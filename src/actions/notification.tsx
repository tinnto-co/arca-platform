import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import z from "zod";
import { db } from "@/lib/db";
import {
  notification,
  client,
  invoiceAttachment,
  document,
} from "@/drizzle/schema";
import { auth } from "@/lib/auth";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";

export const getNotifications = createServerFn({
  method: "GET",
})
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(10),
      clientFilter: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      search: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    console.log(ctx.data);
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const { page, limit, clientFilter, dateFrom, dateTo } = ctx.data;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    if (clientFilter && clientFilter !== "all") {
      conditions.push(eq(notification.client, clientFilter));
    }

    if (dateFrom) {
      conditions.push(gte(notification.publicationDate, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(notification.publicationDate, new Date(dateTo)));
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notification)
      .leftJoin(client, eq(notification.client, client.id))
      .where(whereCondition);

    // Get notifications with client data
    const notifications = await db
      .select({
        id: notification.id,
        externalId: notification.externalId,
        message: notification.message,
        expirationDate: notification.expirationDate,
        publicationDate: notification.publicationDate,
        opened: notification.opened,
        clientId: notification.client,
        clientName: client.name,
        clientEmail: client.email,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
      })
      .from(notification)
      .leftJoin(client, eq(notification.client, client.id))
      .where(whereCondition)
      .orderBy(desc(notification.publicationDate))
      .limit(limit)
      .offset(offset);
    console.log(notifications);
    return {
      notifications,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };
  });

export const getNotification = createServerFn({
  method: "GET",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    // Get notification with client and profile data
    const [notificationData] = await db
      .select({
        id: notification.id,
        externalId: notification.externalId,
        message: notification.message,
        expirationDate: notification.expirationDate,
        publicationDate: notification.publicationDate,
        opened: notification.opened,
        clientId: notification.client,
        clientName: client.name,
        clientEmail: client.email,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
      })
      .from(notification)
      .leftJoin(client, eq(notification.client, client.id))
      .where(eq(notification.id, ctx.data.id))
      .limit(1);

    if (!notificationData) throw new Error("Notificación no encontrada");

    // Get attachments for this notification
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
      ...notificationData,
      attachments,
    };
  });

export const getNotificationAttachments = createServerFn({
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

export const createNotification = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      externalId: z.string().min(1, "El ID externo es requerido"),
      clientId: z.string().uuid("ID de cliente inválido"),
      profileId: z.string().uuid("ID de perfil inválido").optional(),
      message: z.string().min(1, "El mensaje es requerido"),
      expirationDate: z.string().transform((str) => new Date(str)),
      publicationDate: z.string().transform((str) => new Date(str)),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      externalId,
      clientId,
      profileId,
      message,
      expirationDate,
      publicationDate,
    } = ctx.data;

    const [newNotification] = await db
      .insert(notification)
      .values({
        externalId,
        client: clientId,
        profile: profileId || null,
        message,
        expirationDate,
        publicationDate,
      })
      .returning();

    if (!newNotification) throw new Error("Error al crear la notificación");

    return newNotification;
  });

export const updateNotification = createServerFn({
  method: "POST",
})
  .inputValidator(
    z.object({
      id: z.string(),
      externalId: z.string().min(1, "El ID externo es requerido"),
      clientId: z.string().uuid("ID de cliente inválido"),
      profileId: z.string().uuid("ID de perfil inválido").optional(),
      message: z.string().min(1, "El mensaje es requerido"),
      expirationDate: z.string().transform((str) => new Date(str)),
      publicationDate: z.string().transform((str) => new Date(str)),
    })
  )
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const {
      id,
      externalId,
      clientId,
      profileId,
      message,
      expirationDate,
      publicationDate,
    } = ctx.data;

    const [updatedNotification] = await db
      .update(notification)
      .set({
        externalId,
        client: clientId,
        profile: profileId || null,
        message,
        expirationDate,
        publicationDate,
        updatedAt: new Date(),
      })
      .where(eq(notification.id, id))
      .returning();

    if (!updatedNotification)
      throw new Error("Error al actualizar la notificación");

    return updatedNotification;
  });

export const markNotificationOpened = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.userId, session.user.id));
    const userClientIds = userClients.map((c) => c.id);
    if (userClientIds.length === 0) throw new Error("Unauthorized");

    const [updated] = await db
      .update(notification)
      .set({ opened: true, updatedAt: new Date() })
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, userClientIds)
        )
      )
      .returning();

    if (!updated) throw new Error("Notificación no encontrada o sin acceso");
    return { opened: true };
  });

export const deleteNotification = createServerFn({
  method: "POST",
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user?.id) throw new Error("Unauthorized");

    const [deletedNotification] = await db
      .delete(notification)
      .where(eq(notification.id, ctx.data.id))
      .returning();

    if (!deletedNotification)
      throw new Error("Error al eliminar la notificación");

    return { success: true };
  });
