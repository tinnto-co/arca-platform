/**
 * Server functions del ajuste por inflación (RT 6) y del RECPAM.
 *
 * Dos bloques:
 * 1. **Serie de índices** (`inflation_index`): dato público y global del estudio,
 *    no se scopea por empresa. Se carga desde la planilla de FACPCE o a mano.
 * 2. **Ajuste de un ejercicio** (`inflation_adjustment`): preplanilla + asiento
 *    de ajuste. Sí se scopea por empresa.
 *
 * El cálculo vive en `src/lib/accounting-inflation.ts` (módulo puro, testeado
 * contra el balance de E-PRESIS SA). Acá solo se junta la data y se persiste.
 */
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { and, eq, inArray, sql, desc, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  account,
  accountingLog,
  accountingPeriod,
  fiscalYear,
  inflationAdjustment,
  inflationAdjustmentLine,
  inflationIndex,
  journalEntry,
  journalEntryLine,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
  ensureClientBelongsToOrg,
  loadFiscalYearForOrg,
} from './helpers';
import {
  computeInflationAdjustment,
  defaultInflationNature,
  monthKey,
  reexpressionCoefficient,
  type InflationAccountInput,
  type InflationNature,
} from '@/lib/accounting-inflation';
import { nextEntryNumber } from '@/lib/accounting-posting-db';

/** Código de la cuenta que absorbe la contrapartida del ajuste. */
const RECPAM_CODE = '5.4.004';

const SOURCES = ['facpce_rt6', 'indec_ipc', 'manual'] as const;
type IndexSource = (typeof SOURCES)[number];

const sourceSchema = z.enum(SOURCES).default('facpce_rt6');

/** Solo el Owner administra la serie de índices y aplica el ajuste. */
function assertOwner(role: string): void {
  if (role !== 'owner') {
    throw new Error('Solo el Owner del estudio puede realizar esta acción');
  }
}

/* ═══════════════════════ 1. Serie de índices ═══════════════════════ */

export interface InflationIndexRow {
  id: string;
  source: IndexSource;
  year: number;
  month: number;
  value: number;
  /** Variación respecto del mes anterior de la misma serie, en %. */
  variation: number | null;
  updatedAt: string;
}

export interface InflationIndexList {
  rows: InflationIndexRow[];
  /** Años con datos, descendente. Alimenta el filtro. */
  years: number[];
  /** Series cargadas, con su cantidad de meses. */
  sources: { source: IndexSource; count: number }[];
  total: number;
  /** Último mes con índice publicado en la serie seleccionada. */
  lastPeriod: { year: number; month: number; value: number } | null;
}

/**
 * Serie completa de una fuente. Son ~400 filas, así que se devuelve entera y el
 * filtrado por año se hace en el cliente: eso permite calcular coeficientes
 * contra cualquier mes de cierre sin ir de nuevo al servidor.
 */
export const listInflationIndexes = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ source: sourceSchema }))
  .handler(async (ctx): Promise<InflationIndexList> => {
    await getSessionWithOrg();
    const { source } = ctx.data;

    const all = await db
      .select()
      .from(inflationIndex)
      .where(eq(inflationIndex.source, source))
      .orderBy(asc(inflationIndex.year), asc(inflationIndex.month));

    const years = [...new Set(all.map((r) => r.year))].sort((a, b) => b - a);

    const sourceCounts = await db
      .select({
        source: inflationIndex.source,
        count: sql<number>`count(*)::int`,
      })
      .from(inflationIndex)
      .groupBy(inflationIndex.source);

    const rows: InflationIndexRow[] = all.map((r, i) => {
      const prev = i > 0 ? all[i - 1] : null;
      const value = Number(r.value);
      const prevValue = prev ? Number(prev.value) : null;
      // Solo tiene sentido si el mes anterior es efectivamente el consecutivo.
      const consecutive =
        prev &&
        (prev.year === r.year
          ? prev.month === r.month - 1
          : prev.year === r.year - 1 && prev.month === 12 && r.month === 1);
      return {
        id: r.id,
        source: r.source,
        year: r.year,
        month: r.month,
        value,
        variation:
          consecutive && prevValue
            ? Math.round((value / prevValue - 1) * 10000) / 100
            : null,
        updatedAt: r.updatedAt.toISOString(),
      };
    });

    const last = all[all.length - 1];
    return {
      rows,
      years,
      sources: sourceCounts.map((s) => ({
        source: s.source,
        count: s.count,
      })),
      total: all.length,
      lastPeriod: last
        ? { year: last.year, month: last.month, value: Number(last.value) }
        : null,
    };
  });

