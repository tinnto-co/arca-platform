import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  cliente,
  ivaDeclaracion,
  comprobante,
  comprobanteTipo,
  condicionIva,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { and, eq, asc, desc, isNull, sql } from 'drizzle-orm';

export const FISCAL_CONDITIONS = condicionIva.enumValues;

/**
 * Los logins de AFIP del cliente, en una sola línea. Un cliente puede tener
 * más de uno (varios representantes declaran por él), así que se agregan.
 */
const credencialesSql = sql<string | null>`(
  select string_agg(distinct coalesce(cr.nombre, cr.cuit), ', ')
  from cliente_credencial cc
  join credencial_afip cr on cr.id = cc.credencial_id
  where cc.cliente_id = ${cliente.id}
)`;

/** "MM/YYYY" → primer día del mes, que es como se guarda el período. */
function periodoADate(periodo: string): string {
  const [mm, yyyy] = periodo.split('/');
  return `${yyyy}-${mm}-01`;
}

/**
 * Resumen de posición IVA (F2051 scrapeado) de todos los clientes Responsable
 * Inscripto de la organización, para un período fiscal dado ("MM/YYYY").
 * Left join: los RI sin declaración del período aparecen con datos en null.
 */
export const getIvaResumenRI = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      periodo: z.string().regex(/^\d{2}\/\d{4}$/, 'Formato esperado: MM/YYYY'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const periodo = periodoADate(ctx.data.periodo);

    return await db
      .select({
        clienteId: cliente.id,
        razonSocial: cliente.razonSocial,
        cuit: cliente.cuit,
        credenciales: credencialesSql,
        condicionIva: cliente.condicionIva,
        declaracionId: ivaDeclaracion.id,
        presentadaAt: ivaDeclaracion.presentadaAt,
        debitoFiscal: ivaDeclaracion.debitoFiscal,
        creditoFiscal: ivaDeclaracion.creditoFiscal,
        saldoTecnicoFavor: ivaDeclaracion.saldoTecnicoFavor,
        saldoLibreDisponibilidadFavor:
          ivaDeclaracion.saldoLibreDisponibilidadFavor,
        retencionesPercepcionesPeriodo:
          ivaDeclaracion.retencionesPercepcionesPeriodo,
      })
      .from(cliente)
      .leftJoin(
        ivaDeclaracion,
        and(
          eq(ivaDeclaracion.clienteId, cliente.id),
          eq(ivaDeclaracion.periodo, periodo)
        )
      )
      .where(
        and(
          eq(cliente.orgId, orgId),
          eq(cliente.condicionIva, 'responsable_inscripto'),
          eq(cliente.estado, 'activo')
        )
      )
      .orderBy(asc(cliente.razonSocial));
  });

/**
 * Clientes monotributistas con la facturación emitida acumulada de los últimos
 * 12 meses cerrados, para monitorear los límites de categoría. Las notas de
 * crédito restan: el catálogo `comprobante_tipo` dice cuáles lo son.
 */
export const getMonotributistasFacturacion = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const facturado = sql`coalesce(sum(
    case when ${comprobanteTipo.esNc} then -${comprobante.total} else ${comprobante.total} end
  ), 0)`;

  return await db
    .select({
      clienteId: cliente.id,
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
      credenciales: credencialesSql,
      condicionIva: cliente.condicionIva,
      comprobanteCount: sql<number>`count(${comprobante.id})::int`,
      ultimoComprobante: sql<string | null>`max(${comprobante.fechaEmision})::text`,
      facturacion12m: sql<string>`${facturado}::text`,
    })
    .from(cliente)
    .leftJoin(
      comprobante,
      and(
        eq(comprobante.clienteId, cliente.id),
        eq(comprobante.direccion, 'emitido'),
        sql`${comprobante.fechaEmision} >= date_trunc('month', now()) - interval '12 months'`
      )
    )
    .leftJoin(comprobanteTipo, eq(comprobanteTipo.codigo, comprobante.tipo))
    .where(
      and(
        eq(cliente.orgId, orgId),
        eq(cliente.condicionIva, 'monotributista'),
        eq(cliente.estado, 'activo')
      )
    )
    .groupBy(cliente.id, cliente.razonSocial, cliente.cuit, cliente.condicionIva)
    .orderBy(desc(facturado));
});

/** Clientes activos de la organización sin condición fiscal asignada. */
export const getClientesSinClasificar = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  return await db
    .select({
      clienteId: cliente.id,
      razonSocial: cliente.razonSocial,
      cuit: cliente.cuit,
      credenciales: credencialesSql,
      condicionIva: cliente.condicionIva,
    })
    .from(cliente)
    .where(
      and(
        eq(cliente.orgId, orgId),
        isNull(cliente.condicionIva),
        eq(cliente.estado, 'activo')
      )
    )
    .orderBy(asc(cliente.razonSocial));
});

export const updateClienteCondicionIva = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clienteId: z.string().uuid(),
      condicionIva: z.enum(condicionIva.enumValues).nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const [updated] = await db
      .update(cliente)
      .set({ condicionIva: ctx.data.condicionIva, updatedAt: new Date() })
      .where(and(eq(cliente.id, ctx.data.clienteId), eq(cliente.orgId, orgId)))
      .returning({
        clienteId: cliente.id,
        condicionIva: cliente.condicionIva,
      });

    if (!updated) throw new Error('Cliente no encontrado o no autorizado');
    return updated;
  });
