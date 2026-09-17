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
  comprobanteTipo,
  contraparte,
  cliente,
} from '@/drizzle/schema';
import { semaforoBancoVsFacturacion } from '@/lib/extracto-calc';
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
  .validator(
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
  .validator(z.object({ clienteId: z.string().uuid() }))
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
  .validator(
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

    if (ctx.data.movimientos.length === 0)
      return { importados: 0, salteados: 0 };

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

/**
 * Las cuentas de la empresa con su actividad, para poder mostrar CUÁLES son
 * y no solo cuántas: cada una con sus totales, su cantidad de movimientos y
 * la fecha del último.
 */
export const listCuentasConResumen = createServerFn({ method: 'GET' })
  .validator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    return await db
      .select({
        id: cuentaBancaria.id,
        banco: cuentaBancaria.banco,
        numero: cuentaBancaria.numero,
        cbu: cuentaBancaria.cbu,
        alias: cuentaBancaria.alias,
        tipo: cuentaBancaria.tipo,
        moneda: cuentaBancaria.moneda,
        movimientos: sql<number>`(count(${movimientoBancario.id}))::int`,
        ingresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
        egresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
        ultimoMovimiento: sql<
          string | null
        >`max(${movimientoBancario.fecha})::text`,
        // El saldo del último movimiento importado: lo que el banco decía al
        // cierre del extracto más reciente.
        saldoUltimo: sql<string | null>`(
          select mb2.saldo_posterior from movimiento_bancario mb2
          where mb2.cuenta_bancaria_id = ${cuentaBancaria.id}
            and mb2.saldo_posterior is not null
          order by mb2.fecha desc, mb2.created_at desc limit 1
        )::text`,
      })
      .from(cuentaBancaria)
      .leftJoin(
        movimientoBancario,
        eq(movimientoBancario.cuentaBancariaId, cuentaBancaria.id)
      )
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, ctx.data.clienteId),
          eq(cuentaBancaria.activa, true)
        )
      )
      .groupBy(cuentaBancaria.id)
      .orderBy(cuentaBancaria.createdAt);
  });

