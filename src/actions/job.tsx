import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import { job, representative, jobLog, client } from '@/drizzle/schema';
import { getSessionWithOrg, getMemberRole, assertCanWrite } from '@/actions/helpers';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  classifyStoredFailedReason,
  CATEGORY_LABELS,
  type ErrorCategory,
  type ErrorSeverity,
  type ErrorClassification,
} from '@/lib/job-error-classifier';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const jobStatusEnum = z.enum(['pending', 'running', 'failed', 'finished']);
const jobTypeEnum = z.enum([
  'iva',
  'comprobantes',
  'comprobantes_full',
  'notificaciones',
  'deuda',
  'vencimientos',
]);

export type JobStatus = z.infer<typeof jobStatusEnum>;
export type JobType = z.infer<typeof jobTypeEnum>;

export interface JobRow {
  id: string;
  status: JobStatus;
  type: JobType;
  representativeId: string;
  representativeName: string | null;
  /** Empresas (clientes) del representante. */
  clients: { id: string; name: string }[];
  params: Record<string, {}> | null;
  result: Record<string, {}> | null;
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  progress: number | null;
}

export interface JobsResponse {
  jobs: JobRow[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export interface JobLogRow {
  id: string;
  jobId: string;
  level: string;
  message: string;
  context: Record<string, {}> | null;
  createdAt: Date;
}

export const getJobs = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      representativeId: z.string().optional(),
      status: jobStatusEnum.optional(),
      type: jobTypeEnum.optional(),
      date: z.string().optional(), // YYYY-MM-DD
      fromTime: z.string().optional(), // HH:mm
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { page, limit, representativeId, status, type, date, fromTime } = ctx.data;
    const offset = (page - 1) * limit;

    const userClients = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const clientIds = userClients.map((c) => c.id);
    if (clientIds.length === 0) {
      return {
        jobs: [],
        totalCount: 0,
        totalPages: 0,
        currentPage: page,
      };
    }

    const conditions = [inArray(job.representativeId, clientIds)];

    if (representativeId) {
      conditions.push(eq(job.representativeId, representativeId));
    }

    if (status) {
      conditions.push(eq(job.status, status));
    }

    if (type) {
      conditions.push(eq(job.type, type));
    }

    if (date && fromTime) {
      conditions.push(
        sql`${job.createdAt} >= (${`${date} ${fromTime}`}::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`
      );
    } else if (date) {
      conditions.push(
        sql`(${job.createdAt} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date`
      );
    }

    const whereCondition = and(...conditions);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(job)
      .where(whereCondition);

    const rawJobs = await db
      .select({
        id: job.id,
        status: job.status,
        type: job.type,
        representativeId: job.representativeId,
        representativeName: representative.name,
        params: job.params,
        result: job.result,
        failedReason: job.failedReason,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        progress: job.progress,
      })
      .from(job)
      .leftJoin(representative, eq(job.representativeId, representative.id))
      .where(whereCondition)
      .orderBy(
        sql`CASE ${job.status} WHEN 'running' THEN 0 WHEN 'failed' THEN 1 WHEN 'finished' THEN 2 ELSE 3 END`,
        desc(job.createdAt)
      )
      .limit(limit)
      .offset(offset);

    // Empresas (clientes) de cada representante para mostrar debajo.
    const repIds = [...new Set(rawJobs.map((j) => j.representativeId))];
    const clientRows =
      repIds.length > 0
        ? await db
            .select({
              id: client.id,
              name: client.name,
              representativeId: client.representativeId,
            })
            .from(client)
            .where(inArray(client.representativeId, repIds))
            .orderBy(asc(client.name))
        : [];
    const clientsByRep = new Map<string, { id: string; name: string }[]>();
    for (const c of clientRows) {
      if (!c.representativeId) continue;
      const list = clientsByRep.get(c.representativeId);
      const entry = { id: c.id, name: c.name };
      if (list) list.push(entry);
      else clientsByRep.set(c.representativeId, [entry]);
    }

    const jobs: JobRow[] = rawJobs.map((j) => ({
      ...j,
      // El enum de la DB incluye 'batch' pero la UI solo maneja JobType.
      type: j.type as JobType,
      clients: clientsByRep.get(j.representativeId) ?? [],
      params: (j.params ?? null) as Record<string, {}> | null,
      result: (j.result ?? null) as Record<string, {}> | null,
    }));

    const response: JobsResponse = {
      jobs: jobs,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };

    return response;
  });

