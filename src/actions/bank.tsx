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
  cuenta,
  cuentaBancaria,
  cuentaBancariaTipo,
  movimientoBancario,
  movimientoDireccion,
  conciliacionComprobante,
  comprobante,
  comprobanteTipo,
  contraparte,
  cliente,
  saldoBancario,
} from '@/drizzle/schema';
import { semaforoBancoVsFacturacion } from '@/lib/extracto-calc';
import { getUmbralControlBancario } from '@/actions/admin';
import { type ContraparteSugerida } from '@/lib/contraparte-movimiento';
import { DIAS_PROXIMIDAD } from '@/lib/cruce-conciliacion';
import {
  cuentasActivasDeCliente,
  generarSugerencias,
} from '@/lib/sugerencias-conciliacion';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIAS_SIN_FACTURA,
} from '@/lib/clasificar-movimiento';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import {
  eq,
  and,
  or,
  desc,
  gte,
  lte,
  sql,
  ilike,
  inArray,
  type SQL,
} from 'drizzle-orm';

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

/**
 * A qué cuenta del plan se imputan los movimientos de esta cuenta bancaria.
 *
 * Sin esto no hay asiento posible: el Debe de un cobro y el Haber de un pago
 * van siempre contra el banco, y el banco es una cuenta del plan distinta por
 * cada cuenta bancaria (Banco Nación c/c no es Banco Galicia c/c).
 */
