/**
 * Cron del módulo de Balances: contabiliza periódicamente las facturas pendientes
 * (sin asiento). (UST4)
 *
 * Configurable por entorno:
 * - ACCOUNTING_BATCH_INTERVAL_MS: intervalo entre corridas (default 1 hora).
 * - ACCOUNTING_BATCH_SIZE: facturas por empresa por corrida (default 50).
 */
import { runPendingInvoiceBatch } from '@/lib/accounting-invoice-batch';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hora

export function startAccountingInvoiceCron(): void {
  if (!process.env.DATABASE_URL) {
    console.log(
      '[accounting-batch] DATABASE_URL no configurada — cron desactivado'
    );
    return;
  }
  const intervalMs = Number(
    process.env.ACCOUNTING_BATCH_INTERVAL_MS ?? DEFAULT_INTERVAL_MS
  );
  const batchSize = Number(process.env.ACCOUNTING_BATCH_SIZE ?? 50);

  console.log(
    `[accounting-batch] cron activo: cada ${Math.round(intervalMs / 1000)}s, ` +
      `lote de ${batchSize} facturas/empresa`
  );

  const tick = () => {
    runPendingInvoiceBatch({ batchSize }).catch((err) =>
      console.error('[accounting-batch] error en la corrida:', err)
    );
  };

  // No corremos al instante para no competir con el arranque del server.
  setInterval(tick, intervalMs);
}
