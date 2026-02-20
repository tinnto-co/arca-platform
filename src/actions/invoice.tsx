import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import {
  invoice,
  client,
  invoiceAttachment,
  document,
  profile,
} from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq, desc, asc, and, gte, lte, sql, inArray } from "drizzle-orm";

export const getInvoices = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      clientFilter: z.string().optional(),
      profileFilter: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      typeFilter: z.string().optional(),
      directionFilter: z.string().optional(),
      search: z.string().optional(),
      sortBy: z.enum(["amount", "emitionDate"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      page,
      limit,
      clientFilter,
      profileFilter,
      dateFrom,
      dateTo,
      typeFilter,
      directionFilter,
      search,
      sortBy,
      sortOrder,
    } = ctx.data;
    const offset = (page - 1) * limit;

    // Get clients associated with the current user
    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return {
        invoices: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    // Build where conditions
    const conditions = [
      inArray(invoice.client, userClientIds), // Filter by user's clients
    ];

    if (clientFilter && clientFilter !== "all") {
      // Verify the client belongs to the user
      if (userClientIds.includes(clientFilter)) {
        conditions.push(eq(invoice.client, clientFilter));
      }
    }

    if (profileFilter && profileFilter !== "all") {
      // Verify profile belongs to one of user's clients
      const [profileRow] = await db
        .select({ id: profile.id })
        .from(profile)
        .where(
          and(
            eq(profile.id, profileFilter),
            inArray(profile.client, userClientIds)
          )
        )
        .limit(1);
      if (profileRow) {
        conditions.push(eq(invoice.profile, profileFilter));
      }
    }

    if (dateFrom) {
      conditions.push(gte(invoice.emitionDate, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(invoice.emitionDate, new Date(dateTo)));
    }

    if (typeFilter && typeFilter !== "all") {
      conditions.push(eq(invoice.type, typeFilter));
    }

    if (directionFilter && directionFilter !== "all") {
      conditions.push(eq(invoice.direction, directionFilter));
    }

    if (search) {
      conditions.push(
        sql`(
          ${invoice.emitterName} ILIKE ${`%${search}%`} OR
          ${invoice.recipientName} ILIKE ${`%${search}%`}
        )`
      );
    }

    const whereCondition = and(...conditions);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .where(whereCondition);

    // Get invoices with client and profile data
    const invoices = await db
      .select({
        id: invoice.id,
        direction: invoice.direction,
        emitionDate: invoice.emitionDate,
        type: invoice.type,
        recipientName: invoice.recipientName,
        recipientIdentityNumber: invoice.recipientIdentityNumber,
        recipientIdentityType: invoice.recipientIdentityType,
        emitterName: invoice.emitterName,
        emitterIdentityNumber: invoice.emitterIdentityNumber,
        emitterIdentityType: invoice.emitterIdentityType,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        salePoint: invoice.salePoint,
        authorizationNumber: invoice.authorizationNumber,
        idFrom: invoice.idFrom,
        idTo: invoice.idTo,
        amount: invoice.amount,
        clientId: invoice.client,
        clientName: client.name,
        clientEmail: client.email,
        profileName: profile.name,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .leftJoin(profile, eq(invoice.profile, profile.id))
      .where(whereCondition)
      .orderBy(
        sortBy === "amount"
          ? sortOrder === "asc"
            ? asc(invoice.amount)
            : desc(invoice.amount)
          : sortBy === "emitionDate"
            ? sortOrder === "asc"
              ? asc(invoice.emitionDate)
              : desc(invoice.emitionDate)
            : desc(invoice.emitionDate)
      )
      .limit(limit)
      .offset(offset);

    return {
      invoices,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  });

export const getInvoice = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ id: z.string() }))
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
      throw new Error("Factura no encontrada");
    }

    // Get invoice with client data, ensuring it belongs to user's clients
    const [invoiceData] = await db
      .select({
        id: invoice.id,
        direction: invoice.direction,
        emitionDate: invoice.emitionDate,
        type: invoice.type,
        recipientName: invoice.recipientName,
        recipientIdentityNumber: invoice.recipientIdentityNumber,
        recipientIdentityType: invoice.recipientIdentityType,
        emitterName: invoice.emitterName,
        emitterIdentityNumber: invoice.emitterIdentityNumber,
        emitterIdentityType: invoice.emitterIdentityType,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        salePoint: invoice.salePoint,
        authorizationNumber: invoice.authorizationNumber,
        idFrom: invoice.idFrom,
        idTo: invoice.idTo,
        amount: invoice.amount,
        amountIVA0: invoice.amountIVA0,
        IVA25: invoice.IVA25,
        amountIVA25: invoice.amountIVA25,
        IVA5: invoice.IVA5,
        amountIVA5: invoice.amountIVA5,
        IVA105: invoice.IVA105,
        amountIVA105: invoice.amountIVA105,
        IVA21: invoice.IVA21,
        amountIVA21: invoice.amountIVA21,
        IVA27: invoice.IVA27,
        amountIVA27: invoice.amountIVA27,
        amountTaxed: invoice.amountTaxed,
        amountNoTaxed: invoice.amountNoTaxed,
        amountExempt: invoice.amountExempt,
        other_taxes: invoice.other_taxes,
        totalIVA: invoice.totalIVA,
        clientId: invoice.client,
        clientName: client.name,
        clientEmail: client.email,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .where(
        and(eq(invoice.id, ctx.data.id), inArray(invoice.client, userClientIds))
      )
      .limit(1);

    if (!invoiceData) throw new Error("Factura no encontrada");

    // Get attachments for this invoice (using notification table as reference)
    // Note: invoiceAttachment references notification, not invoice directly
    // This might need to be adjusted based on your actual schema relationships
    const attachments = await db
      .select({
        id: invoiceAttachment.id,
        externalId: invoiceAttachment.externalId,
        documentId: invoiceAttachment.document,
        documentName: document.name,
        documentUrl: document.url,
        documentType: document.type,
        createdAt: invoiceAttachment.createdAt,
      })
      .from(invoiceAttachment)
      .leftJoin(document, eq(invoiceAttachment.document, document.id))
      .where(eq(invoiceAttachment.notification, ctx.data.id));

    return {
      ...invoiceData,
      attachments,
    };
  });

