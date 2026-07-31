/**
 * Bancos: cuentas, movimientos y conciliación contra comprobantes.
 *
 * La cuenta cuelga del **cliente** (antes colgaba del login de AFIP, que no es
 * quien tiene la cuenta). El importe del movimiento es siempre positivo y el
 * signo vive en `direccion`, mirado desde el cliente: `ingreso` es plata que
 * entra, `egreso` plata que sale.
 */
import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cuentaBancaria,
  cuentaBancariaTipo,
  movimientoBancario,
  movimientoDireccion,
  conciliacionComprobante,
  comprobante,
  cliente,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, desc, gte, lte, sql, inArray, type SQL } from 'drizzle-orm';

/** La cuenta, validando que sea de la organización activa. */
async function getCuentaDeOrg(cuentaBancariaId: string, orgId: string) {
  const [row] = await db
    .select({ id: cuentaBancaria.id, clienteId: cuentaBancaria.clienteId })
    .from(cuentaBancaria)
    .where(
      and(
        eq(cuentaBancaria.id, cuentaBancariaId),
        eq(cuentaBancaria.orgId, orgId)
      )
    )
    .limit(1);

  if (!row) throw new Error('Cuenta bancaria no encontrada o no autorizada');
  return row;
}

/** El cliente, validando que sea de la organización activa. */
async function assertClienteDeOrg(clienteId: string, orgId: string) {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Cliente no encontrado o no autorizado');
  return row;
}

export const createCuentaBancaria = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      banco: z.string().min(1),
      tipo: z.enum(cuentaBancariaTipo.enumValues).optional(),
      numero: z.string().optional(),
      cbu: z.string().optional(),
      alias: z.string().optional(),
      moneda: z.string().length(3).default('ARS'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await assertClienteDeOrg(ctx.data.clienteId, orgId);

    const [cuenta] = await db
      .insert(cuentaBancaria)
      .values({
        orgId,
        clienteId: ctx.data.clienteId,
        banco: ctx.data.banco,
        tipo: ctx.data.tipo ?? null,
        numero: ctx.data.numero ?? null,
        cbu: ctx.data.cbu ?? null,
        alias: ctx.data.alias ?? null,
        moneda: ctx.data.moneda,
      })
      .returning();

    return cuenta;
  });

export const listCuentasBancarias = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return db
      .select()
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, ctx.data.clienteId),
          eq(cuentaBancaria.activa, true)
        )
      )
      .orderBy(cuentaBancaria.createdAt);
  });

export const importMovimientos = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      cuentaBancariaId: z.string().uuid(),
      movimientos: z.array(
        z.object({
          fecha: z.string(),
          descripcion: z.string().optional(),
          importe: z.string(),
          direccion: z.enum(movimientoDireccion.enumValues),
          contraparteTexto: z.string().optional(),
          idExterno: z.string().optional(),
          datosCrudos: z.record(z.string(), z.unknown()).optional(),
        })
      ),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);

    if (ctx.data.movimientos.length === 0) return { importados: 0, salteados: 0 };

    // Dedupe por el id que da el banco.
    const idsExternos = ctx.data.movimientos
      .map((m) => m.idExterno)
      .filter((id): id is string => Boolean(id));

    let yaImportados = new Set<string>();
    if (idsExternos.length > 0) {
      const existentes = await db
        .select({ idExterno: movimientoBancario.idExterno })
        .from(movimientoBancario)
        .where(
          and(
            eq(movimientoBancario.cuentaBancariaId, ctx.data.cuentaBancariaId),
            inArray(movimientoBancario.idExterno, idsExternos)
          )
        );
      yaImportados = new Set(
        existentes
          .map((e) => e.idExterno)
          .filter((id): id is string => Boolean(id))
      );
    }

    const nuevos = ctx.data.movimientos.filter(
      (m) => !m.idExterno || !yaImportados.has(m.idExterno)
    );

    if (nuevos.length === 0)
      return { importados: 0, salteados: ctx.data.movimientos.length };

    await db.insert(movimientoBancario).values(
      nuevos.map((m) => ({
        cuentaBancariaId: ctx.data.cuentaBancariaId,
        fecha: m.fecha,
        // El signo lo lleva `direccion`; el importe es siempre positivo.
        importe: Math.abs(Number(m.importe)).toFixed(2),
        direccion: m.direccion,
        descripcion: m.descripcion ?? null,
        contraparteTexto: m.contraparteTexto ?? null,
        idExterno: m.idExterno ?? null,
        datosCrudos: m.datosCrudos ?? null,
        fuente: 'import' as const,
      }))
    );

    return {
      importados: nuevos.length,
      salteados: ctx.data.movimientos.length - nuevos.length,
    };
  });

