/**
 * Crea la tabla data_source_event para audit trail de datos.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-data-source-event-table.ts
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

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "data_source_event" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE CASCADE,
      "entity_type" text NOT NULL,
      "entity_id" text NOT NULL,
      "source" text NOT NULL,
      "source_job_id" uuid REFERENCES "job"("id") ON DELETE SET NULL,
      "action" text NOT NULL,
      "metadata" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `));

  console.log('Tabla data_source_event: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
