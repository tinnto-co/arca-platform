import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import {
  invoice,
  client,
  invoiceAttachment,
  document,
} from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

export const getInvoices = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      clientFilter: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      typeFilter: z.string().optional(),
      directionFilter: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    console.log(ctx.data);
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { page, limit, clientFilter, dateFrom, dateTo, typeFilter, directionFilter } = ctx.data;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    if (clientFilter && clientFilter !== "all") {
      conditions.push(eq(invoice.client, clientFilter));
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

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .where(whereCondition);

    // Get invoices with client data
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
        createdAt: invoice.createdAt,
        updatedAt: invoice.updatedAt,
      })
      .from(invoice)
      .leftJoin(client, eq(invoice.client, client.id))
      .where(whereCondition)
      .orderBy(desc(invoice.emitionDate))
      .limit(limit)
      .offset(offset);
    console.log(invoices);
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

    // Get invoice with client data
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
        amountNoTaxed: invoice.imp_neto_no_gravado,
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
      .where(eq(invoice.id, ctx.data.id))
      .limit(1);

    if (!invoiceData) throw new Error("Factura no encontrada");

    // Get attachments for this invoice (using notification table as reference)
    // Note: You might need to create a separate invoice_attachment table
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
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

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
      .where(eq(invoiceAttachment.notification, ctx.data.id));

    return attachments;
  });

export const createInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      direction: z.string().min(1, "La dirección es requerida"),
      emitionDate: z.string().transform((str) => new Date(str)),
      type: z.string().min(1, "El tipo es requerido"),
      recipientName: z.string().min(1, "El nombre del destinatario es requerido"),
      recipientIdentityNumber: z.string().min(1, "El número de identidad del destinatario es requerido"),
      recipientIdentityType: z.string().min(1, "El tipo de identidad del destinatario es requerido"),
      emitterName: z.string().min(1, "El nombre del emisor es requerido"),
      emitterIdentityNumber: z.string().min(1, "El número de identidad del emisor es requerido"),
      emitterIdentityType: z.string().min(1, "El tipo de identidad del emisor es requerido"),
      currency: z.string().min(1, "La moneda es requerida"),
      currencyRate: z.number().min(0, "La tasa de cambio debe ser positiva"),
      salePoint: z.string().min(1, "El punto de venta es requerido"),
      clientId: z.string().uuid("ID de cliente inválido"),
      authorizationNumber: z.string().min(1, "El número de autorización es requerido"),
      idFrom: z.number().min(1, "El ID desde debe ser mayor a 0"),
      idTo: z.number().min(1, "El ID hasta debe ser mayor a 0"),
      amountIVA0: z.number().min(0, "El monto IVA 0 debe ser positivo"),
      IVA25: z.number().min(0, "El IVA 2.5% debe ser positivo"),
      amountIVA25: z.number().min(0, "El monto IVA 2.5% debe ser positivo"),
      IVA5: z.number().min(0, "El IVA 5% debe ser positivo"),
      amountIVA5: z.number().min(0, "El monto IVA 5% debe ser positivo"),
      IVA105: z.number().min(0, "El IVA 10.5% debe ser positivo"),
      amountIVA105: z.number().min(0, "El monto IVA 10.5% debe ser positivo"),
      IVA21: z.number().min(0, "El IVA 21% debe ser positivo"),
      amountIVA21: z.number().min(0, "El monto IVA 21% debe ser positivo"),
      IVA27: z.number().min(0, "El IVA 27% debe ser positivo"),
      amountIVA27: z.number().min(0, "El monto IVA 27% debe ser positivo"),
      amountTaxed: z.number().min(0, "El monto gravado debe ser positivo"),
      amountNoTaxed: z.number().min(0, "El monto no gravado debe ser positivo"),
      amountExempt: z.number().min(0, "El monto exento debe ser positivo"),
      other_taxes: z.number().min(0, "Otros impuestos deben ser positivos"),
      totalIVA: z.number().min(0, "El total IVA debe ser positivo"),
      amount: z.number().min(0, "El monto total debe ser positivo"),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      direction,
      emitionDate,
      type,
      recipientName,
      recipientIdentityNumber,
      recipientIdentityType,
      emitterName,
      emitterIdentityNumber,
      emitterIdentityType,
      currency,
      currencyRate,
      salePoint,
      clientId,
      authorizationNumber,
      idFrom,
      idTo,
      amountIVA0,
      IVA25,
      amountIVA25,
      IVA5,
      amountIVA5,
      IVA105,
      amountIVA105,
      IVA21,
      amountIVA21,
      IVA27,
      amountIVA27,
      amountTaxed,
      amountNoTaxed,
      amountExempt,
      other_taxes,
      totalIVA,
      amount,
    } = ctx.data;

    const [newInvoice] = await db
      .insert(invoice)
      .values({
        direction,
        emitionDate,
        type,
        recipientName,
        recipientIdentityNumber,
        recipientIdentityType,
        emitterName,
        emitterIdentityNumber,
        emitterIdentityType,
        currency,
        cureencyRate: currencyRate,
        salePoint,
        client: clientId,
        authorizationNumber,
        idFrom,
        idTo,
        amountIVA0,
        IVA25,
        amountIVA25,
        IVA5,
        amountIVA5,
        IVA105,
        amountIVA105,
        IVA21,
        amountIVA21,
        IVA27,
        amountIVA27,
        amountTaxed,
        imp_neto_no_gravado: amountNoTaxed,
        amountExempt,
        other_taxes,
        totalIVA,
        amount,
      })
      .returning();

    if (!newInvoice) throw new Error("Error al crear la factura");

    return newInvoice;
  });