export const getInvoiceAttachments = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ invoiceId: z.string() }))
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

    // Verify invoice belongs to user's clients
    const [invoiceData] = await db
      .select({ clientId: invoice.client })
      .from(invoice)
      .where(
        and(
          eq(invoice.id, ctx.data.invoiceId),
          inArray(invoice.client, userClientIds)
        )
      )
      .limit(1);

    if (!invoiceData) {
      throw new Error("Factura no encontrada");
    }

    // Get attachments for this invoice
    const attachments = await db
      .select({
        id: invoiceAttachment.id,
        externalId: invoiceAttachment.externalId,
        documentId: document.id,
        documentName: document.name,
        documentUrl: document.url,
        documentType: document.type,
        createdAt: invoiceAttachment.createdAt,
      })
      .from(invoiceAttachment)
      .leftJoin(document, eq(invoiceAttachment.document, document.id))
      .where(eq(invoiceAttachment.notification, ctx.data.invoiceId));

    return attachments;
  });

export const createInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      direction: z.string(),
      emitionDate: z.string(),
      type: z.string(),
      recipientName: z.string(),
      recipientIdentityNumber: z.string(),
      recipientIdentityType: z.string(),
      emitterName: z.string(),
      emitterIdentityNumber: z.string(),
      emitterIdentityType: z.string(),
      currency: z.string(),
      currencyRate: z.string(),
      salePoint: z.string(),
      authorizationNumber: z.string(),
      idFrom: z.string(),
      idTo: z.string(),
      amount: z.string(),
      clientId: z.string(),
      profileId: z.string().optional(),
      amountIVA0: z.string().optional(),
      IVA25: z.string().optional(),
      amountIVA25: z.string().optional(),
      IVA5: z.string().optional(),
      amountIVA5: z.string().optional(),
      IVA105: z.string().optional(),
      amountIVA105: z.string().optional(),
      IVA21: z.string().optional(),
      amountIVA21: z.string().optional(),
      IVA27: z.string().optional(),
      amountIVA27: z.string().optional(),
      amountTaxed: z.string().optional(),
      amountNoTaxed: z.string().optional(),
      amountExempt: z.string().optional(),
      other_taxes: z.string().optional(),
      totalIVA: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Verify client belongs to user
    const [clientData] = await db
      .select({ id: client.id })
      .from(client)
      .where(
        and(
          eq(client.id, ctx.data.clientId),
          eq(client.userId, session.user.id)
        )
      )
      .limit(1);

    if (!clientData) {
      throw new Error("Cliente no encontrado o no autorizado");
    }

    // Verify profile belongs to client if provided
    if (ctx.data.profileId) {
      const [profileData] = await db
        .select({ id: profile.id })
        .from(profile)
        .where(
          and(
            eq(profile.id, ctx.data.profileId),
            eq(profile.client, ctx.data.clientId)
          )
        )
        .limit(1);

      if (!profileData) {
        throw new Error("Perfil no encontrado o no pertenece al cliente");
      }
    }

    const [newInvoice] = await db
      .insert(invoice)
      .values({
        direction: ctx.data.direction,
        emitionDate: new Date(ctx.data.emitionDate),
        type: ctx.data.type,
        recipientName: ctx.data.recipientName,
        recipientIdentityNumber: ctx.data.recipientIdentityNumber,
        recipientIdentityType: ctx.data.recipientIdentityType,
        emitterName: ctx.data.emitterName,
        emitterIdentityNumber: ctx.data.emitterIdentityNumber,
        emitterIdentityType: ctx.data.emitterIdentityType,
        currency: ctx.data.currency,
        cureencyRate: ctx.data.currencyRate,
        salePoint: ctx.data.salePoint,
        authorizationNumber: ctx.data.authorizationNumber,
        idFrom: ctx.data.idFrom,
        idTo: ctx.data.idTo,
        amount: ctx.data.amount,
        client: ctx.data.clientId,
        profile: ctx.data.profileId || null,
        amountIVA0: ctx.data.amountIVA0 || "0",
        IVA25: ctx.data.IVA25 || "0",
        amountIVA25: ctx.data.amountIVA25 || "0",
        IVA5: ctx.data.IVA5 || "0",
        amountIVA5: ctx.data.amountIVA5 || "0",
        IVA105: ctx.data.IVA105 || "0",
        amountIVA105: ctx.data.amountIVA105 || "0",
        IVA21: ctx.data.IVA21 || "0",
        amountIVA21: ctx.data.amountIVA21 || "0",
        IVA27: ctx.data.IVA27 || "0",
        amountIVA27: ctx.data.amountIVA27 || "0",
        amountTaxed: ctx.data.amountTaxed || "0",
        amountNoTaxed: ctx.data.amountNoTaxed || "0",
        amountExempt: ctx.data.amountExempt || "0",
        other_taxes: ctx.data.other_taxes || "0",
        totalIVA: ctx.data.totalIVA || "0",
      })
      .returning();

    return newInvoice;
  });

