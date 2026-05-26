import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { representative, invoice, debt, dueDate, notification, alert, job } from '@/drizzle/schema';
import { eq, and, gte, lte, sql, inArray, isNull, desc } from 'drizzle-orm';
import { getSessionWithOrg } from '@/actions/helpers';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDateParam(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

// Drizzle expression: amount converted to ARS (USD × rate, else as-is)
// Uses LOWER() for case-insensitive currency comparison (DB values may be 'USD', 'usd', etc.)
const arsAmount = sql<number>`CASE
  WHEN LOWER(${invoice.currency}) = 'usd'
  THEN CAST(${invoice.amount} AS DECIMAL) * CAST(${invoice.cureencyRate} AS DECIMAL)
  ELSE CAST(${invoice.amount} AS DECIMAL)
END`;

// ── getDashboardStats ──────────────────────────────────────────────────────

export const getDashboardStats = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) {
      return {
        totalRepresentatives: 0,
        totalSales: 0,
        totalPurchases: 0,
        totalInvoices: 0,
        monthlySales: 0,
        monthlyPurchases: 0,
        monthlyInvoices: 0,
        previousMonthSales: 0,
        previousMonthPurchases: 0,
      };
    }

    const now = new Date();

    // Current period bounds
    const currentFrom = parseDateParam(
      ctx.data.from,
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
    const currentTo = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    );
    currentTo.setHours(23, 59, 59, 999);

    // Previous period: same duration ending just before currentFrom
    const rangeMs = currentTo.getTime() - currentFrom.getTime();
    const previousTo = new Date(currentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - rangeMs);

    // Run all 3 aggregate queries in parallel
    const [currentStats, previousStats, totalStats] = await Promise.all([
      // Current period aggregation (SQL-level, no full table scan)
      db
        .select({
          sales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          purchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          invoiceCount: sql<number>`COUNT(*)`,
        })
        .from(invoice)
        .where(
          and(
            inArray(invoice.representativeId, userRepresentativeIds),
            gte(invoice.emitionDate, currentFrom),
            lte(invoice.emitionDate, currentTo)
          )
        ),

      // Previous period aggregation
      db
        .select({
          sales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          purchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
        })
        .from(invoice)
        .where(
          and(
            inArray(invoice.representativeId, userRepresentativeIds),
            gte(invoice.emitionDate, previousFrom),
            lte(invoice.emitionDate, previousTo)
          )
        ),

      // All-time totals for mini KPIs
      db
        .select({
          totalSales: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'outbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          totalPurchases: sql<number>`COALESCE(SUM(CASE WHEN LOWER(${invoice.direction}) = 'inbound' THEN ${arsAmount} ELSE 0 END), 0)`,
          totalInvoices: sql<number>`COUNT(*)`,
        })
        .from(invoice)
        .where(inArray(invoice.representativeId, userRepresentativeIds)),
    ]);

    const cur = currentStats[0];
    const prev = previousStats[0];
    const total = totalStats[0];

    return {
      totalRepresentatives: userRepresentativeIds.length,
      totalSales: Number(total?.totalSales ?? 0),
      totalPurchases: Number(total?.totalPurchases ?? 0),
      totalInvoices: Number(total?.totalInvoices ?? 0),
      monthlySales: Number(cur?.sales ?? 0),
      monthlyPurchases: Number(cur?.purchases ?? 0),
      monthlyInvoices: Number(cur?.invoiceCount ?? 0),
      previousMonthSales: Number(prev?.sales ?? 0),
      previousMonthPurchases: Number(prev?.purchases ?? 0),
    };
  });

// ── getMonthlyEvolution ────────────────────────────────────────────────────