export const setCuentaContableDeCuentaBancaria = createServerFn({
  method: 'POST',
})
  .validator(
    z.object({
      cuentaBancariaId: z.string().uuid(),
      /** Null la desvincula: la cuenta queda sin poder generar asientos. */
      cuentaContableId: z.string().uuid().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());
    const cuentaBanco = await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);

    // La cuenta contable tiene que ser de la misma organización y poder
    // recibir asientos: una cuenta de agrupación no admite movimientos.
    if (ctx.data.cuentaContableId) {
      const [destino] = await db
        .select({
          id: cuenta.id,
          tipo: cuenta.tipo,
          clienteId: cuenta.clienteId,
        })
        .from(cuenta)
        .where(
          and(
            eq(cuenta.id, ctx.data.cuentaContableId),
            eq(cuenta.orgId, orgId),
            eq(cuenta.tipo, 'imputable')
          )
        );
      if (!destino)
        throw new Error('La cuenta contable no existe o no es imputable');
      // Una cuenta propia de otro cliente no puede usarse acá.
      if (destino.clienteId && destino.clienteId !== cuentaBanco.clienteId)
        throw new Error('Esa cuenta es de otra empresa');
    }

    await db
      .update(cuentaBancaria)
      .set({ cuentaContableId: ctx.data.cuentaContableId })
      .where(eq(cuentaBancaria.id, ctx.data.cuentaBancariaId));

    return { success: true };
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
        cuentaContableId: cuentaBancaria.cuentaContableId,
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

/**
 * El registro de movimientos, paginado del lado del servidor.
 *
 * Devuelve la página pedida y, en la misma respuesta, los totales de TODO lo
 * que cumple el filtro (no solo de la página): así lo que dice el resumen
 * —entró, salió, cuántos, cuántos conciliados— es siempre sobre el mismo
 * conjunto que se está paginando.
 */
export const listMovimientos = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        /** Una cuenta puntual, o todas las de la empresa con `clienteId`. */
        cuentaBancariaId: z.string().uuid().optional(),
        clienteId: z.string().uuid().optional(),
        /** Mes 'YYYY-MM'. Sin él, todo el historial. */
        periodo: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        /** Último mes del rango ('YYYY-MM'). Sin él, solo el mes `periodo`. */
        hasta: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        categoria: z.enum(CATEGORIAS_MOVIMIENTO).optional(),
        /** Estados excluyentes: con cruce confirmado, solo sugerido, o nada. */
        estado: z
          .enum(['conciliado', 'sugerido', 'sin_conciliar', 'no_requiere'])
          .optional(),
        /** Texto libre: busca en la descripción del banco y en la contraparte. */
        busqueda: z.string().trim().max(120).optional(),
        /** Rango de importe, en pesos, sin importar si entró o salió. */
        importeMin: z.number().nonnegative().optional(),
        importeMax: z.number().nonnegative().optional(),
        pagina: z.number().int().min(1).default(1),
        porPagina: z.number().int().min(1).max(200).default(50),
      })
      .refine((v) => v.cuentaBancariaId ?? v.clienteId, {
        message: 'Falta indicar la cuenta o la empresa',
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { pagina, porPagina } = ctx.data;

    const vacio = {
      filas: [],
      pagina,
      porPagina,
      totales: {
        movimientos: 0,
        movimientosSinEstado: 0,
        ingresos: 0,
        egresos: 0,
        conciliados: 0,
        sugeridos: 0,
        noRequiereFactura: 0,
        sinConciliar: 0,
      },
    };

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
      if (cuentaIds.length === 0) return vacio;
    }

    const conditions: SQL[] = [
      inArray(movimientoBancario.cuentaBancariaId, cuentaIds),
    ];
    if (ctx.data.periodo) {
      const desde = `${ctx.data.periodo}-01`;
      const ultimoMes = `${ctx.data.hasta ?? ctx.data.periodo}-01`;
      conditions.push(gte(movimientoBancario.fecha, desde));
      conditions.push(
        sql`${movimientoBancario.fecha} < (${ultimoMes}::date + interval '1 month')`
      );
    }
    // Conciliado = tiene un cruce confirmado; una sugerencia del cálculo no
    // cuenta hasta que alguien la confirma. Mismo criterio que la fila.
    const conCruce = (estado: 'confirmada' | 'sugerida') => sql`exists (
      select 1 from ${conciliacionComprobante}
      where ${conciliacionComprobante.movimientoBancarioId} = ${movimientoBancario.id}
        and ${conciliacionComprobante.estado} = ${estado}
    )`;
    const conciliado = conCruce('confirmada');
    const sugerido = conCruce('sugerida');
    if (ctx.data.categoria)
      conditions.push(eq(movimientoBancario.categoria, ctx.data.categoria));
    // El banco escribe la contraparte dentro de la descripción y a veces
    // también la tenemos aparte, así que se busca en las dos.
    if (ctx.data.busqueda) {
      const patron = `%${ctx.data.busqueda}%`;
      conditions.push(
        or(
          ilike(movimientoBancario.descripcion, patron),
          ilike(movimientoBancario.contraparteTexto, patron)
        )!
      );
    }
    if (ctx.data.importeMin != null)
      conditions.push(
        gte(movimientoBancario.importe, ctx.data.importeMin.toFixed(2))
      );
    if (ctx.data.importeMax != null)
      conditions.push(
        lte(movimientoBancario.importe, ctx.data.importeMax.toFixed(2))
      );
    // Lo que nunca va a tener factura (impuestos, comisiones, sueldos…) sale
    // de "sin conciliar": contarlo ahí escondía lo que sí hay que revisar.
    const sinFactura = inArray(
      movimientoBancario.categoria,
      CATEGORIAS_SIN_FACTURA as string[]
    );
    // Los cuatro estados parten el mismo conjunto, así que se cuentan sin
    // aplicar el filtro de estado: si no, elegir uno dejaba los otros tres
    // en cero y no se podía saltar de uno a otro.
    const filtroSinEstado = and(...conditions);
    if (ctx.data.estado === 'conciliado') conditions.push(conciliado);
    if (ctx.data.estado === 'sugerido')
      conditions.push(sql`${sugerido} and not ${conciliado}`);
    if (ctx.data.estado === 'sin_conciliar')
      conditions.push(
        sql`not ${conciliado} and not ${sugerido} and not ${sinFactura}`
      );
    if (ctx.data.estado === 'no_requiere') conditions.push(sinFactura);
    // Los totales de plata usan este mismo filtro: con "Impuestos" elegido,
    // "salió" es lo que se fue en impuestos.
    const filtro = and(...conditions);

    const [[totales], [porEstado], movimientos] = await Promise.all([
      db
        .select({
          movimientos: sql<number>`count(*)::int`,
          ingresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
          egresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
        })
        .from(movimientoBancario)
        .where(filtro),
      db
        .select({
          movimientos: sql<number>`count(*)::int`,
          conciliados: sql<number>`(count(*) filter (where ${conciliado}))::int`,
          sinFactura: sql<number>`(count(*) filter (where ${movimientoBancario.categoria} in ${CATEGORIAS_SIN_FACTURA}))::int`,
          sugeridos: sql<number>`(count(*) filter (where ${sugerido} and not ${conciliado}))::int`,
        })
        .from(movimientoBancario)
        .where(filtroSinEstado),
      db
        .select({
          id: movimientoBancario.id,
          fecha: movimientoBancario.fecha,
          direccion: movimientoBancario.direccion,
          importe: movimientoBancario.importe,
          descripcion: movimientoBancario.descripcion,
          saldoPosterior: movimientoBancario.saldoPosterior,
          contraparteId: movimientoBancario.contraparteId,
          contraparteTexto: movimientoBancario.contraparteTexto,
          // Por importe exacto de una factura: se muestra como posible, no
          // se asigna (ver `contraparte-movimiento`).
          contraparteSugerida: sql<ContraparteSugerida | null>`${movimientoBancario.datosCrudos}->'contraparteSugerida'`,
          idExterno: movimientoBancario.idExterno,
          categoria: movimientoBancario.categoria,
          categoriaFuente: movimientoBancario.categoriaFuente,
          excluido: movimientoBancario.excluido,
          noContabilizar: movimientoBancario.noContabilizar,
          asientoId: movimientoBancario.asientoId,
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
        .where(filtro)
        // `id` desempata: sin un orden total, una fila puede repetirse o
        // perderse entre dos páginas con la misma fecha.
        .orderBy(desc(movimientoBancario.fecha), movimientoBancario.id)
        .limit(porPagina)
        .offset((pagina - 1) * porPagina),
    ]);

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
              revisadoAt: conciliacionComprobante.revisadoAt,
              // Qué factura es, para decirlo en la fila (también la
              // descartada: se muestra para poder revertir un error).
              comprobanteTipo: comprobanteTipo.descripcion,
              comprobantePuntoVenta: comprobante.puntoVenta,
              comprobanteNumero: comprobante.numero,
              comprobanteFecha: comprobante.fechaEmision,
              comprobanteTotal: comprobante.total,
              comprobanteContraparte: contraparte.nombre,
              comprobanteContraparteId: comprobante.contraparteId,
            })
            .from(conciliacionComprobante)
            .innerJoin(
              comprobante,
              eq(comprobante.id, conciliacionComprobante.comprobanteId)
            )
            .leftJoin(
              comprobanteTipo,
              eq(comprobanteTipo.codigo, comprobante.tipo)
            )
            .leftJoin(
              contraparte,
              eq(contraparte.id, comprobante.contraparteId)
            )
            .where(inArray(conciliacionComprobante.movimientoBancarioId, ids))
        : [];

    const porMovimiento = new Map<string, typeof conciliaciones>();
    for (const c of conciliaciones) {
      const lista = porMovimiento.get(c.movimientoBancarioId) ?? [];
      lista.push(c);
      porMovimiento.set(c.movimientoBancarioId, lista);
    }

    const total = Number(totales?.movimientos ?? 0);
    // Los contadores por estado se cuentan sobre todo lo filtrado menos el
    // estado, así que su base no es `total`.
    const totalSinEstado = Number(porEstado?.movimientos ?? 0);
    const conciliados = Number(porEstado?.conciliados ?? 0);

    return {
      filas: movimientos.map((m) => ({
        ...m,
        conciliaciones: porMovimiento.get(m.id) ?? [],
        conciliado: (porMovimiento.get(m.id) ?? []).some(
          (c) => c.estado === 'confirmada'
        ),
      })),
      pagina,
      porPagina,
      totales: {
        movimientos: total,
        // Base de los cuatro contadores: lo filtrado sin mirar el estado.
        movimientosSinEstado: totalSinEstado,
        ingresos: Number(totales?.ingresos ?? 0),
        egresos: Number(totales?.egresos ?? 0),
        conciliados,
        sugeridos: Number(porEstado?.sugeridos ?? 0),
        // Movimientos que nunca van a tener factura: impuestos, comisiones,
        // sueldos, débitos automáticos, intereses y retiros de efectivo.
        noRequiereFactura: Number(porEstado?.sinFactura ?? 0),
        // Excluyente con los otros tres, igual que el filtro de estado.
        sinConciliar:
          totalSinEstado -
          conciliados -
          Number(porEstado?.sugeridos ?? 0) -
          Number(porEstado?.sinFactura ?? 0),
      },
    };
  });