export const updateInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string(),
      direction: z.string().optional(),
      emitionDate: z.string().optional(),
      type: z.string().optional(),
      recipientName: z.string().optional(),
      recipientIdentityNumber: z.string().optional(),
      recipientIdentityType: z.string().optional(),
      emitterName: z.string().optional(),
      emitterIdentityNumber: z.string().optional(),
      emitterIdentityType: z.string().optional(),
      currency: z.string().optional(),
      currencyRate: z.string().optional(),
      salePoint: z.string().optional(),
      authorizationNumber: z.string().optional(),
      idFrom: z.string().optional(),
      idTo: z.string().optional(),
      amount: z.string().optional(),
      clientId: z.string().optional(),
      profileId: z.string().optional(),
      amountIVA0: z.string().optional(),
      IVA25: z.string().optional(),
      amountIVA25: z.string().optional(),
      IVA5: z.string().optional(),
      amountIVA5: z.string().optional(),
      IVA105: z.string().optional(),
      amountIVA105: z.string().optional(),
      IVA21: z.string().optional(),
      amountIVA21: z.string().optional(),
      IVA27: z.string().optional(),
      amountIVA27: z.string().optional(),
      amountTaxed: z.string().optional(),
      amountNoTaxed: z.string().optional(),
      amountExempt: z.string().optional(),
      other_taxes: z.string().optional(),
      totalIVA: z.string().optional(),
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
      throw new Error("Factura no encontrada");
    }

    // Verify invoice belongs to user's clients
    const [existingInvoice] = await db
      .select({ id: invoice.id, clientId: invoice.client })
      .from(invoice)
      .where(
        and(eq(invoice.id, ctx.data.id), inArray(invoice.client, userClientIds))
      )
      .limit(1);

    if (!existingInvoice) {
      throw new Error("Factura no encontrada o no autorizada");
    }

    // Verify new client belongs to user if provided
    if (ctx.data.clientId && ctx.data.clientId !== existingInvoice.clientId) {
      if (!userClientIds.includes(ctx.data.clientId)) {
        throw new Error("Cliente no autorizado");
      }
    }

    // Verify profile belongs to client if provided
    if (ctx.data.profileId) {
      const clientIdToCheck = ctx.data.clientId || existingInvoice.clientId;
      if (clientIdToCheck) {
        const [profileData] = await db
          .select({ id: profile.id })
          .from(profile)
          .where(
            and(
              eq(profile.id, ctx.data.profileId),
              eq(profile.client, clientIdToCheck)
            )
          )
          .limit(1);

        if (!profileData) {
          throw new Error("Perfil no encontrado o no pertenece al cliente");
        }
      }
    }

    // Build update object
    const updateData: any = {};
    if (ctx.data.direction) updateData.direction = ctx.data.direction;
    if (ctx.data.emitionDate)
      updateData.emitionDate = new Date(ctx.data.emitionDate);
    if (ctx.data.type) updateData.type = ctx.data.type;
    if (ctx.data.recipientName)
      updateData.recipientName = ctx.data.recipientName;
    if (ctx.data.recipientIdentityNumber)
      updateData.recipientIdentityNumber = ctx.data.recipientIdentityNumber;
    if (ctx.data.recipientIdentityType)
      updateData.recipientIdentityType = ctx.data.recipientIdentityType;
    if (ctx.data.emitterName) updateData.emitterName = ctx.data.emitterName;
    if (ctx.data.emitterIdentityNumber)
      updateData.emitterIdentityNumber = ctx.data.emitterIdentityNumber;
    if (ctx.data.emitterIdentityType)
      updateData.emitterIdentityType = ctx.data.emitterIdentityType;
    if (ctx.data.currency) updateData.currency = ctx.data.currency;
    if (ctx.data.currencyRate) updateData.cureencyRate = ctx.data.currencyRate;
    if (ctx.data.salePoint) updateData.salePoint = ctx.data.salePoint;
    if (ctx.data.authorizationNumber)
      updateData.authorizationNumber = ctx.data.authorizationNumber;
    if (ctx.data.idFrom) updateData.idFrom = ctx.data.idFrom;
    if (ctx.data.idTo) updateData.idTo = ctx.data.idTo;
    if (ctx.data.amount) updateData.amount = ctx.data.amount;
    if (ctx.data.clientId) updateData.client = ctx.data.clientId;
    if (ctx.data.profileId !== undefined)
      updateData.profile = ctx.data.profileId || null;
    if (ctx.data.amountIVA0) updateData.amountIVA0 = ctx.data.amountIVA0;
    if (ctx.data.IVA25) updateData.IVA25 = ctx.data.IVA25;
    if (ctx.data.amountIVA25) updateData.amountIVA25 = ctx.data.amountIVA25;
    if (ctx.data.IVA5) updateData.IVA5 = ctx.data.IVA5;
    if (ctx.data.amountIVA5) updateData.amountIVA5 = ctx.data.amountIVA5;
    if (ctx.data.IVA105) updateData.IVA105 = ctx.data.IVA105;
    if (ctx.data.amountIVA105) updateData.amountIVA105 = ctx.data.amountIVA105;
    if (ctx.data.IVA21) updateData.IVA21 = ctx.data.IVA21;
    if (ctx.data.amountIVA21) updateData.amountIVA21 = ctx.data.amountIVA21;
    if (ctx.data.IVA27) updateData.IVA27 = ctx.data.IVA27;
    if (ctx.data.amountIVA27) updateData.amountIVA27 = ctx.data.amountIVA27;
    if (ctx.data.amountTaxed) updateData.amountTaxed = ctx.data.amountTaxed;
    if (ctx.data.amountNoTaxed)
      updateData.amountNoTaxed = ctx.data.amountNoTaxed;
    if (ctx.data.amountExempt) updateData.amountExempt = ctx.data.amountExempt;
    if (ctx.data.other_taxes) updateData.other_taxes = ctx.data.other_taxes;
    if (ctx.data.totalIVA) updateData.totalIVA = ctx.data.totalIVA;

    const [updatedInvoice] = await db
      .update(invoice)
      .set(updateData)
      .where(eq(invoice.id, ctx.data.id))
      .returning();

    return updatedInvoice;
  });

