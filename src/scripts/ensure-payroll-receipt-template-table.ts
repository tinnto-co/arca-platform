/**
 * Crea la tabla payroll_receipt_template para templates de recibos reutilizables.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-payroll-receipt-template-table.ts
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
    CREATE TABLE IF NOT EXISTS "payroll_receipt_template" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "profile_id" uuid NOT NULL REFERENCES "profile"("id") ON DELETE CASCADE,
      "name" text NOT NULL,
      "receipt_type" text NOT NULL DEFAULT 'sueldo',
      "concept_ids" jsonb,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );

  console.log('Tabla payroll_receipt_template: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