export const getMonthlyEvolution = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      months: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) return [];

    const now = new Date();
    const monthCount = ctx.data.months ?? 6;

    const to = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    );
    const from = parseDateParam(
      ctx.data.from,
      new Date(to.getFullYear(), to.getMonth() - (monthCount - 1), 1)
    );

    // Fetch only invoices in the date range (key optimization vs full table scan)
    const invoicesInRange = await db
      .select({
        direction: invoice.direction,
        amount: invoice.amount,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        emitionDate: invoice.emitionDate,
      })
      .from(invoice)
      .where(
        and(
          inArray(invoice.representativeId, userRepresentativeIds),
          gte(invoice.emitionDate, from),
          lte(invoice.emitionDate, to)
        )
      );

    // Build monthly buckets from `from` to `to`
    const buckets: {
      year: number;
      month: number;
      outbound: number;
      inbound: number;
    }[] = [];
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endBucket = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endBucket) {
      buckets.push({
        year: cur.getFullYear(),
        month: cur.getMonth(),
        outbound: 0,
        inbound: 0,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    invoicesInRange.forEach((inv) => {
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD') {
        amount = amount * parseFloat(inv.currencyRate || '1');
      }

      const d = new Date(inv.emitionDate);
      const bucket = buckets.find(
        (b) => b.year === d.getFullYear() && b.month === d.getMonth()
      );
      if (!bucket) return;

      if (inv.direction?.toLowerCase() === 'outbound')
        bucket.outbound += amount;
      else if (inv.direction?.toLowerCase() === 'inbound')
        bucket.inbound += amount;
    });

    const MONTH_NAMES: Record<number, string> = {
      0: 'ene',
      1: 'feb',
      2: 'mar',
      3: 'abr',
      4: 'may',
      5: 'jun',
      6: 'jul',
      7: 'ago',
      8: 'sep',
      9: 'oct',
      10: 'nov',
      11: 'dic',
    };

    return buckets.map((b) => ({
      month: `${MONTH_NAMES[b.month]} ${String(b.year).slice(2)}`,
      outbound: b.outbound,
      inbound: b.inbound,
    }));
  });

// ── getUpcomingDueDates ────────────────────────────────────────────────────

export const getUpcomingDueDates = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      days: z.number().default(7),
      limit: z.number().default(5),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futureDate = new Date(today);
    futureDate.setDate(today.getDate() + ctx.data.days);
    futureDate.setHours(23, 59, 59, 999);

    const dueDates = await db
      .select({
        id: dueDate.id,
        tax: dueDate.tax,
        concept: dueDate.concept,
        dueDate: dueDate.dueDate,
        clientId: dueDate.representativeId,
        clientName: representative.name,
      })
      .from(dueDate)
      .leftJoin(representative, eq(dueDate.representativeId, representative.id))
      .where(
        and(
          inArray(dueDate.representativeId, userRepresentativeIds),
          gte(dueDate.dueDate, today),
          lte(dueDate.dueDate, futureDate)
        )
      )
      .orderBy(dueDate.dueDate)
      .limit(ctx.data.limit);

    return dueDates;
  });

// ── getOverdueDebts ────────────────────────────────────────────────────────

export const getOverdueDebts = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      limit: z.number().default(5),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const debts = await db
      .select({
        id: debt.id,
        tax: debt.tax,
        concept: debt.concept,
        dueDate: debt.dueDate,
        balance: debt.balance,
        clientId: debt.representativeId,
        clientName: representative.name,
      })
      .from(debt)
      .leftJoin(representative, eq(debt.representativeId, representative.id))
      .where(and(inArray(debt.representativeId, userRepresentativeIds), lte(debt.dueDate, today)))
      .orderBy(debt.dueDate)
      .limit(ctx.data.limit);

    return debts;
  });

// ── getRecentInvoices ──────────────────────────────────────────────────────

export const getRecentInvoices = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      limit: z.number().default(5),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) return [];

    const conditions = [inArray(invoice.representativeId, userRepresentativeIds)];

    if (ctx.data.from) {
      conditions.push(gte(invoice.emitionDate, new Date(ctx.data.from)));
    }
    if (ctx.data.to) {
      const to = new Date(ctx.data.to);
      to.setHours(23, 59, 59, 999);
      conditions.push(lte(invoice.emitionDate, to));
    }

    const invoices = await db
      .select({
        id: invoice.id,
        type: invoice.type,
        direction: invoice.direction,
        amount: invoice.amount,
        currency: invoice.currency,
        emitionDate: invoice.emitionDate,
        clientId: invoice.representativeId,
        clientName: representative.name,
      })
      .from(invoice)
      .leftJoin(representative, eq(invoice.representativeId, representative.id))
      .where(and(...conditions))
      .orderBy(sql`${invoice.createdAt} DESC`)
      .limit(ctx.data.limit);

    return invoices;
  });

// ── getTopRepresentatives ──────────────────────────────────────────────────────────

