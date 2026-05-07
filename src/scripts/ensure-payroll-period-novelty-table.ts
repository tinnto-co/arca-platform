/**
 * Crea la tabla payroll_period_novelty para novedades mensuales de liquidación.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-payroll-period-novelty-table.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "payroll_period_novelty" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "empleado_id" uuid NOT NULL REFERENCES "liquidacion_import_empleado"("id") ON DELETE CASCADE,
      "periodo" text NOT NULL,
      "type" text NOT NULL,
      "quantity" numeric(10, 2),
      "amount" numeric(14, 2),
      "description" text,
      "applied_to_recibo_id" uuid REFERENCES "liquidacion_import_recibo"("id") ON DELETE SET NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );

  console.log('Tabla payroll_period_novelty: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
