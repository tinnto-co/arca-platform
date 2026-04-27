import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { GoogleGenAI } from '@google/genai';
import { db } from '@/lib/db';
import {
  notification,
  client,
  profile,
  invoiceAttachment,
  document,
  dataSourceEvent,
} from '@/drizzle/schema';
import { member, user } from '@/drizzle/auth';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
  getOrgClientIds,
} from '@/actions/helpers';
import { eq, desc, and, gte, lte, sql, inArray, isNull } from 'drizzle-orm';

export const getNotifications = createServerFn({
  method: 'GET',
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
      category: z.string().optional(),
      onlyUnresolved: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);

    const {
      page,
      limit,
      clientFilter,
      dateFrom,
      dateTo,
      profileId,
      opened,
      category,
      onlyUnresolved,
    } = ctx.data;
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

    if (clientFilter && clientFilter !== 'all') {
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

    if (profileId && profileId !== 'all') {
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

    if (category && category !== 'all') {
      conditions.push(eq(notification.category, category));
    }

    if (onlyUnresolved) {
      conditions.push(isNull(notification.resolvedAt));
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
        severity: notification.severity,
        category: notification.category,
        aiSummary: notification.aiSummary,
        assignedToUserId: notification.assignedToUserId,
        resolvedAt: notification.resolvedAt,
        resolvedByUserId: notification.resolvedByUserId,
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
  method: 'GET',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0)
      throw new Error('Notificación no encontrada');

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

    if (!notificationData) throw new Error('Notificación no encontrada');

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
  method: 'GET',
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
  method: 'POST',
})
  .inputValidator(
    z.object({
      externalId: z.string().min(1, 'El ID externo es requerido'),
      clientId: z.string().uuid('ID de cliente inválido'),
      profileId: z.string().uuid('ID de perfil inválido').optional(),
      message: z.string().min(1, 'El mensaje es requerido'),
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
      throw new Error('El cliente no pertenece a la organización activa');
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

    if (!newNotification) throw new Error('Error al crear la notificación');

    return newNotification;
  });

export const updateNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string(),
      externalId: z.string().min(1, 'El ID externo es requerido'),
      clientId: z.string().uuid('ID de cliente inválido'),
      profileId: z.string().uuid('ID de perfil inválido').optional(),
      message: z.string().min(1, 'El mensaje es requerido'),
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
      throw new Error('El cliente no pertenece a la organización activa');
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
        and(eq(notification.id, id), inArray(notification.client, orgClientIds))
      )
      .returning();

    if (!updatedNotification)
      throw new Error('Error al actualizar la notificación');

    return updatedNotification;
  });

export const markNotificationOpened = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const userClients = await db
      .select({ id: client.id })
      .from(client)
      .where(eq(client.organizationId, orgId));
    const userClientIds = userClients.map((c) => c.id);
    if (userClientIds.length === 0) throw new Error('Unauthorized');

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

    if (!updated) throw new Error('Notificación no encontrada o sin acceso');
    return { opened: true };
  });

export const markNotificationUnread = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0) throw new Error('Unauthorized');

    const [updated] = await db
      .update(notification)
      .set({ opened: false, updatedAt: new Date() })
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada o sin acceso');
    return { opened: false };
  });

export const markAllNotificationsRead = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();
  const orgClientIds = await getOrgClientIds(orgId);
  if (orgClientIds.length === 0) return { count: 0 };

  const updated = await db
    .update(notification)
    .set({ opened: true, updatedAt: new Date() })
    .where(
      and(
        inArray(notification.client, orgClientIds),
        eq(notification.opened, false)
      )
    )
    .returning({ id: notification.id });

  return { count: updated.length };
});

export const deleteNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0) {
      throw new Error('Error al eliminar la notificación');
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
      throw new Error('Error al eliminar la notificación');

    return { success: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Assignment & Resolution
// ─────────────────────────────────────────────────────────────────────────────

export const listOrgMembersForAssignment = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();

  const members = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, orgId));

  return members;
});

export const assignNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(
    z.object({
      id: z.string().uuid(),
      userId: z.string().nullable(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0)
      throw new Error('Notificación no encontrada');

    const [updated] = await db
      .update(notification)
      .set({ assignedToUserId: ctx.data.userId, updatedAt: new Date() })
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

export const resolveNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0)
      throw new Error('Notificación no encontrada');

    const now = new Date();
    const [updated] = await db
      .update(notification)
      .set({ resolvedAt: now, resolvedByUserId: userId, updatedAt: now })
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

export const unresolveNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0)
      throw new Error('Notificación no encontrada');

    const [updated] = await db
      .update(notification)
      .set({ resolvedAt: null, resolvedByUserId: null, updatedAt: new Date() })
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .returning();

    if (!updated) throw new Error('Notificación no encontrada');
    return updated;
  });

