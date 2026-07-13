/**
 * Job batch (server-only) que contabiliza facturas sin asiento. (UST4)
 *
 * Vive fuera de `src/actions/accounting.tsx` a propósito: ese módulo es parte del
 * bundle del cliente (importa server functions), y una función exportada que use
 * `db` ahí arrastraría el driver de Postgres al browser. Acá es server-only (lo
 * importan solo el cron y el script), así que puede tocar la DB libremente.
 *
 * La lógica de cálculo (montos, selección de regla, líneas del asiento) se reusa
 * del motor puro `accounting-invoice-posting.ts`; el plumbing de DB (cargar reglas,
 * resolver período, validar cuentas, insertar) replica el de generateInvoiceEntries.
 */
import { db } from '@/lib/db';
import {
  account,
  accountOverride,
  accountingLog,
  accountingPeriod,
  client,
  fiscalYear,
  invoice,
  journalEntry,
  journalEntryLine,
  ledgerMappingRule,
  ledgerMappingRuleLine,
  organizationModule,
  representative,
} from '@/drizzle/schema';
import { and, asc, eq, inArray, gte, lte, sql } from 'drizzle-orm';
import {
  buildEntryLines,
  computeInvoiceAmounts,
  normalizeDirection,
  selectRuleForInvoice,
  type RuleLike,
} from '@/lib/accounting-invoice-posting';
import { PENDING_REVIEW_CODE } from '@/lib/accounting-labels';

export interface InvoiceBatchResult {
  startedAt: string;
  finishedAt: string;
  batchSize: number;
  dryRun: boolean;
  clientsWithPending: number;
  invoicesScanned: number;
  created: number;
  pendingReview: number;
  skipped: number;
  errors: { clientId: string; invoiceId: string; reason: string }[];
}

interface InvoiceRow {
  id: string;
  emitionDate: Date;
  direction: string;
  type: string;
  recipientName: string;
  emitterName: string;
  amount: string;
  totalIVA: string;
  other_taxes: string;
}

const INVOICE_SELECT = {
  id: invoice.id,
  emitionDate: invoice.emitionDate,
  direction: invoice.direction,
  type: invoice.type,
  recipientName: invoice.recipientName,
  emitterName: invoice.emitterName,
  amount: invoice.amount,
  totalIVA: invoice.totalIVA,
  other_taxes: invoice.other_taxes,
} as const;

const pad2 = (n: number): string => String(n).padStart(2, '0');
const invoiceDateStr = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

async function loadPendingReviewAccountId(orgId: string): Promise<string> {
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

async function loadActiveInvoiceRules(clientId: string): Promise<RuleLike[]> {
  const rules = await db
    .select()
    .from(ledgerMappingRule)
    .where(
      and(
        eq(ledgerMappingRule.clientId, clientId),
        eq(ledgerMappingRule.sourceModule, 'invoice'),
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
      ruleType: r.ruleType as 'default' | 'conditional',
      condition: (r.condition ?? null) as Record<string, unknown> | null,
      priority: r.priority,
      lines: (byRule.get(r.id) ?? []).map((l) => ({
        accountId: l.accountId,
        side: l.side as 'debit' | 'credit',
        amountBasis: l.amountBasis as RuleLike['lines'][number]['amountBasis'],
        fixedAmount: l.fixedAmount,
        description: l.description,
      })),
    })
  );
}

async function resolvePeriodForDate(clientId: string, dateStr: string) {
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

async function assertPostableAccounts(
  clientId: string,
  orgId: string,
  accountIds: string[]
) {
  const ids = [...new Set(accountIds)];
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

async function hasAutoEntry(clientId: string, invoiceId: string) {
  const [row] = await db
    .select({ id: journalEntry.id })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.clientId, clientId),
        eq(journalEntry.sourceType, 'invoice'),
        eq(journalEntry.sourceId, invoiceId),
        eq(journalEntry.isVoided, false)
      )
    )
    .limit(1);
  return !!row;
}

async function insertAutoInvoiceEntry(params: {
  clientId: string;
  fyId: string;
  periodId: string;
  date: Date;
  inv: InvoiceRow;
  ruleId: string | null;
  lines: { accountId: string; debit: number; credit: number; description: string | null }[];
  usedPendingReview: boolean;
  reason: string | null;
}) {
  const { clientId, fyId, periodId, date, inv, ruleId, lines, usedPendingReview, reason } =
    params;
  await db.transaction(async (tx) => {
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
    const number = (maxNum ?? 0) + 1;
    const dir = normalizeDirection(inv.direction);
    const who = dir === 'purchase' ? inv.emitterName : inv.recipientName;
    const label =
      dir === 'purchase' ? 'Compra' : dir === 'sale' ? 'Venta' : 'Comprobante';
    const description = `${label} ${inv.type} — ${who}`.trim();

    const [je] = await tx
      .insert(journalEntry)
      .values({
        clientId,
        fiscalYearId: fyId,
        periodId,
        number,
        entryDate: date,
        description,
        origin: 'auto_invoice',
        sourceType: 'invoice',
        sourceId: inv.id,
        mappingRuleId: ruleId,
        createdBy: null,
      })
      .returning();

    await tx.insert(journalEntryLine).values(
      lines.map((l, i) => ({
        journalEntryId: je.id,
        accountId: l.accountId,
        clientId,
        periodId,
        debit: String(l.debit),
        credit: String(l.credit),
        description: l.description,
        lineOrder: i,
      }))
    );

    await tx.insert(accountingLog).values({
      clientId,
      fiscalYearId: fyId,
      eventType: 'journal_entry_created',
      eventData: {
        entryId: je.id,
        number,
        auto: true,
        source: 'invoice',
        invoiceId: inv.id,
        ruleId,
        pendingReview: usedPendingReview,
        reason,
        batch: true,
      },
      userId: null,
    });
  });
}

