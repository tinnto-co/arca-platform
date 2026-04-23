import 'dotenv/config';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { client, job } from '@/drizzle/schema';

type TrackedJobType =
  | 'comprobantes'
  | 'iva'
  | 'deuda'
  | 'notificaciones'
  | 'vencimientos';

const TRACKED_JOB_TYPES: TrackedJobType[] = [
  'comprobantes',
  'iva',
  'deuda',
  'notificaciones',
  'vencimientos',
];

const JOB_LABELS: Record<TrackedJobType, string> = {
  comprobantes: 'comprobantes',
  iva: 'iva',
  deuda: 'deuda',
  notificaciones: 'notificaciones',
  vencimientos: 'vencimientos',
};

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function getLastJobForType(clientId: string, type: TrackedJobType) {
  const [lastJob] = await db
    .select({
      id: job.id,
      type: job.type,
      status: job.status,
      failedReason: job.failedReason,
      createdAt: job.createdAt,
    })
    .from(job)
    .where(and(eq(job.clientId, clientId), eq(job.type, type)))
    .orderBy(desc(job.createdAt))
    .limit(1);

  return lastJob ?? null;
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const now = new Date();

  console.log(
    `[sync-client-job-errors] Iniciando (${dryRun ? 'DRY RUN' : 'WRITE'}) @ ${now.toISOString()}`
  );

  const clients = await db
    .select({
      id: client.id,
      name: client.name,
      hasErrors: client.hasErrors,
      errorMessage: client.errorMessage,
    })
    .from(client)
    .orderBy(client.createdAt);

  if (clients.length === 0) {
    console.log('[sync-client-job-errors] No hay clientes para procesar.');
    return;
  }

  let clientsWithErrors = 0;
  let clientsWithoutErrors = 0;
  let rowsUpdated = 0;

  for (let i = 0; i < clients.length; i++) {
    const current = clients[i];
    const prefix = `[${i + 1}/${clients.length}] ${current.name} (${current.id})`;
    const failedTypes: string[] = [];

    for (const type of TRACKED_JOB_TYPES) {
      // Si nunca hubo job de este tipo, NO cuenta como error (se omite).
      const lastJob = await getLastJobForType(current.id, type);
      if (!lastJob) continue;

      if (lastJob.status === 'failed' || lastJob.failedReason) {
        failedTypes.push(JOB_LABELS[type]);
      }
    }

    const hasErrors = failedTypes.length > 0;
    const errorMessage = hasErrors
      ? `Jobs fallidos: ${failedTypes.join(', ')}`
      : '';

    const changed =
      current.hasErrors !== hasErrors ||
      (current.errorMessage ?? '') !== errorMessage;

    if (hasErrors) {
      clientsWithErrors++;
    } else {
      clientsWithoutErrors++;
    }

    if (!changed) {
      console.log(`${prefix} -> sin cambios`);
      continue;
    }

    if (dryRun) {
      console.log(
        `${prefix} -> update pendiente: hasErrors=${hasErrors}, errorMessage="${errorMessage}"`
      );
      continue;
    }

    await db
      .update(client)
      .set({
        hasErrors,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(client.id, current.id));

    rowsUpdated++;
    console.log(
      `${prefix} -> actualizado: hasErrors=${hasErrors}, errorMessage="${errorMessage}"`
    );
  }

  console.log(
    `[sync-client-job-errors] Fin. Total=${clients.length}, conError=${clientsWithErrors}, sinError=${clientsWithoutErrors}, actualizados=${rowsUpdated}, modo=${dryRun ? 'dry-run' : 'write'}`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[sync-client-job-errors] Error fatal:', message);
  process.exit(1);
});
