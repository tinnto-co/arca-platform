import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/lib/db";
import {
  notification,
  client,
  profile,
  invoiceAttachment,
  document,
} from "@/drizzle/schema";
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
  getOrgClientIds,
} from "@/actions/helpers";
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
      profileId: z.string().optional(),
      search: z.string().optional(),
      opened: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);

    const { page, limit, clientFilter, dateFrom, dateTo, profileId, opened } = ctx.data;
    const offset = (page - 1) * limit;

    if (orgClientIds.length === 0) {
      return {
        notifications: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    // Build where conditions (always scoped to active organization via clients)
    const conditions = [inArray(notification.client, orgClientIds)];

    if (clientFilter && clientFilter !== "all") {
      if (!orgClientIds.includes(clientFilter)) {
        return {
          notifications: [],
          totalCount: 0,
          totalPages: 0,
          currentPage: page,
        };
      }
      conditions.push(eq(notification.client, clientFilter));
    }

    if (profileId && profileId !== "all") {
      conditions.push(eq(notification.profile, profileId));
    }

    if (dateFrom) {
      conditions.push(gte(notification.publicationDate, new Date(dateFrom)));
    }

    if (dateTo) {
      conditions.push(lte(notification.publicationDate, new Date(dateTo)));
    }

    if (opened !== undefined) {
      conditions.push(eq(notification.opened, opened));
    }

    const whereCondition = and(...conditions);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notification)
      .leftJoin(client, eq(notification.client, client.id))
      .where(whereCondition);

    // Get notifications with client + profile data
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
        profileId: notification.profile,
        profileName: profile.name,
        profileIdentityNumber: profile.identityNumber,
        createdAt: notification.createdAt,
        updatedAt: notification.updatedAt,
      })
      .from(notification)
      .leftJoin(client, eq(notification.client, client.id))
      .leftJoin(profile, eq(notification.profile, profile.id))
      .where(whereCondition)
      .orderBy(desc(notification.publicationDate))
      .limit(limit)
      .offset(offset);
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
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0) throw new Error("Notificación no encontrada");

    // Get notification with client and profile data (only if client belongs to org)
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
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
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
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0) return [];

    const [n] = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .limit(1);
    if (!n) return [];

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
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    const {
      externalId,
      clientId,
      profileId,
      message,
      expirationDate,
      publicationDate,
    } = ctx.data;

    if (!orgClientIds.includes(clientId)) {
      throw new Error("El cliente no pertenece a la organización activa");
    }

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
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    const {
      id,
      externalId,
      clientId,
      profileId,
      message,
      expirationDate,
      publicationDate,
    } = ctx.data;

    if (!orgClientIds.includes(clientId)) {
      throw new Error("El cliente no pertenece a la organización activa");
    }

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
      .where(
        and(
          eq(notification.id, id),
          inArray(notification.client, orgClientIds)
        )
      )
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
    const { orgId } = await getSessionWithOrg();

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));
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
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0) {
      throw new Error("Error al eliminar la notificación");
    }

    const [deletedNotification] = await db
      .delete(notification)
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .returning();

    if (!deletedNotification)
      throw new Error("Error al eliminar la notificación");

    return { success: true };
  });