export const deleteInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ id: z.string() }))
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
      throw new Error("Factura no encontrada");
    }

    // Verify invoice belongs to user's clients
    const [existingInvoice] = await db
      .select({ id: invoice.id })
      .from(invoice)
      .where(
        and(eq(invoice.id, ctx.data.id), inArray(invoice.client, userClientIds))
      )
      .limit(1);

    if (!existingInvoice) {
      throw new Error("Factura no encontrada o no autorizada");
    }

    await db.delete(invoice).where(eq(invoice.id, ctx.data.id));

    return { success: true };
  });

export const getInvoiceTotalsByClient = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (process.env.NODE_ENV === "development") {
    console.log("[getInvoiceTotalsByClient] called", {
      userId: session.user.id,
    });
  }

  // Get clients associated with the current user
  const userClients = await db
    .select({ id: client.id })
    .from(client)
    // .where(eq(client.userId, session.user.id));

  const userClientIds = userClients.map((c) => c.id);

  if (process.env.NODE_ENV === "development") {
    console.log("[getInvoiceTotalsByClient] user clients", {
      count: userClientIds.length,
      sampleIds: userClientIds.slice(0, 5),
    });
  }

  if (userClientIds.length === 0) {
    return {};
  }

  // Get all invoices for user's clients
  const invoices = await db
    .select({
      clientId: invoice.client,
      direction: invoice.direction,
      amount: invoice.amount,
      currency: invoice.currency,
      currencyRate: invoice.cureencyRate,
    })
    .from(invoice)
    .where(inArray(invoice.client, userClientIds));

  if (process.env.NODE_ENV === "development") {
    console.log("[getInvoiceTotalsByClient] raw invoices", {
      count: invoices.length,
      sample: invoices.slice(0, 5),
    });
  }

  // Calculate totals by client
  const totalsByClient: Record<string, { outbound: number; inbound: number }> =
    {};

  invoices.forEach((inv) => {
    if (!inv.clientId) return;

    if (!totalsByClient[inv.clientId]) {
      totalsByClient[inv.clientId] = { outbound: 0, inbound: 0 };
    }

    // Convert amount to number (it's stored as string in numeric type)
    let amount = parseFloat(inv.amount || "0");

    // If currency is USD, convert to ARS using the currency rate
    if (inv.currency?.toUpperCase() === "USD") {
      const rate = parseFloat(inv.currencyRate || "1");
      amount = amount * rate;
    }

    // Add to the appropriate direction
    const direction = inv.direction?.toLowerCase();
    if (direction === "outbound") {
      totalsByClient[inv.clientId].outbound += amount;
    } else if (direction === "inbound") {
      totalsByClient[inv.clientId].inbound += amount;
    }
  });

  if (process.env.NODE_ENV === "development") {
    console.log("[getInvoiceTotalsByClient] totalsByClient summary", {
      clientsWithTotals: Object.keys(totalsByClient).length,
      sample: Object.entries(totalsByClient)
        .slice(0, 5)
        .map(([clientId, totals]) => ({ clientId, ...totals })),
    });
  }

  return totalsByClient;
});

