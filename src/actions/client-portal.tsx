import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import z from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { user as userTable } from '@/drizzle/auth';
import {
  representative,
  representativeUserAccess,
  representativeRequest,
  debt,
  dueDate,
  notification,
  document as documentTable,
} from '@/drizzle/schema';
import {
  getAuthSession,
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { eq, and, isNull, gte, asc, desc } from 'drizzle-orm';

export const getPortalSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuthSession();
    const userId = session.user.id;

    const [access] = await db
      .select()
      .from(representativeUserAccess)
      .where(eq(representativeUserAccess.userId, userId))
      .limit(1);

    if (!access) throw new Error('Sin acceso al portal del cliente');

    return { userId, clientId: access.representativeId, access };
  }
);

/**
 * Validates that the calling user has a representativeUserAccess row for the given client.
 * Returns the access row (with permission flags) or throws if not found.
 */
async function getRepresentativePortalAccess(userId: string, representativeId: string) {
  const [access] = await db
    .select()
    .from(representativeUserAccess)
    .where(
      and(
        eq(representativeUserAccess.userId, userId),
        eq(representativeUserAccess.representativeId, representativeId)
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
    const access = await getRepresentativePortalAccess(userId, data.clientId);

    const [clientData] = await db
      .select({
        id: representative.id,
        name: representative.name,
        cuit: representative.cuit,
        fiscalCondition: representative.fiscalCondition,
        status: representative.status,
      })
      .from(representative)
      .where(eq(representative.id, data.clientId))
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
              eq(dueDate.representativeId, data.clientId),
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
                and(eq(debt.representativeId, data.clientId), eq(debt.status, 'open'))
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
              eq(notification.representativeId, data.clientId),
              eq(notification.opened, false),
              isNull(notification.resolvedAt)
            )
          ),

        // Pending requests
        db
          .select({
            id: representativeRequest.id,
            title: representativeRequest.title,
            type: representativeRequest.type,
            status: representativeRequest.status,
            dueAt: representativeRequest.dueAt,
            createdAt: representativeRequest.createdAt,
          })
          .from(representativeRequest)
          .where(
            and(
              eq(representativeRequest.representativeId, data.clientId),
              eq(representativeRequest.status, 'open')
            )
          )
          .orderBy(asc(representativeRequest.dueAt))
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
    const access = await getRepresentativePortalAccess(userId, data.clientId);

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
      .where(eq(debt.representativeId, data.clientId))
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
    await getRepresentativePortalAccess(userId, data.clientId);

    const conditions = [eq(dueDate.representativeId, data.clientId)];
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
    await getRepresentativePortalAccess(userId, data.clientId);

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
          eq(notification.representativeId, data.clientId),
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
    await getRepresentativePortalAccess(userId, data.clientId);

    const conditions = [eq(representativeRequest.representativeId, data.clientId)];
    if (data.status) {
      conditions.push(eq(representativeRequest.status, data.status));
    }

    const requests = await db
      .select({
        id: representativeRequest.id,
        title: representativeRequest.title,
        description: representativeRequest.description,
        type: representativeRequest.type,
        status: representativeRequest.status,
        dueAt: representativeRequest.dueAt,
        completedAt: representativeRequest.completedAt,
        metadata: representativeRequest.metadata,
        createdAt: representativeRequest.createdAt,
      })
      .from(representativeRequest)
      .where(and(...conditions))
      .orderBy(desc(representativeRequest.createdAt));

    return requests as any;
  });

export const completeClientRequest = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;

    // Find the request to verify the user has access to this client
    const [request] = await db
      .select({ id: representativeRequest.id, clientId: representativeRequest.representativeId })
      .from(representativeRequest)
      .where(eq(representativeRequest.id, data.requestId))
      .limit(1);

    if (!request) throw new Error('Solicitud no encontrada');

    // Validate user has access to the client
    await getRepresentativePortalAccess(userId, request.clientId);

    await db
      .update(representativeRequest)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(representativeRequest.id, data.requestId));

    return { success: true };
  });

// ── Studio-side server functions ─────────────────────────────────────────────

export const listClientRequests = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      status: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();

    // Validate client belongs to org
    const [clientRow] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(eq(representative.id, data.clientId), eq(representative.organizationId, orgId))
      )
      .limit(1);
    if (!clientRow) throw new Error('Cliente no encontrado');

    const conditions = [eq(representativeRequest.representativeId, data.clientId)];
    if (data.status) {
      conditions.push(eq(representativeRequest.status, data.status));
    }

    const rows = await db
      .select({
        id: representativeRequest.id,
        organizationId: representativeRequest.organizationId,
        clientId: representativeRequest.representativeId,
        profileId: representativeRequest.clientId,
        requestedByUserId: representativeRequest.requestedByUserId,
        title: representativeRequest.title,
        description: representativeRequest.description,
        type: representativeRequest.type,
        status: representativeRequest.status,
        dueAt: representativeRequest.dueAt,
        completedAt: representativeRequest.completedAt,
        metadata: representativeRequest.metadata,
        createdAt: representativeRequest.createdAt,
      })
      .from(representativeRequest)
      .where(and(...conditions))
      .orderBy(desc(representativeRequest.createdAt));
    return rows as any;
  });