export const listMovimientos = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        /** Una cuenta puntual, o todas las de la empresa con `clienteId`. */
        cuentaBancariaId: z.string().uuid().optional(),
        clienteId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .refine((v) => v.cuentaBancariaId ?? v.clienteId, {
        message: 'Falta indicar la cuenta o la empresa',
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    // Sin cuenta puntual se listan todas las de la empresa: el registro se ve
    // completo sin tener que elegir una por una.
    let cuentaIds: string[];
    if (ctx.data.cuentaBancariaId) {
      await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);
      cuentaIds = [ctx.data.cuentaBancariaId];
    } else {
      const cuentas = await db
        .select({ id: cuentaBancaria.id })
        .from(cuentaBancaria)
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, ctx.data.clienteId!),
            eq(cuentaBancaria.activa, true)
          )
        );
      cuentaIds = cuentas.map((c) => c.id);
      if (cuentaIds.length === 0) return [];
    }

    const conditions: SQL[] = [
      inArray(movimientoBancario.cuentaBancariaId, cuentaIds),
    ];
    if (ctx.data.from)
      conditions.push(gte(movimientoBancario.fecha, ctx.data.from));
    if (ctx.data.to)
      conditions.push(lte(movimientoBancario.fecha, ctx.data.to));

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
        categoria: movimientoBancario.categoria,
        categoriaFuente: movimientoBancario.categoriaFuente,
        excluido: movimientoBancario.excluido,
        fuente: movimientoBancario.fuente,
        createdAt: movimientoBancario.createdAt,
        cuentaBancariaId: movimientoBancario.cuentaBancariaId,
        // De qué cuenta es la fila: se muestra cuando se ven todas juntas.
        cuentaBanco: cuentaBancaria.banco,
        cuentaNumero: cuentaBancaria.numero,
      })
      .from(movimientoBancario)
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
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
            .where(inArray(conciliacionComprobante.movimientoBancarioId, ids))
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
  .validator(z.object({ cuentaBancariaId: z.string().uuid() }))
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
  .validator(
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
  .validator(z.object({ clienteId: z.string().uuid() }))
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

/**
 * Banco vs Facturación (TIN-1634): lo que entró al banco contra lo que la
 * empresa facturó en el mismo mes. La brecha grande es la incongruencia que
 * el estudio necesita ver (el caso del ticket: $10M facturados, $800M en la
 * cuenta). Los movimientos marcados `excluido` (p. ej. transferencias entre
 * cuentas propias) quedan afuera de la suma.
 */
export const getBancoVsFacturacion = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      /** Mes a comparar, 'YYYY-MM'. */
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const desde = `${ctx.data.periodo}-01`;
    const hasta = sql`(${desde}::date + interval '1 month')`;

    // Contra la base remota cada viaje cuesta cientos de milisegundos, y la
    // card se repregunta con cada cambio de mes: las dos mitades salen en
    // paralelo y los movimientos cuelgan del join con la cuenta, así no hace
    // falta un viaje extra para saber qué cuentas tiene la empresa.
    const [[banco], [ventas]] = await Promise.all([
      db
        .select({
          cuentas: sql<number>`(count(distinct ${cuentaBancaria.id}))::int`,
          ingresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' and not ${movimientoBancario.excluido} then ${movimientoBancario.importe} else 0 end), 0)::text`,
          egresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' and not ${movimientoBancario.excluido} then ${movimientoBancario.importe} else 0 end), 0)::text`,
          movimientos: sql<number>`(count(${movimientoBancario.id}) filter (where not ${movimientoBancario.excluido}))::int`,
          excluidos: sql<number>`(count(${movimientoBancario.id}) filter (where ${movimientoBancario.excluido}))::int`,
          // El último mes con movimientos, sin importar el período pedido.
          ultimoPeriodo: sql<string | null>`(
            select to_char(max(mb2.fecha), 'YYYY-MM') from movimiento_bancario mb2
            where mb2.cuenta_bancaria_id in (
              select cb2.id from cuenta_bancaria cb2
              where cb2.cliente_id = ${ctx.data.clienteId} and cb2.activa
            )
          )`,
        })
        .from(cuentaBancaria)
        // LEFT JOIN: una empresa con cuentas pero sin movimientos en el mes
        // tiene que seguir contando sus cuentas.
        .leftJoin(
          movimientoBancario,
          and(
            eq(movimientoBancario.cuentaBancariaId, cuentaBancaria.id),
            gte(movimientoBancario.fecha, desde),
            sql`${movimientoBancario.fecha} < ${hasta}`
          )
        )
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, ctx.data.clienteId),
            eq(cuentaBancaria.activa, true)
          )
        ),

      // Ventas del mismo mes (mismo criterio que la solapa de IVA: emitidos,
      // con las notas de crédito restando).
      db
        .select({
          total: sql<string>`coalesce(sum(case when ${comprobanteTipo.esNc} then -${comprobante.total} else ${comprobante.total} end), 0)::text`,
          comprobantes: sql<number>`count(${comprobante.id})::int`,
        })
        .from(comprobante)
        .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
        .where(
          and(
            eq(comprobante.orgId, orgId),
            eq(comprobante.clienteId, ctx.data.clienteId),
            eq(comprobante.direccion, 'emitido'),
            gte(comprobante.fechaEmision, desde),
            sql`${comprobante.fechaEmision} < ${hasta}`
          )
        ),
    ]);

    const ingresosBancarios = Number(banco?.ingresos ?? 0);
    const ventasFacturadas = Number(ventas?.total ?? 0);

    return {
      periodo: ctx.data.periodo,
      // Para que la card pueda abrirse en un mes con datos en vez de en uno
      // vacío: los extractos se cargan a mes vencido y con atraso.
      ultimoPeriodoConDatos: banco?.ultimoPeriodo ?? null,
      cuentas: Number(banco?.cuentas ?? 0),
      ingresosBancarios,
      egresosBancarios: Number(banco?.egresos ?? 0),
      movimientos: Number(banco?.movimientos ?? 0),
      movimientosExcluidos: Number(banco?.excluidos ?? 0),
      ventasFacturadas,
      comprobantes: Number(ventas?.comprobantes ?? 0),
      ...semaforoBancoVsFacturacion(ingresosBancarios, ventasFacturadas),
    };
  });

/* ───────────────── Bandeja de conciliación (TIN-1634) ────────────────── */

/**
 * Lo que hace falta para conciliar un mes, en una sola consulta: la plata que
 * entró y todavía no tiene comprobante, las facturas del mes que no tienen
 * cobro identificado, y los candidatos de cruce entre unas y otras.
 *
 * El criterio de cruce es el mismo que usa `autoConciliar` —importe con un
 * peso de tolerancia y fecha cercana— pero acá no se guarda nada: se proponen
 * hasta tres candidatos por movimiento con el motivo a la vista, y confirma
 * una persona.
 */