/**
 * Propone cruces para los movimientos de una cuenta, o de toda la empresa.
 * Solo propone: todo queda `sugerida` hasta que una persona lo confirma o lo
 * descarta, y mientras tanto no cuenta como conciliado en ningún lado.
 *
 * Cada vez recalcula las sugerencias pendientes del alcance: si apareció un
 * movimiento que le corresponde mejor a una factura (misma contraparte, fecha
 * más cercana), la sugerencia pasa a ese. Lo confirmado y lo descartado no
 * se toca. Qué factura va con qué movimiento lo decide `asignarCruces`.
 */
export const autoConciliar = createServerFn({ method: 'POST' })
  .validator(
    z
      .object({
        cuentaBancariaId: z.string().uuid().optional(),
        clienteId: z.string().uuid().optional(),
      })
      .refine((v) => v.cuentaBancariaId ?? v.clienteId, {
        message: 'Falta indicar la cuenta o la empresa',
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    let clienteId: string;
    let cuentaIds: string[];
    if (ctx.data.cuentaBancariaId) {
      const cuenta = await getCuentaDeOrg(ctx.data.cuentaBancariaId, orgId);
      clienteId = cuenta.clienteId;
      cuentaIds = [cuenta.id];
    } else {
      clienteId = ctx.data.clienteId!;
      await assertClienteDeOrg(clienteId, orgId);
      cuentaIds = await cuentasActivasDeCliente(orgId, clienteId);
    }
    return await generarSugerencias(clienteId, cuentaIds);
  });

/**
 * Confirma o descarta la sugerencia de `autoConciliar` para un movimiento.
 * Confirmar la vuelve una conciliación de verdad; descartar la deja
 * `rechazada`, para que el cálculo no vuelva a proponer el mismo cruce.
 */
export const resolverSugerencia = createServerFn({ method: 'POST' })
  .validator(
    z.object({ movimientoId: z.string().uuid(), aceptar: z.boolean() })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [sugerencia] = await db
      .select({
        id: conciliacionComprobante.id,
        comprobanteId: conciliacionComprobante.comprobanteId,
      })
      .from(conciliacionComprobante)
      .innerJoin(
        movimientoBancario,
        eq(movimientoBancario.id, conciliacionComprobante.movimientoBancarioId)
      )
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          eq(
            conciliacionComprobante.movimientoBancarioId,
            ctx.data.movimientoId
          ),
          eq(conciliacionComprobante.estado, 'sugerida'),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .limit(1);
    if (!sugerencia) throw new Error('Ese movimiento no tiene una sugerencia');

    if (ctx.data.aceptar) {
      // Si mientras tanto la factura se concilió con otro movimiento, no se
      // puede cobrar (o pagar) dos veces.
      const [tomada] = await db
        .select({ id: conciliacionComprobante.id })
        .from(conciliacionComprobante)
        .where(
          and(
            eq(conciliacionComprobante.comprobanteId, sugerencia.comprobanteId),
            eq(conciliacionComprobante.estado, 'confirmada')
          )
        )
        .limit(1);
      if (tomada)
        throw new Error('Esa factura ya está conciliada con otro movimiento');
    }

    await db
      .update(conciliacionComprobante)
      .set({
        estado: ctx.data.aceptar ? 'confirmada' : 'rechazada',
        revisadoPor: userId,
        revisadoAt: new Date(),
      })
      .where(eq(conciliacionComprobante.id, sugerencia.id));

    if (ctx.data.aceptar) {
      await descartarOtrasSugerencias([sugerencia.comprobanteId]);
    }

    return { ok: true };
  });