/**
 * Importa la serie completa desde la planilla de FACPCE. El .xlsx se parsea en
 * el navegador (evita subir el binario) y acá llegan las filas ya normalizadas.
 * Idempotente: hace upsert por (source, año, mes).
 */
export const importInflationIndexes = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      source: sourceSchema,
      rows: z
        .array(
          z.object({
            year: z.number().int().min(1900).max(2200),
            month: z.number().int().min(1).max(12),
            value: z.number().positive(),
          })
        )
        .min(1, 'La planilla no tiene filas válidas')
        .max(5000),
    })
  )
  .handler(
    async (ctx): Promise<{ imported: number; from: string; to: string }> => {
      await getSessionWithOrg();
      assertOwner(await getMemberRole());
      const { source, rows } = ctx.data;

      // Una misma (año, mes) repetida en la planilla rompería el upsert.
      const dedup = new Map<string, (typeof rows)[number]>();
      for (const r of rows) dedup.set(monthKey(r.year, r.month), r);
      const clean = [...dedup.values()].sort(
        (a, b) => a.year - b.year || a.month - b.month
      );

      const BATCH = 200;
      for (let i = 0; i < clean.length; i += BATCH) {
        await db
          .insert(inflationIndex)
          .values(
            clean.slice(i, i + BATCH).map((r) => ({
              source,
              year: r.year,
              month: r.month,
              value: r.value.toFixed(6),
            }))
          )
          .onConflictDoUpdate({
            target: [
              inflationIndex.source,
              inflationIndex.year,
              inflationIndex.month,
            ],
            set: { value: sql`excluded.value`, updatedAt: new Date() },
          });
      }

      const first = clean[0];
      const last = clean[clean.length - 1];
      return {
        imported: clean.length,
        from: monthKey(first.year, first.month),
        to: monthKey(last.year, last.month),
      };
    }
  );

/** Alta o corrección de un índice puntual, a mano. */
export const saveInflationIndex = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      source: sourceSchema,
      year: z.number().int().min(1900).max(2200),
      month: z.number().int().min(1).max(12),
      value: z.number().positive('El índice debe ser mayor a cero'),
    })
  )
  .handler(async (ctx): Promise<{ ok: true }> => {
    await getSessionWithOrg();
    assertOwner(await getMemberRole());
    const { source, year, month, value } = ctx.data;
    await db
      .insert(inflationIndex)
      .values({ source, year, month, value: value.toFixed(6) })
      .onConflictDoUpdate({
        target: [
          inflationIndex.source,
          inflationIndex.year,
          inflationIndex.month,
        ],
        set: { value: value.toFixed(6), updatedAt: new Date() },
      });
    return { ok: true };
  });

export const deleteInflationIndex = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx): Promise<{ ok: true }> => {
    await getSessionWithOrg();
    assertOwner(await getMemberRole());
    await db.delete(inflationIndex).where(eq(inflationIndex.id, ctx.data.id));
    return { ok: true };
  });

export interface CoefficientRow {
  year: number;
  month: number;
  index: number;
  coefficient: number;
}

/**
 * Tabla de coeficientes contra un mes de cierre. Es la vista que el contador
 * compara contra su papel de trabajo.
 */
