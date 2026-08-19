import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { db, dbReadonly } from '@/lib/db';
import {
  representative,
  client,
  ivaScrape,
  invoice,
  movements,
  debt,
  notification,
  job,
} from '@/drizzle/schema';
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm';
import { calcularIvaDesdeFacturas, type InvoiceIvaRow } from '@/lib/iva-calc';
import { assertCanWrite, getMemberRole, getSessionWithOrg } from './helpers';

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
      .select({ id: representative.id, name: sql<string>`coalesce(${representative.name}, '')` })
      .from(representative)
      .where(
        and(
          eq(representative.organizationId, orgId),
          ilike(representative.name, `%${clientName}%`)
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
          eq(client.representativeId, foundClient.id),
          ilike(client.name, `%${profileName}%`)
        )
      : eq(client.representativeId, foundClient.id);

    const profiles = await dbReadonly
      .select({
        id: client.id,
        name: client.name,
        identityNumber: client.identityNumber,
      })
      .from(client)
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
           WHERE client_id = ANY(ARRAY[${profileIds.map((id) => `'${id}'`).join(',')}]::uuid[])
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
            eq(ivaScrape.clientId, p.id),
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
            eq(invoice.clientId, p.id),
            gte(invoice.emitionDate, dateFrom),
            lte(invoice.emitionDate, dateTo)
          )
        );

      const ivaCalc = calcularIvaDesdeFacturas(invoices);
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

/* =========================================================================
   Resolución de cliente por nombre o id, scoped al org.
   Devuelve { id, name } o un mensaje de error.
   Usada por escanearExtractoBancario para que el LLM pueda pasar nombre.
   ========================================================================= */
const resolveClientInput = z
  .object({
    clientId: z.string().optional(),
    clientName: z.string().optional(),
  })
  .refine((v) => Boolean(v.clientId ?? v.clientName), {
    message: 'Se requiere clientId o clientName',
  });

export type ResolveClientResult =
  | { id: string; name: string }
  | { error: string; options?: string[] };

export const resolveClientForCopilot = createServerFn({ method: 'POST' })
  .inputValidator(resolveClientInput)
  .handler(async (ctx): Promise<ResolveClientResult> => {
    const { orgId } = (await getSessionWithOrg()) as { orgId: string };
    const { clientId, clientName } = ctx.data;

    if (clientId) {
      const [row] = await dbReadonly
        .select({ id: representative.id, name: sql<string>`coalesce(${representative.name}, '')` })
        .from(representative)
        .where(and(eq(representative.id, clientId), eq(representative.organizationId, orgId)))
        .limit(1);
      if (!row) return { error: 'Cliente no encontrado o fuera del estudio.' };
      return { id: row.id, name: row.name };
    }

    const matches = await dbReadonly
      .select({ id: representative.id, name: sql<string>`coalesce(${representative.name}, '')` })
      .from(representative)
      .where(
        and(
          eq(representative.organizationId, orgId),
          ilike(representative.name, `%${clientName!}%`)
        )
      );
    if (matches.length === 0) {
      return { error: `No encontré clientes con nombre "${clientName!}"` };
    }
    if (matches.length > 1) {
      return {
        error: 'Más de un cliente coincide',
        options: matches.map((c) => c.name),
      };
    }
    return { id: matches[0].id, name: matches[0].name };
  });

/* =========================================================================
   Persistir movimientos extraídos de un extracto bancario por scanBankStatement.
   Inserta en `movements` (FK por userId, no por client — ver schema.ts:353).
   El clientId se valida contra el org pero no queda almacenado en la fila
   (la tabla actual no tiene FK a client). Se incluye una nota en `descripcion`
   con el banco y el cliente para preservar la trazabilidad.
   ========================================================================= */
const movementInputSchema = z.object({
  fecha: z.string().min(1),
  tipo: z.enum(['ingreso', 'egreso']),
  monto: z.string().min(1),
  infoExtra: z.string().optional().default(''),
  tipoGasto: z.string().optional(),
});

const persistMovementsInput = z.object({
  clientId: z.string().min(1),
  banco: z.string().optional().default(''),
  ingresos: z.array(movementInputSchema),
  egresos: z.array(movementInputSchema),
});

export interface PersistMovementsResult {
  inserted: number;
  skipped: number;
  clientId: string;
  clientName: string;
  banco: string;
}

const ARG_MONTO_RE = /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+(,\d{1,2})?$/;
const FECHA_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/;
const NON_NUMERIC_RE = /[^0-9.-]/g;

function parseArgMonto(raw: string): number | null {
  const trimmed = raw.trim().replace(/^\$\s*/, '');
  // Acepta formato argentino "1.234.567,89" o "1234567,89" o "1234567.89".
  if (ARG_MONTO_RE.test(trimmed)) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  // Fallback permisivo: quita separadores y prueba.
  const fallback = Number(
    trimmed.replace(/\./g, '').replace(',', '.').replace(NON_NUMERIC_RE, '')
  );
  return Number.isFinite(fallback) ? fallback : null;
}

