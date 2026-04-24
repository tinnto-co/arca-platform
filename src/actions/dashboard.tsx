import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { client, invoice, debt, dueDate, notification } from '@/drizzle/schema';
import { eq, and, gte, lte, sql, inArray, isNull } from 'drizzle-orm';
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return {
        totalClients: 0,
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
            inArray(invoice.client, userClientIds),
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
            inArray(invoice.client, userClientIds),
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
        .where(inArray(invoice.client, userClientIds)),
    ]);

    const cur = currentStats[0];
    const prev = previousStats[0];
    const total = totalStats[0];

    return {
      totalClients: userClientIds.length,
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) return [];

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
          inArray(invoice.client, userClientIds),
          gte(invoice.emitionDate, from),
          lte(invoice.emitionDate, to)
        )
      );

    // Build monthly buckets from `from` to `to`
    const buckets: { year: number; month: number; outbound: number; inbound: number }[] = [];
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endBucket = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endBucket) {
      buckets.push({ year: cur.getFullYear(), month: cur.getMonth(), outbound: 0, inbound: 0 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    invoicesInRange.forEach((inv) => {
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD') {
        amount = amount * parseFloat(inv.currencyRate || '1');
      }

      const d = new Date(inv.emitionDate);
      const bucket = buckets.find((b) => b.year === d.getFullYear() && b.month === d.getMonth());
      if (!bucket) return;

      if (inv.direction?.toLowerCase() === 'outbound') bucket.outbound += amount;
      else if (inv.direction?.toLowerCase() === 'inbound') bucket.inbound += amount;
    });

    const MONTH_NAMES: Record<number, string> = {
      0: 'ene', 1: 'feb', 2: 'mar', 3: 'abr', 4: 'may', 5: 'jun',
      6: 'jul', 7: 'ago', 8: 'sep', 9: 'oct', 10: 'nov', 11: 'dic',
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) return [];

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
        clientId: dueDate.client,
        clientName: client.name,
      })
      .from(dueDate)
      .leftJoin(client, eq(dueDate.client, client.id))
      .where(
        and(
          inArray(dueDate.client, userClientIds),
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const debts = await db
      .select({
        id: debt.id,
        tax: debt.tax,
        concept: debt.concept,
        dueDate: debt.dueDate,
        balance: debt.balance,
        clientId: debt.client,
        clientName: client.name,
      })
      .from(debt)
      .leftJoin(client, eq(debt.client, client.id))
      .where(and(inArray(debt.client, userClientIds), lte(debt.dueDate, today)))
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) return [];

    const conditions = [inArray(invoice.client, userClientIds)];

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
        clientId: invoice.client,
        clientName: client.name,
      })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .where(and(...conditions))
      .orderBy(sql`${invoice.createdAt} DESC`)
      .limit(ctx.data.limit);

    return invoices;
  });

// ── getTopClients ──────────────────────────────────────────────────────────

export const getTopClients = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      limit: z.number().default(5),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userClients = await db
      .select({
        id: client.id,
        name: client.name,
        cuit: client.identityNumber,
      })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) return [];

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
        clientId: invoice.client,
        totalAmount: sql<string>`SUM(${invoice.amount}::numeric)`,
        invoiceCount: sql<number>`COUNT(*)`,
        lastActivity: sql<string>`MAX(${invoice.createdAt})`,
      })
      .from(invoice)
      .where(
        and(
          inArray(invoice.client, userClientIds),
          gte(invoice.emitionDate, rangeFrom),
          lte(invoice.emitionDate, rangeTo)
        )
      )
      .groupBy(invoice.client)
      .orderBy(sql`SUM(${invoice.amount}::numeric) DESC`)
      .limit(ctx.data.limit);

    const overdueDebts = await db
      .select({
        clientId: debt.client,
        overdueCount: sql<number>`COUNT(*)`,
        maxOverdueDays: sql<number>`MAX(EXTRACT(EPOCH FROM NOW() - ${debt.dueDate}::timestamptz) / 86400)`,
      })
      .from(debt)
      .where(
        and(inArray(debt.client, userClientIds), lte(debt.dueDate, new Date()))
      )
      .groupBy(debt.client)
      .catch(() => [] as { clientId: string | null; overdueCount: number; maxOverdueDays: number }[]);

    const clientMap = new Map(userClients.map((c) => [c.id, c]));
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

  const userClients = await db
    .select({ id: client.id })
    .from(client)
    .where(eq(client.organizationId, orgId));

  const userClientIds = userClients.map((c) => c.id);

  if (userClientIds.length === 0) return { count: 0 };

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notification)
    .where(
      and(
        inArray(notification.client, userClientIds),
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);
    if (userClientIds.length === 0) return { dueDates: [], debts: [] };

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
          clientId: dueDate.client,
          clientName: client.name,
          completedAt: dueDate.completedAt,
        })
        .from(dueDate)
        .leftJoin(client, eq(dueDate.client, client.id))
        .where(
          and(
            inArray(dueDate.client, userClientIds),
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
          clientId: debt.client,
          clientName: client.name,
        })
        .from(debt)
        .leftJoin(client, eq(debt.client, client.id))
        .where(
          and(
            inArray(debt.client, userClientIds),
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

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return {
        overdueDebtCount: 0,
        criticalNotificationCount: 0,
        upcomingDueDateCount: 0,
        clientErrorCount: 0,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    threeDaysFromNow.setHours(23, 59, 59, 999);

    const [overdueDebts, criticalNotifs, upcomingDueDates, clientErrors] =
      await Promise.all([
        // Overdue open debts: status='open' and dueDate < today
        db
          .select({ count: sql<number>`count(*)` })
          .from(debt)
          .where(
            and(
              inArray(debt.client, userClientIds),
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
              inArray(notification.client, userClientIds),
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
              inArray(dueDate.client, userClientIds),
              gte(dueDate.dueDate, today),
              lte(dueDate.dueDate, threeDaysFromNow),
              isNull(dueDate.completedAt)
            )
          ),

        // Clients with errors
        db
          .select({ count: sql<number>`count(*)` })
          .from(client)
          .where(
            and(
              eq(client.organizationId, orgId),
              eq(client.hasErrors, true)
            )
          ),
      ]);

    return {
      overdueDebtCount: Number(overdueDebts[0]?.count ?? 0),
      criticalNotificationCount: Number(criticalNotifs[0]?.count ?? 0),
      upcomingDueDateCount: Number(upcomingDueDates[0]?.count ?? 0),
      clientErrorCount: Number(clientErrors[0]?.count ?? 0),
    };
  }
);