export const createClientRequest = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.string().min(1),
      dueAt: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate client belongs to org
    const [clientRow] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(eq(representative.id, data.clientId), eq(representative.organizationId, orgId))
      )
      .limit(1);
    if (!clientRow) throw new Error('Cliente no encontrado');

    const [created] = await db
      .insert(representativeRequest)
      .values({
        organizationId: orgId,
        representativeId: data.clientId,
        requestedByUserId: userId,
        title: data.title,
        description: data.description ?? null,
        type: data.type,
        status: 'open',
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
      })
      .returning({
        id: representativeRequest.id,
        organizationId: representativeRequest.organizationId,
        clientId: representativeRequest.representativeId,
        profileId: representativeRequest.clientId,
        requestedByUserId: representativeRequest.requestedByUserId,
        title: representativeRequest.title,
        description: representativeRequest.description,
        type: representativeRequest.type,
        status: representativeRequest.status,
        dueAt: representativeRequest.dueAt,
        completedAt: representativeRequest.completedAt,
        createdAt: representativeRequest.createdAt,
      });

    return created;
  });

export const uploadDocumentForRequest = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
      sizeBytes: z.number().int().positive(),
      base64Data: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const session = await getAuthSession();
    const userId = session.user.id;

    const [request] = await db
      .select({
        id: representativeRequest.id,
        clientId: representativeRequest.representativeId,
        status: representativeRequest.status,
      })
      .from(representativeRequest)
      .where(eq(representativeRequest.id, data.requestId))
      .limit(1);

    if (!request) throw new Error('Solicitud no encontrada');
    if (request.status !== 'open')
      throw new Error('La solicitud no está abierta');

    const access = await getRepresentativePortalAccess(userId, request.clientId);
    if (!access.canUploadDocuments) {
      throw new Error('No tienes permiso para subir documentos');
    }

    const dataUrl = `data:${data.mimeType};base64,${data.base64Data}`;
    const [doc] = await db
      .insert(documentTable)
      .values({
        representativeId: request.clientId,
        type: 'uploaded',
        name: data.fileName,
        url: dataUrl,
        storageProvider: 'upload',
        storageKey: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
      })
      .returning({ id: documentTable.id });

    await db
      .update(representativeRequest)
      .set({
        metadata: {
          documentId: doc.id,
          documentName: data.fileName,
          documentMimeType: data.mimeType,
          uploadedAt: new Date().toISOString(),
          uploadedByUserId: userId,
        } as any,
      })
      .where(eq(representativeRequest.id, data.requestId));

    return { documentId: doc.id, success: true };
  });

export const getRequestDocument = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ requestId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();

    const [requestRow] = await db
      .select({ id: representativeRequest.id, metadata: representativeRequest.metadata })
      .from(representativeRequest)
      .innerJoin(representative, eq(representative.id, representativeRequest.representativeId))
      .where(
        and(
          eq(representativeRequest.id, data.requestId),
          eq(representative.organizationId, orgId)
        )
      )
      .limit(1);

    if (!requestRow) throw new Error('Solicitud no encontrada');

    const meta = requestRow.metadata as { documentId?: string } | null;
    if (!meta?.documentId) return null;

    const [doc] = await db
      .select({
        id: documentTable.id,
        name: documentTable.name,
        url: documentTable.url,
        mimeType: documentTable.mimeType,
        sizeBytes: documentTable.sizeBytes,
        createdAt: documentTable.createdAt,
      })
      .from(documentTable)
      .where(eq(documentTable.id, meta.documentId))
      .limit(1);

    return doc ?? null;
  });

export const updateClientRequestStatus = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      requestId: z.string().uuid(),
      status: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate request belongs to org
    const [existing] = await db
      .select({
        id: representativeRequest.id,
        organizationId: representativeRequest.organizationId,
      })
      .from(representativeRequest)
      .where(eq(representativeRequest.id, data.requestId))
      .limit(1);
    if (!existing || existing.organizationId !== orgId) {
      throw new Error('Solicitud no encontrada');
    }

    const completedAt = data.status === 'completed' ? new Date() : null;

    await db
      .update(representativeRequest)
      .set({ status: data.status, completedAt })
      .where(eq(representativeRequest.id, data.requestId));

    return { success: true };
  });

// ── Portal user management (studio-side) ────────────────────────────────────

/**
 * Helper: validates that a representative belongs to the calling org.
 * Returns the representative row or throws.
 */
