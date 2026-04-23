import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { client, invoice, debt, dueDate, notification } from '@/drizzle/schema';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { getSessionWithOrg, getOrgClientIds } from '@/actions/helpers';

// ── Helpers ────────────────────────────────────────────────────────────────

function parseDateParam(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

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

    // Previous period: same duration, ending 1ms before currentFrom
    const rangeMs = currentTo.getTime() - currentFrom.getTime();
    const previousTo = new Date(currentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - rangeMs);

    const allInvoices = await db
      .select({
        direction: invoice.direction,
        amount: invoice.amount,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        emitionDate: invoice.emitionDate,
      })
      .from(invoice)
      .where(inArray(invoice.client, userClientIds));

    let totalSales = 0;
    let totalPurchases = 0;
    let monthlySales = 0;
    let monthlyPurchases = 0;
    let previousMonthSales = 0;
    let previousMonthPurchases = 0;

    allInvoices.forEach((inv) => {
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD') {
        const rate = parseFloat(inv.currencyRate || '1');
        amount = amount * rate;
      }

      const direction = inv.direction?.toLowerCase();
      const invoiceDate = new Date(inv.emitionDate);

      if (direction === 'outbound') {
        totalSales += amount;
        if (invoiceDate >= currentFrom && invoiceDate <= currentTo) {
          monthlySales += amount;
        }
        if (invoiceDate >= previousFrom && invoiceDate <= previousTo) {
          previousMonthSales += amount;
        }
      } else if (direction === 'inbound') {
        totalPurchases += amount;
        if (invoiceDate >= currentFrom && invoiceDate <= currentTo) {
          monthlyPurchases += amount;
        }
        if (invoiceDate >= previousFrom && invoiceDate <= previousTo) {
          previousMonthPurchases += amount;
        }
      }
    });

    const monthlyInvoices = allInvoices.filter((inv) => {
      const d = new Date(inv.emitionDate);
      return d >= currentFrom && d <= currentTo;
    }).length;

    return {
      totalClients: userClientIds.length,
      totalSales,
      totalPurchases,
      totalInvoices: allInvoices.length,
      monthlySales,
      monthlyPurchases,
      monthlyInvoices,
      previousMonthSales,
      previousMonthPurchases,
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

    // Determine range
    const to = parseDateParam(
      ctx.data.to,
      new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    );
    const monthCount = ctx.data.months ?? 6;
    const from = parseDateParam(
      ctx.data.from,
      new Date(to.getFullYear(), to.getMonth() - (monthCount - 1), 1)
    );

    const allInvoices = await db
      .select({
        direction: invoice.direction,
        amount: invoice.amount,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        emitionDate: invoice.emitionDate,
      })
      .from(invoice)
      .where(inArray(invoice.client, userClientIds));

    // Build monthly buckets from `from` to `to`
    const buckets: { year: number; month: number; outbound: number; inbound: number }[] = [];
    let cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endBucket = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endBucket) {
      buckets.push({ year: cur.getFullYear(), month: cur.getMonth(), outbound: 0, inbound: 0 });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    allInvoices.forEach((inv) => {
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
        cuit: client.cuit,
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
        totalAmount: sql<string>`SUM(CAST(${invoice.amount} AS DECIMAL))`,
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
      .orderBy(sql`SUM(CAST(${invoice.amount} AS DECIMAL)) DESC`)
      .limit(ctx.data.limit);

    const clientMap = new Map(userClients.map((c) => [c.id, c]));

    const overdueDebts = await db
      .select({
        clientId: debt.client,
        overdueCount: sql<number>`COUNT(*)`,
        maxOverdueDays: sql<number>`MAX(EXTRACT(DAY FROM NOW() - ${debt.dueDate}))`,
      })
      .from(debt)
      .where(
        and(inArray(debt.client, userClientIds), lte(debt.dueDate, new Date()))
      )
      .groupBy(debt.client);

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
