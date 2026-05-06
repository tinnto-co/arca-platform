import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { dbReadonly } from '@/lib/db';
import { client, profile, ivaScrape, invoice } from '@/drizzle/schema';
import { and, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { calcularIvaDesdeFacturas, type InvoiceIvaRow } from '@/lib/iva-calc';
import { getSessionWithOrg } from './helpers';

const getIvaPositionInput = z.object({
  clientName: z.string(),
  displayMonth: z.string().optional(),
  profileName: z.string().optional(),
});

export type GetIvaPositionForCopilotResult =
  | {
      error: string;
      options?: string[];
    }
  | {
      cliente: string;
      clienteId: string;
      periodoMostrado: string;
      periodoIvaScrape: string;
      perfiles: {
        profileId: string;
        perfil: string;
        cuit: string | null;
        periodo: string;
        fechaPresentacion: string;
        ventas: {
          netoA21: string;
          netoA105: string;
          totalB21: string;
          totalB105: string;
          totalB27: string;
          debitoFiscal: string;
        };
        compras: {
          netoGravado21: string;
          netoGravado105: string;
          netoGravado27: string;
          creditoFiscal: string;
        };
        saldosAFIP: {
          saldoAFavorPeriodoAnterior: string | null;
          saldoLibreDisponibilidad: string | null;
          totalRetencionesPercepciones: string | null;
        };
        saldoTecnico: string;
        saldoLibreDisponibilidad: string;
        totalRetencionesPercepciones: string;
        tieneDatosAFIP: boolean;
        ivaScrape: {
          periodoFiscal: string;
          fechaPresentacion: string | null;
          debitoFiscal: string | null;
          creditoFiscal: string | null;
          saldoMesPasado: string | null;
          saldoArcaMes: string | null;
          saldoTecnicoFavorContribuyente: string | null;
          saldoTecnicoFavorContribuyentePosicionMensual: string | null;
          saldoLibreDisponibilidadPeriodoAnteriorNeto: string | null;
          totalRetencionesPercepcionesPeriodo: string | null;
          saldoLibreDisponibilidadFavorContribuyentePeriodo: string | null;
        } | null;
      }[];
      totales: {
        debitoFiscal: string;
        creditoFiscal: string;
        saldoTecnico: string;
        saldoLibreDisponibilidad: string;
      } | null;
    };

export const getIvaPositionForCopilot = createServerFn({ method: 'POST' })
  .inputValidator(getIvaPositionInput)
  .handler(async (ctx): Promise<GetIvaPositionForCopilotResult> => {
    const { orgId } = (await getSessionWithOrg()) as { orgId: string };
    const { clientName, displayMonth, profileName } = ctx.data;

    const matchingClients = await dbReadonly
      .select({ id: client.id, name: client.name })
      .from(client)
      .where(
        and(
          eq(client.organizationId, orgId),
          ilike(client.name, `%${clientName}%`)
        )
      );

    if (matchingClients.length === 0) {
      return { error: `No encontré clientes con nombre "${clientName}"` };
    }
    if (matchingClients.length > 1) {
      return {
        error: 'Más de un cliente coincide',
        options: matchingClients.map((c) => c.name),
      };
    }

    const foundClient = matchingClients[0];

    const profileWhere = profileName
      ? and(
          eq(profile.client, foundClient.id),
          ilike(profile.name, `%${profileName}%`)
        )
      : eq(profile.client, foundClient.id);

    const profiles = await dbReadonly
      .select({
        id: profile.id,
        name: profile.name,
        identityNumber: profile.identityNumber,
      })
      .from(profile)
      .where(profileWhere);

    if (profiles.length === 0) {
      return { error: `No se encontraron perfiles para ${foundClient.name}` };
    }

    const profileIds = profiles.map((p) => p.id);

    // "03/2026" → "02/2026"
    const prevMonthStr = (s: string): string => {
      const [mm, yyyy] = s.split('/').map(Number);
      const d = new Date(yyyy, mm - 2, 1);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    // "02/2026" → "03/2026"
    const nextMonthStr = (s: string): string => {
      const [mm, yyyy] = s.split('/').map(Number);
      const d = new Date(yyyy, mm, 1);
      return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };

    const periodToDateRange = (p: string): { from: Date; to: Date } => {
      const [mm, yyyy] = p.split('/').map(Number);
      const from = new Date(yyyy, mm - 1, 1);
      const to = new Date(yyyy, mm, 0, 23, 59, 59);
      return { from, to };
    };

    let invoicePeriod: string;
    let ivaScrapeperiod: string;

    if (displayMonth) {
      invoicePeriod = displayMonth;
      ivaScrapeperiod = prevMonthStr(displayMonth);
    } else {
      const rows = await dbReadonly.execute(
        sql.raw(
          `SELECT periodo_fiscal FROM iva_scrape
           WHERE profile_id = ANY(ARRAY[${profileIds.map((id) => `'${id}'`).join(',')}]::uuid[])
           ORDER BY TO_DATE(periodo_fiscal, 'MM/YYYY') DESC LIMIT 1`
        )
      );
      const arr: { periodo_fiscal: string }[] = Array.from(
        rows as Iterable<{ periodo_fiscal: string }>
      );
      if (arr.length === 0) {
        return {
          error: `No hay datos de IVA disponibles para ${foundClient.name}.`,
        };
      }
      ivaScrapeperiod = arr[0].periodo_fiscal;
      invoicePeriod = nextMonthStr(ivaScrapeperiod);
    }

    const { from: dateFrom, to: dateTo } = periodToDateRange(invoicePeriod);
    const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

    const results: Extract<
      GetIvaPositionForCopilotResult,
      { perfiles: unknown }
    >['perfiles'] = [];

    for (const p of profiles) {
      const [ivaRow] = await dbReadonly
        .select()
        .from(ivaScrape)
        .where(
          and(
            eq(ivaScrape.profileId, p.id),
            eq(ivaScrape.periodoFiscal, ivaScrapeperiod)
          )
        )
        .limit(1);

      const invoices = await dbReadonly
        .select({
          direction: invoice.direction,
          type: invoice.type,
          currency: invoice.currency,
          currencyRate: invoice.cureencyRate,
          amountIVA21: invoice.amountIVA21,
          amountIVA105: invoice.amountIVA105,
          amountIVA27: invoice.amountIVA27,
          amountIVA5: invoice.amountIVA5,
          amountIVA25: invoice.amountIVA25,
          IVA21: invoice.IVA21,
          IVA105: invoice.IVA105,
          IVA27: invoice.IVA27,
        })
        .from(invoice)
        .where(
          and(
            eq(invoice.profile, p.id),
            gte(invoice.emitionDate, dateFrom),
            lte(invoice.emitionDate, dateTo)
          )
        );

      const ivaCalc = calcularIvaDesdeFacturas(invoices as InvoiceIvaRow[]);
      const debitoFiscalCalculado = ivaCalc.debitoFiscal;
      const creditoFiscalCalculado = ivaCalc.creditoFiscalCompras;
      const {
        netoA21,
        netoA105,
        totalAmountB21: totalB21,
        totalAmountB105: totalB105,
        totalAmountB27: totalB27,
        netoInbound21: netoIn21,
        netoInbound105: netoIn105,
        netoInbound27: netoIn27,
      } = ivaCalc;

      const saldoAFavor = n(ivaRow?.saldoTecnicoFavorContribuyente);
      const saldoLibreDisp = n(
        ivaRow?.saldoLibreDisponibilidadFavorContribuyentePeriodo
      );
      const totalRetenciones = n(ivaRow?.totalRetencionesPercepcionesPeriodo);

      const saldoTecnico =
        debitoFiscalCalculado - creditoFiscalCalculado - saldoAFavor;

      results.push({
        profileId: p.id,
        perfil: p.name,
        cuit: p.identityNumber,
        periodo: invoicePeriod,
        fechaPresentacion: ivaRow?.fechaPresentacion ?? 'No disponible',
        ventas: {
          netoA21: netoA21.toFixed(2),
          netoA105: netoA105.toFixed(2),
          totalB21: totalB21.toFixed(2),
          totalB105: totalB105.toFixed(2),
          totalB27: totalB27.toFixed(2),
          debitoFiscal: debitoFiscalCalculado.toFixed(2),
        },
        compras: {
          netoGravado21: netoIn21.toFixed(2),
          netoGravado105: netoIn105.toFixed(2),
          netoGravado27: netoIn27.toFixed(2),
          creditoFiscal: creditoFiscalCalculado.toFixed(2),
        },
        saldosAFIP: {
          saldoAFavorPeriodoAnterior:
            ivaRow?.saldoTecnicoFavorContribuyente ?? null,
          saldoLibreDisponibilidad:
            ivaRow?.saldoLibreDisponibilidadFavorContribuyentePeriodo ?? null,
          totalRetencionesPercepciones:
            ivaRow?.totalRetencionesPercepcionesPeriodo ?? null,
        },
        saldoTecnico: saldoTecnico.toFixed(2),
        saldoLibreDisponibilidad: saldoLibreDisp.toFixed(2),
        totalRetencionesPercepciones: totalRetenciones.toFixed(2),
        tieneDatosAFIP: !!ivaRow,
        ivaScrape: ivaRow
          ? {
              periodoFiscal: ivaRow.periodoFiscal,
              fechaPresentacion: ivaRow.fechaPresentacion ?? null,
              debitoFiscal: ivaRow.debitoFiscal ?? null,
              creditoFiscal: ivaRow.creditoFiscal ?? null,
              saldoMesPasado: ivaRow.saldoMesPasado ?? null,
              saldoArcaMes: ivaRow.saldoArcaMes ?? null,
              saldoTecnicoFavorContribuyente:
                ivaRow.saldoTecnicoFavorContribuyente ?? null,
              saldoTecnicoFavorContribuyentePosicionMensual:
                ivaRow.saldoTecnicoFavorContribuyentePosicionMensual ?? null,
              saldoLibreDisponibilidadPeriodoAnteriorNeto:
                ivaRow.saldoLibreDisponibilidadPeriodoAnteriorNeto ?? null,
              totalRetencionesPercepcionesPeriodo:
                ivaRow.totalRetencionesPercepcionesPeriodo ?? null,
              saldoLibreDisponibilidadFavorContribuyentePeriodo:
                ivaRow.saldoLibreDisponibilidadFavorContribuyentePeriodo ??
                null,
            }
          : null,
      });
    }

    if (results.length === 0) {
      return {
        error: `No hay datos para ${foundClient.name} en el período ${invoicePeriod}.`,
      };
    }

    const totales =
      results.length > 1
        ? {
            debitoFiscal: results
              .reduce((s, r) => s + n(r.ventas.debitoFiscal), 0)
              .toFixed(2),
            creditoFiscal: results
              .reduce((s, r) => s + n(r.compras.creditoFiscal), 0)
              .toFixed(2),
            saldoTecnico: results
              .reduce((s, r) => s + n(r.saldoTecnico), 0)
              .toFixed(2),
            saldoLibreDisponibilidad: results
              .reduce((s, r) => s + n(r.saldoLibreDisponibilidad), 0)
              .toFixed(2),
          }
        : null;

    return {
      cliente: foundClient.name,
      clienteId: foundClient.id,
      periodoMostrado: invoicePeriod,
      periodoIvaScrape: ivaScrapeperiod,
      perfiles: results,
      totales,
    };
  });
