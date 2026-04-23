import 'dotenv/config';
import axios from 'axios';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { client } from '@/drizzle/schema';

const JOBS_API_URL =
  process.env.SCRAPPER_JOBS_URL ||
  process.env.BACKEND_API_URL ||
  'http://localhost:3002';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 300; // ~15 min por job

type JobType = 'comprobantes_full' | 'iva';
type JobState = 'pending' | 'running' | 'failed' | 'finished';

interface JobApiResponse {
  id: string;
  status: JobState;
  result?: unknown;
  failedReason?: string | null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readArgValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function waitForJob(jobId: string): Promise<JobApiResponse> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const { data } = await axios.get<JobApiResponse>(
      `${JOBS_API_URL}/api/jobs/${jobId}`
    );
    if (data.status === 'finished' || data.status === 'failed') {
      return data;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Tiempo de espera agotado para el job ${jobId}`);
}

async function runJobForClient(
  clientId: string,
  jobType: JobType
): Promise<void> {
  const { data: createdJob } = await axios.post<{ id: string }>(
    `${JOBS_API_URL}/api/jobs`,
    {
      type: jobType,
      clientId,
    }
  );

  const result = await waitForJob(createdJob.id);
  if (result.status === 'failed') {
    throw new Error(result.failedReason || `Error en job ${jobType}`);
  }
}

async function main() {
  const runIva = hasFlag('--with-iva');
  const onlyClientId = readArgValue('--client-id');

  if (!process.env.DATABASE_URL) {
    throw new Error('Falta DATABASE_URL en el entorno.');
  }

  console.log('[rebuild-client-invoices] Iniciando proceso secuencial...');
  console.log(`[rebuild-client-invoices] Jobs API: ${JOBS_API_URL}`);
  console.log(
    `[rebuild-client-invoices] Modo jobs: ${
      runIva ? 'comprobantes_full + iva' : 'solo comprobantes_full'
    }`
  );

  const clients = onlyClientId
    ? await db
        .select({ id: client.id, name: client.name })
        .from(client)
        .where(sql`${client.id} = ${onlyClientId}`)
        .orderBy(client.createdAt)
    : await db
        .select({ id: client.id, name: client.name })
        .from(client)
        .orderBy(client.createdAt);

  if (clients.length === 0) {
    console.log('[rebuild-client-invoices] No hay clientes para procesar.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < clients.length; i++) {
    const current = clients[i];
    const prefix = `[${i + 1}/${clients.length}] ${current.name} (${current.id})`;
    console.log(`${prefix} -> iniciando`);

    try {
      // SQL pedido: DELETE FROM invoice WHERE client_id = '...'
      await db.execute(
        sql`DELETE FROM invoice WHERE client_id = ${current.id}`
      );
      console.log(`${prefix} -> invoices borrados`);

      await runJobForClient(current.id, 'comprobantes_full');
      console.log(`${prefix} -> job comprobantes_full OK`);

      if (runIva) {
        await runJobForClient(current.id, 'iva');
        console.log(`${prefix} -> job iva OK`);
      }

      ok++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${prefix} -> ERROR: ${message}`);
    }
  }

  console.log(
    `[rebuild-client-invoices] Finalizado. Exitosos: ${ok}. Con error: ${failed}. Total: ${clients.length}.`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[rebuild-client-invoices] Error fatal:', message);
  process.exit(1);
});
