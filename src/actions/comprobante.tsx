import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  comprobante,
  comprobanteAlicuota,
  comprobanteTipo,
  contraparte,
  cliente,
  liquidacionIibb,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { PROVINCE_LABELS } from '@/lib/provinces';
import { eq, desc, asc, and, gte, lte, sql, isNull } from 'drizzle-orm';
import { calcularIva, type ComprobanteAlicuotaRow } from '@/lib/iva-calc';

/** Valida que el cliente sea de la organización activa. */
async function assertClienteDeOrg(clienteId: string, orgId: string) {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, clienteId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Cliente no encontrado o no autorizado');
}

/** Primer día del mes de un período "YYYY-MM", que es como se guarda en BD. */
function periodoADate(periodo: string): string {
  return `${periodo}-01`;
}

export const getComprobantes = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      clienteId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      tipo: z.number().optional(),
      direccion: z.enum(['emitido', 'recibido']).optional(),
      search: z.string().optional(),
      sortBy: z.enum(['total', 'fechaEmision']).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const {
      page,
      limit,
      clienteId,
      dateFrom,
      dateTo,
      tipo,
      direccion,
      search,
      sortBy,
      sortOrder,
    } = ctx.data;

    const conditions = [eq(comprobante.orgId, orgId)];

    if (clienteId) conditions.push(eq(comprobante.clienteId, clienteId));
    if (dateFrom) conditions.push(gte(comprobante.fechaEmision, dateFrom));
    if (dateTo) conditions.push(lte(comprobante.fechaEmision, dateTo));
    if (tipo !== undefined) conditions.push(eq(comprobante.tipo, tipo));
    if (direccion) conditions.push(eq(comprobante.direccion, direccion));
    if (search) {
      conditions.push(
        sql`(${contraparte.nombre} ILIKE ${`%${search}%`} OR ${contraparte.docNro} ILIKE ${`%${search}%`})`
      );
    }

    const whereCondition = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .where(whereCondition);

    const orden =
      sortBy === 'total'
        ? sortOrder === 'asc'
          ? asc(comprobante.total)
          : desc(comprobante.total)
        : sortOrder === 'asc'
          ? asc(comprobante.fechaEmision)
          : desc(comprobante.fechaEmision);

    const rows = await db
      .select({
        id: comprobante.id,
        direccion: comprobante.direccion,
        fechaEmision: comprobante.fechaEmision,
        tipo: comprobante.tipo,
        tipoDescripcion: comprobanteTipo.descripcion,
        letra: comprobanteTipo.letra,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
        moneda: comprobante.moneda,
        cotizacion: comprobante.cotizacion,
        netoGravado: comprobante.netoGravado,
        ivaTotal: comprobante.ivaTotal,
        total: comprobante.total,
        cae: comprobante.cae,
        clienteId: comprobante.clienteId,
        clienteRazonSocial: cliente.razonSocial,
        contraparteId: contraparte.id,
        contraparteNombre: contraparte.nombre,
        contraparteDocTipo: contraparte.docTipo,
        contraparteDocNro: contraparte.docNro,
        contraparteProvincia: contraparte.provincia,
        createdAt: comprobante.createdAt,
      })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .innerJoin(cliente, eq(comprobante.clienteId, cliente.id))
      .where(whereCondition)
      .orderBy(orden)
      .limit(limit)
      .offset((page - 1) * limit);

    return {
      comprobantes: rows,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  });

export const getComprobante = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const [row] = await db
      .select({
        id: comprobante.id,
        direccion: comprobante.direccion,
        fechaEmision: comprobante.fechaEmision,
        tipo: comprobante.tipo,
        tipoDescripcion: comprobanteTipo.descripcion,
        letra: comprobanteTipo.letra,
        esNc: comprobanteTipo.esNc,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
        moneda: comprobante.moneda,
        cotizacion: comprobante.cotizacion,
        netoGravado: comprobante.netoGravado,
        netoNoGravado: comprobante.netoNoGravado,
        exento: comprobante.exento,
        otrosTributos: comprobante.otrosTributos,
        ivaTotal: comprobante.ivaTotal,
        total: comprobante.total,
        cae: comprobante.cae,
        fuente: comprobante.fuente,
        clienteId: comprobante.clienteId,
        clienteRazonSocial: cliente.razonSocial,
        contraparteNombre: contraparte.nombre,
        contraparteDocTipo: contraparte.docTipo,
        contraparteDocNro: contraparte.docNro,
        contraparteProvincia: contraparte.provincia,
        createdAt: comprobante.createdAt,
        updatedAt: comprobante.updatedAt,
      })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .innerJoin(cliente, eq(comprobante.clienteId, cliente.id))
      .where(and(eq(comprobante.id, ctx.data.id), eq(comprobante.orgId, orgId)))
      .limit(1);

    if (!row) throw new Error('Comprobante no encontrado');

    const alicuotas = await db
      .select({
        alicuota: comprobanteAlicuota.alicuota,
        neto: comprobanteAlicuota.neto,
        iva: comprobanteAlicuota.iva,
      })
      .from(comprobanteAlicuota)
      .where(eq(comprobanteAlicuota.comprobanteId, row.id))
      .orderBy(asc(comprobanteAlicuota.alicuota));

    return { ...row, alicuotas };
  });

