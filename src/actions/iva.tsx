import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { representative, client, ivaScrape, invoice } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { and, eq, asc, desc, isNull, sql } from 'drizzle-orm';

export const FISCAL_CONDITIONS = [
  'responsable_inscripto',
  'monotributista',
  'exento',
] as const;

/**
 * Resumen de posición IVA (iva_scrape) para todas las empresas Responsable
 * Inscripto de la organización, para un período fiscal dado ("MM/YYYY").
 * Left join: las empresas RI sin scrape del período aparecen con datos en null.
 */
export const getIvaResumenRI = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      periodo: z.string().regex(/^\d{2}\/\d{4}$/, 'Formato esperado: MM/YYYY'),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { periodo } = ctx.data;

    return await db
      .select({
        clientId: client.id,
        clientName: client.name,
        cuit: client.identityNumber,
        representativeName: representative.name,
        fiscalCondition: client.fiscalCondition,
        scrapeId: ivaScrape.id,
        ok: ivaScrape.ok,
        fechaPresentacion: ivaScrape.fechaPresentacion,
        debitoFiscal: ivaScrape.debitoFiscal,
        creditoFiscal: ivaScrape.creditoFiscal,
        saldoTecnicoFavorContribuyente:
          ivaScrape.saldoTecnicoFavorContribuyente,
        saldoLibreDisponibilidad:
          ivaScrape.saldoLibreDisponibilidadFavorContribuyentePeriodo,
        totalRetencionesPercepciones:
          ivaScrape.totalRetencionesPercepcionesPeriodo,
      })
      .from(client)
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .leftJoin(
        ivaScrape,
        and(
          eq(ivaScrape.clientId, client.id),
          eq(ivaScrape.periodoFiscal, periodo)
        )
      )
      .where(
        and(
          eq(representative.organizationId, orgId),
          eq(client.fiscalCondition, 'responsable_inscripto'),
          isNull(client.disabledAt)
        )
      )
      .orderBy(asc(client.name));
  });

/**
 * Empresas monotributistas con facturación emitida acumulada de los últimos
 * 12 meses cerrados (para monitorear límites de categoría).
 * Las notas de crédito (tipos 3, 8, 13) restan; el total es el del comprobante.
 */
export const getMonotributistasFacturacion = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const isCreditNote = sql`(${invoice.type} in ('3', '8', '13') or ${invoice.type}::text ilike '%Crédito%')`;

  return await db
    .select({
      clientId: client.id,
      clientName: client.name,
      cuit: client.identityNumber,
      representativeName: representative.name,
      fiscalCondition: client.fiscalCondition,
      invoiceCount: sql<number>`count(${invoice.id})::int`,
      ultimaFactura: sql<string | null>`max(${invoice.emitionDate})::text`,
      facturacion12m: sql<string>`coalesce(sum(case when ${isCreditNote} then -(${invoice.amount}::numeric) else (${invoice.amount}::numeric) end), 0)::text`,
    })
    .from(client)
    .innerJoin(representative, eq(client.representativeId, representative.id))
    .leftJoin(
      invoice,
      and(
        eq(invoice.clientId, client.id),
        sql`LOWER(${invoice.direction}) = 'outbound'`,
        sql`${invoice.emitionDate} >= date_trunc('month', now()) - interval '12 months'`
      )
    )
    .where(
      and(
        eq(representative.organizationId, orgId),
        eq(client.fiscalCondition, 'monotributista'),
        isNull(client.disabledAt)
      )
    )
    .groupBy(
      client.id,
      client.name,
      client.identityNumber,
      representative.name,
      client.fiscalCondition
    )
    .orderBy(
      desc(
        sql`coalesce(sum(case when ${isCreditNote} then -(${invoice.amount}::numeric) else (${invoice.amount}::numeric) end), 0)`
      )
    );
});

/** Empresas activas de la organización sin condición fiscal asignada. */
export const getClientsSinClasificar = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  return await db
    .select({
      clientId: client.id,
      clientName: client.name,
      cuit: client.identityNumber,
      representativeName: representative.name,
      fiscalCondition: client.fiscalCondition,
    })
    .from(client)
    .innerJoin(representative, eq(client.representativeId, representative.id))
    .where(
      and(
        eq(representative.organizationId, orgId),
        isNull(client.fiscalCondition),
        isNull(client.disabledAt)
      )
    )
    .orderBy(asc(client.name));
});

/** Actualiza la condición fiscal de una empresa (client). */
export const updateClientFiscalCondition = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalCondition: z.enum(FISCAL_CONDITIONS).nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    assertCanWrite(await getMemberRole());

    const { clientId, fiscalCondition } = ctx.data;

    // Verificar que la empresa pertenece a la organización activa
    const [owned] = await db
      .select({ id: client.id })
      .from(client)
      .innerJoin(representative, eq(client.representativeId, representative.id))
      .where(
        and(eq(client.id, clientId), eq(representative.organizationId, orgId))
      )
      .limit(1);

    if (!owned) throw new Error('Empresa no encontrada o no autorizada');

    const [updated] = await db
      .update(client)
      .set({ fiscalCondition, updatedAt: new Date() })
      .where(eq(client.id, clientId))
      .returning({
        clientId: client.id,
        fiscalCondition: client.fiscalCondition,
      });

    return updated;
  });