export const getTopRepresentatives = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      limit: z.number().default(5),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({
        id: representative.id,
        name: representative.name,
        cuit: representative.cuit,
      })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) return [];

    const now = new Date();
    const rangeFrom = parseDateParam(
      ctx.data.from,
      new Date(now.getFullYear(), now.getMonth(), 1)
    );
    const rangeTo = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    );
    rangeTo.setHours(23, 59, 59, 999);

    const clientInvoices = await db
      .select({
        clientId: invoice.representativeId,
        totalAmount: sql<string>`SUM(${invoice.amount}::numeric)`,
        invoiceCount: sql<number>`COUNT(*)`,
        lastActivity: sql<string>`MAX(${invoice.createdAt})`,
      })
      .from(invoice)
      .where(
        and(
          inArray(invoice.representativeId, userRepresentativeIds),
          gte(invoice.emitionDate, rangeFrom),
          lte(invoice.emitionDate, rangeTo)
        )
      )
      .groupBy(invoice.representativeId)
      .orderBy(sql`SUM(${invoice.amount}::numeric) DESC`)
      .limit(ctx.data.limit);

    const overdueDebts = await db
      .select({
        clientId: debt.representativeId,
        overdueCount: sql<number>`COUNT(*)`,
        maxOverdueDays: sql<number>`MAX(EXTRACT(EPOCH FROM NOW() - ${debt.dueDate}::timestamptz) / 86400)`,
      })
      .from(debt)
      .where(
        and(inArray(debt.representativeId, userRepresentativeIds), lte(debt.dueDate, new Date()))
      )
      .groupBy(debt.representativeId)
      .catch(
        () =>
          [] as {
            clientId: string | null;
            overdueCount: number;
            maxOverdueDays: number;
          }[]
      );

    const clientMap = new Map(userRepresentatives.map((c) => [c.id, c]));
    const overdueMap = new Map(overdueDebts.map((d) => [d.clientId, d]));

    return clientInvoices.map((ci) => {
      const clientInfo = clientMap.get(ci.clientId);
      const overdue = overdueMap.get(ci.clientId);
      let status: 'ok' | 'pend' | 'late' = 'ok';
      let statusLabel = 'Al día';
      if (overdue && overdue.overdueCount > 0) {
        if (overdue.maxOverdueDays > 7) {
          status = 'late';
          statusLabel = `Vencido +${Math.round(overdue.maxOverdueDays)}d`;
        } else {
          status = 'pend';
          statusLabel = 'Pendiente';
        }
      }

      return {
        clientId: ci.clientId,
        name: clientInfo?.name || '-',
        cuit: clientInfo?.cuit || '-',
        totalAmount: parseFloat(ci.totalAmount || '0'),
        invoiceCount: ci.invoiceCount,
        lastActivity: ci.lastActivity,
        status,
        statusLabel,
      };
    });
  });

// ── getPendingNotificationsCount ───────────────────────────────────────────

export const getPendingNotificationsCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const userRepresentatives = await db
    .select({ id: representative.id })
    .from(representative)
    .where(eq(representative.organizationId, orgId));

  const userRepresentativeIds = userRepresentatives.map((c) => c.id);

  if (userRepresentativeIds.length === 0) return { count: 0 };

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notification)
    .where(
      and(
        inArray(notification.representativeId, userRepresentativeIds),
        eq(notification.opened, false)
      )
    );

  return { count: result?.count ?? 0 };
});

// ── getCalendarDueDates ──────────────────────────────────────────────────

export const getCalendarDueDates = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      from: z.string(),
      to: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);
    if (userRepresentativeIds.length === 0) return { dueDates: [], debts: [] };

    const from = new Date(ctx.data.from);
    const to = new Date(ctx.data.to);
    to.setHours(23, 59, 59, 999);

    const [dueDates, debts] = await Promise.all([
      db
        .select({
          id: dueDate.id,
          tax: dueDate.tax,
          concept: dueDate.concept,
          dueDate: dueDate.dueDate,
          clientId: dueDate.representativeId,
          clientName: representative.name,
          completedAt: dueDate.completedAt,
        })
        .from(dueDate)
        .leftJoin(representative, eq(dueDate.representativeId, representative.id))
        .where(
          and(
            inArray(dueDate.representativeId, userRepresentativeIds),
            gte(dueDate.dueDate, from),
            lte(dueDate.dueDate, to)
          )
        )
        .orderBy(dueDate.dueDate),
      db
        .select({
          id: debt.id,
          tax: debt.tax,
          concept: debt.concept,
          dueDate: debt.dueDate,
          balance: debt.balance,
          clientId: debt.representativeId,
          clientName: representative.name,
        })
        .from(debt)
        .leftJoin(representative, eq(debt.representativeId, representative.id))
        .where(
          and(
            inArray(debt.representativeId, userRepresentativeIds),
            gte(debt.dueDate, from),
            lte(debt.dueDate, to)
          )
        )
        .orderBy(debt.dueDate),
    ]);

    return { dueDates, debts };
  });

