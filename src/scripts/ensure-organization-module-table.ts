/**
 * Crea la tabla organization_module para feature flags por organización.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-organization-module-table.ts
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
    CREATE TABLE IF NOT EXISTS "organization_module" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "module" text NOT NULL,
      "enabled" boolean NOT NULL DEFAULT false,
      "enabled_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL,
      UNIQUE ("organization_id", "module")
    )
  `)
  );

  console.log('Tabla organization_module: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