/**
 * Las sugerencias pendientes de una empresa (o de una cuenta), con la
 * factura que proponen, para revisarlas y confirmarlas en bloque.
 */
export const listarSugerencias = createServerFn({ method: 'GET' })
  .validator(
    z
      .object({
        cuentaBancariaId: z.string().uuid().optional(),
        clienteId: z.string().uuid().optional(),
        periodo: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
        /** Último mes del rango ('YYYY-MM'). Sin él, solo el mes `periodo`. */
        hasta: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .refine((v) => v.cuentaBancariaId ?? v.clienteId, {
        message: 'Falta indicar la cuenta o la empresa',
      })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions: SQL[] = [
      eq(cuentaBancaria.orgId, orgId),
      eq(conciliacionComprobante.estado, 'sugerida'),
      ctx.data.cuentaBancariaId
        ? eq(cuentaBancaria.id, ctx.data.cuentaBancariaId)
        : eq(cuentaBancaria.clienteId, ctx.data.clienteId!),
    ];
    if (ctx.data.periodo) {
      const desde = `${ctx.data.periodo}-01`;
      const ultimoMes = `${ctx.data.hasta ?? ctx.data.periodo}-01`;
      conditions.push(gte(movimientoBancario.fecha, desde));
      conditions.push(
        sql`${movimientoBancario.fecha} < (${ultimoMes}::date + interval '1 month')`
      );
    }

    return await db
      .select({
        movimientoId: movimientoBancario.id,
        fecha: movimientoBancario.fecha,
        descripcion: movimientoBancario.descripcion,
        importe: movimientoBancario.importe,
        direccion: movimientoBancario.direccion,
        contraparteTexto: movimientoBancario.contraparteTexto,
        contraparteId: movimientoBancario.contraparteId,
        cuentaNumero: cuentaBancaria.numero,
        confianza: conciliacionComprobante.confianza,
        comprobanteId: comprobante.id,
        comprobanteTipo: comprobanteTipo.descripcion,
        comprobantePuntoVenta: comprobante.puntoVenta,
        comprobanteNumero: comprobante.numero,
        comprobanteFecha: comprobante.fechaEmision,
        comprobanteTotal: comprobante.total,
        comprobanteContraparte: contraparte.nombre,
        comprobanteContraparteId: comprobante.contraparteId,
      })
      .from(conciliacionComprobante)
      .innerJoin(
        movimientoBancario,
        eq(movimientoBancario.id, conciliacionComprobante.movimientoBancarioId)
      )
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .innerJoin(
        comprobante,
        eq(comprobante.id, conciliacionComprobante.comprobanteId)
      )
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
      .where(and(...conditions))
      .orderBy(
        desc(conciliacionComprobante.confianza),
        movimientoBancario.fecha
      );
  });

/**
 * Confirma varias sugerencias de una vez (la aprobación masiva). Las revisa
 * igual que una por una: si la factura ya se concilió con otro movimiento
 * mientras tanto, esa se saltea y se informa.
 */
export const confirmarSugerencias = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      movimientoIds: z.array(z.string().uuid()).min(1).max(500),
    })
  )
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const sugerencias = await db
      .select({
        id: conciliacionComprobante.id,
        comprobanteId: conciliacionComprobante.comprobanteId,
      })
      .from(conciliacionComprobante)
      .innerJoin(
        movimientoBancario,
        eq(movimientoBancario.id, conciliacionComprobante.movimientoBancarioId)
      )
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          inArray(
            conciliacionComprobante.movimientoBancarioId,
            ctx.data.movimientoIds
          ),
          eq(conciliacionComprobante.estado, 'sugerida'),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .orderBy(desc(conciliacionComprobante.confianza));

    if (sugerencias.length === 0)
      throw new Error('Esas sugerencias ya no están pendientes');

    // Una factura se concilia una sola vez: las que ya están tomadas se
    // saltean.
    const tomadas = new Set(
      (
        await db
          .select({ id: conciliacionComprobante.comprobanteId })
          .from(conciliacionComprobante)
          .where(
            and(
              inArray(
                conciliacionComprobante.comprobanteId,
                sugerencias.map((s) => s.comprobanteId)
              ),
              eq(conciliacionComprobante.estado, 'confirmada')
            )
          )
      ).map((t) => t.id)
    );
    const aConfirmar = sugerencias.filter((s) => {
      if (tomadas.has(s.comprobanteId)) return false;
      tomadas.add(s.comprobanteId);
      return true;
    });

    if (aConfirmar.length > 0) {
      await db
        .update(conciliacionComprobante)
        .set({
          estado: 'confirmada',
          revisadoPor: userId,
          revisadoAt: new Date(),
        })
        .where(
          inArray(
            conciliacionComprobante.id,
            aConfirmar.map((s) => s.id)
          )
        );
      await descartarOtrasSugerencias(aConfirmar.map((s) => s.comprobanteId));
    }

    return {
      confirmados: aConfirmar.length,
      salteados: ctx.data.movimientoIds.length - aConfirmar.length,
    };
  });