async function assertRepresentativeOwnership(representativeId: string, orgId: string) {
  const [rep] = await db
    .select({ id: representative.id })
    .from(representative)
    .where(
      and(eq(representative.id, representativeId), eq(representative.organizationId, orgId))
    )
    .limit(1);
  if (!rep) throw new Error('Cliente no encontrado');
  return rep;
}

export const listPortalUsers = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ representativeId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    await assertRepresentativeOwnership(data.representativeId, orgId);

    const rows = await db
      .select({
        accessId: representativeUserAccess.id,
        userId: representativeUserAccess.userId,
        role: representativeUserAccess.role,
        canViewDebts: representativeUserAccess.canViewDebts,
        canViewIva: representativeUserAccess.canViewIva,
        canViewPayroll: representativeUserAccess.canViewPayroll,
        canUploadDocuments: representativeUserAccess.canUploadDocuments,
        canChatAi: representativeUserAccess.canChatAi,
        createdAt: representativeUserAccess.createdAt,
        name: userTable.name,
        email: userTable.email,
      })
      .from(representativeUserAccess)
      .innerJoin(userTable, eq(userTable.id, representativeUserAccess.userId))
      .where(eq(representativeUserAccess.representativeId, data.representativeId));

    return rows;
  });

const portalPermissionsSchema = z.object({
  canViewDebts: z.boolean().default(true),
  canViewIva: z.boolean().default(true),
  canViewPayroll: z.boolean().default(false),
  canUploadDocuments: z.boolean().default(true),
  canChatAi: z.boolean().default(true),
});

export const createPortalUser = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      representativeId: z.string().uuid(),
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      permissions: portalPermissionsSchema,
    })
  )
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);
    await assertRepresentativeOwnership(data.representativeId, orgId);

    // Check email not already in use
    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, data.email))
      .limit(1);
    if (existing) throw new Error('Ya existe un usuario con ese email');

    const created = await auth.api.createUser({
      headers: getRequestHeaders(),
      body: {
        name: data.name,
        email: data.email,
        password: data.password,
        role: 'user',
      },
    });

    const [access] = await db
      .insert(representativeUserAccess)
      .values({
        representativeId: data.representativeId,
        userId: created.user.id,
        role: 'client_viewer',
        canViewDebts: data.permissions.canViewDebts,
        canViewIva: data.permissions.canViewIva,
        canViewPayroll: data.permissions.canViewPayroll,
        canUploadDocuments: data.permissions.canUploadDocuments,
        canChatAi: data.permissions.canChatAi,
      })
      .returning();

    return access;
  });

export const updatePortalUserPermissions = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      accessId: z.string().uuid(),
      permissions: portalPermissionsSchema,
    })
  )
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate that the access row belongs to a representative in this org
    const [accessRow] = await db
      .select({ representativeId: representativeUserAccess.representativeId })
      .from(representativeUserAccess)
      .where(eq(representativeUserAccess.id, data.accessId))
      .limit(1);
    if (!accessRow) throw new Error('Acceso no encontrado');
    await assertRepresentativeOwnership(accessRow.representativeId, orgId);

    await db
      .update(representativeUserAccess)
      .set({
        canViewDebts: data.permissions.canViewDebts,
        canViewIva: data.permissions.canViewIva,
        canViewPayroll: data.permissions.canViewPayroll,
        canUploadDocuments: data.permissions.canUploadDocuments,
        canChatAi: data.permissions.canChatAi,
      })
      .where(eq(representativeUserAccess.id, data.accessId));

    return { success: true };
  });

export const resetPortalUserPassword = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      userId: z.string(),
      newPassword: z.string().min(8),
    })
  )
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    // Validate that this userId has access to a representative belonging to this org
    const accessRows = await db
      .select({ representativeId: representativeUserAccess.representativeId })
      .from(representativeUserAccess)
      .where(eq(representativeUserAccess.userId, data.userId));

    const repIds = accessRows.map((r) => r.representativeId);
    if (repIds.length === 0) throw new Error('Usuario no encontrado');

    const [owned] = await db
      .select({ id: representative.id })
      .from(representative)
      .where(
        and(
          eq(representative.organizationId, orgId),
          eq(representative.id, repIds[0])
        )
      )
      .limit(1);
    if (!owned) throw new Error('Sin permisos para modificar este usuario');

    await auth.api.setUserPassword({
      headers: getRequestHeaders(),
      body: { userId: data.userId, newPassword: data.newPassword },
    });

    return { success: true };
  });

export const revokePortalAccess = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ accessId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [accessRow] = await db
      .select({ representativeId: representativeUserAccess.representativeId })
      .from(representativeUserAccess)
      .where(eq(representativeUserAccess.id, data.accessId))
      .limit(1);
    if (!accessRow) throw new Error('Acceso no encontrado');
    await assertRepresentativeOwnership(accessRow.representativeId, orgId);

    await db
      .delete(representativeUserAccess)
      .where(eq(representativeUserAccess.id, data.accessId));

    return { success: true };
  });