export const getJobLogs = createServerFn({
  method: 'GET',
})
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      limit: z.number().default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const { jobId, limit } = ctx.data;

    const userClients = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const clientIds = userClients.map((c) => c.id);
    if (clientIds.length === 0) {
      return [] as JobLogRow[];
    }

    const [jobRow] = await db
      .select({ id: job.id, clientId: job.representativeId })
      .from(job)
      .where(eq(job.id, jobId))
      .limit(1);

    if (!jobRow || !clientIds.includes(jobRow.clientId)) {
      return [] as JobLogRow[];
    }

    const logs = await db
      .select({
        id: jobLog.id,
        jobId: jobLog.jobId,
        level: jobLog.level,
        message: jobLog.message,
        context: jobLog.context,
        createdAt: jobLog.createdAt,
      })
      .from(jobLog)
      .where(eq(jobLog.jobId, jobId))
      .orderBy(asc(jobLog.createdAt))
      .limit(limit);

    return logs as JobLogRow[];
  });

export interface ActiveJobRow {
  id: string;
  type: JobType;
  status: 'pending' | 'running';
  representativeId: string;
  representativeName: string | null;
  progress: number | null;
  createdAt: Date;
}

export interface FinishedJobRow {
  id: string;
  type: JobType;
  status: 'finished' | 'failed';
  representativeId: string;
  representativeName: string | null;
  failedReason: string | null;
  finishedAt: Date | null;
}

export interface ActiveJobsSummary {
  active: ActiveJobRow[];
  recentlyFinished: FinishedJobRow[];
}

export const getActiveJobsSummary = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ActiveJobsSummary> => {
    const { orgId } = await getSessionWithOrg();

    const userClients = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    const clientIds = userClients.map((c) => c.id);
    if (clientIds.length === 0) {
      return { active: [], recentlyFinished: [] };
    }

    const active = await db
      .select({
        id: job.id,
        type: job.type,
        status: job.status,
        representativeId: job.representativeId,
        representativeName: representative.name,
        progress: job.progress,
        createdAt: job.createdAt,
      })
      .from(job)
      .leftJoin(representative, eq(job.representativeId, representative.id))
      .where(
        and(
          inArray(job.representativeId, clientIds),
          inArray(job.status, ['pending', 'running'])
        )
      )
      .orderBy(asc(job.createdAt));

    const recentlyFinished = await db
      .select({
        id: job.id,
        type: job.type,
        status: job.status,
        representativeId: job.representativeId,
        representativeName: representative.name,
        failedReason: job.failedReason,
        finishedAt: sql<Date | null>`COALESCE(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt})`,
      })
      .from(job)
      .leftJoin(representative, eq(job.representativeId, representative.id))
      .where(
        and(
          inArray(job.representativeId, clientIds),
          inArray(job.status, ['finished', 'failed']),
          sql`COALESCE(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt}) > now() - interval '10 minutes'`
        )
      )
      .orderBy(desc(sql`COALESCE(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt})`))
      .limit(100);

    return {
      active: active as ActiveJobRow[],
      recentlyFinished: recentlyFinished as FinishedJobRow[],
    };
  }
);

export const dispatchAllJobs = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ limit: z.number().int().positive().optional() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    let representatives = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));

    if (ctx.data.limit) {
      representatives = representatives.slice(0, ctx.data.limit);
    }

    if (representatives.length === 0)
      return { success: true, dispatched: 0, errors: 0 };

    const representativeIds = representatives.map((c) => c.id);

    const [activeJobs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(job)
      .where(
        and(
          inArray(job.representativeId, representativeIds),
          sql`${job.status} IN ('running', 'pending')`
        )
      );

    if (activeJobs.count > 0) {
      throw new Error(
        `Ya hay un batch en ejecución (${activeJobs.count} jobs activos). Esperá a que termine antes de disparar uno nuevo.`
      );
    }

    const types = [
      'deuda',
      'vencimientos',
      'notificaciones',
      'comprobantes_full',
      'iva',
    ] as const;
    const jobs = representatives.flatMap((c) =>
      types.map((type) => ({ type, representativeId: c.id }))
    );

    const { data } = await axios.post(`${JOBS_API_URL}/api/jobs/batch`, {
      jobs,
    });
    const created = data?.created ?? 0;
    const errors = data?.errors ?? 0;
    return { success: errors === 0, dispatched: created, errors };
  });

export interface ErrorGroup {
  category: ErrorCategory;
  label: string;
  severity: ErrorSeverity;
  retryable: boolean;
  count: number;
  /** Hasta 3 failedReason distintos de ejemplo. */
  sampleReasons: string[];
  representatives: {
    id: string;
    name: string | null;
    count: number;
    clients: { id: string; name: string }[];
  }[];
}