export const listMovimientos = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      cuentaBancariaId: z.string().uuid(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);

    const conditions: SQL[] = [
      eq(movimientoBancario.cuentaBancariaId, ctx.data.cuentaBancariaId),
    ];
    if (ctx.data.from)
      conditions.push(gte(movimientoBancario.fecha, ctx.data.from));
    if (ctx.data.to) conditions.push(lte(movimientoBancario.fecha, ctx.data.to));

    const movimientos = await db
      .select({
        id: movimientoBancario.id,
        fecha: movimientoBancario.fecha,
        direccion: movimientoBancario.direccion,
        importe: movimientoBancario.importe,
        descripcion: movimientoBancario.descripcion,
        saldoPosterior: movimientoBancario.saldoPosterior,
        contraparteId: movimientoBancario.contraparteId,
        contraparteTexto: movimientoBancario.contraparteTexto,
        idExterno: movimientoBancario.idExterno,
        fuente: movimientoBancario.fuente,
        createdAt: movimientoBancario.createdAt,
      })
      .from(movimientoBancario)
      .where(and(...conditions))
      .orderBy(desc(movimientoBancario.fecha))
      .limit(ctx.data.limit);

    const ids = movimientos.map((m) => m.id);
    const conciliaciones =
      ids.length > 0
        ? await db
            .select({
              id: conciliacionComprobante.id,
              movimientoBancarioId:
                conciliacionComprobante.movimientoBancarioId,
              comprobanteId: conciliacionComprobante.comprobanteId,
              importeConciliado: conciliacionComprobante.importeConciliado,
              estado: conciliacionComprobante.estado,
              fuente: conciliacionComprobante.fuente,
              confianza: conciliacionComprobante.confianza,
            })
            .from(conciliacionComprobante)
            .where(
              inArray(conciliacionComprobante.movimientoBancarioId, ids)
            )
        : [];

    const porMovimiento = new Map<string, typeof conciliaciones>();
    for (const c of conciliaciones) {
      const lista = porMovimiento.get(c.movimientoBancarioId) ?? [];
      lista.push(c);
      porMovimiento.set(c.movimientoBancarioId, lista);
    }

    return movimientos.map((m) => ({
      ...m,
      conciliaciones: porMovimiento.get(m.id) ?? [],
      conciliado: (porMovimiento.get(m.id) ?? []).length > 0,
    }));
  });

const DIAS_PROXIMIDAD = 5;

export const autoConciliar = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ cuentaBancariaId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const cuenta = await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);

    const movimientos = await db
      .select({
        id: movimientoBancario.id,
        fecha: movimientoBancario.fecha,
        importe: movimientoBancario.importe,
        contraparteId: movimientoBancario.contraparteId,
      })
      .from(movimientoBancario)
      .where(
        eq(movimientoBancario.cuentaBancariaId, ctx.data.cuentaBancariaId)
      );

    if (movimientos.length === 0) return { conciliados: 0 };

    const yaConciliados = new Set(
      (
        await db
          .select({ id: conciliacionComprobante.movimientoBancarioId })
          .from(conciliacionComprobante)
          .where(
            inArray(
              conciliacionComprobante.movimientoBancarioId,
              movimientos.map((m) => m.id)
            )
          )
      ).map((c) => c.id)
    );

    const pendientes = movimientos.filter((m) => !yaConciliados.has(m.id));
    if (pendientes.length === 0) return { conciliados: 0 };

    const comprobantes = await db
      .select({
        id: comprobante.id,
        total: comprobante.total,
        fechaEmision: comprobante.fechaEmision,
        contraparteId: comprobante.contraparteId,
      })
      .from(comprobante)
      .where(eq(comprobante.clienteId, cuenta.clienteId));

    const aInsertar: {
      movimientoBancarioId: string;
      comprobanteId: string;
      importeConciliado: string;
      estado: 'sugerida';
      fuente: 'calculo';
      confianza: string;
    }[] = [];

    for (const mov of pendientes) {
      const importe = Number(mov.importe);
      const fecha = new Date(mov.fecha).getTime();

      let mejor: { comprobanteId: string; confianza: number } | null = null;

      for (const comp of comprobantes) {
        // El importe tiene que coincidir con tolerancia de un peso.
        if (Math.abs(importe - Number(comp.total)) >= 1) continue;

        const dias =
          Math.abs(fecha - new Date(comp.fechaEmision).getTime()) /
          (1000 * 60 * 60 * 24);
        if (dias > DIAS_PROXIMIDAD) continue;

        // Base: importe + fecha. Bonus si además coincide la contraparte.
        let confianza = 0.5;
        if (mov.contraparteId && mov.contraparteId === comp.contraparteId) {
          confianza += 0.4;
        }
        confianza += (1 - dias / DIAS_PROXIMIDAD) * 0.1;

        if (!mejor || confianza > mejor.confianza) {
          mejor = { comprobanteId: comp.id, confianza };
        }
      }

      if (mejor) {
        aInsertar.push({
          movimientoBancarioId: mov.id,
          comprobanteId: mejor.comprobanteId,
          importeConciliado: importe.toFixed(2),
          // La sugiere el cálculo de la app: queda pendiente de que la confirme alguien.
          estado: 'sugerida',
          fuente: 'calculo',
          confianza: mejor.confianza.toFixed(4),
        });
      }
    }

    if (aInsertar.length > 0) {
      await db.insert(conciliacionComprobante).values(aInsertar);
    }

    return { conciliados: aInsertar.length };
  });