/** Comprobantes de un cliente en un rango de fechas. */
export const getComprobantesEnRango = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string(),
      dateFrom: z.string(),
      dateTo: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, dateFrom, dateTo } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    return await db
      .select({
        id: comprobante.id,
        direccion: comprobante.direccion,
        fechaEmision: comprobante.fechaEmision,
        tipo: comprobante.tipo,
        tipoDescripcion: comprobanteTipo.descripcion,
        letra: comprobanteTipo.letra,
        esNc: comprobanteTipo.esNc,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
        moneda: comprobante.moneda,
        cotizacion: comprobante.cotizacion,
        netoGravado: comprobante.netoGravado,
        netoNoGravado: comprobante.netoNoGravado,
        exento: comprobante.exento,
        ivaTotal: comprobante.ivaTotal,
        total: comprobante.total,
        contraparteNombre: contraparte.nombre,
        contraparteDocNro: contraparte.docNro,
      })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(
        and(
          eq(comprobante.orgId, orgId),
          eq(comprobante.clienteId, clienteId),
          gte(comprobante.fechaEmision, dateFrom),
          lte(comprobante.fechaEmision, dateTo)
        )
      )
      .orderBy(desc(comprobante.fechaEmision));
  });

/**
 * Totales de IVA y de facturación de un cliente en un rango.
 *
 * El desglose de IVA sale de `comprobante_alicuota`; los totales por mes y por
 * tipo, de la cabecera. Las notas de crédito restan de los totales de
 * facturación (para el IVA la regla es otra, ver `calcularIva`).
 */
export const getComprobanteStats = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, dateFrom, dateTo } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    const conditions = [
      eq(comprobante.orgId, orgId),
      eq(comprobante.clienteId, clienteId),
    ];
    if (dateFrom) conditions.push(gte(comprobante.fechaEmision, dateFrom));
    if (dateTo) conditions.push(lte(comprobante.fechaEmision, dateTo));
    const whereCondition = and(...conditions);

    const cabeceras = await db
      .select({
        direccion: comprobante.direccion,
        fechaEmision: comprobante.fechaEmision,
        tipoDescripcion: comprobanteTipo.descripcion,
        esNc: comprobanteTipo.esNc,
        moneda: comprobante.moneda,
        cotizacion: comprobante.cotizacion,
        netoNoGravado: comprobante.netoNoGravado,
        exento: comprobante.exento,
        total: comprobante.total,
      })
      .from(comprobante)
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(whereCondition);

    const alicuotas: ComprobanteAlicuotaRow[] = await db
      .select({
        direccion: comprobante.direccion,
        letra: comprobanteTipo.letra,
        esNc: comprobanteTipo.esNc,
        moneda: comprobante.moneda,
        cotizacion: comprobante.cotizacion,
        alicuota: comprobanteAlicuota.alicuota,
        neto: comprobanteAlicuota.neto,
        iva: comprobanteAlicuota.iva,
      })
      .from(comprobanteAlicuota)
      .innerJoin(
        comprobante,
        eq(comprobanteAlicuota.comprobanteId, comprobante.id)
      )
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(whereCondition);

    const cotizacionDe = (moneda: string | null, cotizacion: string | null) =>
      moneda?.toUpperCase() === 'ARS' ? 1 : parseFloat(cotizacion ?? '1') || 1;

    // Neto a alícuota 0%: no genera crédito ni débito, pero se declara aparte.
    let totalAmountIVA0 = 0;
    for (const a of alicuotas) {
      if (parseFloat(a.alicuota) !== 0) continue;
      const cot = cotizacionDe(a.moneda, a.cotizacion);
      totalAmountIVA0 += (parseFloat(a.neto) || 0) * cot * (a.esNc ? -1 : 1);
    }

    let totalEmitido = 0;
    let totalRecibido = 0;
    let totalAmountExempt = 0;
    let totalAmountNoTaxed = 0;
    const porMes: Record<string, { outbound: number; inbound: number }> = {};
    const porTipo: Record<string, number> = {};

    for (const c of cabeceras) {
      const cot = cotizacionDe(c.moneda, c.cotizacion);
      const signo = c.esNc ? -1 : 1;
      const total = signo * (parseFloat(c.total) || 0) * cot;

      totalAmountExempt += signo * (parseFloat(c.exento) || 0) * cot;
      totalAmountNoTaxed += signo * (parseFloat(c.netoNoGravado) || 0) * cot;

      const mes = c.fechaEmision.slice(0, 7);
      porMes[mes] ??= { outbound: 0, inbound: 0 };
      if (c.direccion === 'emitido') {
        totalEmitido += total;
        porMes[mes].outbound += total;
      } else {
        totalRecibido += total;
        porMes[mes].inbound += total;
      }

      porTipo[c.tipoDescripcion] = (porTipo[c.tipoDescripcion] ?? 0) + total;
    }

    return {
      totalComprobantes: cabeceras.length,
      totalEmitido,
      totalRecibido,
      monthlyData: Object.entries(porMes)
        .map(([month, d]) => ({ month, ...d }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      typeDistribution: Object.entries(porTipo).map(([type, amount]) => ({
        type,
        amount,
      })),
      ...calcularIva(alicuotas),
      totalAmountExempt,
      totalAmountIVA0,
      totalAmountNoTaxed,
    };
  });