export const getBandejaConciliacion = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const desde = `${ctx.data.periodo}-01`;
    const hasta = sql`(${desde}::date + interval '1 month')`;

    const [movimientos, comprobantes] = await Promise.all([
      db
        .select({
          id: movimientoBancario.id,
          fecha: movimientoBancario.fecha,
          descripcion: movimientoBancario.descripcion,
          importe: movimientoBancario.importe,
          direccion: movimientoBancario.direccion,
          categoria: movimientoBancario.categoria,
          excluido: movimientoBancario.excluido,
          contraparteId: movimientoBancario.contraparteId,
          cuentaBanco: cuentaBancaria.banco,
          cuentaNumero: cuentaBancaria.numero,
          conciliacionId: conciliacionComprobante.id,
          conciliacionEstado: conciliacionComprobante.estado,
          comprobanteConciliadoId: conciliacionComprobante.comprobanteId,
        })
        .from(movimientoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
        )
        .leftJoin(
          conciliacionComprobante,
          eq(
            conciliacionComprobante.movimientoBancarioId,
            movimientoBancario.id
          )
        )
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, ctx.data.clienteId),
            eq(cuentaBancaria.activa, true),
            gte(movimientoBancario.fecha, desde),
            sql`${movimientoBancario.fecha} < ${hasta}`
          )
        )
        .orderBy(desc(movimientoBancario.importe)),

      db
        .select({
          id: comprobante.id,
          fechaEmision: comprobante.fechaEmision,
          tipo: comprobante.tipo,
          tipoNombre: comprobanteTipo.descripcion,
          esNc: comprobanteTipo.esNc,
          puntoVenta: comprobante.puntoVenta,
          numero: comprobante.numero,
          total: comprobante.total,
          contraparteId: comprobante.contraparteId,
          contraparteNombre: contraparte.nombre,
          conciliacionId: conciliacionComprobante.id,
        })
        .from(comprobante)
        .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
        .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
        .leftJoin(
          conciliacionComprobante,
          eq(conciliacionComprobante.comprobanteId, comprobante.id)
        )
        .where(
          and(
            eq(comprobante.orgId, orgId),
            eq(comprobante.clienteId, ctx.data.clienteId),
            eq(comprobante.direccion, 'emitido'),
            gte(comprobante.fechaEmision, desde),
            sql`${comprobante.fechaEmision} < ${hasta}`
          )
        )
        .orderBy(desc(comprobante.total)),
    ]);

    const dias = (a: string, b: string) =>
      Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;

    // Candidatos por movimiento: mismo importe y fecha cercana. El motivo se
    // arma acá porque es lo que la persona necesita leer para decidir.
    const sinCobro = comprobantes.filter((c) => !c.conciliacionId && !c.esNc);

    const ingresos = movimientos.filter(
      (m) => m.direccion === 'ingreso' && !m.excluido && !m.conciliacionId
    );

    const conCandidatos = ingresos.map((m) => {
      const candidatos = sinCobro
        .filter(
          (c) =>
            Math.abs(Number(m.importe) - Number(c.total)) < 1 &&
            dias(m.fecha, c.fechaEmision) <= DIAS_PROXIMIDAD
        )
        .map((c) => {
          const d = Math.round(dias(m.fecha, c.fechaEmision));
          const mismaContraparte =
            m.contraparteId != null && m.contraparteId === c.contraparteId;
          return {
            comprobanteId: c.id,
            confianza: mismaContraparte ? 0.95 : d === 0 ? 0.9 : 0.75,
            motivo: mismaContraparte
              ? 'Mismo importe y el mismo cliente'
              : d === 0
                ? 'Mismo importe, el mismo día'
                : `Mismo importe, ${d} día${d === 1 ? '' : 's'} de diferencia`,
          };
        })
        .sort((a, b) => b.confianza - a.confianza)
        .slice(0, 3);

      return { ...m, candidatos };
    });

    const suma = (xs: { importe: string }[]) =>
      xs.reduce((a, x) => a + Number(x.importe), 0);

    const todosIngresos = movimientos.filter((m) => m.direccion === 'ingreso');
    const conciliados = todosIngresos.filter((m) => m.conciliacionId);
    const excluidos = todosIngresos.filter((m) => m.excluido);
    const facturado = comprobantes.reduce(
      (a, c) => a + (c.esNc ? -Number(c.total) : Number(c.total)),
      0
    );
    const facturadoConciliado = comprobantes
      .filter((c) => c.conciliacionId)
      .reduce((a, c) => a + Number(c.total), 0);

    // El último mes con movimientos, para que la bandeja no abra en un mes
    // vacío: los extractos se cargan a mes vencido y con atraso.
    const [ultimo] = await db
      .select({
        periodo: sql<
          string | null
        >`to_char(max(${movimientoBancario.fecha}), 'YYYY-MM')`,
      })
      .from(movimientoBancario)
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          eq(cuentaBancaria.orgId, orgId),
          eq(cuentaBancaria.clienteId, ctx.data.clienteId),
          eq(cuentaBancaria.activa, true)
        )
      );

    return {
      periodo: ctx.data.periodo,
      ultimoPeriodoConDatos: ultimo?.periodo ?? null,
      totales: {
        facturado,
        facturadoConciliado,
        comprobantes: comprobantes.length,
        comprobantesSinCobro: sinCobro.length,
        facturadoSinCobro: sinCobro.reduce((a, c) => a + Number(c.total), 0),
        ingresos: suma(todosIngresos),
        conciliado: suma(conciliados),
        excluido: suma(excluidos),
        sinExplicar: suma(conCandidatos),
        movimientosSinIdentificar: conCandidatos.length,
        crucesExactos: conCandidatos.filter((m) => m.candidatos.length > 0)
          .length,
      },
      movimientos: conCandidatos,
      comprobantes: sinCobro,
    };
  });