/**
 * Facturas para conciliar a mano un movimiento: del lado que corresponde
 * (cobro → emitidas, pago → recibidas), de cualquier mes y buscando por
 * número, contraparte, CUIT o importe. Sin texto, trae las más parecidas
 * alrededor de la fecha del movimiento. Las que ya están conciliadas vienen
 * marcadas, para que se vea por qué no se pueden elegir.
 */
export const buscarFacturasParaMovimiento = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      movimientoId: z.string().uuid(),
      texto: z.string().max(80).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [mov] = await db
      .select({
        id: movimientoBancario.id,
        fecha: movimientoBancario.fecha,
        importe: movimientoBancario.importe,
        direccion: movimientoBancario.direccion,
        clienteId: cuentaBancaria.clienteId,
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
    if (!mov) throw new Error('Movimiento no encontrado');

    const texto = ctx.data.texto?.trim() ?? '';
    const digitos = texto.replace(/\D/g, '');
    // "14.900" o "14900,50" se buscan como importe; el resto, como texto.
    const comoImporte =
      /^[\d.,$\s]+$/.test(texto) && digitos.length > 0
        ? Number(texto.replace(/[$\s.]/g, '').replace(',', '.'))
        : null;

    const conditions: SQL[] = [
      eq(comprobante.orgId, orgId),
      eq(comprobante.clienteId, mov.clienteId),
      eq(
        comprobante.direccion,
        mov.direccion === 'ingreso' ? 'emitido' : 'recibido'
      ),
      sql`coalesce(${comprobanteTipo.esNc}, false) = false`,
    ];
    if (texto === '') {
      // Sin búsqueda: tres meses antes y uno después del movimiento.
      conditions.push(
        sql`${comprobante.fechaEmision} between (${mov.fecha}::date - 90) and (${mov.fecha}::date + 30)`
      );
    } else if (comoImporte !== null && Number.isFinite(comoImporte)) {
      conditions.push(
        sql`abs(${comprobante.total} - ${comoImporte.toFixed(2)}) < 1`
      );
    } else {
      const patron = `%${texto}%`;
      conditions.push(
        sql`(${contraparte.nombre} ilike ${patron}
          or ${contraparte.docNro} like ${`%${digitos || texto}%`}
          or (${comprobante.puntoVenta}::text || '-' || ${comprobante.numero}::text) like ${`%${texto}%`}
          or ${comprobante.numero}::text = ${digitos || '-'})`
      );
    }

    return await db
      .select({
        id: comprobante.id,
        tipoNombre: comprobanteTipo.descripcion,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
        fechaEmision: comprobante.fechaEmision,
        total: comprobante.total,
        contraparteNombre: contraparte.nombre,
        contraparteDoc: contraparte.docNro,
        // Si ya está conciliada, con qué movimiento: no se puede usar dos
        // veces.
        conciliadaConFecha: sql<string | null>`(
          select mb.fecha::text from ${conciliacionComprobante} cc
          join ${movimientoBancario} mb on mb.id = cc.movimiento_bancario_id
          where cc.comprobante_id = ${comprobante.id}
            and cc.estado = 'confirmada'
          limit 1
        )`,
      })
      .from(comprobante)
      .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
      .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
      .where(and(...conditions))
      // Primero las de importe más parecido, después las más cercanas.
      .orderBy(
        sql`abs(${comprobante.total} - ${mov.importe})`,
        sql`abs(${comprobante.fechaEmision} - ${mov.fecha}::date)`
      )
      .limit(40);
  });

/**
 * Deshace un descarte: la factura que se había descartado para un movimiento
 * vuelve a quedar sugerida, por si descartarla fue un error. Solo si el
 * movimiento no tiene otro cruce y la factura sigue libre.
 */