export const conciliarManual = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      movimientoId: z.string().uuid(),
      comprobanteId: z.string().uuid(),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [mov] = await db
      .select({
        id: movimientoBancario.id,
        importe: movimientoBancario.importe,
      })
      .from(movimientoBancario)
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          eq(movimientoBancario.id, ctx.data.movimientoId),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .limit(1);

    if (!mov) throw new Error('Movimiento no encontrado o no autorizado');

    const [comp] = await db
      .select({ id: comprobante.id })
      .from(comprobante)
      .where(
        and(
          eq(comprobante.id, ctx.data.comprobanteId),
          eq(comprobante.orgId, orgId)
        )
      )
      .limit(1);

    if (!comp) throw new Error('Comprobante no encontrado o no autorizado');

    // Una conciliación manual reemplaza lo que hubiera sugerido el cálculo.
    await db
      .delete(conciliacionComprobante)
      .where(
        eq(conciliacionComprobante.movimientoBancarioId, ctx.data.movimientoId)
      );

    const [conciliacion] = await db
      .insert(conciliacionComprobante)
      .values({
        movimientoBancarioId: ctx.data.movimientoId,
        comprobanteId: ctx.data.comprobanteId,
        importeConciliado: mov.importe,
        estado: 'confirmada',
        fuente: 'manual',
        confianza: '1.0000',
        revisadoPor: userId,
        revisadoAt: new Date(),
      })
      .returning();

    return conciliacion;
  });

export const getResumenConciliacion = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const cuentas = await db
      .select({ id: cuentaBancaria.id })
      .from(cuentaBancaria)
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, ctx.data.clienteId),
          eq(cuentaBancaria.activa, true)
        )
      );

    if (cuentas.length === 0) {
      return {
        movimientos: 0,
        conciliados: 0,
        pendientes: 0,
        porcentajeConciliado: 0,
        totalIngresos: '0.00',
        totalEgresos: '0.00',
        cuentas: 0,
      };
    }

    const cuentaIds = cuentas.map((c) => c.id);

    const [totales] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalIngresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
        totalEgresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
      })
      .from(movimientoBancario)
      .where(inArray(movimientoBancario.cuentaBancariaId, cuentaIds));

    const [conciliados] = await db
      .select({
        count: sql<number>`count(distinct ${conciliacionComprobante.movimientoBancarioId})::int`,
      })
      .from(conciliacionComprobante)
      .innerJoin(
        movimientoBancario,
        eq(conciliacionComprobante.movimientoBancarioId, movimientoBancario.id)
      )
      .where(inArray(movimientoBancario.cuentaBancariaId, cuentaIds));

    const total = Number(totales?.total ?? 0);
    const conciliado = Number(conciliados?.count ?? 0);

    return {
      movimientos: total,
      conciliados: conciliado,
      pendientes: total - conciliado,
      porcentajeConciliado:
        total > 0 ? Math.round((conciliado / total) * 100) : 0,
      totalIngresos: totales?.totalIngresos ?? '0.00',
      totalEgresos: totales?.totalEgresos ?? '0.00',
      cuentas: cuentas.length,
    };
  });