export async function runPendingInvoiceBatch(opts?: {
  batchSize?: number;
  dryRun?: boolean;
  clientId?: string;
}): Promise<InvoiceBatchResult> {
  const batchSize = Math.max(1, Math.min(opts?.batchSize ?? 50, 500));
  const dryRun = opts?.dryRun ?? false;
  const onlyClientId = opts?.clientId ?? null;
  const startedAt = new Date();
  const result = {
    clientsWithPending: 0,
    invoicesScanned: 0,
    created: 0,
    pendingReview: 0,
    skipped: 0,
    errors: [] as { clientId: string; invoiceId: string; reason: string }[],
  };

  // Empresas de organizaciones con el módulo de contabilidad activo.
  const clients = await db
    .select({ clientId: client.id, orgId: representative.organizationId })
    .from(client)
    .innerJoin(representative, eq(representative.id, client.representativeId))
    .innerJoin(
      organizationModule,
      and(
        eq(organizationModule.organizationId, representative.organizationId),
        eq(organizationModule.module, 'contabilidad'),
        eq(organizationModule.enabled, true)
      )
    )
    .where(onlyClientId ? eq(client.id, onlyClientId) : undefined);

  for (const { clientId, orgId } of clients) {
    const pending = await db
      .select(INVOICE_SELECT)
      .from(invoice)
      .where(
        and(
          eq(invoice.clientId, clientId),
          sql`NOT EXISTS (
            SELECT 1 FROM ${journalEntry} je
            WHERE je.client_id = ${invoice.clientId}
              AND je.source_type = 'invoice'
              AND je.source_id = ${invoice.id}
              AND je.is_voided = false
          )`
        )
      )
      .limit(batchSize);

    if (pending.length === 0) continue;
    result.clientsWithPending++;

    let prId: string;
    let rules: RuleLike[];
    try {
      prId = await loadPendingReviewAccountId(orgId);
      rules = await loadActiveInvoiceRules(clientId);
    } catch (e) {
      result.errors.push({
        clientId,
        invoiceId: '*',
        reason: `Setup falló: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    for (const inv of pending) {
      result.invoicesScanned++;
      try {
        if (await hasAutoEntry(clientId, inv.id)) {
          result.skipped++;
          continue;
        }
        const amounts = computeInvoiceAmounts(inv);
        if (amounts.total <= 0) {
          result.skipped++;
          continue;
        }
        let resolved;
        try {
          resolved = await resolvePeriodForDate(
            clientId,
            invoiceDateStr(inv.emitionDate)
          );
        } catch {
          result.skipped++; // sin ejercicio/período para esa fecha
          continue;
        }
        if (resolved.period.status === 'closed') {
          result.skipped++;
          continue;
        }
        const rule = selectRuleForInvoice(rules, inv);
        if (rule && rule.lines.length > 0) {
          await assertPostableAccounts(
            clientId,
            orgId,
            rule.lines.map((l) => l.accountId)
          );
        }
        const built = buildEntryLines(rule, amounts, prId);
        if (!dryRun) {
          await insertAutoInvoiceEntry({
            clientId,
            fyId: resolved.fy.id,
            periodId: resolved.period.id,
            date: resolved.date,
            inv,
            ruleId: rule?.id ?? null,
            lines: built.lines,
            usedPendingReview: built.usedPendingReview,
            reason: built.reason,
          });
        }
        result.created++;
        if (built.usedPendingReview) result.pendingReview++;
      } catch (e) {
        result.errors.push({
          clientId,
          invoiceId: inv.id,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const finishedAt = new Date();
  const summary: InvoiceBatchResult = {
    ...result,
    batchSize,
    dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
  console.log(
    `[accounting-batch]${dryRun ? ' (DRY-RUN)' : ''} ${summary.created} asientos creados ` +
      `(${summary.pendingReview} pend. de revisión), ${summary.skipped} omitidas, ` +
      `${summary.errors.length} errores · ${summary.clientsWithPending} empresas, ` +
      `${summary.invoicesScanned} facturas (tope ${batchSize}/empresa) · ` +
      `${startedAt.toISOString()} → ${finishedAt.toISOString()}`
  );
  if (summary.errors.length > 0) {
    console.warn(
      '[accounting-batch] errores:',
      JSON.stringify(summary.errors.slice(0, 20))
    );
  }
  return summary;
}