// ---------------------------------------------------------------------------
// Convenio Multilateral
// ---------------------------------------------------------------------------

/**
 * La provincia es la del receptor de la venta y vive en `contraparte` (catálogo
 * global), no en el comprobante. Sin provincia se asume Capital Federal, que es
 * como se venía tratando el dato faltante.
 */
const provinciaSql = sql<string>`CASE WHEN LOWER(COALESCE(${contraparte.provincia}, '')) IN ('', 'sin datos') THEN 'Capital Federal' ELSE ${contraparte.provincia} END`;

/**
 * Base imponible de IIBB: los comprobantes C no discriminan IVA, así que el
 * total es la base; en el resto la base es el neto gravado.
 */
const baseImponibleSql = sql<string>`(CASE WHEN ${comprobanteTipo.letra} = 'C' THEN ${comprobante.total} ELSE ${comprobante.netoGravado} END)`;

/** Las notas de crédito restan del total facturado. */
const signoNcSql = sql`(CASE WHEN ${comprobanteTipo.esNc} THEN -1 ELSE 1 END)`;

export const getClienteMultilateralResumen = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, dateFrom, dateTo } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    const conditions = [
      eq(comprobante.orgId, orgId),
      eq(comprobante.clienteId, clienteId),
      eq(comprobante.direccion, 'emitido'),
    ];
    if (dateFrom) conditions.push(gte(comprobante.fechaEmision, dateFrom));
    if (dateTo) conditions.push(lte(comprobante.fechaEmision, dateTo));

    return await db
      .select({
        provincia: provinciaSql,
        cantidad: sql<number>`count(*)::int`,
        totalIva: sql<string>`(coalesce(sum(${signoNcSql} * ${comprobante.ivaTotal}), 0))::text`,
        totalBase: sql<string>`(coalesce(sum(${signoNcSql} * ${baseImponibleSql}), 0))::text`,
      })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(and(...conditions))
      .groupBy(provinciaSql);
  });

export const getClienteMultilateralComprobantes = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      clienteId: z.string(),
      provincia: z.string().nullable().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, provincia, dateFrom, dateTo } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    const conditions = [
      eq(comprobante.orgId, orgId),
      eq(comprobante.clienteId, clienteId),
      eq(comprobante.direccion, 'emitido'),
    ];
    if (provincia !== undefined) {
      if (provincia === null || provincia === '') {
        conditions.push(isNull(contraparte.provincia));
      } else {
        conditions.push(eq(provinciaSql, provincia));
      }
    }
    if (dateFrom) conditions.push(gte(comprobante.fechaEmision, dateFrom));
    if (dateTo) conditions.push(lte(comprobante.fechaEmision, dateTo));

    return await db
      .select({
        id: comprobante.id,
        fechaEmision: comprobante.fechaEmision,
        tipo: comprobante.tipo,
        tipoDescripcion: comprobanteTipo.descripcion,
        puntoVenta: comprobante.puntoVenta,
        numero: comprobante.numero,
        moneda: comprobante.moneda,
        netoGravado: comprobante.netoGravado,
        baseImponible: baseImponibleSql,
        ivaTotal: comprobante.ivaTotal,
        total: comprobante.total,
        contraparteNombre: contraparte.nombre,
        contraparteDocNro: contraparte.docNro,
        provincia: provinciaSql,
        provinciaFuente: contraparte.provinciaFuente,
        provinciaActualizadaAt: contraparte.provinciaActualizadaAt,
      })
      .from(comprobante)
      .innerJoin(contraparte, eq(comprobante.contraparteId, contraparte.id))
      .innerJoin(comprobanteTipo, eq(comprobante.tipo, comprobanteTipo.codigo))
      .where(and(...conditions))
      .orderBy(desc(comprobante.fechaEmision));
  });