export const getInvoicesByProfile = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      profileId: z.string(),
      page: z.number().default(1),
      limit: z.number().default(10),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { profileId, page, limit } = ctx.data;
    const offset = (page - 1) * limit;

    // Get clients associated with the current user
    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return {
        invoices: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    // Verify profile belongs to one of user's clients
    const [profileData] = await db
      .select({ id: profile.id, clientId: profile.client })
      .from(profile)
      .where(
        and(eq(profile.id, profileId), inArray(profile.client, userClientIds))
      )
      .limit(1);

    if (!profileData) {
      throw new Error("Perfil no encontrado o no autorizado");
    }

    // Build where conditions
    const conditions = [
      eq(invoice.profile, profileId),
      inArray(invoice.client, userClientIds),
    ];

    const whereCondition = and(...conditions);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoice)
      .where(whereCondition);

    // Get invoices with client and profile data
    const invoices = await db
      .select({
        id: invoice.id,
        direction: invoice.direction,
        emitionDate: invoice.emitionDate,
        type: invoice.type,
        recipientName: invoice.recipientName,
        recipientIdentityNumber: invoice.recipientIdentityNumber,
        recipientIdentityType: invoice.recipientIdentityType,
        emitterName: invoice.emitterName,
        emitterIdentityNumber: invoice.emitterIdentityNumber,
        emitterIdentityType: invoice.emitterIdentityType,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        salePoint: invoice.salePoint,
        authorizationNumber: invoice.authorizationNumber,
        idFrom: invoice.idFrom,
        idTo: invoice.idTo,
        amount: invoice.amount,
        clientId: invoice.client,
        clientName: client.name,
        clientEmail: client.email,
        profileName: profile.name,
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .leftJoin(profile, eq(invoice.profile, profile.id))
      .where(whereCondition)
      .orderBy(desc(invoice.emitionDate))
      .limit(limit)
      .offset(offset);

    return {
      invoices,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  });

export const getInvoicesByProfileInRange = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      profileId: z.string(),
      dateFrom: z.string(),
      dateTo: z.string(),
    })
  )
  .handler(async (ctx) => {
    try {
      const session = await auth.api.getSession({ headers: getRequestHeaders() });
      if (!session?.user?.id) throw new Error("Unauthorized");

      const { profileId, dateFrom, dateTo } = ctx.data;

      // Get clients associated with the current user
      const userClients = await db
        .select({ id: client.id })
        .from(client)
        .where(eq(client.userId, session.user.id));

      const userClientIds = userClients.map((c) => c.id);

      if (userClientIds.length === 0) {
        return [];
      }

      // Verify profile belongs to one of user's clients
      const [profileData] = await db
        .select({ id: profile.id, clientId: profile.client })
        .from(profile)
        .where(
          and(eq(profile.id, profileId), inArray(profile.client, userClientIds))
        )
        .limit(1);

      if (!profileData) {
        throw new Error("Perfil no encontrado o no autorizado");
      }

      const whereCondition = and(
        eq(invoice.profile, profileId),
        inArray(invoice.client, userClientIds),
        gte(invoice.emitionDate, new Date(dateFrom)),
        lte(invoice.emitionDate, new Date(dateTo))
      );

      const invoicesInRange = await db
        .select()
        .from(invoice)
        .where(whereCondition)
        .orderBy(desc(invoice.emitionDate));

      return invoicesInRange;
    } catch (error: any) {
      console.error("[getInvoicesByProfileInRange] error:", error);
      throw new Error(
        error?.message ||
          "No se pudieron obtener las facturas para el perfil y rango seleccionados"
      );
    }
  });

