import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import {
  client,
  clientUserAccess,
  clientRequest,
  debt,
  dueDate,
  notification,
} from '@/drizzle/schema';
import { getAuthSession } from '@/actions/helpers';
import { eq, and, isNull, gte, asc, desc } from 'drizzle-orm';

/**
 * Validates that the calling user has a clientUserAccess row for the given client.
 * Returns the access row (with permission flags) or throws if not found.
 */
async function getClientPortalAccess(userId: string, clientId: string) {
  const [access] = await db
    .select()
    .from(clientUserAccess)
    .where(
      and(
        eq(clientUserAccess.userId, userId),
        eq(clientUserAccess.clientId, clientId)
      )
    )
    .limit(1);

  if (!access) {
    throw new Error('Acceso denegado al portal del cliente');
  }
  return access;
}

export const getClientPortalDashboard = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;
    const access = await getClientPortalAccess(userId, data.clientId);

    const [clientData] = await db
      .select({
        id: client.id,
        name: client.name,
        identityNumber: client.identityNumber,
        fiscalCondition: client.fiscalCondition,
        status: client.status,
      })
      .from(client)
      .where(eq(client.id, data.clientId))
      .limit(1);

    if (!clientData) throw new Error('Cliente no encontrado');

    const now = new Date();

    const [nextDueDates, openDebts, unreadNotifications, pendingRequests] =
      await Promise.all([
        // Next 3 due dates
        db
          .select({
            id: dueDate.id,
            tax: dueDate.tax,
            concept: dueDate.concept,
            dueDate: dueDate.dueDate,
            completedAt: dueDate.completedAt,
          })
          .from(dueDate)
          .where(
            and(
              eq(dueDate.client, data.clientId),
              isNull(dueDate.completedAt),
              gte(dueDate.dueDate, now)
            )
          )
          .orderBy(asc(dueDate.dueDate))
          .limit(3),

        // Open debts summary (only if permitted)
        access.canViewDebts
          ? db
              .select({
                id: debt.id,
                tax: debt.tax,
                concept: debt.concept,
                balance: debt.balance,
                dueDate: debt.dueDate,
                status: debt.status,
              })
              .from(debt)
              .where(
                and(
                  eq(debt.client, data.clientId),
                  eq(debt.status, 'open')
                )
              )
              .orderBy(desc(debt.dueDate))
              .limit(5)
          : Promise.resolve([]),

        // Unread notifications count
        db
          .select({ id: notification.id })
          .from(notification)
          .where(
            and(
              eq(notification.client, data.clientId),
              eq(notification.opened, false),
              isNull(notification.resolvedAt)
            )
          ),

        // Pending requests
        db
          .select({
            id: clientRequest.id,
            title: clientRequest.title,
            type: clientRequest.type,
            status: clientRequest.status,
            dueAt: clientRequest.dueAt,
            createdAt: clientRequest.createdAt,
          })
          .from(clientRequest)
          .where(
            and(
              eq(clientRequest.clientId, data.clientId),
              eq(clientRequest.status, 'open')
            )
          )
          .orderBy(asc(clientRequest.dueAt))
          .limit(10),
      ]);

    return {
      client: clientData,
      nextDueDates,
      openDebts: access.canViewDebts ? openDebts : null,
      unreadNotificationsCount: unreadNotifications.length,
      pendingRequests,
      permissions: {
        canViewDebts: access.canViewDebts,
        canViewIva: access.canViewIva,
        canViewPayroll: access.canViewPayroll,
        canUploadDocuments: access.canUploadDocuments,
        canChatAi: access.canChatAi,
      },
    };
  });

export const getClientPortalDebts = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;
    const access = await getClientPortalAccess(userId, data.clientId);

    if (!access.canViewDebts) {
      throw new Error('No tienes permiso para ver las deudas');
    }

    const debts = await db
      .select({
        id: debt.id,
        tax: debt.tax,
        concept: debt.concept,
        subConcept: debt.subConcept,
        period: debt.period,
        dueDate: debt.dueDate,
        balance: debt.balance,
        compensatoryInterest: debt.compensatoryInterest,
        punitiveInterest: debt.punitiveInterest,
        status: debt.status,
        isIntimated: debt.isIntimated,
        createdAt: debt.createdAt,
      })
      .from(debt)
      .where(eq(debt.client, data.clientId))
      .orderBy(desc(debt.dueDate));

    return debts;
  });

export const getClientPortalDueDates = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      includeCompleted: z.boolean().optional().default(false),
    })
  )
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;
    await getClientPortalAccess(userId, data.clientId);

    const conditions = [eq(dueDate.client, data.clientId)];
    if (!data.includeCompleted) {
      conditions.push(isNull(dueDate.completedAt));
    }

    const dueDates = await db
      .select({
        id: dueDate.id,
        tax: dueDate.tax,
        concept: dueDate.concept,
        subConcept: dueDate.subConcept,
        period: dueDate.period,
        dueDate: dueDate.dueDate,
        completedAt: dueDate.completedAt,
        createdAt: dueDate.createdAt,
      })
      .from(dueDate)
      .where(and(...conditions))
      .orderBy(asc(dueDate.dueDate));

    return dueDates;
  });

export const getClientPortalNotifications = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      limit: z.number().optional().default(50),
    })
  )
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;
    await getClientPortalAccess(userId, data.clientId);

    const notifications = await db
      .select({
        id: notification.id,
        message: notification.message,
        severity: notification.severity,
        category: notification.category,
        aiSummary: notification.aiSummary,
        opened: notification.opened,
        publicationDate: notification.publicationDate,
        resolvedAt: notification.resolvedAt,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .where(
        and(
          eq(notification.client, data.clientId),
          isNull(notification.resolvedAt)
        )
      )
      .orderBy(desc(notification.publicationDate))
      .limit(data.limit);

    return notifications;
  });

export const getClientPortalRequests = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      status: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;
    await getClientPortalAccess(userId, data.clientId);

    const conditions = [eq(clientRequest.clientId, data.clientId)];
    if (data.status) {
      conditions.push(eq(clientRequest.status, data.status));
    }

    const requests = await db
      .select({
        id: clientRequest.id,
        title: clientRequest.title,
        description: clientRequest.description,
        type: clientRequest.type,
        status: clientRequest.status,
        dueAt: clientRequest.dueAt,
        completedAt: clientRequest.completedAt,
        createdAt: clientRequest.createdAt,
      })
      .from(clientRequest)
      .where(and(...conditions))
      .orderBy(desc(clientRequest.createdAt));

    return requests;
  });

export const completeClientRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;

    // Find the request to verify the user has access to this client
    const [request] = await db
      .select({ id: clientRequest.id, clientId: clientRequest.clientId })
      .from(clientRequest)
      .where(eq(clientRequest.id, data.requestId))
      .limit(1);

    if (!request) throw new Error('Solicitud no encontrada');

    // Validate user has access to the client
    await getClientPortalAccess(userId, request.clientId);

    await db
      .update(clientRequest)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(clientRequest.id, data.requestId));

    return { success: true };
  });
