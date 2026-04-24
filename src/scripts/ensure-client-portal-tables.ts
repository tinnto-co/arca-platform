/**
 * Crea las tablas client_user_access y client_request para el portal de clientes.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-client-portal-tables.ts
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
    CREATE TABLE IF NOT EXISTS "client_user_access" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "role" text NOT NULL DEFAULT 'client_viewer',
      "can_upload_documents" boolean NOT NULL DEFAULT true,
      "can_view_debts" boolean NOT NULL DEFAULT true,
      "can_view_iva" boolean NOT NULL DEFAULT true,
      "can_view_payroll" boolean NOT NULL DEFAULT false,
      "can_chat_ai" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "client_user_access_client_id_user_id_unique" UNIQUE ("client_id", "user_id")
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "client_request" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "requested_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "title" text NOT NULL,
      "description" text,
      "type" text NOT NULL,
      "status" text NOT NULL DEFAULT 'open',
      "due_at" timestamp,
      "completed_at" timestamp,
      "metadata" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `));

  console.log('Tablas client_user_access y client_request: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