export const getInflationCoefficients = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      source: sourceSchema,
      closingYear: z.number().int().min(1900).max(2200),
      closingMonth: z.number().int().min(1).max(12),
      /** Cuántos meses hacia atrás mostrar. */
      months: z.number().int().min(1).max(240).default(13),
    })
  )
  .handler(
    async (
      ctx
    ): Promise<{ rows: CoefficientRow[]; closingIndex: number | null }> => {
      await getSessionWithOrg();
      const { source, closingYear, closingMonth, months } = ctx.data;

      const [closing] = await db
        .select()
        .from(inflationIndex)
        .where(
          and(
            eq(inflationIndex.source, source),
            eq(inflationIndex.year, closingYear),
            eq(inflationIndex.month, closingMonth)
          )
        )
        .limit(1);
      if (!closing) return { rows: [], closingIndex: null };

      const closingIndex = Number(closing.value);
      const all = await db
        .select()
        .from(inflationIndex)
        .where(
          and(
            eq(inflationIndex.source, source),
            sql`(${inflationIndex.year} * 12 + ${inflationIndex.month}) <= ${closingYear * 12 + closingMonth}`
          )
        )
        .orderBy(desc(inflationIndex.year), desc(inflationIndex.month))
        .limit(months);

      return {
        closingIndex,
        rows: all
          .map((r) => ({
            year: r.year,
            month: r.month,
            index: Number(r.value),
            coefficient: reexpressionCoefficient(closingIndex, Number(r.value)),
          }))
          .reverse(),
      };
    }
  );

/* ═══════════════════ 2. Ajuste por inflación del ejercicio ═══════════════════ */

export interface InflationAdjustmentPreview {
  status: 'draft' | 'applied';
  adjustmentId: string | null;
  journalEntryId: string | null;
  journalEntryNumber: number | null;
  appliedAt: string | null;
  closing: { year: number; month: number };
  opening: { year: number; month: number };
  fiscalYearNumber: number;
  periodLabel: string;
  /** Meses del ejercicio sin índice cargado. Si hay alguno, no se puede calcular. */
  missingIndexes: string[];
  coefficients: CoefficientRow[];
  lines: {
    accountId: string;
    code: string;
    name: string;
    year: number | null;
    month: number | null;
    isOpening: boolean;
    historical: number;
    coefficient: number;
    adjusted: number;
    difference: number;
  }[];
  byAccount: {
    accountId: string;
    code: string;
    name: string;
    nature: InflationNature;
    targetAccountId: string;
    targetCode: string;
    historical: number;
    adjusted: number;
    difference: number;
  }[];
  entryLines: {
    accountId: string;
    code: string;
    name: string;
    debit: number;
    credit: number;
  }[];
  recpam: number;
  balanced: boolean;
  /** Cuentas con movimientos pero sin naturaleza asignada. */
  accountsWithoutNature: { code: string; name: string }[];
  /**
   * El ajuste aplicado ya no coincide con el mayor: entraron o cambiaron asientos
   * después de generarlo. Los estados contables estarían usando un RECPAM viejo.
   */
  stale: boolean;
  /** RECPAM con el que se generó el asiento. null si todavía no se aplicó. */
  appliedRecpam: number | null;
}

/**
 * Junta los datos del ejercicio y corre el motor. No escribe nada: es la
 * preplanilla que el contador revisa antes de generar el asiento.
 */
