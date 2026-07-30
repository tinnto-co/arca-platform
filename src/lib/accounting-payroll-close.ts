/**
 * Cierre de la liquidación de sueldos y generación de su asiento (US 3.3.1).
 *
 * Server-only, igual que `accounting-invoice-batch.ts`: toca `db` directamente,
 * así que no puede importarse desde el bundle del cliente. La server function
 * de `src/actions/sueldos.ts` lo invoca; el cálculo puro vive en
 * `accounting-payroll-posting.ts` y los helpers de DB en `accounting-posting-db.ts`.
 *
 * Flujo: recibos confirmados del período → conceptos agregados por código SOS →
 * reglas `sourceModule='payroll'` → UN asiento `origin='auto_payroll'` cuyo
 * `sourceId` es la fila de `payroll_liquidacion_cierre`.
 */
import { db } from '@/lib/db';
import {
  accountingLog,
  journalEntry,
  journalEntryLine,
  liquidacionImportConceptoValor,
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
  payrollLiquidacionCierre,
} from '@/drizzle/schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  aggregatePayrollConcepts,
  buildPayrollEntryLines,
  type BuiltPayrollEntry,
} from '@/lib/accounting-payroll-posting';
import {
  assertPostableAccounts,
  loadAccountLabels,
  loadActiveMappingRules,
  loadPendingReviewAccountId,
  nextEntryNumber,
  resolvePeriodForDate,
} from '@/lib/accounting-posting-db';
import {
  normalizarPeriodoYYYYMM,
  variantesPeriodoParaBusqueda,
} from '@/lib/payroll-period-rules';

export interface ClosePayrollPeriodParams {
  /** Empresa con CUIT propio (client.id) — el mismo id que usa contabilidad. */
  clientId: string;
  orgId: string;
  /** Período a cerrar, "YYYY-MM". */
  periodo: string;
  userId: string | null;
  /** Calcula y devuelve el asiento sin persistir nada. */
  dryRun?: boolean;
}

export interface ClosePayrollPeriodResult {
  periodo: string;
  recibos: number;
  conceptos: number;
  conceptosSinRegla: number;
  /** null en dry-run. */
  cierreId: string | null;
  journalEntryId: string | null;
  entryNumber: number | null;
  pendingReview: boolean;
  reason: string | null;
  lines: {
    accountId: string;
    /** Código y nombre de la cuenta, para mostrar el asiento sin re-consultar. */
    accountCode: string | null;
    accountName: string | null;
    debit: number;
    credit: number;
    description: string | null;
  }[];
  mappings: BuiltPayrollEntry['mappings'];
  dryRun: boolean;
}

