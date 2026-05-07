import { db } from '@/lib/db';
import {
  profile,
  client,
  debt,
  notification,
  dueDate,
  invoice,
  ivaScrape,
  profileRiskSnapshot,
} from '@/drizzle/schema';
import { eq, and, lt, isNull, gte, lte, sql } from 'drizzle-orm';

export interface RiskFactors {
  overdueDebtCount: number;
  overdueDebtScore: number;
  criticalNotificationCount: number;
  criticalNotificationScore: number;
  upcomingDueDateCount: number;
  upcomingDueDateScore: number;
  monthsWithoutInvoices: number;
  monthsWithoutInvoicesScore: number;
  ivaStatus: string;
  ivaScore: number;
  hasScraperError: boolean;
  scraperErrorScore: number;
}

export interface RiskScoreResult {
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactors;
}

/**
 * Compute risk score (0–100) for a single profile in a given period (YYYY-MM).
 *
 * Weights:
 *  overdue debt         30%
 *  critical notifications 20%
 *  upcoming due dates   15%
 *  months without invoices 15%
 *  IVA status           10%
 *  scraper errors       10%
 *
 * Risk levels: low < 25, medium 25–50, high 50–75, critical > 75
 */
export async function calculateRiskScore(
  profileId: string,
  period: string
): Promise<RiskScoreResult> {
  // Resolve the client linked to this profile
  const profileRow = await db
    .select({ id: profile.id, clientId: profile.client })
    .from(profile)
    .where(eq(profile.id, profileId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!profileRow) throw new Error(`Profile ${profileId} not found`);

  const clientId = profileRow.clientId;
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Parse period: YYYY-MM → Date for the first of that month
  const [yearStr, monthStr] = period.split('-');
  const periodStart = new Date(Number(yearStr), Number(monthStr) - 1, 1);

  const [
    overdueDebtCount,
    criticalNotificationCount,
    upcomingDueDateCount,
    clientRow,
    ivaRow,
  ] = await Promise.all([
    // 1. Overdue open debts (30% weight)
    clientId
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(debt)
          .where(
            and(
              eq(debt.client, clientId),
              eq(debt.status, 'open'),
              lt(debt.dueDate, now)
            )
          )
          .then((r) => Number(r[0]?.n ?? 0))
      : Promise.resolve(0),

    // 2. Critical unresolved notifications for this profile (20% weight)
    db
      .select({ n: sql<number>`COUNT(*)` })
      .from(notification)
      .where(
        and(
          eq(notification.profile, profileId),
          eq(notification.severity, 'critical'),
          isNull(notification.resolvedAt)
        )
      )
      .then((r) => Number(r[0]?.n ?? 0)),

    // 3. Upcoming due dates not completed within 30 days (15% weight)
    clientId
      ? db
          .select({ n: sql<number>`COUNT(*)` })
          .from(dueDate)
          .where(
            and(
              eq(dueDate.client, clientId),
              isNull(dueDate.completedAt),
              gte(dueDate.dueDate, now),
              lte(dueDate.dueDate, in30Days)
            )
          )
          .then((r) => Number(r[0]?.n ?? 0))
      : Promise.resolve(0),

    // 4. Scraper errors on the client (10% weight)
    clientId
      ? db
          .select({ hasErrors: client.hasErrors })
          .from(client)
          .where(eq(client.id, clientId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),

    // 5. IVA scrape for the period (10% weight)
    db
      .select({ ok: ivaScrape.ok })
      .from(ivaScrape)
      .where(
        and(
          eq(ivaScrape.profileId, profileId),
          eq(ivaScrape.periodoFiscal, period)
        )
      )
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  // 6. Months without invoices in the 3 months before the period (15% weight)
  const monthsWithoutInvoices = await countMonthsWithoutInvoices(
    profileId,
    periodStart
  );

  // --- Compute component scores ---

  // Overdue debt: 0→0, 1→15, 2→20, ≥3→30
  let overdueDebtScore = 0;
  if (overdueDebtCount >= 3) overdueDebtScore = 30;
  else if (overdueDebtCount === 2) overdueDebtScore = 20;
  else if (overdueDebtCount === 1) overdueDebtScore = 15;

  // Critical notifications: 0→0, 1→10, 2→15, ≥3→20
  let criticalNotificationScore = 0;
  if (criticalNotificationCount >= 3) criticalNotificationScore = 20;
  else if (criticalNotificationCount === 2) criticalNotificationScore = 15;
  else if (criticalNotificationCount === 1) criticalNotificationScore = 10;

  // Upcoming due dates: 0→0, 1-2→5, 3-5→10, ≥6→15
  let upcomingDueDateScore = 0;
  if (upcomingDueDateCount >= 6) upcomingDueDateScore = 15;
  else if (upcomingDueDateCount >= 3) upcomingDueDateScore = 10;
  else if (upcomingDueDateCount >= 1) upcomingDueDateScore = 5;

  // Months without invoices: 0→0, 1→5, 2→10, 3→15
  let monthsWithoutInvoicesScore = 0;
  if (monthsWithoutInvoices >= 3) monthsWithoutInvoicesScore = 15;
  else if (monthsWithoutInvoices === 2) monthsWithoutInvoicesScore = 10;
  else if (monthsWithoutInvoices === 1) monthsWithoutInvoicesScore = 5;

  // IVA: missing→10, error→5, ok→0
  let ivaStatus = 'missing';
  let ivaScore = 10;
  if (ivaRow !== null) {
    if (ivaRow.ok) {
      ivaStatus = 'ok';
      ivaScore = 0;
    } else {
      ivaStatus = 'error';
      ivaScore = 5;
    }
  }

  // Scraper errors: hasErrors→10, none→0
  const hasScraperError = clientRow?.hasErrors ?? false;
  const scraperErrorScore = hasScraperError ? 10 : 0;

  const score = Math.min(
    100,
    overdueDebtScore +
      criticalNotificationScore +
      upcomingDueDateScore +
      monthsWithoutInvoicesScore +
      ivaScore +
      scraperErrorScore
  );

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (score > 75) riskLevel = 'critical';
  else if (score > 50) riskLevel = 'high';
  else if (score >= 25) riskLevel = 'medium';
  else riskLevel = 'low';

  return {
    score,
    riskLevel,
    factors: {
      overdueDebtCount,
      overdueDebtScore,
      criticalNotificationCount,
      criticalNotificationScore,
      upcomingDueDateCount,
      upcomingDueDateScore,
      monthsWithoutInvoices,
      monthsWithoutInvoicesScore,
      ivaStatus,
      ivaScore,
      hasScraperError,
      scraperErrorScore,
    },
  };
}

/**
 * Count how many of the 3 months preceding `periodStart` had zero invoices for the profile.
 */
async function countMonthsWithoutInvoices(
  profileId: string,
  periodStart: Date
): Promise<number> {
  let missing = 0;
  for (let i = 1; i <= 3; i++) {
    const monthStart = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth() - i,
      1
    );
    const monthEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth() - i + 1,
      1
    );
    const n = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(invoice)
      .where(
        and(
          eq(invoice.profile, profileId),
          gte(invoice.emitionDate, monthStart),
          lt(invoice.emitionDate, monthEnd)
        )
      )
      .then((r) => Number(r[0]?.n ?? 0));
    if (n === 0) missing++;
  }
  return missing;
}

/**
 * Generate (or update) risk snapshots for all profiles in an organization.
 * Uses upsert on (profile_id, period) so re-running is safe.
 */
export async function generateRiskSnapshots(
  orgId: string,
  period: string
): Promise<{ processed: number; errors: number }> {
  const profiles = await db
    .select({ id: profile.id })
    .from(profile)
    .innerJoin(client, eq(profile.client, client.id))
    .where(eq(client.organizationId, orgId));

  let processed = 0;
  let errors = 0;

  for (const p of profiles) {
    try {
      const result = await calculateRiskScore(p.id, period);

      await db
        .insert(profileRiskSnapshot)
        .values({
          profileId: p.id,
          period,
          score: String(result.score),
          riskLevel: result.riskLevel,
          factors: result.factors,
        })
        .onConflictDoUpdate({
          target: [profileRiskSnapshot.profileId, profileRiskSnapshot.period],
          set: {
            score: String(result.score),
            riskLevel: result.riskLevel,
            factors: result.factors,
          },
        });

      processed++;
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
