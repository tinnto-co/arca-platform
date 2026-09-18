/**
 * Despachar un job al scrapper y esperar a que termine.
 *
 * Es el mismo patrón que usan los botones de actualizar de la ficha
 * (`scrapSingleJob` en `src/actions/client.tsx`, que tiene su propia copia):
 * se encola el job, se lo sigue hasta `finished`/`failed` y el error del
 * scrapper llega ya traducido por `scrapper-api` (candado SCRAPING_PAUSED
 * incluido). Vive acá para que lo puedan usar otros módulos sin arrastrar
 * `client.tsx`, que es un archivo de server functions.
 *
 * Solo servidor: importa `db` y habla con la API interna del scrapper.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { job } from '@/drizzle/schema';
import { scrapperGet, scrapperPost } from '@/lib/scrapper-api';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ??
  process.env.BACKEND_API_URL ??
  'http://localhost:3002';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 300; // ~15 minutos, el techo de un job

type TipoJob = (typeof job.type.enumValues)[number];

/**
 * Encola el job (o reusa el que ya está en curso para esa credencial y tipo:
 * un scrape cubre todas las empresas del login) y espera el resultado.
 */
export async function despacharJobYEsperar(
  tipo: TipoJob,
  credencialId: string,
  orgId: string
): Promise<{ jobId: string; result: unknown }> {
  const [enCurso] = await db
    .select({ id: job.id })
    .from(job)
    .where(
      and(
        eq(job.credencialId, credencialId),
        eq(job.type, tipo),
        inArray(job.status, ['pending', 'running'])
      )
    )
    .limit(1);

  let jobId: string;
  if (enCurso) {
    jobId = enCurso.id;
  } else {
    const creado = await scrapperPost<{ id: string }>(
      `${JOBS_API_URL}/api/jobs`,
      { type: tipo, credencialId }
    );
    jobId = creado.id;
  }

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const data = await scrapperGet<{
      status: string;
      result?: unknown;
      failedReason?: string | null;
    }>(`${JOBS_API_URL}/api/jobs/${jobId}?orgId=${encodeURIComponent(orgId)}`);

    if (data.status === 'failed') {
      throw new Error(
        data.failedReason ?? `La actualización de ${tipo} falló en el scrapper`
      );
    }
    if (data.status === 'finished') return { jobId, result: data.result ?? {} };

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(
    'La actualización está tardando más de lo normal. Se sigue procesando: volvé a mirar en unos minutos.'
  );
}
