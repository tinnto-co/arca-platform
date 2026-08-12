/**
 * Server functions del ajuste por inflación (RT 6) y del RECPAM.
 *
 * Dos bloques:
 * 1. **Serie de índices** (`indice_inflacion`): dato público y global del estudio,
 *    no se scopea por empresa. Se carga desde la planilla de FACPCE o a mano.
 * 2. **Ajuste de un ejercicio** (`ajuste_inflacion`): preplanilla + asiento
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
  ajusteInflacion,
  ajusteInflacionLinea,
  asiento,
  asientoLinea,
  bienDeUso,
  cliente,
  cuenta,
  ejercicio,
  evento,
  indiceInflacion,
  periodoContable,
} from '@/drizzle/schema';
import { getSessionWithOrg, getMemberRole, assertCanWrite } from './helpers';
import {
  computeInflationAdjustment,
  defaultInflationNature,
  monthKey,
  reexpressionCoefficient,
  type InflationAccountInput,
  type InflationNature,
} from '@/lib/accounting-inflation';
import { depreciationCoefficients } from '@/lib/accounting-fixed-asset-inflation';
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

/**
 * `accounting.tsx` tiene estos dos helpers, pero privados. Se repiten acá en vez
 * de exportarlos para no tocar ese archivo mientras se porta el módulo; cuando
 * se unifique, van a `helpers.ts`.
 */
async function ensureClientBelongsToOrg(
  clientId: string,
  orgId: string
): Promise<void> {
  const [row] = await db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, clientId), eq(cliente.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Empresa no encontrada o no autorizada');
}

async function loadFiscalYearForOrg(fiscalYearId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(ejercicio)
    .where(and(eq(ejercicio.id, fiscalYearId), eq(ejercicio.orgId, orgId)))
    .limit(1);
  if (!row) throw new Error('Ejercicio no encontrado o no autorizado');
  return row;
}

/**
 * Las columnas `date` de Postgres vuelven de Drizzle como string "YYYY-MM-DD",
 * no como `Date`. Se convierten en el borde y en UTC: interpretarlas en la zona
 * local correría el día para todo el hemisferio oeste, y acá el mes de una fecha
 * decide qué coeficiente se aplica.
 */
const aFecha = (s: string): Date => new Date(`${s}T00:00:00Z`);

/**
 * `periodo_contable.periodo` es un date (el primer día del mes), no un par
 * año/mes como en el modelo viejo.
 */