export interface JobErrorSummary {
  totalFailed: number;
  totalJobs: number;
  affectedRepresentatives: number;
  topCategory: { label: string; count: number } | null;
  groups: ErrorGroup[];
}

export const getJobErrorSummary = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      representativeId: z.string().optional(),
      type: jobTypeEnum.optional(),
      date: z.string().optional(), // YYYY-MM-DD
      fromTime: z.string().optional(), // HH:mm
    })
  )
  .handler(async (ctx): Promise<JobErrorSummary> => {
    const { orgId } = await getSessionWithOrg();
    const { representativeId, type, date, fromTime } = ctx.data;

    const emptySummary: JobErrorSummary = {
      totalFailed: 0,
      totalJobs: 0,
      affectedRepresentatives: 0,
      topCategory: null,
      groups: [],
    };

    const orgReps = await db
      .select({ id: representative.id })
      .from(representative)
      .where(eq(representative.organizationId, orgId));
    const orgRepIds = orgReps.map((r) => r.id);
    if (orgRepIds.length === 0) return emptySummary;

    const baseConditions = [inArray(job.representativeId, orgRepIds)];
    if (representativeId) baseConditions.push(eq(job.representativeId, representativeId));
    if (type) baseConditions.push(eq(job.type, type));
    if (date && fromTime) {
      baseConditions.push(
        sql`${job.createdAt} >= (${`${date} ${fromTime}`}::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')`
      );
    } else if (date) {
      baseConditions.push(
        sql`(${job.createdAt} AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = ${date}::date`
      );
    }

    const [{ count: totalJobs }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(job)
      .where(and(...baseConditions));

    const failedRows = await db
      .select({
        id: job.id,
        failedReason: job.failedReason,
        representativeId: job.representativeId,
        representativeName: representative.name,
      })
      .from(job)
      .leftJoin(representative, eq(job.representativeId, representative.id))
      .where(and(...baseConditions, eq(job.status, 'failed')))
      .limit(2000);

    if (failedRows.length === 0) return { ...emptySummary, totalJobs };

    // Agrupar por categoría normalizada.
    interface GroupAcc {
      classification: ErrorClassification;
      count: number;
      reasons: Map<string, number>;
      reps: Map<string, { name: string | null; count: number }>;
    }
    const groupsByCategory = new Map<ErrorCategory, GroupAcc>();
    for (const row of failedRows) {
      const classification = classifyStoredFailedReason(row.failedReason);
      let acc = groupsByCategory.get(classification.category);
      if (!acc) {
        acc = { classification, count: 0, reasons: new Map(), reps: new Map() };
        groupsByCategory.set(classification.category, acc);
      }
      acc.count++;
      const reason = row.failedReason ?? 'Sin motivo registrado';
      acc.reasons.set(reason, (acc.reasons.get(reason) ?? 0) + 1);
      const rep = acc.reps.get(row.representativeId);
      if (rep) rep.count++;
      else acc.reps.set(row.representativeId, { name: row.representativeName, count: 1 });
    }

    // Clientes por representante afectado (mismo patrón que getJobs).
    const affectedRepIds = [...new Set(failedRows.map((r) => r.representativeId))];
    const clientRows = await db
      .select({
        id: client.id,
        name: client.name,
        representativeId: client.representativeId,
      })
      .from(client)
      .where(inArray(client.representativeId, affectedRepIds))
      .orderBy(asc(client.name));
    const clientsByRep = new Map<string, { id: string; name: string }[]>();
    for (const c of clientRows) {
      if (!c.representativeId) continue;
      const list = clientsByRep.get(c.representativeId);
      const entry = { id: c.id, name: c.name };
      if (list) list.push(entry);
      else clientsByRep.set(c.representativeId, [entry]);
    }

    const groups: ErrorGroup[] = [...groupsByCategory.entries()]
      .map(([category, acc]) => ({
        category,
        label: CATEGORY_LABELS[category],
        severity: acc.classification.severity,
        retryable: acc.classification.retryable,
        count: acc.count,
        sampleReasons: [...acc.reasons.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([reason]) => reason),
        representatives: [...acc.reps.entries()]
          .map(([id, rep]) => ({
            id,
            name: rep.name,
            count: rep.count,
            clients: clientsByRep.get(id) ?? [],
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalFailed: failedRows.length,
      totalJobs,
      affectedRepresentatives: affectedRepIds.length,
      topCategory: groups[0] ? { label: groups[0].label, count: groups[0].count } : null,
      groups,
    };
  });