export const volverASugerir = createServerFn({ method: 'POST' })
  .validator(z.object({ movimientoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const filas = await db
      .select({
        id: conciliacionComprobante.id,
        estado: conciliacionComprobante.estado,
        comprobanteId: conciliacionComprobante.comprobanteId,
        revisadoAt: conciliacionComprobante.revisadoAt,
      })
      .from(conciliacionComprobante)
      .innerJoin(
        movimientoBancario,
        eq(movimientoBancario.id, conciliacionComprobante.movimientoBancarioId)
      )
      .innerJoin(
        cuentaBancaria,
        eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
      )
      .where(
        and(
          eq(
            conciliacionComprobante.movimientoBancarioId,
            ctx.data.movimientoId
          ),
          eq(cuentaBancaria.orgId, orgId)
        )
      )
      .orderBy(desc(conciliacionComprobante.revisadoAt));

    if (filas.some((f) => f.estado !== 'rechazada'))
      throw new Error('Este movimiento ya tiene un cruce');
    const [descartada] = filas;
    if (!descartada) throw new Error('Este movimiento no tiene un descarte');

    const [ocupada] = await db
      .select({ estado: conciliacionComprobante.estado })
      .from(conciliacionComprobante)
      .where(
        and(
          eq(conciliacionComprobante.comprobanteId, descartada.comprobanteId),
          inArray(conciliacionComprobante.estado, ['confirmada', 'sugerida'])
        )
      )
      .limit(1);
    if (ocupada)
      throw new Error(
        ocupada.estado === 'confirmada'
          ? 'Esa factura ya se concilió con otro movimiento'
          : 'Esa factura está sugerida para otro movimiento'
      );

    await db
      .update(conciliacionComprobante)
      .set({ estado: 'sugerida', revisadoPor: null, revisadoAt: null })
      .where(eq(conciliacionComprobante.id, descartada.id));

    return { ok: true };
  });

/**
 * Al confirmar un cruce, las sugerencias de OTROS movimientos para la misma
 * factura dejan de tener sentido: una factura se cobra (o se paga) una vez.
 */
async function descartarOtrasSugerencias(comprobanteIds: string[]) {
  if (comprobanteIds.length === 0) return;
  await db
    .delete(conciliacionComprobante)
    .where(
      and(
        inArray(conciliacionComprobante.comprobanteId, comprobanteIds),
        eq(conciliacionComprobante.estado, 'sugerida')
      )
    );
}

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
    await descartarOtrasSugerencias([ctx.data.comprobanteId]);

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
      .where(
        and(
          inArray(movimientoBancario.cuentaBancariaId, cuentaIds),
          eq(conciliacionComprobante.estado, 'confirmada')
        )
      );

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
 * Control bancario (reunión del 23/9): el módulo no busca cruzar factura por
 * factura, busca que los totales cierren. Dos comparaciones del mismo período:
 *
 *   ingresos del banco  vs  lo facturado (emitidas)
 *   egresos del banco   vs  lo comprado  (recibidas)
 *
 * De cada una sale la diferencia en pesos y en porcentaje. La diferencia no es
 * un error: puede ser una factura todavía no cobrada, un cobro de un mes
 * anterior, retenciones o impuestos. Por eso también vuelve el desglose por
 * concepto, que es lo que la explica.
 *
 * `meses` permite mirar una ventana más larga (agosto + septiembre), porque lo
 * facturado en un mes se cobra en el otro y mes a mes la brecha engaña.
 *
 * Las compras cuentan **todas** las facturas recibidas, sin importar la letra:
 * el estudio lo pidió explícitamente.
 */
export const getControlBancario = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      clienteId: z.string().uuid(),
      /** Último mes de la ventana, 'YYYY-MM'. */
      periodo: z.string().regex(/^\d{4}-\d{2}$/),
      /** Cuántos meses mira hacia atrás, incluido el pedido. */
      meses: z.number().int().min(1).max(12).default(1),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, meses } = ctx.data;

    const finDeVentana = `${ctx.data.periodo}-01`;
    // La ventana termina al final del mes pedido y arranca `meses - 1` antes.
    const desde = sql`(${finDeVentana}::date - make_interval(months => ${meses - 1}))`;
    const hasta = sql`(${finDeVentana}::date + interval '1 month')`;

    const movimientosDelPeriodo = and(
      eq(cuentaBancaria.orgId, orgId),
      eq(cuentaBancaria.clienteId, clienteId),
      eq(cuentaBancaria.activa, true),
      eq(movimientoBancario.excluido, false),
      sql`${movimientoBancario.fecha} >= ${desde}`,
      sql`${movimientoBancario.fecha} < ${hasta}`
    );

    const comprobantesDelPeriodo = (direccion: 'emitido' | 'recibido') =>
      and(
        eq(comprobante.orgId, orgId),
        eq(comprobante.clienteId, clienteId),
        eq(comprobante.direccion, direccion),
        sql`${comprobante.fechaEmision} >= ${desde}`,
        sql`${comprobante.fechaEmision} < ${hasta}`
      );

    // Las notas de crédito restan, igual que en IVA y en el resumen de
    // Facturas. Lo que está en otra moneda se pasa a pesos con su cotización.
    const totalComprobantes = sql<string>`coalesce(sum(
      (case when ${comprobanteTipo.esNc} then -1 else 1 end)
      * (case when upper(${comprobante.moneda}) = 'ARS' then 1
              else coalesce(nullif(${comprobante.cotizacion}, 0), 1) end)
      * ${comprobante.total}), 0)::text`;

    // El impuesto al cheque (ley 25.413) se toma a cuenta de Ganancias, así
    // que el estudio necesita el acumulado del año además del mes. Va por año
    // calendario, que es como se computa.
    const anio = ctx.data.periodo.slice(0, 4);

    const [
      banco,
      porConcepto,
      [emitidas],
      [recibidas],
      [ultimo],
      [chequeAnual],
    ] = await Promise.all([
      db
        .select({
          ingresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
          egresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
          movimientos: sql<number>`count(*)::int`,
        })
        .from(movimientoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
        )
        .where(movimientosDelPeriodo),

      db
        .select({
          categoria: movimientoBancario.categoria,
          direccion: movimientoBancario.direccion,
          total: sql<string>`coalesce(sum(${movimientoBancario.importe}), 0)::text`,
          movimientos: sql<number>`count(*)::int`,
        })
        .from(movimientoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
        )
        .where(movimientosDelPeriodo)
        .groupBy(movimientoBancario.categoria, movimientoBancario.direccion),

      db
        .select({
          total: totalComprobantes,
          comprobantes: sql<number>`count(*)::int`,
        })
        .from(comprobante)
        .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
        .where(comprobantesDelPeriodo('emitido')),

      db
        .select({
          total: totalComprobantes,
          comprobantes: sql<number>`count(*)::int`,
        })
        .from(comprobante)
        .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
        .where(comprobantesDelPeriodo('recibido')),

      // El último mes con movimientos, sin importar el período pedido: la card
      // de la ficha del cliente abre ahí cuando el mes anterior está vacío,
      // porque los extractos se cargan con atraso.
      db
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
            eq(cuentaBancaria.clienteId, clienteId),
            eq(cuentaBancaria.activa, true)
          )
        ),

      db
        .select({
          total: sql<string>`coalesce(sum(${movimientoBancario.importe}), 0)::text`,
          movimientos: sql<number>`count(*)::int`,
        })
        .from(movimientoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
        )
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, clienteId),
            eq(cuentaBancaria.activa, true),
            eq(movimientoBancario.categoria, 'impuestos_idc'),
            sql`${movimientoBancario.fecha} >= ${`${anio}-01-01`}::date`,
            sql`${movimientoBancario.fecha} < (${`${anio}-01-01`}::date + interval '1 year')`
          )
        ),
    ]);

    const ingresos = Number(banco[0]?.ingresos ?? 0);
    const egresos = Number(banco[0]?.egresos ?? 0);
    const ventas = Number(emitidas?.total ?? 0);
    const compras = Number(recibidas?.total ?? 0);
    // Con qué desvío este estudio quiere que le avisen.
    const umbral = await getUmbralControlBancario();

    const desglose = porConcepto
      .map((c) => ({
        categoria: c.categoria ?? 'varios',
        direccion: c.direccion,
        total: Number(c.total),
        movimientos: c.movimientos,
      }))
      .sort((a, b) => b.total - a.total);

    /**
     * El cuadre del propio extracto: saldo inicial + lo que entró − lo que
     * salió tiene que dar el saldo final que declara el banco.
     *
     * Responde una pregunta distinta a la del control contable: no es "¿está
     * bien contabilizado?" sino "¿está completo?". Si no cierra, falta un
     * movimiento en el medio —lo más común, una página del PDF que no se
     * leyó—, y todo lo que se calcule después va a estar mal sin que nada lo
     * avise. El cálculo ya existía, pero solo se veía al importar el extracto
     * y después desaparecía.
     */
    const [porCuenta, saldos] = await Promise.all([
      db
        .select({
          cuentaBancariaId: movimientoBancario.cuentaBancariaId,
          ingresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'ingreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
          egresos: sql<string>`coalesce(sum(case when ${movimientoBancario.direccion} = 'egreso' then ${movimientoBancario.importe} else 0 end), 0)::text`,
        })
        .from(movimientoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, movimientoBancario.cuentaBancariaId)
        )
        .where(movimientosDelPeriodo)
        .groupBy(movimientoBancario.cuentaBancariaId),
      // El inicial del primer mes de la ventana y el final del último: con
      // una ventana de varios meses la cuenta sigue siendo la misma.
      db
        .select({
          cuentaBancariaId: saldoBancario.cuentaBancariaId,
          banco: cuentaBancaria.banco,
          numero: cuentaBancaria.numero,
          inicial: sql<string>`(array_agg(${saldoBancario.saldoInicial} order by ${saldoBancario.periodo}))[1]`,
          final: sql<string>`(array_agg(${saldoBancario.saldoFinal} order by ${saldoBancario.periodo} desc))[1]`,
          meses: sql<number>`count(*)::int`,
        })
        .from(saldoBancario)
        .innerJoin(
          cuentaBancaria,
          eq(cuentaBancaria.id, saldoBancario.cuentaBancariaId)
        )
        .where(
          and(
            eq(cuentaBancaria.orgId, orgId),
            eq(cuentaBancaria.clienteId, clienteId),
            eq(cuentaBancaria.activa, true),
            sql`${saldoBancario.periodo} >= ${desde}::date`,
            sql`${saldoBancario.periodo} < ${hasta}::date`
          )
        )
        .groupBy(
          saldoBancario.cuentaBancariaId,
          cuentaBancaria.banco,
          cuentaBancaria.numero
        ),
    ]);

    const movsPorCuenta = new Map(
      porCuenta.map((c) => [
        c.cuentaBancariaId,
        { ingresos: Number(c.ingresos), egresos: Number(c.egresos) },
      ])
    );
    const cuadre = saldos.map((s) => {
      const m = movsPorCuenta.get(s.cuentaBancariaId) ?? {
        ingresos: 0,
        egresos: 0,
      };
      const inicial = Number(s.inicial);
      const real = Number(s.final);
      const esperado =
        Math.round((inicial + m.ingresos - m.egresos) * 100) / 100;
      return {
        cuentaBancariaId: s.cuentaBancariaId,
        cuentaBancaria: `${s.banco} ${s.numero ?? ''}`.trim(),
        inicial,
        ingresos: m.ingresos,
        egresos: m.egresos,
        esperado,
        real,
        diferencia: Math.round((real - esperado) * 100) / 100,
        /** Cuántos meses de extracto entraron en la cuenta. */
        meses: s.meses,
      };
    });

    return {
      periodo: ctx.data.periodo,
      meses,
      cuadre,
      ingresos: {
        banco: ingresos,
        comprobantes: ventas,
        cantidadComprobantes: Number(emitidas?.comprobantes ?? 0),
        ...semaforoBancoVsFacturacion(ingresos, ventas, umbral),
      },
      egresos: {
        banco: egresos,
        comprobantes: compras,
        cantidadComprobantes: Number(recibidas?.comprobantes ?? 0),
        ...semaforoBancoVsFacturacion(egresos, compras, umbral),
      },
      movimientos: Number(banco[0]?.movimientos ?? 0),
      ultimoPeriodoConDatos: ultimo?.periodo ?? null,
      umbral: { porcentaje: umbral.porcentaje },
      desglose,
      /** Impuesto al cheque: lo de la ventana y lo del año, para Ganancias. */
      impuestoCheque: {
        ventana: desglose
          .filter((d) => d.categoria === 'impuestos_idc')
          .reduce((acc, d) => acc + d.total, 0),
        anio: Number(chequeAnual?.total ?? 0),
        movimientosAnio: Number(chequeAnual?.movimientos ?? 0),
        anioLabel: anio,
      },
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
        // Solo lo confirmado: una sugerencia del cálculo sigue pendiente.
        .leftJoin(
          conciliacionComprobante,
          and(
            eq(
              conciliacionComprobante.movimientoBancarioId,
              movimientoBancario.id
            ),
            eq(conciliacionComprobante.estado, 'confirmada')
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
          contraparteDoc: contraparte.docNro,
          conciliacionId: conciliacionComprobante.id,
        })
        .from(comprobante)
        .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
        .leftJoin(contraparte, eq(contraparte.id, comprobante.contraparteId))
        .leftJoin(
          conciliacionComprobante,
          and(
            eq(conciliacionComprobante.comprobanteId, comprobante.id),
            eq(conciliacionComprobante.estado, 'confirmada')
          )
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
          // Los bancos meten el CUIT del ordenante en la descripción
          // ("TRANSFERENCIA INMEDIATA COE 30718075099"): encontrarlo es la
          // confirmación más fuerte que tenemos de que el cobro es de ese
          // cliente, y no solo una coincidencia de importe.
          const cuitEnDescripcion =
            c.contraparteDoc != null &&
            c.contraparteDoc.length >= 8 &&
            (m.descripcion ?? '').replace(/\D/g, '').includes(c.contraparteDoc);

          return {
            comprobanteId: c.id,
            confianza: cuitEnDescripcion
              ? 0.99
              : mismaContraparte
                ? 0.95
                : d === 0
                  ? 0.9
                  : 0.75,
            motivo: cuitEnDescripcion
              ? 'Mismo importe y el CUIT del cliente en la descripción'
              : mismaContraparte
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

    // La última factura emitida que tiene cargada la empresa: si el mes no
    // tiene ninguna, sirve para avisar desde cuándo faltan datos de ARCA.
    const [ultimaFactura] = await db
      .select({
        fecha: sql<string | null>`max(${comprobante.fechaEmision})::text`,
      })
      .from(comprobante)
      .where(
        and(
          eq(comprobante.orgId, orgId),
          eq(comprobante.clienteId, ctx.data.clienteId),
          eq(comprobante.direccion, 'emitido')
        )
      );

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
      ultimaFacturaEmitida: ultimaFactura?.fecha ?? null,
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
      // Los excluidos se devuelven para poder volver a incorporarlos: sacar
      // un movimiento de la conciliación no puede ser un camino de ida.
      excluidos: excluidos.map((m) => ({
        id: m.id,
        fecha: m.fecha,
        descripcion: m.descripcion,
        importe: m.importe,
        cuentaNumero: m.cuentaNumero,
      })),
      // Y lo ya conciliado, por el mismo motivo: tiene que poder deshacerse.
      conciliados: conciliados.map((m) => {
        const comp = comprobantes.find(
          (c) => c.id === m.comprobanteConciliadoId
        );
        return {
          id: m.id,
          fecha: m.fecha,
          descripcion: m.descripcion,
          importe: m.importe,
          estado: m.conciliacionEstado,
          comprobante: comp
            ? {
                id: comp.id,
                fechaEmision: comp.fechaEmision,
                tipoNombre: comp.tipoNombre,
                puntoVenta: comp.puntoVenta,
                numero: comp.numero,
                total: comp.total,
                contraparteNombre: comp.contraparteNombre,
              }
            : null,
        };
      }),
    };
  });