function parseArgFecha(raw: string): Date | null {
  const m = FECHA_RE.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isFinite(d.getTime()) ? d : null;
}

export const persistBankStatementMovements = createServerFn({ method: 'POST' })
  .inputValidator(persistMovementsInput)
  .handler(async (ctx): Promise<PersistMovementsResult> => {
    const { orgId, userId } = (await getSessionWithOrg()) as {
      orgId: string;
      userId: string;
    };
    const role = await getMemberRole();
    assertCanWrite(role);

    const { clientId, banco, ingresos, egresos } = ctx.data;

    const [target] = await db
      .select({ id: representative.id, name: sql<string>`coalesce(${representative.name}, '')` })
      .from(representative)
      .where(and(eq(representative.id, clientId), eq(representative.organizationId, orgId)))
      .limit(1);
    if (!target) {
      throw new Error('Cliente no encontrado o fuera del estudio.');
    }

    const all: {
      tipo: 'ingreso' | 'egreso';
      m: z.infer<typeof movementInputSchema>;
    }[] = [
      ...ingresos.map((m) => ({ tipo: 'ingreso' as const, m })),
      ...egresos.map((m) => ({ tipo: 'egreso' as const, m })),
    ];

    const rows: (typeof movements.$inferInsert)[] = [];
    let skipped = 0;
    for (const { tipo, m } of all) {
      const fecha = parseArgFecha(m.fecha);
      const montoNum = parseArgMonto(m.monto);
      if (!fecha || montoNum == null) {
        skipped += 1;
        continue;
      }
      const descripcion = banco
        ? `[${banco}] ${m.infoExtra ?? ''}`.trim()
        : (m.infoExtra ?? '').trim() || tipo;
      rows.push({
        id: crypto.randomUUID(),
        userId,
        tipo,
        fecha,
        descripcion,
        monto: Math.abs(montoNum).toFixed(2),
        tipoGasto: m.tipoGasto ?? 'Sin especificar',
      });
    }

    if (rows.length > 0) {
      await db.insert(movements).values(rows);
    }

    return {
      inserted: rows.length,
      skipped,
      clientId: target.id,
      clientName: target.name,
      banco: banco ?? '',
    };
  });

/**
 * Resumen de salud de un cliente (módulo Clientes).
 *
 * Combina datos de varias tablas para devolver un overview ejecutivo:
 * - Health score 0-100
 * - Facturación del mes en curso
 * - Deudas vencidas y pendientes
 * - Notificaciones AFIP no leídas
 * - Estado del último scrape de cada tipo (auth_error / ok / fallido)
 *
 * Diseñado para responder "cómo está el cliente X" sin abrir 7 tabs.
 *
 * Acepta `clientId` y/o `clientName`. Si el id no resuelve (LLMs suelen
 * "regenerar" UUIDs cambiándole un dígito), cae por fuzzy match al nombre.
 */
const getResumenSaludClienteInput = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
});

export type GetResumenSaludClienteResult =
  | { error: string }
  | {
      cliente: { id: string; name: string; identityNumber: string };
      healthScore: number;
      facturacionMesActual: { ventas: number; compras: number; cantidad: number };
      deudas: { vencidas: number; vencidasMonto: number; total: number; totalMonto: number };
      notificaciones: { noLeidas: number };
      ultimoScrapePorTipo: {
        tipo: string;
        status: string | null;
        finishedAt: string | null;
        diasDesde: number | null;
        failedReason: string | null;
      }[];
      observaciones: { severidad: 'info' | 'warn' | 'error'; mensaje: string }[];
    };

