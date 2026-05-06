import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import { alert as alertTable, job } from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

export const listAlerts = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      status: z.string().optional(),
      severity: z.string().optional(),
      type: z.string().optional(),
      clientId: z.string().uuid().optional(),
      errorCategory: z.string().optional(),
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
    if (ctx.data.type) {
      conditions.push(eq(alertTable.type, ctx.data.type) as any);
    }
    if (ctx.data.clientId) {
      conditions.push(eq(alertTable.clientId, ctx.data.clientId) as any);
    }
    if (ctx.data.errorCategory) {
      conditions.push(
        sql`${alertTable.metadata}->>'errorCategory' = ${ctx.data.errorCategory}` as any
      );
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
      .where(
        and(
          eq(alertTable.id, ctx.data.id),
          eq(alertTable.organizationId, orgId)
        )
      )
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
      .where(
        and(
          eq(alertTable.id, ctx.data.id),
          eq(alertTable.organizationId, orgId)
        )
      )
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
      .where(
        and(
          eq(alertTable.id, ctx.data.id),
          eq(alertTable.organizationId, orgId)
        )
      )
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

export const retryAlertJobs = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [alertRow] = await db
      .select()
      .from(alertTable)
      .where(
        and(
          eq(alertTable.id, ctx.data.id),
          eq(alertTable.organizationId, orgId)
        )
      )
      .limit(1);

    if (!alertRow) throw new Error('Alert not found');

    const metadata = alertRow.metadata as any;
    if (!metadata?.retryable) throw new Error('Esta alerta no es reintentable');

    const failedJobIds: string[] = metadata.failedJobIds ?? [];
    if (failedJobIds.length === 0) throw new Error('No hay jobs para reintentar');

    const jobsToRetry = await db
      .select({ id: job.id, type: job.type, clientId: job.clientId })
      .from(job)
      .where(inArray(job.id, failedJobIds));

    if (jobsToRetry.length === 0) throw new Error('No se encontraron los jobs fallidos');

    const jobs = jobsToRetry.map((j) => ({ type: j.type, clientId: j.clientId }));
    await axios.post(`${JOBS_API_URL}/api/jobs/batch`, { jobs });

    await db
      .update(alertTable)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(eq(alertTable.id, ctx.data.id));

    return { retried: jobs.length };
  });

export const retryAllRetryable = createServerFn({ method: 'POST' })
  .handler(async () => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const openAlerts = await db
      .select()
      .from(alertTable)
      .where(
        and(
          eq(alertTable.organizationId, orgId),
          eq(alertTable.status, 'open'),
          eq(alertTable.type, 'scraper_error')
        )
      );

    const retryableAlerts = openAlerts.filter((a) => {
      const meta = a.metadata as any;
      return meta?.retryable === true;
    });

    if (retryableAlerts.length === 0) return { retried: 0, acknowledged: 0 };

    const allJobIds = retryableAlerts.flatMap((a) => {
      const meta = a.metadata as any;
      return (meta?.failedJobIds ?? []) as string[];
    });

    if (allJobIds.length > 0) {
      const jobsToRetry = await db
        .select({ id: job.id, type: job.type, clientId: job.clientId })
        .from(job)
        .where(inArray(job.id, allJobIds));

      const jobs = jobsToRetry.map((j) => ({ type: j.type, clientId: j.clientId }));
      await axios.post(`${JOBS_API_URL}/api/jobs/batch`, { jobs });
    }

    const alertIds = retryableAlerts.map((a) => a.id);
    await db
      .update(alertTable)
      .set({ status: 'acknowledged', updatedAt: new Date() })
      .where(inArray(alertTable.id, alertIds));

    return { retried: allJobIds.length, acknowledged: retryableAlerts.length };
  });