/**
 * Corrige a mano la provincia de una contraparte. `provincia_fuente = 'manual'`
 * hace que el proceso automático (padrón AFIP / Nosis) no la vuelva a pisar.
 *
 * No hay nada que propagar a los comprobantes: la provincia vive sólo acá.
 */
export const updateContraparteProvincia = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      docNro: z.string().min(1),
      provincia: z.enum(PROVINCE_LABELS),
    })
  )
  .handler(async (ctx) => {
    await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const { provincia } = ctx.data;
    const docNro = ctx.data.docNro.replace(/\D/g, '');
    if (!docNro) throw new Error('Documento inválido');

    const [row] = await db
      .update(contraparte)
      .set({
        provincia,
        provinciaFuente: 'manual',
        provinciaActualizadaAt: new Date(),
      })
      .where(eq(contraparte.docNro, docNro))
      .returning({ id: contraparte.id });

    if (!row) throw new Error('Contraparte no encontrada');

    return { provincia };
  });

// ---------------------------------------------------------------------------
// Liquidación IIBB
// ---------------------------------------------------------------------------

/**
 * Filas guardadas de liquidación IIBB para un período, más el saldo a favor del
 * período anterior por provincia (el frontend lo usa como valor inicial).
 */
export const getLiquidacionIibb = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clienteId: z.string(),
      periodo: z.string(), // "YYYY-MM"
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { clienteId, periodo } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    const [year, month] = periodo.split('-').map(Number);
    const anterior = new Date(Date.UTC(year, month - 2, 1))
      .toISOString()
      .slice(0, 10);

    const traer = (fecha: string) =>
      db
        .select()
        .from(liquidacionIibb)
        .where(
          and(
            eq(liquidacionIibb.orgId, orgId),
            eq(liquidacionIibb.clienteId, clienteId),
            eq(liquidacionIibb.periodo, fecha)
          )
        );

    const [rows, prevRows] = await Promise.all([
      traer(periodoADate(periodo)),
      traer(anterior),
    ]);

    const carryOver: Record<string, number> = {};
    for (const prev of prevRows) {
      const saldo = Number(prev.saldoAFavor ?? 0);
      if (saldo > 0) carryOver[prev.provincia] = saldo;
    }

    return {
      rows: rows.map((r) => ({
        id: r.id,
        provincia: r.provincia,
        alicuota: Number(r.alicuota),
        saldoAFavor: Number(r.saldoAFavor),
        percepcionesAgentes: Number(r.percepcionesAgentes),
        percepcionesAduaneras: Number(r.percepcionesAduaneras),
        retencionesAgentes: Number(r.retencionesAgentes),
        retencionesBancarias: Number(r.retencionesBancarias),
      })),
      carryOver,
    };
  });

export const saveLiquidacionIibb = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string(),
      periodo: z.string(), // "YYYY-MM"
      provincia: z.string(),
      alicuota: z.number().min(0).max(1),
      saldoAFavor: z.number().min(0),
      percepcionesAgentes: z.number().min(0),
      percepcionesAduaneras: z.number().min(0),
      retencionesAgentes: z.number().min(0),
      retencionesBancarias: z.number().min(0),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const { clienteId, periodo, provincia, ...montos } = ctx.data;
    await assertClienteDeOrg(clienteId, orgId);

    const valores = {
      alicuota: String(montos.alicuota),
      saldoAFavor: String(montos.saldoAFavor),
      percepcionesAgentes: String(montos.percepcionesAgentes),
      percepcionesAduaneras: String(montos.percepcionesAduaneras),
      retencionesAgentes: String(montos.retencionesAgentes),
      retencionesBancarias: String(montos.retencionesBancarias),
    };

    await db
      .insert(liquidacionIibb)
      .values({
        orgId,
        clienteId,
        periodo: periodoADate(periodo),
        provincia,
        ...valores,
      })
      .onConflictDoUpdate({
        target: [
          liquidacionIibb.clienteId,
          liquidacionIibb.periodo,
          liquidacionIibb.provincia,
        ],
        set: { ...valores, updatedAt: new Date() },
      });

    return { ok: true };
  });
