/**
 * Crea la tabla client_balance_config para configuración de cierre de ejercicio por cliente.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-client-balance-config-table.ts
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
    CREATE TABLE IF NOT EXISTS "client_balance_config" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL UNIQUE REFERENCES "client"("id") ON DELETE CASCADE,
      "fiscal_year_end_month" integer NOT NULL,
      "fiscal_year_end_day" integer NOT NULL,
      "presentation_due_days" integer,
      "alert_days_before" jsonb DEFAULT '[60,30,15,7]'::jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );

  console.log('Tabla client_balance_config: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
