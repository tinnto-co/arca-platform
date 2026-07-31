import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import axios from 'axios';
import { db } from '@/lib/db';
import {
  job,
  jobLog,
  credencialAfip,
  cliente,
  clienteCredencial,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
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
  credencialId: string;
  credencialNombre: string | null;
  credencialCuit: string;
  /** Clientes a los que da acceso esa credencial. */
  clientes: { id: string; razonSocial: string }[];
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

/** Los clientes de cada credencial, para mostrarlos debajo del job. */
async function getClientesPorCredencial(credencialIds: string[]) {
  const byCredencial = new Map<string, { id: string; razonSocial: string }[]>();
  if (credencialIds.length === 0) return byCredencial;

  const rows = await db
    .select({
      id: cliente.id,
      razonSocial: cliente.razonSocial,
      credencialId: clienteCredencial.credencialId,
    })
    .from(clienteCredencial)
    .innerJoin(cliente, eq(clienteCredencial.clienteId, cliente.id))
    .where(inArray(clienteCredencial.credencialId, credencialIds))
    .orderBy(asc(cliente.razonSocial));

  for (const r of rows) {
    const entry = { id: r.id, razonSocial: r.razonSocial };
    const list = byCredencial.get(r.credencialId);
    if (list) list.push(entry);
    else byCredencial.set(r.credencialId, [entry]);
  }
  return byCredencial;
}

export const getJobs = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      page: z.number().default(1),
      limit: z.number().default(20),
      credencialId: z.string().optional(),
      status: jobStatusEnum.optional(),
      type: jobTypeEnum.optional(),
      date: z.string().optional(), // YYYY-MM-DD
      fromTime: z.string().optional(), // HH:mm
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { page, limit, credencialId, status, type, date, fromTime } =
      ctx.data;

    const conditions = [eq(job.orgId, orgId)];
    if (credencialId) conditions.push(eq(job.credencialId, credencialId));
    if (status) conditions.push(eq(job.status, status));
    if (type) conditions.push(eq(job.type, type));
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
      .select({ count: sql<number>`count(*)::int` })
      .from(job)
      .where(whereCondition);

    const rawJobs = await db
      .select({
        id: job.id,
        status: job.status,
        type: job.type,
        credencialId: job.credencialId,
        credencialNombre: credencialAfip.nombre,
        credencialCuit: credencialAfip.cuit,
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
      .innerJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
      .where(whereCondition)
      .orderBy(
        sql`CASE ${job.status} WHEN 'running' THEN 0 WHEN 'failed' THEN 1 WHEN 'finished' THEN 2 ELSE 3 END`,
        desc(job.createdAt)
      )
      .limit(limit)
      .offset((page - 1) * limit);

    const clientesPorCredencial = await getClientesPorCredencial([
      ...new Set(rawJobs.map((j) => j.credencialId)),
    ]);

    const jobs: JobRow[] = rawJobs.map((j) => ({
      ...j,
      // El enum de la DB incluye 'batch' pero la UI solo maneja JobType.
      type: j.type as JobType,
      clientes: clientesPorCredencial.get(j.credencialId) ?? [],
      params: (j.params ?? null) as Record<string, {}> | null,
      result: (j.result ?? null) as Record<string, {}> | null,
    }));

    const response: JobsResponse = {
      jobs,
      totalCount: count,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    };

    return response;
  });

export const getJobLogs = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      jobId: z.string().uuid(),
      limit: z.number().default(100),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const { jobId, limit } = ctx.data;

    const [jobRow] = await db
      .select({ id: job.id })
      .from(job)
      .where(and(eq(job.id, jobId), eq(job.orgId, orgId)))
      .limit(1);

    if (!jobRow) return [] as JobLogRow[];

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
  credencialId: string;
  credencialNombre: string | null;
  progress: number | null;
  createdAt: Date;
}

export interface FinishedJobRow {
  id: string;
  type: JobType;
  status: 'finished' | 'failed';
  credencialId: string;
  credencialNombre: string | null;
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

    const active = await db
      .select({
        id: job.id,
        type: job.type,
        status: job.status,
        credencialId: job.credencialId,
        credencialNombre: credencialAfip.nombre,
        progress: job.progress,
        createdAt: job.createdAt,
      })
      .from(job)
      .innerJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
      .where(
        and(eq(job.orgId, orgId), inArray(job.status, ['pending', 'running']))
      )
      .orderBy(asc(job.createdAt));

