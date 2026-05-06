/**
 * Crea las tablas de contabilidad:
 *   accounting_account, journal_entry, journal_entry_line
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-accounting-tables.ts
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
    CREATE TABLE IF NOT EXISTS "accounting_account" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "code" text NOT NULL,
      "name" text NOT NULL,
      "type" text NOT NULL,
      "parent_id" uuid REFERENCES "accounting_account"("id") ON DELETE SET NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "accounting_account_client_id_code_unique" UNIQUE ("client_id", "code")
    )
  `)
  );
  console.log('Tabla accounting_account: OK.');

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "journal_entry" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "entry_date" timestamp NOT NULL,
      "description" text,
      "source_type" text,
      "source_id" uuid,
      "status" text NOT NULL DEFAULT 'draft',
      "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );
  console.log('Tabla journal_entry: OK.');

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "journal_entry_line" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "journal_entry_id" uuid NOT NULL REFERENCES "journal_entry"("id") ON DELETE CASCADE,
      "account_id" uuid NOT NULL REFERENCES "accounting_account"("id") ON DELETE RESTRICT,
      "debit" numeric(14,2) NOT NULL DEFAULT 0,
      "credit" numeric(14,2) NOT NULL DEFAULT 0,
      "description" text
    )
  `)
  );
  console.log('Tabla journal_entry_line: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