// Tipos A según AFIP (Factura A, Nota Débito/Crédito A, Recibo A, etc.)
const INVOICE_TYPES_A = [
  "1", "2", "3", "4",
  "51", "52", "53", "54",
  "201", "202", "203",
];

// Tipos B según AFIP (Factura B, Nota Débito B, Nota Crédito B)
const INVOICE_TYPES_B = ["6", "7", "8"];

// Tipos Nota de Crédito (AFIP): restan del total (no suman)
const CREDIT_NOTE_TYPES = [
  "3", "8", "13", "21", "53", "114", "197", "203", "208", "213",
];

export const getInvoiceStatsByProfile = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      profileId: z.string(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { profileId, dateFrom, dateTo } = ctx.data;

    // Get clients associated with the current user
    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));

    const userClientIds = userClients.map((c) => c.id);

    if (userClientIds.length === 0) {
      return {
        totalInvoices: 0,
        totalOutbound: 0,
        totalInbound: 0,
        monthlyData: [],
        typeDistribution: [],
        netoA21: 0,
        netoA105: 0,
        totalAmountB21: 0,
        totalAmountB105: 0,
        totalAmountB27: 0,
        netoInbound27: 0,
        netoInbound21: 0,
        netoInbound105: 0,
        netoInbound5: 0,
        netoInbound25: 0,
        netoGravadoCompras: 0,
        creditoFiscalCompras: 0,
        totalAmountExempt: 0,
        totalAmountIVA0: 0,
        totalAmountNoTaxed: 0,
      };
    }

    // Verify profile belongs to one of user's clients
    const [profileData] = await db
      .select({ id: profile.id, clientId: profile.client })
      .from(profile)
      .where(
        and(eq(profile.id, profileId), inArray(profile.client, userClientIds))
      )
      .limit(1);

    if (!profileData) {
      throw new Error("Perfil no encontrado o no autorizado");
    }

    const conditions = [
      eq(invoice.profile, profileId),
      inArray(invoice.client, userClientIds),
    ];
    if (dateFrom) conditions.push(gte(invoice.emitionDate, new Date(dateFrom)));
    if (dateTo) conditions.push(lte(invoice.emitionDate, new Date(dateTo)));

    // Get all invoices for this profile (and date range if provided)
    const invoices = await db
      .select({
        id: invoice.id,
        direction: invoice.direction,
        emitionDate: invoice.emitionDate,
        type: invoice.type,
        amount: invoice.amount,
        currency: invoice.currency,
        currencyRate: invoice.cureencyRate,
        amountIVA21: invoice.amountIVA21,
        amountIVA105: invoice.amountIVA105,
        amountIVA27: invoice.amountIVA27,
        amountIVA5: invoice.amountIVA5,
        amountIVA25: invoice.amountIVA25,
        IVA21: invoice.IVA21,
        IVA105: invoice.IVA105,
        IVA27: invoice.IVA27,
        amountIVA0: invoice.amountIVA0,
        amountExempt: invoice.amountExempt,
        amountNoTaxed: invoice.amountNoTaxed,
      })
      .from(invoice)
      .where(and(...conditions));

    // Ventas Outbound tipo A: Neto A 21% = amountIVA21, Neto A 10,5% = amountIVA105
    const invoicesForIvaA = invoices.filter((inv) => {
      const direction = inv.direction?.toLowerCase();
      const type = inv.type ?? "";
      return direction === "outbound" && INVOICE_TYPES_A.includes(type);
    });
    console.log(
      "[getInvoiceStatsByProfile] invoices usados para IVA 21% e IVA 10,5% (ventas tipo A):",
      JSON.stringify(
        invoicesForIvaA.map((inv) => ({
          id: inv.id,
          direction: inv.direction,
          type: inv.type,
          emitionDate: inv.emitionDate,
          amountIVA21: inv.amountIVA21,
          amountIVA105: inv.amountIVA105,
        })),
        null,
        2
      )
    );

    let netoA21 = 0;
    let netoA105 = 0;
    invoicesForIvaA.forEach((inv) => {
      const rate =
        inv.currency?.toUpperCase() === "USD"
          ? parseFloat(inv.currencyRate || "1")
          : 1;
      const sign = CREDIT_NOTE_TYPES.includes(inv.type ?? "") ? -1 : 1;
      netoA21 += sign * parseFloat(inv.amountIVA21 || "0") * rate;
      netoA105 += sign * parseFloat(inv.amountIVA105 || "0") * rate;
    });

    // Ventas Outbound tipo B: totalAmountB = suma de (base + impuesto) por alícuota. NC restan, Factura/ND suman. USD con rate.
    const invoicesForIvaB = invoices.filter((inv) => {
      const direction = inv.direction?.toLowerCase();
      const type = inv.type ?? "";
      return direction === "outbound" && INVOICE_TYPES_B.includes(type);
    });
    let totalAmountB21 = 0;
    let totalAmountB105 = 0;
    let totalAmountB27 = 0;
    invoicesForIvaB.forEach((inv) => {
      const rate =
        inv.currency?.toUpperCase() === "USD"
          ? parseFloat(inv.currencyRate || "1")
          : 1;
      const sign = CREDIT_NOTE_TYPES.includes(inv.type ?? "") ? -1 : 1;
      const base21 = parseFloat(inv.amountIVA21 || "0") + parseFloat(inv.IVA21 || "0");
      const base105 = parseFloat(inv.amountIVA105 || "0") + parseFloat(inv.IVA105 || "0");
      const base27 = parseFloat(inv.amountIVA27 || "0") + parseFloat(inv.IVA27 || "0");
      totalAmountB21 += sign * base21 * rate;
      totalAmountB105 += sign * base105 * rate;
      totalAmountB27 += sign * base27 * rate;
    });

    // Compras (inbound): netos gravados por alícuota 27%, 21%, 10,5%, 5%, 2,5%. A y B juntos. NC restan, ND y facturas suman.
    const invoicesInbound = invoices.filter((inv) => inv.direction?.toLowerCase() === "inbound");
    let netoInbound27 = 0;
    let netoInbound21 = 0;
    let netoInbound105 = 0;
    let netoInbound5 = 0;
    let netoInbound25 = 0;
    invoicesInbound.forEach((inv) => {
      const rate =
        inv.currency?.toUpperCase() === "USD"
          ? parseFloat(inv.currencyRate || "1")
          : 1;
      const sign = CREDIT_NOTE_TYPES.includes(inv.type ?? "") ? -1 : 1;
      netoInbound27 += sign * parseFloat(inv.amountIVA27 || "0") * rate;
      netoInbound21 += sign * parseFloat(inv.amountIVA21 || "0") * rate;
      netoInbound105 += sign * parseFloat(inv.amountIVA105 || "0") * rate;
      netoInbound5 += sign * parseFloat(inv.amountIVA5 || "0") * rate;
      netoInbound25 += sign * parseFloat(inv.amountIVA25 || "0") * rate;
    });

    const netoGravadoCompras =
      netoInbound27 + netoInbound21 + netoInbound105 + netoInbound5 + netoInbound25;

    // Exento, IVA 0%, No gravado: suma en todos los comprobantes (nota de crédito resta)
    let totalAmountExempt = 0;
    let totalAmountIVA0 = 0;
    let totalAmountNoTaxed = 0;
    invoices.forEach((inv) => {
      const rate =
        inv.currency?.toUpperCase() === "USD"
          ? parseFloat(inv.currencyRate || "1")
          : 1;
      const sign = CREDIT_NOTE_TYPES.includes(inv.type ?? "") ? -1 : 1;
      totalAmountExempt += sign * parseFloat(inv.amountExempt || "0") * rate;
      totalAmountIVA0 += sign * parseFloat(inv.amountIVA0 || "0") * rate;
      totalAmountNoTaxed += sign * parseFloat(inv.amountNoTaxed || "0") * rate;
    });

    // Crédito Fiscal Compras = (neto21 * 0.21) + (neto105 * 0.105) + (neto27 * 0.27) + (neto5 * 0.05) + (neto25 * 0.025)
    // Nota: El Ajuste se suma en el frontend (viene de mock por ahora)
    const creditoFiscalCompras =
      netoInbound21 * 0.21 +
      netoInbound105 * 0.105 +
      netoInbound27 * 0.27 +
      netoInbound5 * 0.05 +
      netoInbound25 * 0.025;

    // Calculate totals
    let totalOutbound = 0;
    let totalInbound = 0;
    const monthlyDataMap: Record<
      string,
      { outbound: number; inbound: number }
    > = {};
    const typeDistributionMap: Record<string, number> = {};

    invoices.forEach((inv) => {
      // Convert amount to number
      let amount = parseFloat(inv.amount || "0");

      // If currency is USD, convert to ARS using the currency rate
      if (inv.currency?.toUpperCase() === "USD") {
        const rate = parseFloat(inv.currencyRate || "1");
        amount = amount * rate;
      }

      // Notas de crédito restan del total (no suman)
      const isCreditNote = CREDIT_NOTE_TYPES.includes(inv.type ?? "");
      const signedAmount = isCreditNote ? -amount : amount;

      const direction = inv.direction?.toLowerCase();
      const date = new Date(inv.emitionDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      // Calculate totals
      if (direction === "outbound") {
        totalOutbound += signedAmount;
      } else if (direction === "inbound") {
        totalInbound += signedAmount;
      }

      // Monthly data
      if (!monthlyDataMap[monthKey]) {
        monthlyDataMap[monthKey] = { outbound: 0, inbound: 0 };
      }
      if (direction === "outbound") {
        monthlyDataMap[monthKey].outbound += signedAmount;
      } else if (direction === "inbound") {
        monthlyDataMap[monthKey].inbound += signedAmount;
      }

      // Type distribution (notas de crédito restan)
      const type = inv.type || "unknown";
      if (!typeDistributionMap[type]) {
        typeDistributionMap[type] = 0;
      }
      typeDistributionMap[type] += signedAmount;
    });

    // Convert monthly data map to array
    const monthlyData = Object.entries(monthlyDataMap)
      .map(([month, data]) => ({
        month,
        outbound: data.outbound,
        inbound: data.inbound,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Convert type distribution map to array
    const typeDistribution = Object.entries(typeDistributionMap).map(
      ([type, amount]) => ({
        type,
        amount,
      })
    );

    return {
      totalInvoices: invoices.length,
      totalOutbound,
      totalInbound,
      monthlyData,
      typeDistribution,
      netoA21,
      netoA105,
      totalAmountB21,
      totalAmountB105,
      totalAmountB27,
      netoInbound27,
      netoInbound21,
      netoInbound105,
      netoInbound5,
      netoInbound25,
      netoGravadoCompras,
      creditoFiscalCompras,
      totalAmountExempt,
      totalAmountIVA0,
      totalAmountNoTaxed,
    };
  });