    // Un job puede terminar por finished, failed o simplemente actualizarse.
    const terminadoAt = sql<
      Date | null
    >`COALESCE(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt})`;

    const recentlyFinished = await db
      .select({
        id: job.id,
        type: job.type,
        status: job.status,
        credencialId: job.credencialId,
        credencialNombre: credencialAfip.nombre,
        failedReason: job.failedReason,
        finishedAt: terminadoAt,
      })
      .from(job)
      .innerJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
      .where(
        and(
          eq(job.orgId, orgId),
          inArray(job.status, ['finished', 'failed']),
          sql`${terminadoAt} > now() - interval '10 minutes'`
        )
      )
      .orderBy(desc(terminadoAt))
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
    assertCanWrite(await getMemberRole());

    let credenciales = await db
      .select({ id: credencialAfip.id })
      .from(credencialAfip)
      .where(eq(credencialAfip.orgId, orgId));

    if (ctx.data.limit) credenciales = credenciales.slice(0, ctx.data.limit);
    if (credenciales.length === 0)
      return { success: true, dispatched: 0, errors: 0 };

    const [activeJobs] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(job)
      .where(
        and(eq(job.orgId, orgId), inArray(job.status, ['running', 'pending']))
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
    const jobs = credenciales.flatMap((c) =>
      types.map((type) => ({ type, credencialId: c.id }))
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
  credenciales: {
    id: string;
    nombre: string | null;
    count: number;
    clientes: { id: string; razonSocial: string }[];
  }[];
}

export interface JobErrorSummary {
  totalFailed: number;
  totalJobs: number;
  affectedCredenciales: number;
  topCategory: { label: string; count: number } | null;
  groups: ErrorGroup[];
}

export const getJobErrorSummary = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      credencialId: z.string().optional(),
      type: jobTypeEnum.optional(),
      date: z.string().optional(), // YYYY-MM-DD
      fromTime: z.string().optional(), // HH:mm
    })
  )
  .handler(async (ctx): Promise<JobErrorSummary> => {
    const { orgId } = await getSessionWithOrg();
    const { credencialId, type, date, fromTime } = ctx.data;

    const baseConditions = [eq(job.orgId, orgId)];
    if (credencialId) baseConditions.push(eq(job.credencialId, credencialId));
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
        credencialId: job.credencialId,
        credencialNombre: credencialAfip.nombre,
      })
      .from(job)
      .innerJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
      .where(and(...baseConditions, eq(job.status, 'failed')))
      .limit(2000);

    if (failedRows.length === 0) {
      return {
        totalFailed: 0,
        totalJobs,
        affectedCredenciales: 0,
        topCategory: null,
        groups: [],
      };
    }

    // Agrupar por categoría normalizada.
    type GroupAcc = {
      classification: ErrorClassification;
      count: number;
      reasons: Map<string, number>;
      credenciales: Map<string, { nombre: string | null; count: number }>;
    };
    const groupsByCategory = new Map<ErrorCategory, GroupAcc>();
    for (const row of failedRows) {
      const classification = classifyStoredFailedReason(row.failedReason);
      let acc = groupsByCategory.get(classification.category);
      if (!acc) {
        acc = {
          classification,
          count: 0,
          reasons: new Map(),
          credenciales: new Map(),
        };
        groupsByCategory.set(classification.category, acc);
      }
      acc.count++;
      const reason = row.failedReason ?? 'Sin motivo registrado';
      acc.reasons.set(reason, (acc.reasons.get(reason) ?? 0) + 1);
      const cred = acc.credenciales.get(row.credencialId);
      if (cred) cred.count++;
      else
        acc.credenciales.set(row.credencialId, {
          nombre: row.credencialNombre,
          count: 1,
        });
    }

    const affectedIds = [...new Set(failedRows.map((r) => r.credencialId))];
    const clientesPorCredencial = await getClientesPorCredencial(affectedIds);

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
        credenciales: [...acc.credenciales.entries()]
          .map(([id, cred]) => ({
            id,
            nombre: cred.nombre,
            count: cred.count,
            clientes: clientesPorCredencial.get(id) ?? [],
          }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalFailed: failedRows.length,
      totalJobs,
      affectedCredenciales: affectedIds.length,
      topCategory: groups[0]
        ? { label: groups[0].label, count: groups[0].count }
        : null,
      groups,
    };
  });