// ── getExceptionsSummary ───────────────────────────────────────────────────

export const getExceptionsSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const userRepresentatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const userRepresentativeIds = userRepresentatives.map((c) => c.id);

    if (userRepresentativeIds.length === 0) {
      return {
        overdueDebtCount: 0,
        criticalNotificationCount: 0,
        upcomingDueDateCount: 0,
        representativeErrorCount: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const [overdueDebts, criticalNotifs, upcomingDueDates, representativeErrors] =
      await Promise.all([
        // Overdue open debts: status='open' and dueDate < today
        db
          .select({ count: sql<number>`count(*)` })
          .from(debt)
          .where(
            and(
              inArray(debt.representativeId, userRepresentativeIds),
              eq(debt.status, 'open'),
              lte(debt.dueDate, today)
            )
          ),

        // Critical unresolved notifications
        db
          .select({ count: sql<number>`count(*)` })
          .from(notification)
          .where(
            and(
              inArray(notification.representativeId, userRepresentativeIds),
              eq(notification.severity, 'critical'),
              isNull(notification.resolvedAt)
            )
          ),

        // Upcoming due dates within 3 days that are not completed
        db
          .select({ count: sql<number>`count(*)` })
          .from(dueDate)
          .where(
            and(
              inArray(dueDate.representativeId, userRepresentativeIds),
              gte(dueDate.dueDate, today),
              lte(dueDate.dueDate, threeDaysFromNow),
              isNull(dueDate.completedAt)
            )
          ),

        // Representatives with open scraper_error alerts
        db
          .select({ count: sql<number>`count(DISTINCT ${alert.representativeId})` })
          .from(alert)
          .where(
            and(
              eq(alert.organizationId, orgId),
              eq(alert.type, 'scraper_error'),
              eq(alert.status, 'open')
            )
          ),
      ]);

    return {
      overdueDebtCount: Number(overdueDebts[0]?.count ?? 0),
      criticalNotificationCount: Number(criticalNotifs[0]?.count ?? 0),
      upcomingDueDateCount: Number(upcomingDueDates[0]?.count ?? 0),
      representativeErrorCount: Number(representativeErrors[0]?.count ?? 0),
    };
  }
);

// ── getTodayScrapedRepresentatives ──────────────────────────────────────────

export const getTodayScrapedRepresentatives = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userReps = await db
    .select({ id: representative.id })
    .from(representative)
    .where(eq(representative.organizationId, orgId));
  const repIds = userReps.map((r) => r.id);
  if (repIds.length === 0) return [];

  // Get distinct representatives that had jobs created today
  const rows = await db
    .select({
      representativeId: job.representativeId,
      name: representative.name,
      cuit: representative.cuit,
      jobCount: sql<number>`count(*)::int`,
      successCount: sql<number>`count(*) filter (where ${job.status} = 'finished')::int`,
      failedCount: sql<number>`count(*) filter (where ${job.status} = 'failed')::int`,
      pendingCount: sql<number>`count(*) filter (where ${job.status} in ('pending', 'running'))::int`,
    })
    .from(job)
    .innerJoin(representative, eq(job.representativeId, representative.id))
    .where(
      and(
        inArray(job.representativeId, repIds),
        gte(job.createdAt, today)
      )
    )
    .groupBy(job.representativeId, representative.name, representative.cuit)
    .orderBy(desc(sql`max(${job.createdAt})`));

  return rows;
});

// ── getCredentialAlerts ──────────────────────────────────────────────────────

export const getCredentialAlerts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const rows = await db
      .select({
        alertId: alert.id,
        representativeId: alert.representativeId,
        name: representative.name,
        cuit: representative.cuit,
        description: alert.description,
        createdAt: alert.createdAt,
      })
      .from(alert)
      .innerJoin(representative, eq(alert.representativeId, representative.id))
      .where(
        and(
          eq(alert.organizationId, orgId),
          eq(alert.type, 'scraper_error'),
          eq(alert.status, 'open'),
          sql`${alert.metadata}->>'errorCategory' = 'credentials'`
        )
      )
      .orderBy(desc(alert.createdAt));

    // Deduplicate by representativeId (a rep may have alerts for multiple job types)
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (!row.representativeId || seen.has(row.representativeId)) return false;
      seen.add(row.representativeId);
      return true;
    });
  }
);

