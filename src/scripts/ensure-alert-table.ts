/**
 * Crea la tabla alert para alertas centralizadas de riesgos.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-alert-table.ts
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
    CREATE TABLE IF NOT EXISTS "alert" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "type" text NOT NULL,
      "severity" text NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "source_entity_type" text,
      "source_entity_id" text,
      "status" text NOT NULL DEFAULT 'open',
      "assigned_to_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "due_at" timestamp,
      "resolved_at" timestamp,
      "resolved_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "metadata" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `));

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS "idx_alert_org_status" ON "alert" ("organization_id", "status")
  `));

  console.log('Tabla alert: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