/** Último día del mes del período — fecha contable del asiento de devengamiento. */
function fechaAsientoPeriodo(periodoNorm: string): string {
  const [y, m] = periodoNorm.split('-').map((x) => parseInt(x, 10));
  if (!y || !m) throw new Error(`Período inválido: ${periodoNorm}`);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * Cierra el período y genera su asiento. Idempotente: si ya existe un cierre
 * vigente (no reabierto) para la empresa+período, lanza en vez de duplicar.
 */
export async function closePayrollPeriod(
  params: ClosePayrollPeriodParams
): Promise<ClosePayrollPeriodResult> {
  const { clientId, orgId, userId } = params;
  const dryRun = params.dryRun ?? false;
  const periodoNorm = normalizarPeriodoYYYYMM(params.periodo);

  // 1. Idempotencia: un cierre vigente bloquea otro.
  const [vigente] = await db
    .select({ id: payrollLiquidacionCierre.id })
    .from(payrollLiquidacionCierre)
    .where(
      and(
        eq(payrollLiquidacionCierre.clientId, clientId),
        eq(payrollLiquidacionCierre.periodo, periodoNorm),
        isNull(payrollLiquidacionCierre.reopenedAt)
      )
    )
    .limit(1);
  if (vigente && !dryRun)
    throw new Error(
      `La liquidación de ${periodoNorm} ya está cerrada. Reabrila para volver a generarla.`
    );

  // 2. Recibos confirmados del período (los mismos que muestra la solapa Recibo).
  const variantes = variantesPeriodoParaBusqueda(periodoNorm, params.periodo);
  const recibos = await db
    .select({ id: liquidacionImportRecibo.id })
    .from(liquidacionImportRecibo)
    .innerJoin(
      liquidacionImportEmpleado,
      eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id)
    )
    .where(
      and(
        eq(liquidacionImportEmpleado.clientId, clientId),
        eq(liquidacionImportRecibo.reciboConfirmado, true),
        variantes.length === 1
          ? eq(liquidacionImportRecibo.periodo, variantes[0])
          : or(...variantes.map((v) => eq(liquidacionImportRecibo.periodo, v)))
      )
    );

  if (recibos.length === 0)
    throw new Error(
      `No hay recibos confirmados para ${periodoNorm}. Confirmá los recibos antes de cerrar.`
    );

  // 3. Conceptos de esos recibos, agregados por código SOS.
  const valores = await db
    .select({
      codigo: liquidacionImportConceptoValor.codigo,
      tipoLiquidacion: liquidacionImportConceptoValor.tipoLiquidacion,
      monto: liquidacionImportConceptoValor.monto,
    })
    .from(liquidacionImportConceptoValor)
    .where(
      inArray(
        liquidacionImportConceptoValor.reciboId,
        recibos.map((r) => r.id)
      )
    );

  const concepts = aggregatePayrollConcepts(valores);
  if (concepts.length === 0)
    throw new Error(
      `Los recibos de ${periodoNorm} no tienen conceptos con importe.`
    );

  // 4. Reglas + cuenta pending_review + período contable destino.
  const [prId, rules] = await Promise.all([
    loadPendingReviewAccountId(orgId),
    loadActiveMappingRules(clientId, 'payroll'),
  ]);

  const resolved = await resolvePeriodForDate(
    clientId,
    fechaAsientoPeriodo(periodoNorm)
  ).catch((e: Error) => {
    if (e.message === 'no_fy')
      throw new Error(
        `No hay ejercicio contable que contenga ${periodoNorm}. Creá el ejercicio antes de cerrar.`
      );
    if (e.message === 'no_period')
      throw new Error(`No hay período contable para ${periodoNorm}.`);
    throw e;
  });
  if (resolved.period.status === 'closed')
    throw new Error(
      `El período contable de ${periodoNorm} está cerrado; reabrilo para contabilizar sueldos.`
    );

  // 5. Asiento (puro). Las cuentas de las reglas usadas deben ser imputables.
  const built = buildPayrollEntryLines(concepts, rules, prId);
  const ruleAccountIds = rules
    .filter((r) => built.usedRuleIds.includes(r.id))
    .flatMap((r) => r.lines.map((l) => l.accountId));
  await assertPostableAccounts(clientId, orgId, ruleAccountIds);

  const conceptosSinRegla = built.mappings.filter((m) => m.unmapped).length;
  const labels = await loadAccountLabels(
    orgId,
    built.lines.map((l) => l.accountId)
  );
  const linesWithLabels = built.lines.map((l) => ({
    ...l,
    accountCode: labels.get(l.accountId)?.code ?? null,
    accountName: labels.get(l.accountId)?.name ?? null,
  }));
  const base: ClosePayrollPeriodResult = {
    periodo: periodoNorm,
    recibos: recibos.length,
    conceptos: concepts.length,
    conceptosSinRegla,
    cierreId: null,
    journalEntryId: null,
    entryNumber: null,
    pendingReview: built.usedPendingReview,
    reason: built.reason,
    lines: linesWithLabels,
    mappings: built.mappings,
    dryRun,
  };
  if (dryRun) return base;

  // 6. Persistencia atómica: cierre + asiento + líneas + log.
  return await db.transaction(async (tx) => {
    const number = await nextEntryNumber(tx, clientId, resolved.fy.id);

    const [cierre] = await tx
      .insert(payrollLiquidacionCierre)
      .values({
        clientId,
        periodo: periodoNorm,
        recibos: recibos.length,
        conceptosSinRegla,
        closedBy: userId,
      })
      .returning();

    const [je] = await tx
      .insert(journalEntry)
      .values({
        clientId,
        fiscalYearId: resolved.fy.id,
        periodId: resolved.period.id,
        number,
        entryDate: resolved.date,
        description: `Sueldos y jornales devengados ${periodoNorm}`,
        origin: 'auto_payroll',
        sourceType: 'payroll',
        sourceId: cierre.id,
        // Un asiento agrupa varias reglas; se guarda la primera como referencia.
        mappingRuleId: built.usedRuleIds[0] ?? null,
        createdBy: userId,
      })
      .returning();

    await tx.insert(journalEntryLine).values(
      built.lines.map((l, i) => ({
        journalEntryId: je.id,
        accountId: l.accountId,
        clientId,
        periodId: resolved.period.id,
        debit: String(l.debit),
        credit: String(l.credit),
        description: l.description,
        lineOrder: i,
      }))
    );

    await tx
      .update(payrollLiquidacionCierre)
      .set({ journalEntryId: je.id })
      .where(eq(payrollLiquidacionCierre.id, cierre.id));

    await tx.insert(accountingLog).values({
      clientId,
      fiscalYearId: resolved.fy.id,
      eventType: 'journal_entry_created',
      eventData: {
        entryId: je.id,
        number,
        auto: true,
        source: 'payroll',
        cierreId: cierre.id,
        periodo: periodoNorm,
        recibos: recibos.length,
        ruleIds: built.usedRuleIds,
        pendingReview: built.usedPendingReview,
        conceptosSinRegla,
        reason: built.reason,
      },
      userId,
    });

    return {
      ...base,
      cierreId: cierre.id,
      journalEntryId: je.id,
      entryNumber: number,
    };
  });
}

/**
 * Reabre la liquidación: marca el cierre como reabierto y anula su asiento.
 * No borra nada — el cierre queda como historial y el asiento como anulado.
 */
export async function reopenPayrollPeriod(params: {
  clientId: string;
  periodo: string;
  userId: string | null;
  reason?: string;
}): Promise<{ cierreId: string; voidedEntryId: string | null }> {
  const periodoNorm = normalizarPeriodoYYYYMM(params.periodo);
  const [cierre] = await db
    .select()
    .from(payrollLiquidacionCierre)
    .where(
      and(
        eq(payrollLiquidacionCierre.clientId, params.clientId),
        eq(payrollLiquidacionCierre.periodo, periodoNorm),
        isNull(payrollLiquidacionCierre.reopenedAt)
      )
    )
    .limit(1);
  if (!cierre)
    throw new Error(`No hay una liquidación cerrada para ${periodoNorm}.`);

  return await db.transaction(async (tx) => {
    if (cierre.journalEntryId) {
      await tx
        .update(journalEntry)
        .set({
          isVoided: true,
          voidedAt: new Date(),
          voidedBy: params.userId,
          voidReason:
            params.reason ?? `Reapertura de la liquidación de ${periodoNorm}`,
        })
        .where(eq(journalEntry.id, cierre.journalEntryId));
    }
    await tx
      .update(payrollLiquidacionCierre)
      .set({ reopenedAt: new Date(), reopenedBy: params.userId })
      .where(eq(payrollLiquidacionCierre.id, cierre.id));

    return { cierreId: cierre.id, voidedEntryId: cierre.journalEntryId };
  });
}
