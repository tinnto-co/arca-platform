import { createServerFn } from '@tanstack/react-start';
import z from 'zod';
import { db } from '@/lib/db';
import { scrapperPost } from '@/lib/scrapper-api';
import {
  alerta,
  job,
  alertaTipo,
  alertaSeveridad,
  alertaEstado,
} from '@/drizzle/schema';
import {
  getSessionWithOrg,
  assertCanWrite,
  getMemberRole,
} from '@/actions/helpers';
import { eq, and, desc, inArray, sql, type SQL } from 'drizzle-orm';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

/** Lo que el scrapper deja en `alerta.detalle` para las alertas de scraping. */
export interface AlertaDetalle {
  retryable?: boolean;
  errorCategory?: string;
  errorMessage?: string;
  failedJobIds?: string[];
  jobId?: string;
}

export const listAlerts = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      estado: z.enum(alertaEstado.enumValues).optional(),
      severidad: z.enum(alertaSeveridad.enumValues).optional(),
      tipo: z.enum(alertaTipo.enumValues).optional(),
      credencialId: z.string().uuid().optional(),
      errorCategory: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    })
  )
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();

    const conditions: SQL[] = [eq(alerta.orgId, orgId)];

    if (ctx.data.estado) conditions.push(eq(alerta.estado, ctx.data.estado));
    if (ctx.data.severidad)
      conditions.push(eq(alerta.severidad, ctx.data.severidad));
    if (ctx.data.tipo) conditions.push(eq(alerta.tipo, ctx.data.tipo));
    if (ctx.data.credencialId)
      conditions.push(eq(alerta.credencialId, ctx.data.credencialId));
    if (ctx.data.errorCategory) {
      conditions.push(
        sql`${alerta.detalle}->>'errorCategory' = ${ctx.data.errorCategory}`
      );
    }

    return db
      .select({
        id: alerta.id,
        credencialId: alerta.credencialId,
        clienteId: alerta.clienteId,
        tipo: alerta.tipo,
        severidad: alerta.severidad,
        titulo: alerta.titulo,
        descripcion: alerta.descripcion,
        origenTipo: alerta.origenTipo,
        origenId: alerta.origenId,
        estado: alerta.estado,
        asignadaA: alerta.asignadaA,
        resueltaAt: alerta.resueltaAt,
        resueltaPor: alerta.resueltaPor,
        detalle: sql<AlertaDetalle | null>`${alerta.detalle}`,
        createdAt: alerta.createdAt,
        updatedAt: alerta.updatedAt,
      })
      .from(alerta)
      .where(and(...conditions))
      .orderBy(desc(alerta.createdAt))
      .limit(ctx.data.limit);
  });

export const assignAlert = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid(), userId: z.string() }))
  .handler(async (ctx) => {
    const { orgId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [row] = await db
      .update(alerta)
      .set({ asignadaA: ctx.data.userId, updatedAt: new Date() })
      .where(and(eq(alerta.id, ctx.data.id), eq(alerta.orgId, orgId)))
      .returning({ id: alerta.id });

    if (!row) throw new Error('Alerta no encontrada');
    return { success: true };
  });

export const resolveAlert = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const now = new Date();
    const [row] = await db
      .update(alerta)
      .set({
        estado: 'resuelta',
        resueltaAt: now,
        resueltaPor: userId,
        updatedAt: now,
      })
      .where(and(eq(alerta.id, ctx.data.id), eq(alerta.orgId, orgId)))
      .returning({ id: alerta.id });

    if (!row) throw new Error('Alerta no encontrada');
    return { success: true };
  });

/**
 * Dedupea pares (credencial, tipo) — un job scrapea todas las relaciones del
 * login, así que reintentar dos jobs fallidos del mismo par sería un scrape
 * duplicado — y saltea pares que ya tienen un job pending/running.
 */
async function dedupeRetryJobs(
  jobsToRetry: { type: string; credencialId: string }[]
): Promise<{ type: string; credencialId: string }[]> {
  const uniquePairs = new Map<string, { type: string; credencialId: string }>();
  for (const j of jobsToRetry) {
    uniquePairs.set(`${j.credencialId}:${j.type}`, j);
  }
  if (uniquePairs.size === 0) return [];

  const pairs = [...uniquePairs.values()];
  const activeJobs = await db
    .select({ credencialId: job.credencialId, type: job.type })
    .from(job)
    .where(
      and(
        inArray(
          job.credencialId,
          pairs.map((p) => p.credencialId)
        ),
        inArray(job.status, ['pending', 'running'])
      )
    );
  const activeSet = new Set(
    activeJobs.map((j) => `${j.credencialId}:${j.type}`)
  );

  return pairs.filter((p) => !activeSet.has(`${p.credencialId}:${p.type}`));
}

/** Los jobs a reintentar según el detalle de la alerta, ya deduplicados. */
async function jobsDeAlertas(
  detalles: (AlertaDetalle | null)[],
  orgId: string
): Promise<{ type: string; credencialId: string }[]> {
  const failedJobIds = detalles.flatMap((d) => d?.failedJobIds ?? []);
  if (failedJobIds.length === 0) return [];

  const jobsToRetry = await db
    .select({ type: job.type, credencialId: job.credencialId })
    .from(job)
    .where(and(inArray(job.id, failedJobIds), eq(job.orgId, orgId)));

  return dedupeRetryJobs(jobsToRetry);
}

export const retryAlertJobs = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async (ctx) => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const [alertRow] = await db
      .select({ detalle: sql<AlertaDetalle | null>`${alerta.detalle}` })
      .from(alerta)
      .where(and(eq(alerta.id, ctx.data.id), eq(alerta.orgId, orgId)))
      .limit(1);

    if (!alertRow) throw new Error('Alerta no encontrada');
    if (!alertRow.detalle?.retryable)
      throw new Error('Esta alerta no es reintentable');

    const jobs = await jobsDeAlertas([alertRow.detalle], orgId);
    if (jobs.length === 0)
      throw new Error('No se encontraron los jobs fallidos');

    await scrapperPost(`${JOBS_API_URL}/api/jobs/batch`, { jobs });

    const now = new Date();
    await db
      .update(alerta)
      .set({
        estado: 'resuelta',
        resueltaAt: now,
        resueltaPor: userId,
        updatedAt: now,
      })
      .where(eq(alerta.id, ctx.data.id));

    return { retried: jobs.length };
  });

export const retryAllRetryable = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { orgId, userId } = await getSessionWithOrg();
    const role = await getMemberRole();
    assertCanWrite(role);

    const abiertas = await db
      .select({
        id: alerta.id,
        detalle: sql<AlertaDetalle | null>`${alerta.detalle}`,
      })
      .from(alerta)
      .where(
        and(
          eq(alerta.orgId, orgId),
          eq(alerta.estado, 'abierta'),
          eq(alerta.tipo, 'error_scraping')
        )
      );

    const reintentables = abiertas.filter((a) => a.detalle?.retryable === true);
    if (reintentables.length === 0) return { retried: 0, resolved: 0 };

    const jobs = await jobsDeAlertas(
      reintentables.map((a) => a.detalle),
      orgId
    );
    if (jobs.length > 0) {
      await scrapperPost(`${JOBS_API_URL}/api/jobs/batch`, { jobs });
    }

    const now = new Date();
    await db
      .update(alerta)
      .set({
        estado: 'resuelta',
        resueltaAt: now,
        resueltaPor: userId,
        updatedAt: now,
      })
      .where(
        inArray(
          alerta.id,
          reintentables.map((a) => a.id)
        )
      );

    return { retried: jobs.length, resolved: reintentables.length };
  }
);