export const updateInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string(),
      direction: z.string().min(1, "La dirección es requerida"),
      emitionDate: z.string().transform((str) => new Date(str)),
      type: z.string().min(1, "El tipo es requerido"),
      recipientName: z.string().min(1, "El nombre del destinatario es requerido"),
      recipientIdentityNumber: z.string().min(1, "El número de identidad del destinatario es requerido"),
      recipientIdentityType: z.string().min(1, "El tipo de identidad del destinatario es requerido"),
      emitterName: z.string().min(1, "El nombre del emisor es requerido"),
      emitterIdentityNumber: z.string().min(1, "El número de identidad del emisor es requerido"),
      emitterIdentityType: z.string().min(1, "El tipo de identidad del emisor es requerido"),
      currency: z.string().min(1, "La moneda es requerida"),
      currencyRate: z.number().min(0, "La tasa de cambio debe ser positiva"),
      salePoint: z.string().min(1, "El punto de venta es requerido"),
      clientId: z.string().uuid("ID de cliente inválido"),
      authorizationNumber: z.string().min(1, "El número de autorización es requerido"),
      idFrom: z.number().min(1, "El ID desde debe ser mayor a 0"),
      idTo: z.number().min(1, "El ID hasta debe ser mayor a 0"),
      amountIVA0: z.number().min(0, "El monto IVA 0 debe ser positivo"),
      IVA25: z.number().min(0, "El IVA 2.5% debe ser positivo"),
      amountIVA25: z.number().min(0, "El monto IVA 2.5% debe ser positivo"),
      IVA5: z.number().min(0, "El IVA 5% debe ser positivo"),
      amountIVA5: z.number().min(0, "El monto IVA 5% debe ser positivo"),
      IVA105: z.number().min(0, "El IVA 10.5% debe ser positivo"),
      amountIVA105: z.number().min(0, "El monto IVA 10.5% debe ser positivo"),
      IVA21: z.number().min(0, "El IVA 21% debe ser positivo"),
      amountIVA21: z.number().min(0, "El monto IVA 21% debe ser positivo"),
      IVA27: z.number().min(0, "El IVA 27% debe ser positivo"),
      amountIVA27: z.number().min(0, "El monto IVA 27% debe ser positivo"),
      amountTaxed: z.number().min(0, "El monto gravado debe ser positivo"),
      amountNoTaxed: z.number().min(0, "El monto no gravado debe ser positivo"),
      amountExempt: z.number().min(0, "El monto exento debe ser positivo"),
      other_taxes: z.number().min(0, "Otros impuestos deben ser positivos"),
      totalIVA: z.number().min(0, "El total IVA debe ser positivo"),
      amount: z.number().min(0, "El monto total debe ser positivo"),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      id,
      direction,
      emitionDate,
      type,
      recipientName,
      recipientIdentityNumber,
      recipientIdentityType,
      emitterName,
      emitterIdentityNumber,
      emitterIdentityType,
      currency,
      currencyRate,
      salePoint,
      clientId,
      authorizationNumber,
      idFrom,
      idTo,
      amountIVA0,
      IVA25,
      amountIVA25,
      IVA5,
      amountIVA5,
      IVA105,
      amountIVA105,
      IVA21,
      amountIVA21,
      IVA27,
      amountIVA27,
      amountTaxed,
      amountNoTaxed,
      amountExempt,
      other_taxes,
      totalIVA,
      amount,
    } = ctx.data;

    const [updatedInvoice] = await db
      .update(invoice)
      .set({
        direction,
        emitionDate,
        type,
        recipientName,
        recipientIdentityNumber,
        recipientIdentityType,
        emitterName,
        emitterIdentityNumber,
        emitterIdentityType,
        currency,
        cureencyRate: currencyRate,
        salePoint,
        client: clientId,
        authorizationNumber,
        idFrom,
        idTo,
        amountIVA0,
        IVA25,
        amountIVA25,
        IVA5,
        amountIVA5,
        IVA105,
        amountIVA105,
        IVA21,
        amountIVA21,
        IVA27,
        amountIVA27,
        amountTaxed,
        imp_neto_no_gravado: amountNoTaxed,
        amountExempt,
        other_taxes,
        totalIVA,
        amount,
        updatedAt: new Date(),
      })
      .where(eq(invoice.id, id))
      .returning();

    if (!updatedInvoice)
      throw new Error("Error al actualizar la factura");

    return updatedInvoice;
  });

export const deleteInvoice = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const [deletedInvoice] = await db
      .delete(invoice)
      .where(eq(invoice.id, ctx.data.id))
      .returning();

    if (!deletedInvoice)
      throw new Error("Error al eliminar la factura");

    return { success: true };
  });





