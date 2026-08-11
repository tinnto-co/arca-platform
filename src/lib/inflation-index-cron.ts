/**
 * Cron de la serie de índices para el ajuste por inflación (RT 6).
 *
 * FACPCE publica el índice de cada mes a mediados del mes siguiente. Sin esto,
 * alguien tiene que acordarse de correr `db:seed-inflation-index` y, si no lo
 * hace, el primer cierre que necesite ese mes se frena.
 *
 * El chequeo es barato (una descarga de ~25 KB) y el upsert solo toca lo que
 * cambió, así que corre una vez por día en vez de intentar adivinar el día
 * exacto de publicación: si el mes ya está cargado, no hace nada.
 *
 * Corriendo a diario, 29 de cada 30 corridas no traen novedad. Por eso solo
 * loguea cuando aparece un mes nuevo: si informara cada corrida, el día que
 * realmente pasa algo quedaría enterrado entre avisos de que no pasó nada.
 *
 * Configurable por entorno:
 * - INFLATION_INDEX_CRON_INTERVAL_MS: intervalo entre corridas (default 24 h).
 * - INFLATION_INDEX_CRON_DISABLED: "1" para apagarlo.
 */
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { indiceInflacion } from '@/drizzle/schema';
import {
  fetchFacpceSeries,
  upsertInflationIndexes,
} from '@/lib/inflation-index-source';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 día
/** Margen tras el arranque, para no competir con el boot del server. */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

/** Último mes con índice publicado, como "AAAA-MM". null si la serie está vacía. */
async function latestPeriod(): Promise<string | null> {
  const [row] = await db
    .select({ year: indiceInflacion.anio, month: indiceInflacion.mes })
    .from(indiceInflacion)
    .where(eq(indiceInflacion.fuente, 'facpce_rt6'))
    .orderBy(desc(indiceInflacion.anio), desc(indiceInflacion.mes))
    .limit(1);
  return row ? `${row.year}-${String(row.month).padStart(2, '0')}` : null;
}

/**
 * Sincroniza la serie. Devuelve el mes nuevo si apareció uno, o null si no hubo
 * novedad.
 *
 * Las revisiones de meses anteriores (FACPCE a veces corrige) se aplican igual,
 * en silencio: el dato queda bien, simplemente no se anuncia.
 */
export async function runInflationIndexSync(): Promise<string | null> {
  const before = await latestPeriod();
  const { rows, skipped, url } = await fetchFacpceSeries();
  const { processed } = await upsertInflationIndexes(rows);
  const after = await latestPeriod();

  if (after && after !== before) {
    console.log(
      `[inflation-index] nuevo índice: ${after} (serie de ${processed} meses desde ${url})` +
        (skipped > 0 ? `, ${skipped} mes(es) sin publicar` : '')
    );
    return after;
  }
  return null;
}

export function startInflationIndexCron(): void {
  if (!process.env.DATABASE_URL) {
    console.log(
      '[inflation-index] DATABASE_URL no configurada — cron desactivado'
    );
    return;
  }
  if (process.env.INFLATION_INDEX_CRON_DISABLED === '1') {
    console.log('[inflation-index] cron desactivado por configuración');
    return;
  }

  const intervalMs = Number(
    process.env.INFLATION_INDEX_CRON_INTERVAL_MS ?? DEFAULT_INTERVAL_MS
  );
  console.log(
    `[inflation-index] cron activo: cada ${Math.round(intervalMs / 3600000)}h`
  );

  const tick = () => {
    runInflationIndexSync().catch((err) =>
      // Que FACPCE esté caído o cambie la página no puede tumbar el server: la
      // serie sigue cargable a mano desde la solapa «Índices».
      console.error('[inflation-index] error en la corrida:', err)
    );
  };

  setTimeout(tick, FIRST_RUN_DELAY_MS);
  setInterval(tick, intervalMs);
}