/** Deshace la conciliación de un movimiento: vuelve a la bandeja. */
export const desconciliarMovimiento = createServerFn({ method: 'POST' })
  .validator(z.object({ movimientoId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    // El movimiento tiene que ser de una cuenta de la organización.
    const [mov] = await db
      .select({ id: movimientoBancario.id })
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

    const borradas = await db
      .delete(conciliacionComprobante)
      .where(
        eq(conciliacionComprobante.movimientoBancarioId, ctx.data.movimientoId)
      )
      .returning({ id: conciliacionComprobante.id });

    return { deshechas: borradas.length };
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
          .where(
            and(
              inArray(conciliacionComprobante.comprobanteId, compIds),
              eq(conciliacionComprobante.estado, 'confirmada')
            )
          )
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
    await descartarOtrasSugerencias(validos.map((p) => p.comprobanteId));

    return {
      conciliados: validos.length,
      salteados: ctx.data.pares.length - validos.length,
    };
  });

/**
 * El último mes con movimientos cargados de una empresa.
 *
 * Banco abría siempre en el mes en curso, que casi nunca tiene nada: los
 * extractos llegan a mes vencido y algunas empresas están varios meses
 * atrasadas. La pantalla arrancaba vacía y parecía rota. Con esto abre donde
 * hay algo para ver.
 */
export const getUltimoMesConMovimientos = createServerFn({ method: 'GET' })
  .validator(z.object({ clienteId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const [fila] = await db
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
    return { periodo: fila?.periodo ?? null };
  });