// ── getScheduleStatus ────────────────────────────────────────────────────────

const SCHEDULE_CONFIG = {
  daily: { modules: ['comprobantes', 'notificaciones'], freq: 'daily' },
  weekly: { modules: ['deuda', 'vencimientos'], freq: 'weekly' },
  monthly_iva: { modules: ['iva'], freq: 'monthly' },
} as const;

const MODULE_FREQ: Record<string, string> = {};
for (const cfg of Object.values(SCHEDULE_CONFIG)) {
  for (const mod of cfg.modules) {
    MODULE_FREQ[mod] = cfg.freq;
  }
}

const ALL_MODULES = Object.keys(MODULE_FREQ);

function getNextScheduledAfter(frequency: string, now: Date): string {
  const day = now.getDay();
  const date = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (frequency === 'daily') {
    let daysToAdd = 1;
    if (day === 5) daysToAdd = 3;
    if (day === 6) daysToAdd = 2;
    const next = new Date(year, month, date + daysToAdd);
    next.setHours(8, 0, 0, 0);
    return next.toISOString();
  }

  if (frequency === 'weekly') {
    const daysToMon = day === 0 ? 1 : 8 - day;
    const next = new Date(year, month, date + daysToMon);
    next.setHours(6, 0, 0, 0);
    return next.toISOString();
  }

  // monthly (IVA)
  if (date <= 28) {
    const startDay = Math.max(date + 1, 20);
    const next = new Date(year, month, startDay);
    const dow = next.getDay();
    if (dow === 0) next.setDate(next.getDate() + 1);
    if (dow === 6) next.setDate(next.getDate() + 2);
    if (next.getDate() <= 28) {
      next.setHours(8, 0, 0, 0);
      return next.toISOString();
    }
  }
  const next = new Date(year, month + 1, 20);
  const dow = next.getDay();
  if (dow === 0) next.setDate(next.getDate() + 1);
  if (dow === 6) next.setDate(next.getDate() + 2);
  next.setHours(8, 0, 0, 0);
  return next.toISOString();
}

export const getScheduleStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();

    const reps = await db
      .select({ id: representative.id, name: representative.name, cuit: representative.cuit })
      .from(representative)
      .where(and(eq(representative.organizationId, orgId), eq(representative.status, 'active')));

    if (reps.length === 0) return [];

    const repIds = reps.map((r) => r.id);

    // Credential alerts
    const credAlerts = await db
      .select({ representativeId: alert.representativeId })
      .from(alert)
      .where(
        and(
          eq(alert.organizationId, orgId),
          eq(alert.type, 'scraper_error'),
          eq(alert.status, 'open'),
          sql`${alert.metadata}->>'errorCategory' = 'credentials'`
        )
      );
    const blockedIds = new Set(credAlerts.map((r) => r.representativeId));

    // Last successful scrape per (rep, type)
    const lastJobs = await db
      .select({
        representativeId: job.representativeId,
        type: job.type,
        finishedAt: sql<string>`MAX(${job.finishedAt})`,
      })
      .from(job)
      .where(
        and(inArray(job.representativeId, repIds), eq(job.status, 'finished'))
      )
      .groupBy(job.representativeId, job.type);

    const lastMap = new Map<string, string>();
    for (const row of lastJobs) {
      lastMap.set(`${row.representativeId}:${row.type}`, row.finishedAt);
    }

    const now = new Date();

    return reps.map((rep) => {
      const modules: Record<string, { frequency: string; lastScrapedAt: string | null; nextScheduledAfter: string | null }> = {};
      for (const mod of ALL_MODULES) {
        const freq = MODULE_FREQ[mod];
        modules[mod] = {
          frequency: freq,
          lastScrapedAt: lastMap.get(`${rep.id}:${mod}`) || null,
          nextScheduledAfter: blockedIds.has(rep.id) ? null : getNextScheduledAfter(freq, now),
        };
      }
      return {
        representativeId: rep.id,
        name: rep.name,
        cuit: rep.cuit,
        hasCredentialAlert: blockedIds.has(rep.id),
        modules,
      };
    });
  }
);