/**
 * Confirma varios cruces de una vez: es lo que convierte "0% conciliado" en
 * trabajo hecho cuando el extracto trae coincidencias exactas.
 */
export const conciliarLote = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      pares: z
        .array(
          z.object({
            movimientoId: z.string().uuid(),
            comprobanteId: z.string().uuid(),
          })
        )
        .min(1)
        .max(200),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const movIds = ctx.data.pares.map((p) => p.movimientoId);
    const compIds = ctx.data.pares.map((p) => p.comprobanteId);

    // Todo tiene que ser de la organización: se valida en bloque y no de a uno.
    const [movs, comps] = await Promise.all([
      db
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
            inArray(movimientoBancario.id, movIds),
            eq(cuentaBancaria.orgId, orgId)
          )
        ),
      db
        .select({ id: comprobante.id })
        .from(comprobante)
        .where(
          and(inArray(comprobante.id, compIds), eq(comprobante.orgId, orgId))
        ),
    ]);

    const importePorMov = new Map(movs.map((m) => [m.id, m.importe]));
    const compsValidos = new Set(comps.map((c) => c.id));

    // Un comprobante no puede quedar cobrado dos veces en el mismo lote: dos
    // facturas del mismo importe en la misma semana son habituales y el cruce
    // por importe no alcanza para distinguirlas. Las descartadas se informan
    // para que se resuelvan a mano.
    const yaTomados = new Set(
      (
        await db
          .select({ id: conciliacionComprobante.comprobanteId })
          .from(conciliacionComprobante)
          .where(inArray(conciliacionComprobante.comprobanteId, compIds))
      ).map((c) => c.id)
    );

    const validos: { movimientoId: string; comprobanteId: string }[] = [];
    for (const p of ctx.data.pares) {
      if (!importePorMov.has(p.movimientoId)) continue;
      if (!compsValidos.has(p.comprobanteId)) continue;
      if (yaTomados.has(p.comprobanteId)) continue;
      yaTomados.add(p.comprobanteId);
      validos.push(p);
    }

    if (validos.length === 0)
      throw new Error(
        'Esos cruces ya estaban conciliados o no corresponden a esta organización'
      );

    // Una confirmación reemplaza cualquier sugerencia previa del cálculo.
    await db.delete(conciliacionComprobante).where(
      inArray(
        conciliacionComprobante.movimientoBancarioId,
        validos.map((p) => p.movimientoId)
      )
    );

    await db.insert(conciliacionComprobante).values(
      validos.map((p) => ({
        movimientoBancarioId: p.movimientoId,
        comprobanteId: p.comprobanteId,
        importeConciliado: importePorMov.get(p.movimientoId)!,
        estado: 'confirmada' as const,
        fuente: 'manual' as const,
        confianza: '1.0000',
        revisadoPor: userId,
        revisadoAt: new Date(),
      }))
    );

    return {
      conciliados: validos.length,
      salteados: ctx.data.pares.length - validos.length,
    };
  });
