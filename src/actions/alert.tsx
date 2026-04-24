import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { alert as alertTable } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, desc, inArray } from 'drizzle-orm';

export const listAlerts = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      clientId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions: ReturnType<typeof eq>[] = [
      eq(alertTable.organizationId, orgId) as any,
    ];

    if (ctx.data.status) {
      conditions.push(eq(alertTable.status, ctx.data.status) as any);
    }
    if (ctx.data.severity) {
      conditions.push(eq(alertTable.severity, ctx.data.severity) as any);
    }
    if (ctx.data.clientId) {
      conditions.push(eq(alertTable.clientId, ctx.data.clientId) as any);
    }

    return db
      .select()
      .from(alertTable)
      .where(and(...conditions))
      .orderBy(desc(alertTable.createdAt))
      .limit(ctx.data.limit) as any;
  });

export const createAlert = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      clientId: z.string().uuid().optional(),
      profileId: z.string().uuid().optional(),
      type: z.string(),
      severity: z.string(),
      title: z.string(),
      description: z.string().optional(),
      sourceEntityType: z.string().optional(),
      sourceEntityId: z.string().optional(),
      dueAt: z.string().datetime().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const rows = await db
      .insert(alertTable)
      .values({
        organizationId: orgId,
        clientId: ctx.data.clientId,
        profileId: ctx.data.profileId,
        type: ctx.data.type,
        severity: ctx.data.severity,
        title: ctx.data.title,
        description: ctx.data.description,
        sourceEntityType: ctx.data.sourceEntityType,
        sourceEntityId: ctx.data.sourceEntityId,
        dueAt: ctx.data.dueAt ? new Date(ctx.data.dueAt) : undefined,
        metadata: ctx.data.metadata,
        status: 'open',
      })
      .returning();

    return rows[0] as any;
  });

export const acknowledgeAlert = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const rows = await db
      .update(alertTable)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(and(eq(alertTable.id, ctx.data.id), eq(alertTable.organizationId, orgId)))
      .returning();

    return rows[0] as any;
  });

export const assignAlert = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid(), userId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const rows = await db
      .update(alertTable)
      .set({ assignedToUserId: ctx.data.userId, updatedAt: new Date() })
      .where(and(eq(alertTable.id, ctx.data.id), eq(alertTable.organizationId, orgId)))
      .returning();

    return rows[0] as any;
  });

export const resolveAlert = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const rows = await db
      .update(alertTable)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(alertTable.id, ctx.data.id), eq(alertTable.organizationId, orgId)))
      .returning();

    return rows[0] as any;
  });

export const bulkResolveAlerts = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ ids: z.array(z.string().uuid()) }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const rows = await db
      .update(alertTable)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(alertTable.id, ctx.data.ids),
          eq(alertTable.organizationId, orgId)
        )
      )
      .returning();

    return { resolved: rows.length };
  });
