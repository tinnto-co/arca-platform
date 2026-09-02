import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { scrapperPost } from '@/lib/scrapper-api';
import {
  job,
  jobLog,
  credencialAfip,
  cliente,
  clienteCredencial,
  comprobante,
  ivaDeclaracion,
  notificacion,
  deuda,
  vencimiento,
  escalaSalarial,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  getMemberRole,
  assertCanWrite,
} from '@/actions/helpers';
import { and, asc, desc, eq, inArray, sql, type AnyColumn } from 'drizzle-orm';
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
  'escalas',
  'tope_imponible',
  'monotributo',
]);

export type JobStatus = z.infer<typeof jobStatusEnum>;
export type JobType = z.infer<typeof jobTypeEnum>;

export interface JobRow {
  id: string;
  status: JobStatus;
  type: JobType;
  /** Null en los jobs que no usan credencial de AFIP, como `escalas`. */
  credencialId: string | null;
  credencialNombre: string | null;
  credencialCuit: string | null;
  /** Clientes a los que da acceso esa credencial; vacío si no hay credencial. */
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

/**
 * Los clientes de cada credencial, para mostrarlos debajo del job.
 * Acepta nulls porque hay jobs sin credencial —`escalas` scrapea las páginas
 * públicas de los CCT y no se loguea a ninguna cuenta de AFIP—: se descartan.
 */
async function getClientesPorCredencial(credencialIds: (string | null)[]) {
  const byCredencial = new Map<string, { id: string; razonSocial: string }[]>();
  const ids = credencialIds.filter((id): id is string => id !== null);
  if (ids.length === 0) return byCredencial;

  const rows = await db
    .select({
      id: cliente.id,
      razonSocial: cliente.razonSocial,
      credencialId: clienteCredencial.credencialId,
    })
    .from(clienteCredencial)
    .innerJoin(cliente, eq(clienteCredencial.clienteId, cliente.id))
    .where(inArray(clienteCredencial.credencialId, ids))
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
  .validator(
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
      // leftJoin: los jobs de `escalas` no usan credencial de AFIP (scrapean
      // las páginas públicas de los CCT) y con inner quedaban invisibles.
      .leftJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
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
      clientes: j.credencialId
        ? (clientesPorCredencial.get(j.credencialId) ?? [])
        : [],
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
  .validator(
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

/**
 * Fecha (hora argentina) del job más reciente de la organización. La pantalla
 * de jobs abre filtrada en ese día: la pregunta que contesta es "¿el último
 * scrapeo salió bien?", y los acumulados históricos no la contestan.
 */
export const getUltimaFechaScrapeo = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { orgId } = await getSessionWithOrg();
    const [r] = await db
      .select({
        fecha: sql<
          string | null
        >`(max(${job.createdAt}) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::text`,
      })
      .from(job)
      .where(eq(job.orgId, orgId));
    return { fecha: r?.fecha ?? null };
  }
);

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
    const terminadoAt = sql<Date | null>`COALESCE(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt})`;

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
  .validator(z.object({ limit: z.number().int().positive().optional() }))
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

    const data = await scrapperPost<{ created?: number; errors?: number }>(
      `${JOBS_API_URL}/api/jobs/batch`,
      { jobs }
    );
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
  .validator(
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
      .leftJoin(credencialAfip, eq(job.credencialId, credencialAfip.id))
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
      // Un job sin credencial (`escalas`) suma a la categoría pero no agrupa
      // por credencial: no hay ninguna a la que atribuirle el error.
      if (row.credencialId) {
        const cred = acc.credenciales.get(row.credencialId);
        if (cred) cred.count++;
        else
          acc.credenciales.set(row.credencialId, {
            nombre: row.credencialNombre,
            count: 1,
          });
      }
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

/** Una fuente de datos scrapeada: última corrida y última actualización real. */
export interface FuenteDatoRow {
  id: string;
  nombre: string;
  /** Último job terminado OK (ISO) o null si nunca corrió. */
  ultimoOkAt: string | null;
  /** Último job fallido (ISO) o null. */
  ultimoErrorAt: string | null;
  /** max(updated_at) de la tabla destino (ISO) o null si está vacía. */
  datosActualizadosAt: string | null;
}

// max(timestamptz) crudo vuelve como string no-ISO del driver → patrón to_json.
const isoMax = (col: AnyColumn) =>
  sql<string | null>`to_json(max(${col}))#>>'{}'`;

export const getFuentesDatos = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FuenteDatoRow[]> => {
    const { orgId } = await getSessionWithOrg();

    const jobsPorTipo = await db
      .select({
        type: job.type,
        ultimoOkAt: sql<
          string | null
        >`to_json(max(${job.finishedAt}) filter (where ${job.status} = 'finished'))#>>'{}'`,
        ultimoErrorAt: sql<
          string | null
        >`to_json(max(coalesce(${job.failedAt}, ${job.updatedAt})) filter (where ${job.status} = 'failed'))#>>'{}'`,
      })
      .from(job)
      .where(eq(job.orgId, orgId))
      .groupBy(job.type);

    const porTipo = new Map(jobsPorTipo.map((r) => [r.type as string, r]));

    // Última actualización real de cada tabla destino (RLS scopea por org;
    // escala_salarial es catálogo por convenio, scopeada a 2 saltos).
    const [[comp], [ivaDecl], [notif], [deu], [venc], [esc]] =
      await Promise.all([
        db.select({ at: isoMax(comprobante.updatedAt) }).from(comprobante),
        db
          .select({ at: isoMax(ivaDeclaracion.updatedAt) })
          .from(ivaDeclaracion),
        db.select({ at: isoMax(notificacion.updatedAt) }).from(notificacion),
        db.select({ at: isoMax(deuda.updatedAt) }).from(deuda),
        db.select({ at: isoMax(vencimiento.updatedAt) }).from(vencimiento),
        db
          .select({ at: isoMax(escalaSalarial.updatedAt) })
          .from(escalaSalarial),
      ]);

    // Combina varios job types en una fuente (ej. comprobantes + full).
    const jobsDe = (tipos: string[]) => {
      let ultimoOkAt: string | null = null;
      let ultimoErrorAt: string | null = null;
      for (const t of tipos) {
        const r = porTipo.get(t);
        if (r?.ultimoOkAt && (!ultimoOkAt || r.ultimoOkAt > ultimoOkAt))
          ultimoOkAt = r.ultimoOkAt;
        if (
          r?.ultimoErrorAt &&
          (!ultimoErrorAt || r.ultimoErrorAt > ultimoErrorAt)
        )
          ultimoErrorAt = r.ultimoErrorAt;
      }
      return { ultimoOkAt, ultimoErrorAt };
    };

    return [
      {
        id: 'comprobantes',
        nombre: 'Comprobantes',
        ...jobsDe(['comprobantes', 'comprobantes_full']),
        datosActualizadosAt: comp.at,
      },
      {
        id: 'iva',
        nombre: 'IVA (F2051)',
        ...jobsDe(['iva']),
        datosActualizadosAt: ivaDecl.at,
      },
      {
        id: 'notificaciones',
        nombre: 'Notificaciones',
        ...jobsDe(['notificaciones']),
        datosActualizadosAt: notif.at,
      },
      {
        id: 'deuda',
        nombre: 'Deudas',
        ...jobsDe(['deuda']),
        datosActualizadosAt: deu.at,
      },
      {
        id: 'vencimientos',
        nombre: 'Vencimientos',
        ...jobsDe(['vencimientos']),
        datosActualizadosAt: venc.at,
      },
      {
        id: 'escalas',
        nombre: 'Escalas salariales',
        ...jobsDe(['escalas']),
        datosActualizadosAt: esc.at,
      },
    ];
  }
);