// ─────────────────────────────────────────────────────────────────────────────
// AI Classification helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ClassificationResult {
  severity: string;
  category: string;
  ai_summary: string;
}

async function classifyWithGemini(
  message: string
): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Sos un clasificador de notificaciones fiscales de AFIP Argentina.
Analizá el siguiente mensaje de notificación y determiná su severidad, categoría y generá un resumen breve en español.

Severidades disponibles:
- critical: requiere acción urgente (intimaciones, inspecciones activas, deudas con embargo)
- medium: requiere acción en los próximos días (requerimientos, vencimientos próximos)
- low: informativo con plazo holgado (notificaciones preventivas, comunicaciones de baja urgencia)
- informational: sin acción requerida (acuse de recibo, confirmaciones, informativos generales)

Categorías disponibles:
- requerimiento: AFIP requiere documentación o información
- inspeccion: proceso de inspección o auditoría
- deuda: deuda impositiva o previsional
- intimacion: intimación formal o carta documento
- comunicacion_general: comunicación informativa general
- vencimiento: aviso de vencimiento de obligación
- otro: no encaja en ninguna categoría anterior

Mensaje de notificación:
${message}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          severity: { type: 'STRING' },
          category: { type: 'STRING' },
          ai_summary: { type: 'STRING' },
        },
        required: ['severity', 'category', 'ai_summary'],
      },
    },
  });

  const text = response.text ?? '';
  if (!text) throw new Error('Gemini no devolvió respuesta');

  return JSON.parse(text) as ClassificationResult;
}

export const classifyNotification = createServerFn({
  method: 'POST',
})
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const orgClientIds = await getOrgClientIds(orgId);
    if (orgClientIds.length === 0)
      throw new Error('Notificación no encontrada');

    const [notif] = await db
      .select({
        id: notification.id,
        message: notification.message,
        clientId: notification.client,
        profileId: notification.profile,
      })
      .from(notification)
      .where(
        and(
          eq(notification.id, ctx.data.id),
          inArray(notification.client, orgClientIds)
        )
      )
      .limit(1);

    if (!notif) throw new Error('Notificación no encontrada');

    const result = await classifyWithGemini(notif.message);

    const now = new Date();
    const [updated] = await db
      .update(notification)
      .set({
        severity: result.severity,
        category: result.category,
        aiSummary: result.ai_summary,
        aiClassifiedAt: now,
        updatedAt: now,
      })
      .where(eq(notification.id, notif.id))
      .returning();

    await db.insert(dataSourceEvent).values({
      organizationId: orgId,
      clientId: notif.clientId ?? undefined,
      profileId: notif.profileId ?? undefined,
      entityType: 'notification',
      entityId: notif.id,
      source: 'ai',
      action: 'classified',
      metadata: {
        severity: result.severity,
        category: result.category,
      },
    });

    return updated;
  });

export const classifyUnclassifiedNotifications = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { orgId } = await getSessionWithOrg();
  const role = await getMemberRole();
  assertCanWrite(role);

  const orgClientIds = await getOrgClientIds(orgId);
  if (orgClientIds.length === 0) return { classified: 0, errors: 0 };

  const unclassified = await db
    .select({
      id: notification.id,
      message: notification.message,
      clientId: notification.client,
      profileId: notification.profile,
    })
    .from(notification)
    .where(
      and(
        inArray(notification.client, orgClientIds),
        eq(notification.severity, 'unclassified'),
        isNull(notification.aiClassifiedAt)
      )
    );

  let classified = 0;
  let errors = 0;
  const now = new Date();

  for (const notif of unclassified) {
    try {
      const result = await classifyWithGemini(notif.message);

      await db
        .update(notification)
        .set({
          severity: result.severity,
          category: result.category,
          aiSummary: result.ai_summary,
          aiClassifiedAt: now,
          updatedAt: now,
        })
        .where(eq(notification.id, notif.id));

      await db.insert(dataSourceEvent).values({
        organizationId: orgId,
        clientId: notif.clientId ?? undefined,
        profileId: notif.profileId ?? undefined,
        entityType: 'notification',
        entityId: notif.id,
        source: 'ai',
        action: 'classified',
        metadata: {
          severity: result.severity,
          category: result.category,
        },
      });

      classified++;
    } catch {
      errors++;
    }
  }

  return { classified, errors };
});