async function buildPreview(
  orgId: string,
  clientId: string,
  fiscalYearId: string,
  source: IndexSource
): Promise<InflationAdjustmentPreview> {
  const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);

  const closing = {
    year: fy.endDate.getUTCFullYear(),
    month: fy.endDate.getUTCMonth() + 1,
  };
  // Los saldos de apertura se anticúan al cierre del ejercicio anterior, que es
  // el mes previo al primer mes de este ejercicio.
  const startYear = fy.startDate.getUTCFullYear();
  const startMonth = fy.startDate.getUTCMonth() + 1;
  const opening =
    startMonth === 1
      ? { year: startYear - 1, month: 12 }
      : { year: startYear, month: startMonth - 1 };

  // Cuentas visibles para la empresa: base del estudio + custom de la empresa.
  const accounts = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.type, 'imputable'),
        sql`(${account.scope} = 'base' OR ${account.clientId} = ${clientId})`
      )
    );
  const accById = new Map(accounts.map((a) => [a.id, a]));

  // Saldos de apertura: los trae el asiento de apertura del ejercicio.
  const openingRows = await db
    .select({
      accountId: journalEntryLine.accountId,
      debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
    })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
    .where(
      and(
        eq(journalEntry.fiscalYearId, fiscalYearId),
        eq(journalEntry.isVoided, false),
        eq(journalEntry.origin, 'auto_opening')
      )
    )
    .groupBy(journalEntryLine.accountId);

  // Movimientos del ejercicio agrupados por mes. Se excluyen apertura, cierre y
  // el propio ajuste (si no, regenerar lo compondría sobre sí mismo).
  const movementRows = await db
    .select({
      accountId: journalEntryLine.accountId,
      year: accountingPeriod.year,
      month: accountingPeriod.month,
      debit: sql<string>`coalesce(sum(${journalEntryLine.debit}),0)`,
      credit: sql<string>`coalesce(sum(${journalEntryLine.credit}),0)`,
    })
    .from(journalEntryLine)
    .innerJoin(
      journalEntry,
      eq(journalEntry.id, journalEntryLine.journalEntryId)
    )
    .innerJoin(
      accountingPeriod,
      eq(accountingPeriod.id, journalEntryLine.periodId)
    )
    .where(
      and(
        eq(journalEntry.fiscalYearId, fiscalYearId),
        eq(journalEntry.isVoided, false),
        sql`${journalEntry.origin} NOT IN ('auto_opening','auto_closing','auto_inflation')`
      )
    )
    .groupBy(
      journalEntryLine.accountId,
      accountingPeriod.year,
      accountingPeriod.month
    );

  // Índices necesarios: el mes de apertura + todos los meses con movimiento +
  // el mes de cierre.
  const neededKeys = new Set<string>([
    monthKey(opening.year, opening.month),
    monthKey(closing.year, closing.month),
  ]);
  for (const m of movementRows) neededKeys.add(monthKey(m.year, m.month));

  const indexRows = await db
    .select()
    .from(inflationIndex)
    .where(eq(inflationIndex.source, source));
  const indexes: Record<string, number> = {};
  for (const r of indexRows)
    indexes[monthKey(r.year, r.month)] = Number(r.value);

  const missingIndexes = [...neededKeys].filter((k) => !indexes[k]).sort();

  const coefficients: CoefficientRow[] = [];
  const closingIndex = indexes[monthKey(closing.year, closing.month)];
  if (closingIndex) {
    for (const k of [...neededKeys].sort()) {
      const idx = indexes[k];
      if (!idx) continue;
      const [y, m] = k.split('-').map(Number);
      coefficients.push({
        year: y,
        month: m,
        index: idx,
        coefficient: reexpressionCoefficient(closingIndex, idx),
      });
    }
  }

  const existing = await db
    .select()
    .from(inflationAdjustment)
    .where(eq(inflationAdjustment.fiscalYearId, fiscalYearId))
    .limit(1);
  const adj = existing[0] ?? null;

  let entryNumber: number | null = null;
  if (adj?.journalEntryId) {
    const [je] = await db
      .select({ number: journalEntry.number })
      .from(journalEntry)
      .where(eq(journalEntry.id, adj.journalEntryId))
      .limit(1);
    entryNumber = je?.number ?? null;
  }

  const fmtD = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

  const base = {
    status: adj?.status ?? 'draft',
    adjustmentId: adj?.id ?? null,
    journalEntryId: adj?.journalEntryId ?? null,
    journalEntryNumber: entryNumber,
    appliedAt: adj?.appliedAt?.toISOString() ?? null,
    closing,
    opening,
    fiscalYearNumber: fy.number,
    periodLabel: `${fmtD(fy.startDate)} – ${fmtD(fy.endDate)}`,
    missingIndexes,
    coefficients,
  };

  if (missingIndexes.length > 0) {
    return {
      ...base,
      lines: [],
      byAccount: [],
      entryLines: [],
      recpam: 0,
      balanced: true,
      accountsWithoutNature: [],
      stale: false,
      appliedRecpam:
        adj?.status === 'applied' ? Number(adj.recpamAmount) : null,
    };
  }

  // Armado del input del motor.
  const touched = new Set<string>([
    ...openingRows.map((r) => r.accountId),
    ...movementRows.map((r) => r.accountId),
  ]);
  const accountsWithoutNature: { code: string; name: string }[] = [];
  const engineAccounts: InflationAccountInput[] = [];

  for (const id of touched) {
    const a = accById.get(id);
    if (!a) continue;
    // Las cuentas viejas pueden tener el valor legacy 'no_monetaria', o ninguno.
    let nature: InflationNature;
    if (!a.inflationNature) {
      nature = defaultInflationNature(a.accountGroup);
      accountsWithoutNature.push({ code: a.code, name: a.name });
    } else if (a.inflationNature === 'no_monetaria') {
      nature = 'no_monetaria_costo';
    } else {
      nature = a.inflationNature;
    }

    const op = openingRows.find((r) => r.accountId === id);
    engineAccounts.push({
      accountId: id,
      code: a.code,
      name: a.name,
      accountGroup: a.accountGroup,
      nature,
      targetAccountId: a.inflationTargetId,
      opening: op ? parseFloat(op.debit) - parseFloat(op.credit) : 0,
      monthly: movementRows
        .filter((r) => r.accountId === id)
        .map((r) => ({
          year: r.year,
          month: r.month,
          amount: parseFloat(r.debit) - parseFloat(r.credit),
        }))
        .sort((x, y) => x.year - y.year || x.month - y.month),
    });
  }

  const recpamAccount = accounts.find((a) => a.code === RECPAM_CODE);
  if (!recpamAccount) {
    throw new Error(
      `Falta la cuenta ${RECPAM_CODE} (RECPAM) en el plan de cuentas. Sembrá el plan base antes de ajustar.`
    );
  }

  const result = computeInflationAdjustment({
    closing,
    openingMonth: opening,
    indexes,
    accounts: engineAccounts,
    recpamAccountId: recpamAccount.id,
  });

  // ¿El asiento aplicado sigue reflejando el mayor? Se comparan el RECPAM (que es
  // el residuo de todo el ajuste, así que cambia ante cualquier movimiento en una
  // partida no monetaria), la cantidad de filas y el total reexpresado. Si algo
  // difiere, el ajuste quedó viejo.
  let stale = false;
  const appliedRecpam =
    adj?.status === 'applied' ? Number(adj.recpamAmount) : null;
  if (adj?.status === 'applied') {
    const persisted = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(abs(${inflationAdjustmentLine.difference})),0)`,
      })
      .from(inflationAdjustmentLine)
      .where(eq(inflationAdjustmentLine.adjustmentId, adj.id));
    const currentTotal = result.lines.reduce(
      (acc, l) => acc + Math.abs(l.difference),
      0
    );
    stale =
      Math.abs((appliedRecpam ?? 0) - result.recpam) >= 0.01 ||
      persisted[0].count !== result.lines.length ||
      Math.abs(Number(persisted[0].total) - currentTotal) >= 0.01;
  }

  const label = (id: string) => accById.get(id);
  return {
    ...base,
    stale,
    appliedRecpam,
    lines: result.lines,
    byAccount: result.byAccount.map((s) => ({
      ...s,
      targetCode: label(s.targetAccountId)?.code ?? s.code,
    })),
    entryLines: result.entryLines.map((l) => ({
      accountId: l.accountId,
      code: label(l.accountId)?.code ?? '',
      name: label(l.accountId)?.name ?? '',
      debit: l.debit,
      credit: l.credit,
    })),
    recpam: result.recpam,
    balanced: result.balanced,
    accountsWithoutNature,
  };
}

/** Preplanilla del ajuste (papel de trabajo). No escribe nada. */
export const getInflationAdjustment = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      source: sourceSchema,
    })
  )
  .handler(async (ctx): Promise<InflationAdjustmentPreview> => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    return buildPreview(
      orgId,
      ctx.data.clientId,
      ctx.data.fiscalYearId,
      ctx.data.source
    );
  });

/**
 * Genera el asiento de ajuste por inflación y persiste la preplanilla.
 *
 * El asiento se imputa con fecha de cierre del ejercicio y origen
 * `auto_inflation`, así los estados contables lo toman automáticamente y el
 * toggle "histórico" puede excluirlo.
 */
export const applyInflationAdjustment = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      source: sourceSchema,
    })
  )
  .handler(
    async (
      ctx
    ): Promise<{ journalEntryId: string; number: number; recpam: number }> => {
      const { orgId, userId } = await getSessionWithOrg();
      const role = await getMemberRole();
      assertCanWrite(role);
      assertOwner(role);
      const { clientId, fiscalYearId, source } = ctx.data;
      await ensureClientBelongsToOrg(clientId, orgId);
      return applyAdjustment(orgId, userId, clientId, fiscalYearId, source);
    }
  );

/**
 * Genera el asiento de ajuste. Es una función interna y no la server function
 * porque `regenerateInflationAdjustment` la necesita: invocar una server function
 * desde otra no funciona del lado del servidor (el handler espera un request).
 */
async function applyAdjustment(
  orgId: string,
  userId: string,
  clientId: string,
  fiscalYearId: string,
  source: IndexSource
): Promise<{ journalEntryId: string; number: number; recpam: number }> {
  {
    {
      const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);
      if (fy.status === 'closed') {
        throw new Error(
          'El ejercicio está cerrado. Reabrilo para regenerar el ajuste por inflación.'
        );
      }

      const preview = await buildPreview(orgId, clientId, fiscalYearId, source);
      if (preview.missingIndexes.length > 0) {
        throw new Error(
          `Faltan índices de: ${preview.missingIndexes.join(', ')}. Cargá la serie antes de ajustar.`
        );
      }
      if (preview.status === 'applied') {
        throw new Error(
          'El ejercicio ya tiene un ajuste aplicado. Anulalo antes de regenerarlo.'
        );
      }
      if (preview.entryLines.length === 0) {
        throw new Error(
          'El ajuste no genera ningún movimiento: no hay partidas no monetarias para reexpresar.'
        );
      }
      if (!preview.balanced) {
        throw new Error(
          'El asiento de ajuste no cuadra. Revisá la preplanilla antes de aplicarlo.'
        );
      }

      // El asiento va en el último período del ejercicio.
      const [period] = await db
        .select()
        .from(accountingPeriod)
        .where(
          and(
            eq(accountingPeriod.fiscalYearId, fiscalYearId),
            eq(accountingPeriod.year, preview.closing.year),
            eq(accountingPeriod.month, preview.closing.month)
          )
        )
        .limit(1);
      if (!period) {
        throw new Error(
          'No existe el período contable del mes de cierre. Verificá el ejercicio.'
        );
      }

      return await db.transaction(async (tx) => {
        const number = await nextEntryNumber(tx, clientId, fiscalYearId);
        const [je] = await tx
          .insert(journalEntry)
          .values({
            clientId,
            fiscalYearId,
            periodId: period.id,
            number,
            entryDate: fy.endDate,
            description: `Ajuste por inflación RT 6 — ejercicio ${fy.number}`,
            origin: 'auto_inflation',
            createdBy: userId,
          })
          .returning();

        await tx.insert(journalEntryLine).values(
          preview.entryLines.map((l, i) => ({
            journalEntryId: je.id,
            accountId: l.accountId,
            clientId,
            periodId: period.id,
            debit: l.debit.toFixed(2),
            credit: l.credit.toFixed(2),
            description:
              l.accountId ===
              preview.entryLines[preview.entryLines.length - 1].accountId
                ? 'RECPAM del ejercicio'
                : 'Reexpresión a moneda de cierre',
            lineOrder: i,
          }))
        );

        const [adj] = await tx
          .insert(inflationAdjustment)
          .values({
            clientId,
            fiscalYearId,
            source,
            closingYear: preview.closing.year,
            closingMonth: preview.closing.month,
            openingYear: preview.opening.year,
            openingMonth: preview.opening.month,
            status: 'applied',
            recpamAmount: preview.recpam.toFixed(2),
            journalEntryId: je.id,
            appliedAt: new Date(),
            appliedBy: userId,
          })
          .returning();

        // La preplanilla se congela: es la evidencia de cómo se llegó al asiento.
        const BATCH = 300;
        for (let i = 0; i < preview.lines.length; i += BATCH) {
          await tx.insert(inflationAdjustmentLine).values(
            preview.lines.slice(i, i + BATCH).map((l) => ({
              adjustmentId: adj.id,
              accountId: l.accountId,
              year: l.year,
              month: l.month,
              isOpening: l.isOpening,
              historical: l.historical.toFixed(2),
              coefficient: l.coefficient.toFixed(4),
              adjusted: l.adjusted.toFixed(2),
              difference: l.difference.toFixed(2),
            }))
          );
        }

        await tx.insert(accountingLog).values({
          clientId,
          fiscalYearId,
          eventType: 'inflation_adjustment_applied',
          eventData: {
            journalEntryNumber: number,
            recpam: preview.recpam,
            source,
            closing: preview.closing,
            lineas: preview.entryLines.length,
          },
          userId,
        });

        return { journalEntryId: je.id, number, recpam: preview.recpam };
      });
    }
  }
}

/** Anula el asiento de ajuste y borra la preplanilla congelada. */
export const voidInflationAdjustment = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      reason: z.string().max(500).optional(),
    })
  )
  .handler(async (ctx): Promise<{ ok: true }> => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    assertOwner(role);
    const { clientId, fiscalYearId, reason } = ctx.data;
    await ensureClientBelongsToOrg(clientId, orgId);
    return voidAdjustment(orgId, userId, clientId, fiscalYearId, reason);
  });

/** Anula el asiento y borra la preplanilla. Ver la nota de `applyAdjustment`. */
async function voidAdjustment(
  orgId: string,
  userId: string,
  clientId: string,
  fiscalYearId: string,
  reason?: string
): Promise<{ ok: true }> {
  {
    const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);
    if (fy.status === 'closed') {
      throw new Error('El ejercicio está cerrado. Reabrilo para anular.');
    }

    const [adj] = await db
      .select()
      .from(inflationAdjustment)
      .where(eq(inflationAdjustment.fiscalYearId, fiscalYearId))
      .limit(1);
    if (!adj) throw new Error('El ejercicio no tiene ajuste por inflación.');

    await db.transaction(async (tx) => {
      if (adj.journalEntryId) {
        await tx
          .update(journalEntry)
          .set({
            isVoided: true,
            voidedAt: new Date(),
            voidedBy: userId,
            voidReason: reason ?? 'Anulación del ajuste por inflación',
          })
          .where(eq(journalEntry.id, adj.journalEntryId));
      }
      await tx
        .delete(inflationAdjustmentLine)
        .where(eq(inflationAdjustmentLine.adjustmentId, adj.id));
      await tx
        .delete(inflationAdjustment)
        .where(eq(inflationAdjustment.id, adj.id));

      await tx.insert(accountingLog).values({
        clientId,
        fiscalYearId,
        eventType: 'inflation_adjustment_voided',
        eventData: {
          recpam: Number(adj.recpamAmount),
          journalEntryId: adj.journalEntryId,
          reason: reason ?? null,
        },
        userId,
      });
    });

    return { ok: true };
  }
}

/**
 * Regenera el ajuste: anula el asiento anterior y aplica uno nuevo con el mayor
 * actual. Es lo que hay que hacer cuando el ajuste queda desactualizado porque
 * entraron asientos después de generarlo.
 *
 * Va en una sola server function y no en dos llamadas desde el cliente para que
 * no pueda quedar a mitad de camino: sin ajuste y sin aviso.
 */
export const regenerateInflationAdjustment = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      fiscalYearId: z.string().uuid(),
      source: sourceSchema,
    })
  )
  .handler(
    async (
      ctx
    ): Promise<{ journalEntryId: string; number: number; recpam: number }> => {
      const { orgId, userId } = await getSessionWithOrg();
      const role = await getMemberRole();
      assertCanWrite(role);
      assertOwner(role);
      const { clientId, fiscalYearId, source } = ctx.data;
      await ensureClientBelongsToOrg(clientId, orgId);

      await voidAdjustment(
        orgId,
        userId,
        clientId,
        fiscalYearId,
        'Regeneración: el ajuste no coincidía con el mayor'
      );
      return applyAdjustment(orgId, userId, clientId, fiscalYearId, source);
    }
  );

/**
 * Naturaleza frente al AXI de las cuentas de una empresa, para la pantalla de
 * clasificación. Devuelve el valor efectivo y el default normativo, para poder
 * marcar las que el contador cambió.
 */
export const listAccountInflationNatures = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        id: account.id,
        code: account.code,
        name: account.name,
        accountGroup: account.accountGroup,
        inflationNature: account.inflationNature,
        inflationTargetId: account.inflationTargetId,
      })
      .from(account)
      .where(
        and(
          eq(account.organizationId, orgId),
          eq(account.type, 'imputable'),
          sql`(${account.scope} = 'base' OR ${account.clientId} = ${ctx.data.clientId})`
        )
      )
      .orderBy(asc(account.code));

    return rows.map((r) => ({
      ...r,
      effectiveNature:
        r.inflationNature === 'no_monetaria'
          ? 'no_monetaria_costo'
          : (r.inflationNature ?? defaultInflationNature(r.accountGroup)),
      defaultNature: defaultInflationNature(r.accountGroup),
    }));
  });

/** Cambia la naturaleza de una o varias cuentas frente al ajuste. */
export const setAccountInflationNature = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      accountIds: z.array(z.string().uuid()).min(1).max(500),
      nature: z.enum([
        'monetaria',
        'no_monetaria_costo',
        'no_monetaria_valor_corriente',
        'resultado_por_diferencia',
      ]),
    })
  )
  .handler(async (ctx): Promise<{ updated: number }> => {
    const { orgId } = await getSessionWithOrg();
    assertOwner(await getMemberRole());
    const res = await db
      .update(account)
      .set({ inflationNature: ctx.data.nature })
      .where(
        and(
          eq(account.organizationId, orgId),
          inArray(account.id, ctx.data.accountIds)
        )
      )
      .returning({ id: account.id });
    return { updated: res.length };
  });

/** Ejercicios de una empresa, para el selector de la pantalla de ajuste. */
export const listFiscalYearsForInflation = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        id: fiscalYear.id,
        number: fiscalYear.number,
        startDate: fiscalYear.startDate,
        endDate: fiscalYear.endDate,
        status: fiscalYear.status,
      })
      .from(fiscalYear)
      .where(eq(fiscalYear.clientId, ctx.data.clientId))
      .orderBy(desc(fiscalYear.number));
    return rows.map((r) => ({
      ...r,
      startDate: r.startDate.toISOString(),
      endDate: r.endDate.toISOString(),
    }));
  });
