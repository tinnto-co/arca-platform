/**
 * Corre el job batch de contabilización de facturas pendientes una vez. (UST4)
 *
 * Uso:
 *   bun run src/scripts/run-invoice-batch.ts [batchSize] [--dry]
 *
 * Pensado para invocarse manualmente o desde un scheduler externo (cron del SO,
 * k8s CronJob, etc.). El cron in-process vive en src/lib/accounting-cron.ts.
 */
import { runPendingInvoiceBatch } from '@/lib/accounting-invoice-batch';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const sizeArg = args.find((a) => /^\d+$/.test(a));
const batchSize = sizeArg ? Number(sizeArg) : undefined;

const result = await runPendingInvoiceBatch({ batchSize, dryRun });
console.log(JSON.stringify(result, null, 2));
process.exit(0);
