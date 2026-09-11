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
  'escalas',
  'tope_imponible',
  'monotributo',
  'libro_iva',
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

/**
 * Una fuente de datos y qué tan al día está.
 *
 * Antes esto traía dos fechas —cuándo corrió el job y `max(updated_at)` de la
 * tabla destino— y las mostraba juntas. Se contradecían todo el tiempo, y las
 * dos tenían razón: median cosas distintas. `max(updated_at)` sube con
 * cualquier escritura, no sólo con las del scrapper: alguien marcando un
 * vencimiento como cumplido mueve la fecha de toda la fuente. Medido en
 * producción: el 07/09 a las 19:21 se tocó UNA fila de `vencimiento` sin ningún
 * job corriendo, y con eso el panel anunciaba datos frescos mientras el último
 * scrapeo real era de cuatro días antes.
 *
 * Así que la frescura del dato es una sola cosa: cuándo fue la última corrida
 * exitosa. Y la salud es otra: cuántas credenciales están fallando hoy.
 */
export interface FuenteDatoRow {
  id: string;
  nombre: string;
  /** Última corrida exitosa (ISO), o null si nunca hubo una. */
  ultimoOkAt: string | null;
  /** Credenciales cuya corrida más reciente de esta fuente terminó mal. */
  credencialesFallando: number;
  /** Credenciales que alguna vez corrieron esta fuente. El total del "N de M". */
  credencialesTotal: number;
}

export const getFuentesDatos = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FuenteDatoRow[]> => {
    const { orgId } = await getSessionWithOrg();

    /**
     * La corrida más reciente de cada credencial, por fuente.
     *
     * Por credencial y no por tipo de job: el scrapper dispara uno por clave,
     * así que en una misma tanda conviven éxitos y fallas. Mirar
     * `max(failed_at)` contra `max(finished_at)` —lo que hacía antes— compara
     * dos poblaciones distintas y da rojo casi siempre.
     *
     * El `distinct on` es por (fuente, credencial) y no por (tipo, credencial)
     * porque Comprobantes junta dos tipos de job: contando por tipo, una clave
     * que corre los dos se cuenta dos veces y el total sale mayor que la
     * cantidad de claves que existen.
     */
    const filas = await db
      .select({
        fuente: sql<string>`fuente`,
        status: sql<string>`status`,
        cuando: sql<string | null>`to_json(max(cuando))#>>'{}'`,
        n: sql<number>`count(*)::int`,
      })
      .from(
        sql`(
          select distinct on (fuente, credencial_id) fuente, credencial_id, status, cuando
          from (
            select case ${job.type}
                     when 'comprobantes' then 'comprobantes'
                     when 'comprobantes_full' then 'comprobantes'
                     else ${job.type}::text
                   end as fuente,
                   ${job.credencialId} as credencial_id,
                   ${job.status} as status,
                   coalesce(${job.finishedAt}, ${job.failedAt}, ${job.updatedAt}) as cuando,
                   ${job.createdAt} as created_at
            from ${job}
            where ${job.orgId} = ${orgId} and ${job.credencialId} is not null
          ) j
          order by fuente, credencial_id, created_at desc
        ) u`
      )
      .groupBy(sql`fuente, status`);

    /**
     * `ultimoOkAt` sale del job y no de `max(updated_at)` de la tabla destino
     * a propósito: es el único momento del que sabemos que ARCA contestó bien.
     */
    const resumenDe = (fuente: string) => {
      let ultimoOkAt: string | null = null;
      let fallando = 0;
      let total = 0;
      for (const f of filas) {
        if (f.fuente !== fuente) continue;
        total += f.n;
        if (f.status === 'failed') fallando += f.n;
        if (
          f.status === 'finished' &&
          f.cuando &&
          (!ultimoOkAt || f.cuando > ultimoOkAt)
        )
          ultimoOkAt = f.cuando;
      }
      return {
        ultimoOkAt,
        credencialesFallando: fallando,
        credencialesTotal: total,
      };
    };

    /**
     * Las escalas no se scrapean por credencial: las trae un job semanal que
     * lee `cct_fuente`. No hay "N de M claves" que contar, así que la frescura
     * sale del último job del tipo y el conteo queda en cero.
     */
    const [escalas] = await db
      .select({
        ultimoOkAt: sql<
          string | null
        >`to_json(max(${job.finishedAt}) filter (where ${job.status} = 'finished'))#>>'{}'`,
      })
      .from(job)
      .where(and(eq(job.orgId, orgId), eq(job.type, 'escalas')));

    return [
      {
        id: 'comprobantes',
        nombre: 'Comprobantes',
        ...resumenDe('comprobantes'),
      },
      { id: 'iva', nombre: 'IVA (F2051)', ...resumenDe('iva') },
      {
        id: 'notificaciones',
        nombre: 'Notificaciones',
        ...resumenDe('notificaciones'),
      },
      { id: 'deuda', nombre: 'Deudas', ...resumenDe('deuda') },
      {
        id: 'vencimientos',
        nombre: 'Vencimientos',
        ...resumenDe('vencimientos'),
      },
      {
        id: 'escalas',
        nombre: 'Escalas salariales',
        ultimoOkAt: escalas?.ultimoOkAt ?? null,
        credencialesFallando: 0,
        credencialesTotal: 0,
      },
    ];
  }
);
