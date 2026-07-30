/**
 * Helpers de DB compartidos por los motores de asientos automáticos
 * (facturas y sueldos). Server-only: toca `db` directamente, así que NO debe
 * importarse desde `src/actions/accounting.tsx` ni desde componentes — ese
 * módulo entra al bundle del cliente y arrastraría el driver de Postgres.
 *
 * Se extrajo de `accounting-invoice-batch.ts` cuando el motor de sueldos
 * necesitó la misma lógica (US 3.3.1): resolver la cuenta pending_review,
 * ubicar el período contable de una fecha, validar que las cuentas sean
 * imputables y numerar el asiento.
 */
import { db } from '@/lib/db';
import {
  account,
  accountOverride,
  accountingPeriod,
  fiscalYear,
  journalEntry,
  ledgerMappingRule,
  ledgerMappingRuleLine,
} from '@/drizzle/schema';
import { and, asc, eq, inArray, gte, lte, sql } from 'drizzle-orm';
import type { RuleLike } from '@/lib/accounting-invoice-posting';
import { PENDING_REVIEW_CODE } from '@/lib/accounting-labels';

/** Cuenta de sistema `pending_review` del estudio. Lanza si falta. */
export async function loadPendingReviewAccountId(
  orgId: string
): Promise<string> {
  const [acc] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.organizationId, orgId),
        eq(account.scope, 'base'),
        eq(account.code, PENDING_REVIEW_CODE)
      )
    )
    .limit(1);
  if (!acc)
    throw new Error('Falta la cuenta de sistema "Pendiente de revisión"');
  return acc.id;
}

/**
 * Reglas activas de la empresa para un módulo, ya ordenadas por prioridad
 * (asc = más específicas primero) y con sus líneas-plantilla resueltas.
 */
export async function loadActiveMappingRules(
  clientId: string,
  sourceModule: 'invoice' | 'payroll'
): Promise<RuleLike[]> {
  const rules = await db
    .select()
    .from(ledgerMappingRule)
    .where(
      and(
        eq(ledgerMappingRule.clientId, clientId),
        eq(ledgerMappingRule.sourceModule, sourceModule),
        eq(ledgerMappingRule.isActive, true)
      )
    )
    .orderBy(asc(ledgerMappingRule.priority), asc(ledgerMappingRule.name));
  if (rules.length === 0) return [];

  const lines = await db
    .select()
    .from(ledgerMappingRuleLine)
    .where(
      inArray(
        ledgerMappingRuleLine.ruleId,
        rules.map((r) => r.id)
      )
    )
    .orderBy(asc(ledgerMappingRuleLine.lineOrder));
  const byRule = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byRule.get(l.ruleId) ?? [];
    arr.push(l);
    byRule.set(l.ruleId, arr);
  }

  return rules.map(
    (r): RuleLike => ({
      id: r.id,
      name: r.name,
      ruleType: r.ruleType,
      condition: (r.condition ?? null) as Record<string, unknown> | null,
      priority: r.priority,
      lines: (byRule.get(r.id) ?? []).map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis,
        fixedAmount: l.fixedAmount,
        description: l.description,
      })),
    })
  );
}

/**
 * Ejercicio y período contable que contienen la fecha dada.
 * Lanza 'no_fy' / 'no_period' para que el llamador decida si omite o falla.
 */
export async function resolvePeriodForDate(clientId: string, dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(date.getTime())) throw new Error('Fecha inválida');
  const [fy] = await db
    .select()
    .from(fiscalYear)
    .where(
      and(
        eq(fiscalYear.clientId, clientId),
        lte(fiscalYear.startDate, date),
        gte(fiscalYear.endDate, date)
      )
    )
    .limit(1);
  if (!fy) throw new Error('no_fy');
  const [period] = await db
    .select()
    .from(accountingPeriod)
    .where(
      and(
        eq(accountingPeriod.fiscalYearId, fy.id),
        eq(accountingPeriod.year, date.getUTCFullYear()),
        eq(accountingPeriod.month, date.getUTCMonth() + 1)
      )
    )
    .limit(1);
  if (!period) throw new Error('no_period');
  return { fy, period, date };
}

/**
 * Valida que todas las cuentas sean imputables, activas y del estudio/empresa
 * correctos antes de generar el asiento.
 */
export async function assertPostableAccounts(
  clientId: string,
  orgId: string,
  accountIds: string[]
) {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return;
  const accs = await db
    .select()
    .from(account)
    .where(and(eq(account.organizationId, orgId), inArray(account.id, ids)));
  const overrides = await db
    .select()
    .from(accountOverride)
    .where(
      and(
        eq(accountOverride.clientId, clientId),
        inArray(accountOverride.accountId, ids)
      )
    );
  const ovMap = new Map(overrides.map((o) => [o.accountId, o]));
  const byId = new Map(accs.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) throw new Error('Cuenta inexistente o de otro estudio');
    if (a.scope === 'custom' && a.clientId !== clientId)
      throw new Error('Cuenta custom de otra empresa');
    if (a.type !== 'imputable')
      throw new Error(`La cuenta ${a.code} es de agrupación`);
    const active = ovMap.get(id)?.isActive ?? a.isActive;
    if (!active) throw new Error(`La cuenta ${a.code} está inactiva`);
  }
}

/** Código y nombre de cada cuenta, para mostrar el asiento en la UI. */
export async function loadAccountLabels(
  orgId: string,
  accountIds: string[]
): Promise<Map<string, { code: string; name: string }>> {
  const ids = [...new Set(accountIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: account.id, code: account.code, name: account.name })
    .from(account)
    .where(and(eq(account.organizationId, orgId), inArray(account.id, ids)));
  return new Map(rows.map((r) => [r.id, { code: r.code, name: r.name }]));
}

/**
 * Siguiente número consecutivo de asiento dentro del ejercicio.
 * Debe llamarse dentro de la transacción que inserta el asiento, para que la
 * numeración no tenga saltos ni colisiones.
 */
export async function nextEntryNumber(
  tx: Pick<typeof db, 'select'>,
  clientId: string,
  fyId: string
): Promise<number> {
  const [{ maxNum }] = await tx
    .select({
      maxNum: sql<number>`coalesce(max(${journalEntry.number}),0)::int`,
    })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.clientId, clientId),
        eq(journalEntry.fiscalYearId, fyId)
      )
    );
  return (maxNum ?? 0) + 1;
}
