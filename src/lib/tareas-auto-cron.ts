/**
 * Cron de auto-generación de tareas desde vencimientos ARCA.
 *
 * Los vencimientos ya están en la DB (scrapeados por el servicio ARCA).
 * Este cron los convierte automáticamente en tareas del kanban, una vez
 * por día a las 07:00 hora Argentina (10:00 UTC), para cada org activa.
 *
 * Es idempotente: si una tarea ya fue creada para un vencimiento (detectado
 * via vencimiento_id en tarea_cliente), se omite sin duplicar.
 *
 * Configurable por entorno:
 * - TAREAS_AUTO_CRON_DISABLED: "1" para desactivar.
 * - TAREAS_AUTO_CRON_HOUR_UTC: hora UTC de ejecución (default 10 = 07:00 AR).
 */
import { db } from '@/lib/db';
import { organization } from '@/drizzle/auth';
import {
  autoGenerarTareasParaOrg,
  getPeriodoActualAR,
} from '@/lib/tareas-batch';
import { runWithDbContext } from '../../lib/db-context';

/** Hora UTC en la que corre el cron (07:00 AR = 10:00 UTC). */
const TARGET_HOUR_UTC = Number(process.env.TAREAS_AUTO_CRON_HOUR_UTC ?? 10);

/** Ms hasta la próxima ejecución a TARGET_HOUR_UTC:00:00 UTC. */
function msHastaProximaEjecucion(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(TARGET_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function tick(): Promise<void> {
  const periodo = getPeriodoActualAR();
  console.log(`[tareas-auto] corriendo para período ${periodo}...`);

  let orgs: { id: string }[];
  try {
    orgs = await db.select({ id: organization.id }).from(organization);
  } catch (err) {
    console.error('[tareas-auto] error al obtener orgs:', err);
    return;
  }

  let totalCreadas = 0;

  for (const org of orgs) {
    try {
      // Sin request no hay contexto RLS: hay que abrirlo por org. Sin esto las
      // políticas devuelven cero filas y el cron termina «bien» sin crear nada.
      const result = await runWithDbContext({ orgId: org.id }, () =>
        autoGenerarTareasParaOrg(org.id, periodo)
      );
      if (result.creadas > 0 || result.sinCliente > 0) {
        console.log(
          `[tareas-auto] org=${org.id}: ${result.creadas} creadas, ` +
            `${result.omitidas} omitidas, ${result.sinCliente} sin cliente`
        );
      }
      totalCreadas += result.creadas;
    } catch (err) {
      console.error(`[tareas-auto] error en org=${org.id}:`, err);
    }
  }

  console.log(
    `[tareas-auto] finalizado: ${totalCreadas} tareas creadas en total`
  );

  // Programar siguiente ejecución
  setTimeout(() => {
    tick().catch(console.error);
  }, msHastaProximaEjecucion());
}

export function startTareasAutoCron(): void {
  if (process.env.TAREAS_AUTO_CRON_DISABLED === '1') {
    console.log('[tareas-auto] cron desactivado (TAREAS_AUTO_CRON_DISABLED=1)');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.log('[tareas-auto] DATABASE_URL no configurada — cron desactivado');
    return;
  }

  const delay = msHastaProximaEjecucion();
  const horas = Math.floor(delay / 1000 / 60 / 60);
  const minutos = Math.floor((delay / 1000 / 60) % 60);
  console.log(
    `[tareas-auto] cron activo: próxima ejecución en ${horas}h ${minutos}m ` +
      `(${TARGET_HOUR_UTC}:00 UTC = 07:00 AR)`
  );

  setTimeout(() => {
    tick().catch(console.error);
  }, delay);
}
