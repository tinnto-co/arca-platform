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
 * Configurable por entorno:
 * - INFLATION_INDEX_CRON_INTERVAL_MS: intervalo entre corridas (default 24 h).
 * - INFLATION_INDEX_CRON_DISABLED: "1" para apagarlo.
 */
import {
  fetchFacpceSeries,
  upsertInflationIndexes,
} from '@/lib/inflation-index-source';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 día
/** Margen tras el arranque, para no competir con el boot del server. */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

export async function runInflationIndexSync(): Promise<void> {
  const { rows, skipped, url } = await fetchFacpceSeries();
  const { processed, from, to } = await upsertInflationIndexes(rows);
  console.log(
    `[inflation-index] serie actualizada desde ${url}: ${processed} meses (${from} → ${to})` +
      (skipped > 0 ? `, ${skipped} sin publicar` : '')
  );
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
