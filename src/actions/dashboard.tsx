import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import { client, invoice, debt, dueDate, notification } from "@/drizzle/schema";
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
  const currentMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59
  );

  // Get previous month dates
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    0,
    23,
    59,
    59
  );

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
      if (
        invoiceDate >= previousMonthStart &&
        invoiceDate <= previousMonthEnd
      ) {
        previousMonthSales += amount;
      }
    } else if (direction === "inbound") {
      totalPurchases += amount;
      if (invoiceDate >= currentMonthStart && invoiceDate <= currentMonthEnd) {
        monthlyPurchases += amount;
      }
      if (
        invoiceDate >= previousMonthStart &&
        invoiceDate <= previousMonthEnd
      ) {
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

export const getMonthlyEvolution = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      months: z.number().default(6),
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

    // Calculate monthly data for last N months
    const now = new Date();
    const monthlyDataMap: Record<
      string,
      { outbound: number; inbound: number }
    > = {};

    // Initialize all months with 0
    for (let i = ctx.data.months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = date.toLocaleString("es-AR", {
        month: "short",
        year: "2-digit",
      });
      monthlyDataMap[monthKey] = { outbound: 0, inbound: 0 };
    }

    // Process invoices
    allInvoices.forEach((inv) => {
      let amount = parseFloat(inv.amount || "0");
      if (inv.currency?.toUpperCase() === "USD") {
        const rate = parseFloat(inv.currencyRate || "1");
        amount = amount * rate;
      }

      const invoiceDate = new Date(inv.emitionDate);
      const monthKey = invoiceDate.toLocaleString("es-AR", {
        month: "short",
        year: "2-digit",
      });

      // Only include if within the last N months
      const monthsDiff =
        (now.getFullYear() - invoiceDate.getFullYear()) * 12 +
        (now.getMonth() - invoiceDate.getMonth());
      if (monthsDiff >= 0 && monthsDiff < ctx.data.months) {
        if (!monthlyDataMap[monthKey]) {
          monthlyDataMap[monthKey] = { outbound: 0, inbound: 0 };
        }

        if (inv.direction?.toLowerCase() === "outbound") {
          monthlyDataMap[monthKey].outbound += amount;
        } else if (inv.direction?.toLowerCase() === "inbound") {
          monthlyDataMap[monthKey].inbound += amount;
        }
      }
    });

    // Convert to array and sort
    const monthNames: Record<string, number> = {
      ene: 0,
      feb: 1,
      mar: 2,
      abr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      ago: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dic: 11,
    };

    const monthlyData = Object.keys(monthlyDataMap)
      .map((month) => ({ month, ...monthlyDataMap[month] }))
      .sort((a, b) => {
        const [monthA, yearA] = a.month.split(" ");
        const [monthB, yearB] = b.month.split(" ");
        const monthIndexA = monthNames[monthA.toLowerCase()] ?? 0;
        const monthIndexB = monthNames[monthB.toLowerCase()] ?? 0;
        const yearA_num = parseInt(`20${yearA}`);
        const yearB_num = parseInt(`20${yearB}`);

        if (yearA_num !== yearB_num) {
          return yearA_num - yearB_num;
        }
        return monthIndexA - monthIndexB;
      });

    return monthlyData;
  });

export const getUpcomingDueDates = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      days: z.number().default(7),
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

export const getOverdueDebts = createServerFn({
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

export const getPendingNotificationsCount = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userClients = await db
    .select({ id: client.id })
    .from(client)
    .where(eq(client.userId, session.user.id));

  const userClientIds = userClients.map((c) => c.id);

  if (userClientIds.length === 0) {
    return { count: 0 };
  }

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