export const getResumenSaludCliente = createServerFn({ method: 'POST' })
  .inputValidator(getResumenSaludClienteInput)
  .handler(async (ctx): Promise<GetResumenSaludClienteResult> => {
    const { orgId } = (await getSessionWithOrg()) as { orgId: string };
    const { clientId, clientName } = ctx.data;

    if (!clientId && !clientName) {
      return { error: 'Se requiere clientId o clientName.' };
    }

    // 1) Try exact id match first (typical happy path).
    let target: { id: string; name: string; identityNumber: string } | null = null;
    if (clientId) {
      const [byId] = await dbReadonly
        .select({
          id: representative.id,
          name: sql<string>`coalesce(${representative.name}, '')`,
          identityNumber: representative.cuit,
        })
        .from(representative)
        .where(
          and(eq(representative.id, clientId), eq(representative.organizationId, orgId))
        )
        .limit(1);
      if (byId) target = byId;
    }

    // 2) Fallback: fuzzy match by name (LLMs sometimes mangle UUIDs).
    if (!target && clientName) {
      const matches = await dbReadonly
        .select({
          id: representative.id,
          name: sql<string>`coalesce(${representative.name}, '')`,
          identityNumber: representative.cuit,
        })
        .from(representative)
        .where(
          and(
            eq(representative.organizationId, orgId),
            ilike(representative.name, `%${clientName}%`)
          )
        )
        .limit(5);
      if (matches.length === 1) {
        target = matches[0];
      } else if (matches.length > 1) {
        return {
          error: `Encontré varios clientes con nombre similar a "${clientName}". Especificá cuál: ${matches
            .map((m) => m.name)
            .join(', ')}`,
        };
      }
    }

    if (!target) {
      return {
        error: clientName
          ? `No encontré ningún cliente con nombre "${clientName}" en el estudio.`
          : 'Cliente no encontrado o fuera del estudio.',
      };
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [debtRows, notifRow, jobRows, invoiceAgg] = await Promise.all([
      dbReadonly.select().from(debt).where(eq(debt.representativeId, target.id)),
      dbReadonly
        .select({ count: sql<number>`count(*)` })
        .from(notification)
        .where(
          and(eq(notification.representativeId, target.id), eq(notification.opened, false))
        ),
      // Último job de cada tipo
      dbReadonly
        .select({
          type: job.type,
          status: job.status,
          finishedAt: job.finishedAt,
          createdAt: job.createdAt,
          failedReason: job.failedReason,
        })
        .from(job)
        .where(eq(job.representativeId, target.id))
        .orderBy(desc(job.createdAt))
        .limit(50),
      // Facturación del mes
      dbReadonly
        .select({
          direction: invoice.direction,
          totalSum: sql<string>`COALESCE(SUM(${invoice.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(invoice)
        .innerJoin(client, eq(invoice.clientId, client.id))
        .where(
          and(
            eq(client.representativeId, target.id),
            gte(invoice.emitionDate, monthStart),
            lte(invoice.emitionDate, monthEnd)
          )
        )
        .groupBy(invoice.direction),
    ]);

    const num = (v: unknown) => Number(v ?? 0);

    let ventas = 0;
    let compras = 0;
    let invoiceCount = 0;
    for (const row of invoiceAgg) {
      const total = num(row.totalSum);
      invoiceCount += Number(row.count);
      if (row.direction === 'output' || row.direction === 'sales')
        ventas += total;
      else compras += total;
    }

    const debtsVencidas = debtRows.filter((d) => d.dueDate && new Date(d.dueDate) < now);
    const debtsVencidasMonto = debtsVencidas.reduce((s, d) => s + num(d.balance), 0);
    const debtsTotalMonto = debtRows.reduce((s, d) => s + num(d.balance), 0);

    const noLeidas = Number(notifRow[0]?.count ?? 0);

    // Reducir jobs a último por tipo
    const tipos = ['iva', 'comprobantes', 'notificaciones', 'deuda', 'vencimientos'] as const;
    const ultimoScrapePorTipo = tipos.map((tipo) => {
      const last = jobRows.find((j) => j.type === tipo);
      const finished = last?.finishedAt ? new Date(last.finishedAt) : null;
      const diasDesde = finished
        ? Math.floor((now.getTime() - finished.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        tipo,
        status: last?.status ?? null,
        finishedAt: finished ? finished.toISOString() : null,
        diasDesde,
        failedReason: last?.failedReason ?? null,
      };
    });

    // Health score
    let score = 0;
    const observaciones: { severidad: 'info' | 'warn' | 'error'; mensaje: string }[] = [];

    // 25 pts: sin deudas vencidas
    if (debtsVencidas.length === 0) score += 25;
    else
      observaciones.push({
        severidad: 'error',
        mensaje: `${debtsVencidas.length} deudas vencidas por $${debtsVencidasMonto.toFixed(0)}`,
      });

    // 20 pts: scrape reciente (cualquier tipo, <7 días)
    const scrapeReciente = ultimoScrapePorTipo.some(
      (s) => s.diasDesde !== null && s.diasDesde <= 7 && s.status === 'finished'
    );
    if (scrapeReciente) score += 20;
    else
      observaciones.push({
        severidad: 'warn',
        mensaje: 'No hay scrapes exitosos en los últimos 7 días',
      });

    // 20 pts: ningún job recientemente fallido
    const algunFallido = ultimoScrapePorTipo.some((s) => s.status === 'failed');
    if (!algunFallido) score += 20;
    else
      observaciones.push({
        severidad: 'error',
        mensaje: 'Hay jobs fallidos recientes — revisar credenciales',
      });

    // 15 pts: notif no leídas < 5
    if (noLeidas < 5) score += 15;
    else
      observaciones.push({
        severidad: 'warn',
        mensaje: `${noLeidas} notificaciones AFIP sin leer`,
      });

    // 20 pts: tiene facturación reciente
    if (invoiceCount > 0) score += 20;
    else
      observaciones.push({
        severidad: 'info',
        mensaje: 'Sin facturación registrada este mes',
      });

    return {
      cliente: target,
      healthScore: score,
      facturacionMesActual: { ventas, compras, cantidad: invoiceCount },
      deudas: {
        vencidas: debtsVencidas.length,
        vencidasMonto: debtsVencidasMonto,
        total: debtRows.length,
        totalMonto: debtsTotalMonto,
      },
      notificaciones: { noLeidas },
      ultimoScrapePorTipo,
      observaciones,
    };
  });
