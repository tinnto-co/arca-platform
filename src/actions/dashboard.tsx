import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import { client, invoice, debt, dueDate } from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";

export const getDashboardStats = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get clients associated with the current user
  const userClients = await db
    .select({ id: client.id })
    .from(client)
    .where(eq(client.userId, session.user.id));

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

  // Get current month dates
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
  // Get previous month dates
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Get all invoices for user's clients
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

  // Calculate totals
  let totalSales = 0;
  let totalPurchases = 0;
  let monthlySales = 0;
  let monthlyPurchases = 0;
  let previousMonthSales = 0;
  let previousMonthPurchases = 0;

  allInvoices.forEach((inv) => {
    let amount = parseFloat(inv.amount || "0");
    if (inv.currency?.toUpperCase() === "USD") {
      const rate = parseFloat(inv.currencyRate || "1");
      amount = amount * rate;
    }

    const direction = inv.direction?.toLowerCase();
    const invoiceDate = new Date(inv.emitionDate);

    if (direction === "outbound") {
      totalSales += amount;
      if (invoiceDate >= currentMonthStart && invoiceDate <= currentMonthEnd) {
        monthlySales += amount;
      }
      if (invoiceDate >= previousMonthStart && invoiceDate <= previousMonthEnd) {
        previousMonthSales += amount;
      }
    } else if (direction === "inbound") {
      totalPurchases += amount;
      if (invoiceDate >= currentMonthStart && invoiceDate <= currentMonthEnd) {
        monthlyPurchases += amount;
      }
      if (invoiceDate >= previousMonthStart && invoiceDate <= previousMonthEnd) {
        previousMonthPurchases += amount;
      }
    }
  });

  const monthlyInvoices = allInvoices.filter(
    (inv) =>
      new Date(inv.emitionDate) >= currentMonthStart &&
      new Date(inv.emitionDate) <= currentMonthEnd
  ).length;

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

export const getUpcomingDueDates = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      days: z.number().default(7),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Get clients associated with the current user
    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return [];
    }

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
      .limit(10);

    return dueDates;
  });

export const getOverdueDebts = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  // Get clients associated with the current user
  const userClients = await db
    .select({ id: client.id })
    .from(client)
    .where(eq(client.userId, session.user.id));

  const userClientIds = userClients.map((c) => c.id);

  if (userClientIds.length === 0) {
    return [];
  }

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
    .where(
      and(
        inArray(debt.client, userClientIds),
        lte(debt.dueDate, today)
      )
    )
    .orderBy(debt.dueDate)
    .limit(10);

  return debts;
});

export const getRecentInvoices = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      limit: z.number().default(5),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Get clients associated with the current user
    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return [];
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
      .where(inArray(invoice.client, userClientIds))
      .orderBy(sql`${invoice.createdAt} DESC`)
      .limit(ctx.data.limit);

    return invoices;
  });