const anioDe = (d: Date) => d.getUTCFullYear();
const mesDe = (d: Date) => d.getUTCMonth() + 1;

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
  .validator(z.object({ source: sourceSchema }))
  .handler(async (ctx): Promise<InflationIndexList> => {
    await getSessionWithOrg();
    const { source } = ctx.data;

    const all = await db
      .select()
      .from(indiceInflacion)
      .where(eq(indiceInflacion.fuente, source))
      .orderBy(asc(indiceInflacion.anio), asc(indiceInflacion.mes));

    const years = [...new Set(all.map((r) => r.anio))].sort((a, b) => b - a);

    const sourceCounts = await db
      .select({
        source: indiceInflacion.fuente,
        count: sql<number>`count(*)::int`,
      })
      .from(indiceInflacion)
      .groupBy(indiceInflacion.fuente);

    const rows: InflationIndexRow[] = all.map((r, i) => {
      const prev = i > 0 ? all[i - 1] : null;
      const value = Number(r.valor);
      const prevValue = prev ? Number(prev.valor) : null;
      // Solo tiene sentido si el mes anterior es efectivamente el consecutivo.
      const consecutive =
        prev &&
        (prev.anio === r.anio
          ? prev.mes === r.mes - 1
          : prev.anio === r.anio - 1 && prev.mes === 12 && r.mes === 1);
      return {
        id: r.id,
        source: r.fuente,
        year: r.anio,
        month: r.mes,
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
      sources: sourceCounts.map((s) => ({ source: s.source, count: s.count })),
      total: all.length,
      lastPeriod: last
        ? { year: last.anio, month: last.mes, value: Number(last.valor) }
        : null,
    };
  });

/**
 * Importa la serie completa desde la planilla de FACPCE. El .xlsx se parsea en
 * el navegador (evita subir el binario) y acá llegan las filas ya normalizadas.
 * Idempotente: hace upsert por (fuente, año, mes).
 */
export const importInflationIndexes = createServerFn({ method: 'POST' })
  .validator(
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
          .insert(indiceInflacion)
          .values(
            clean.slice(i, i + BATCH).map((r) => ({
              fuente: source,
              anio: r.year,
              mes: r.month,
              valor: r.value.toFixed(6),
            }))
          )
          .onConflictDoUpdate({
            target: [
              indiceInflacion.fuente,
              indiceInflacion.anio,
              indiceInflacion.mes,
            ],
            set: { valor: sql`excluded.valor`, updatedAt: new Date() },
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
  .validator(
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
      .insert(indiceInflacion)
      .values({
        fuente: source,
        anio: year,
        mes: month,
        valor: value.toFixed(6),
      })
      .onConflictDoUpdate({
        target: [
          indiceInflacion.fuente,
          indiceInflacion.anio,
          indiceInflacion.mes,
        ],
        set: { valor: value.toFixed(6), updatedAt: new Date() },
      });
    return { ok: true };
  });

export const deleteInflationIndex = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx): Promise<{ ok: true }> => {
    await getSessionWithOrg();
    assertOwner(await getMemberRole());
    await db.delete(indiceInflacion).where(eq(indiceInflacion.id, ctx.data.id));
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
  .validator(
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
        .from(indiceInflacion)
        .where(
          and(
            eq(indiceInflacion.fuente, source),
            eq(indiceInflacion.anio, closingYear),
            eq(indiceInflacion.mes, closingMonth)
          )
        )
        .limit(1);
      if (!closing) return { rows: [], closingIndex: null };

      const closingIndex = Number(closing.valor);
      const all = await db
        .select()
        .from(indiceInflacion)
        .where(
          and(
            eq(indiceInflacion.fuente, source),
            sql`(${indiceInflacion.anio} * 12 + ${indiceInflacion.mes}) <= ${closingYear * 12 + closingMonth}`
          )
        )
        .orderBy(desc(indiceInflacion.anio), desc(indiceInflacion.mes))
        .limit(months);

      return {
        closingIndex,
        rows: all
          .map((r) => ({
            year: r.anio,
            month: r.mes,
            index: Number(r.valor),
            coefficient: reexpressionCoefficient(closingIndex, Number(r.valor)),
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
   * Cuentas de amortización donde el mayor y el registro de bienes de uso no
   * dicen lo mismo. El coeficiente sale del registro, así que si difieren el
   * ajuste se está aplicando sobre un importe que el registro no explica.
   */
  depreciationMismatch: {
    code: string;
    name: string;
    ledger: number;
    register: number;
  }[];
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
  const fyDesde = aFecha(fy.fechaDesde);
  const fyHasta = aFecha(fy.fechaHasta);

  const closing = { year: anioDe(fyHasta), month: mesDe(fyHasta) };
  // Los saldos de apertura se anticúan al cierre del ejercicio anterior, que es
  // el mes previo al primer mes de este ejercicio.
  const startYear = anioDe(fyDesde);
  const startMonth = mesDe(fyDesde);
  const opening =
    startMonth === 1
      ? { year: startYear - 1, month: 12 }
      : { year: startYear, month: startMonth - 1 };

  // Cuentas visibles para la empresa: base del estudio + propias de la empresa.
  const accounts = await db
    .select()
    .from(cuenta)
    .where(
      and(
        eq(cuenta.orgId, orgId),
        eq(cuenta.tipo, 'imputable'),
        sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${clientId})`
      )
    );
  const accById = new Map(accounts.map((a) => [a.id, a]));

  // Saldos de apertura: los trae el asiento de apertura del ejercicio.
  const openingRows = await db
    .select({
      accountId: asientoLinea.cuentaId,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .where(
      and(
        eq(asiento.ejercicioId, fiscalYearId),
        eq(asiento.anulado, false),
        eq(asiento.origenTipo, 'apertura')
      )
    )
    .groupBy(asientoLinea.cuentaId);

  // Movimientos del ejercicio agrupados por mes. Se excluyen apertura, cierre y
  // el propio ajuste (si no, regenerar lo compondría sobre sí mismo).
  // El período cuelga del asiento, no de la línea, y es un date: el mes sale de
  // ahí en vez de venir en dos columnas.
  const movementRows = await db
    .select({
      accountId: asientoLinea.cuentaId,
      periodo: periodoContable.periodo,
      debit: sql<string>`coalesce(sum(${asientoLinea.debe}),0)`,
      credit: sql<string>`coalesce(sum(${asientoLinea.haber}),0)`,
    })
    .from(asientoLinea)
    .innerJoin(asiento, eq(asiento.id, asientoLinea.asientoId))
    .innerJoin(periodoContable, eq(periodoContable.id, asiento.periodoId))
    .where(
      and(
        eq(asiento.ejercicioId, fiscalYearId),
        eq(asiento.anulado, false),
        sql`${asiento.origenTipo} NOT IN ('apertura','cierre','ajuste_inflacion')`
      )
    )
    .groupBy(asientoLinea.cuentaId, periodoContable.periodo);

  const movements = movementRows.map((r) => ({
    accountId: r.accountId,
    year: anioDe(aFecha(r.periodo)),
    month: mesDe(aFecha(r.periodo)),
    debit: r.debit,
    credit: r.credit,
  }));

  // Registro de bienes de uso: hace falta acá, y no más abajo, porque el mes de
  // alta de un bien comprado en el ejercicio también necesita índice.
  const assets = await db
    .select({
      id: bienDeUso.id,
      name: bienDeUso.nombre,
      acquisitionDate: bienDeUso.fechaAlta,
      originalValue: bienDeUso.valorOrigen,
      residualValue: bienDeUso.valorResidual,
      usefulLifeYears: bienDeUso.vidaUtilAnios,
      disposalDate: bienDeUso.fechaBaja,
      accumDeprAccountId: bienDeUso.cuentaAmortizacionAcumuladaId,
      deprExpenseAccountId: bienDeUso.cuentaAmortizacionGastoId,
    })
    .from(bienDeUso)
    .where(eq(bienDeUso.clienteId, clientId));

  // Índices necesarios: el mes de apertura + todos los meses con movimiento +
  // el mes de cierre + el mes de alta de los bienes incorporados en el ejercicio.
  const neededKeys = new Set<string>([
    monthKey(opening.year, opening.month),
    monthKey(closing.year, closing.month),
  ]);
  for (const m of movements) neededKeys.add(monthKey(m.year, m.month));
  for (const a of assets) {
    const alta = aFecha(a.acquisitionDate);
    if (alta < fyDesde || alta > fyHasta) continue;
    neededKeys.add(monthKey(anioDe(alta), mesDe(alta)));
  }

  const indexRows = await db
    .select()
    .from(indiceInflacion)
    .where(eq(indiceInflacion.fuente, source));
  const indexes: Record<string, number> = {};
  for (const r of indexRows) indexes[monthKey(r.anio, r.mes)] = Number(r.valor);

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
    .from(ajusteInflacion)
    .where(eq(ajusteInflacion.ejercicioId, fiscalYearId))
    .limit(1);
  const adj = existing[0] ?? null;

  let entryNumber: number | null = null;
  if (adj?.asientoId) {
    const [je] = await db
      .select({ numero: asiento.numero })
      .from(asiento)
      .where(eq(asiento.id, adj.asientoId))
      .limit(1);
    entryNumber = je?.numero ?? null;
  }

  const fmtD = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

  const base = {
    status: (adj?.estado === 'aplicado' ? 'applied' : 'draft') as
      | 'draft'
      | 'applied',
    adjustmentId: adj?.id ?? null,
    journalEntryId: adj?.asientoId ?? null,
    journalEntryNumber: entryNumber,
    appliedAt: adj?.aplicadoAt?.toISOString() ?? null,
    closing,
    opening,
    fiscalYearNumber: fy.numero,
    periodLabel: `${fmtD(fyDesde)} – ${fmtD(fyHasta)}`,
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
      depreciationMismatch: [],
      stale: false,
      appliedRecpam: adj?.estado === 'aplicado' ? Number(adj.recpam) : null,
    };
  }

  // Las amortizaciones de bienes de uso no van por el mes de su asiento sino
  // por el coeficiente del bien que amortizan. Sale del registro de bienes,
  // porque el mayor no dice a qué bien corresponde cada línea.
  const openingIndex = indexes[monthKey(opening.year, opening.month)];
  const depreciation =
    assets.length > 0 && openingIndex
      ? depreciationCoefficients({
          assets: assets.map((a) => ({
            id: a.id,
            name: a.name,
            acquisitionDate: aFecha(a.acquisitionDate),
            originalValue: parseFloat(a.originalValue),
            residualValue: parseFloat(a.residualValue ?? '0'),
            usefulLifeYears: a.usefulLifeYears,
            disposalDate: a.disposalDate ? aFecha(a.disposalDate) : null,
            accumDeprAccountId: a.accumDeprAccountId,
            deprExpenseAccountId: a.deprExpenseAccountId,
          })),
          fiscalYearStart: fyDesde,
          fiscalYearEnd: fyHasta,
          openingCoefficient: reexpressionCoefficient(
            closingIndex,
            openingIndex
          ),
          coefficientForMonth: (year, month) => {
            const idx = indexes[monthKey(year, month)];
            if (!idx) {
              throw new Error(
                `Falta el índice de ${monthKey(year, month)} para anticuar la amortización de bienes de uso.`
              );
            }
            return reexpressionCoefficient(closingIndex, idx);
          },
        })
      : null;

  // Armado del input del motor.
  const touched = new Set<string>([
    ...openingRows.map((r) => r.accountId),
    ...movements.map((r) => r.accountId),
  ]);
  const accountsWithoutNature: { code: string; name: string }[] = [];
  const engineAccounts: InflationAccountInput[] = [];

  for (const id of touched) {
    const a = accById.get(id);
    if (!a) continue;
    // Las cuentas viejas pueden tener el valor legacy 'no_monetaria', o ninguno.
    let nature: InflationNature;
    if (!a.naturalezaInflacion) {
      nature = defaultInflationNature(a.rubro);
      accountsWithoutNature.push({ code: a.codigo, name: a.nombre });
    } else if (a.naturalezaInflacion === 'no_monetaria') {
      nature = 'no_monetaria_costo';
    } else {
      nature = a.naturalezaInflacion as InflationNature;
    }

    const op = openingRows.find((r) => r.accountId === id);
    engineAccounts.push({
      accountId: id,
      code: a.codigo,
      name: a.nombre,
      accountGroup: a.rubro,
      nature,
      targetAccountId: a.cuentaAjusteId,
      opening: op ? parseFloat(op.debit) - parseFloat(op.credit) : 0,
      monthlyCoefficient: depreciation?.byAccount.get(id) ?? null,
      monthly: movements
        .filter((r) => r.accountId === id)
        .map((r) => ({
          year: r.year,
          month: r.month,
          amount: parseFloat(r.debit) - parseFloat(r.credit),
        }))
        .sort((x, y) => x.year - y.year || x.month - y.month),
    });
  }

  // Contraste mayor contra registro. La igualdad entre el promedio ponderado y
  // el cálculo bien por bien solo vale si los dos totales coinciden.
  const depreciationMismatch: {
    code: string;
    name: string;
    ledger: number;
    register: number;
  }[] = [];
  if (depreciation) {
    for (const [accountId, register] of depreciation.registerDepreciation) {
      const a = accById.get(accountId);
      if (!a) continue;
      const ledger = movements
        .filter((r) => r.accountId === accountId)
        .reduce((s, r) => s + parseFloat(r.debit) - parseFloat(r.credit), 0);
      // El signo depende de si la cuenta es el gasto (deudor) o la acumulada
      // (acreedora): se compara el valor absoluto.
      if (Math.abs(Math.abs(ledger) - register) < 0.05) continue;
      depreciationMismatch.push({
        code: a.codigo,
        name: a.nombre,
        ledger: Math.round(Math.abs(ledger) * 100) / 100,
        register,
      });
    }
  }

  const recpamAccount = accounts.find((a) => a.codigo === RECPAM_CODE);
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
  const appliedRecpam = adj?.estado === 'aplicado' ? Number(adj.recpam) : null;
  if (adj?.estado === 'aplicado') {
    const persisted = await db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<string>`coalesce(sum(abs(${ajusteInflacionLinea.diferencia})),0)`,
      })
      .from(ajusteInflacionLinea)
      .where(eq(ajusteInflacionLinea.ajusteId, adj.id));
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
      targetCode: label(s.targetAccountId)?.codigo ?? s.code,
    })),
    entryLines: result.entryLines.map((l) => ({
      accountId: l.accountId,
      code: label(l.accountId)?.codigo ?? '',
      name: label(l.accountId)?.nombre ?? '',
      debit: l.debit,
      credit: l.credit,
    })),
    recpam: result.recpam,
    balanced: result.balanced,
    accountsWithoutNature,
    depreciationMismatch,
  };
}

/** Preplanilla del ajuste (papel de trabajo). No escribe nada. */
export const getInflationAdjustment = createServerFn({ method: 'GET' })
  .validator(
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
 * `ajuste_inflacion`, así los estados contables lo toman automáticamente y el
 * toggle "histórico" puede excluirlo.
 */
export const applyInflationAdjustment = createServerFn({ method: 'POST' })
  .validator(
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
  const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);
  if (fy.estado === 'cerrado') {
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
    .from(periodoContable)
    .where(
      and(
        eq(periodoContable.ejercicioId, fiscalYearId),
        sql`extract(year from ${periodoContable.periodo}) = ${preview.closing.year}`,
        sql`extract(month from ${periodoContable.periodo}) = ${preview.closing.month}`
      )
    )
    .limit(1);
  if (!period) {
    throw new Error(
      'No existe el período contable del mes de cierre. Verificá el ejercicio.'
    );
  }

  return await db.transaction(async (tx) => {
    // El ajuste se inserta primero: `asiento.origen_id` tiene que apuntarle, y
    // el check `asiento_origen_coherente` no admite un origen no manual sin id.
    const [adj] = await tx
      .insert(ajusteInflacion)
      .values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        fuente: source,
        cierreAnio: preview.closing.year,
        cierreMes: preview.closing.month,
        aperturaAnio: preview.opening.year,
        aperturaMes: preview.opening.month,
        estado: 'borrador',
        recpam: preview.recpam.toFixed(2),
      })
      .returning();

    const number = await nextEntryNumber(tx, clientId, fiscalYearId);

    const [je] = await tx
      .insert(asiento)
      .values({
        orgId,
        clienteId: clientId,
        ejercicioId: fiscalYearId,
        periodoId: period.id,
        numero: number,
        fecha: fy.fechaHasta, // date: la columna espera 'YYYY-MM-DD'
        descripcion: `Ajuste por inflación RT 6 — ejercicio ${fy.numero}`,
        origenTipo: 'ajuste_inflacion',
        origenId: adj.id,
        fuente: 'calculo',
        creadoPor: userId,
      })
      .returning();

    const ultima = preview.entryLines[preview.entryLines.length - 1];
    await tx.insert(asientoLinea).values(
      preview.entryLines.map((l, i) => ({
        asientoId: je.id,
        cuentaId: l.accountId,
        debe: l.debit.toFixed(2),
        haber: l.credit.toFixed(2),
        descripcion:
          l.accountId === ultima.accountId
            ? 'RECPAM del ejercicio'
            : 'Reexpresión a moneda de cierre',
        orden: i,
      }))
    );

    await tx
      .update(ajusteInflacion)
      .set({
        estado: 'aplicado',
        asientoId: je.id,
        aplicadoAt: new Date(),
        aplicadoPor: userId,
      })
      .where(eq(ajusteInflacion.id, adj.id));

    // La preplanilla se congela: es la evidencia de cómo se llegó al asiento.
    const BATCH = 300;
    for (let i = 0; i < preview.lines.length; i += BATCH) {
      await tx.insert(ajusteInflacionLinea).values(
        preview.lines.slice(i, i + BATCH).map((l) => ({
          ajusteId: adj.id,
          cuentaId: l.accountId,
          anio: l.year,
          mes: l.month,
          esApertura: l.isOpening,
          historico: l.historical.toFixed(2),
          coeficiente: l.coefficient.toFixed(4),
          ajustado: l.adjusted.toFixed(2),
          diferencia: l.difference.toFixed(2),
        }))
      );
    }

    await tx.insert(evento).values({
      orgId,
      clienteId: clientId,
      entidad: 'ajuste_inflacion',
      entidadId: adj.id,
      tipo: 'alta',
      actorTipo: 'user',
      actorId: userId,
      detalle: {
        // `accion` es la clave por la que filtra el log de auditoría.
        accion: 'inflation_adjustment_applied',
        ejercicioId: fiscalYearId,
        asientoNumero: number,
        recpam: preview.recpam,
        fuente: source,
        cierre: preview.closing,
        lineas: preview.entryLines.length,
      },
    });

    return { journalEntryId: je.id, number, recpam: preview.recpam };
  });
}

/** Anula el asiento de ajuste y borra la preplanilla congelada. */
export const voidInflationAdjustment = createServerFn({ method: 'POST' })
  .validator(
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
  const fy = await loadFiscalYearForOrg(fiscalYearId, orgId);
  if (fy.estado === 'cerrado') {
    throw new Error('El ejercicio está cerrado. Reabrilo para anular.');
  }

  const [adj] = await db
    .select()
    .from(ajusteInflacion)
    .where(eq(ajusteInflacion.ejercicioId, fiscalYearId))
    .limit(1);
  if (!adj) throw new Error('El ejercicio no tiene ajuste por inflación.');

  await db.transaction(async (tx) => {
    if (adj.asientoId) {
      await tx
        .update(asiento)
        .set({
          anulado: true,
          anuladoAt: new Date(),
          anuladoPor: userId,
          motivoAnulacion: reason ?? 'Anulación del ajuste por inflación',
        })
        .where(eq(asiento.id, adj.asientoId));
    }
    await tx
      .delete(ajusteInflacionLinea)
      .where(eq(ajusteInflacionLinea.ajusteId, adj.id));
    await tx.delete(ajusteInflacion).where(eq(ajusteInflacion.id, adj.id));

    await tx.insert(evento).values({
      orgId,
      clienteId: clientId,
      entidad: 'ajuste_inflacion',
      entidadId: adj.id,
      tipo: 'baja',
      actorTipo: 'user',
      actorId: userId,
      detalle: {
        accion: 'inflation_adjustment_voided',
        ejercicioId: fiscalYearId,
        recpam: Number(adj.recpam),
        asientoId: adj.asientoId,
        motivo: reason ?? null,
      },
    });
  });

  return { ok: true };
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
  .validator(
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
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        id: cuenta.id,
        code: cuenta.codigo,
        name: cuenta.nombre,
        accountGroup: cuenta.rubro,
        inflationNature: cuenta.naturalezaInflacion,
        inflationTargetId: cuenta.cuentaAjusteId,
      })
      .from(cuenta)
      .where(
        and(
          eq(cuenta.orgId, orgId),
          eq(cuenta.tipo, 'imputable'),
          sql`(${cuenta.alcance} = 'base' OR ${cuenta.clienteId} = ${ctx.data.clientId})`
        )
      )
      .orderBy(asc(cuenta.codigo));

    return rows.map((r) => ({
      ...r,
      effectiveNature:
        r.inflationNature === 'no_monetaria'
          ? ('no_monetaria_costo' as InflationNature)
          : ((r.inflationNature as InflationNature | null) ??
            defaultInflationNature(r.accountGroup)),
      defaultNature: defaultInflationNature(r.accountGroup),
    }));
  });

/** Cambia la naturaleza de una o varias cuentas frente al ajuste. */
export const setAccountInflationNature = createServerFn({ method: 'POST' })
  .validator(
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
      .update(cuenta)
      .set({ naturalezaInflacion: ctx.data.nature })
      .where(
        and(eq(cuenta.orgId, orgId), inArray(cuenta.id, ctx.data.accountIds))
      )
      .returning({ id: cuenta.id });
    return { updated: res.length };
  });

/** Ejercicios de una empresa, para el selector de la pantalla de ajuste. */
export const listFiscalYearsForInflation = createServerFn({ method: 'GET' })
  .validator(z.object({ clientId: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    await ensureClientBelongsToOrg(ctx.data.clientId, orgId);
    const rows = await db
      .select({
        id: ejercicio.id,
        number: ejercicio.numero,
        startDate: ejercicio.fechaDesde,
        endDate: ejercicio.fechaHasta,
        status: ejercicio.estado,
      })
      .from(ejercicio)
      .where(eq(ejercicio.clienteId, ctx.data.clientId))
      .orderBy(desc(ejercicio.numero));
    return rows.map((r) => ({
      ...r,
      startDate: aFecha(r.startDate).toISOString(),
      endDate: aFecha(r.endDate).toISOString(),
    }));
  });
