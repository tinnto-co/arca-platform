/**
 * Crea las tablas de conciliación bancaria:
 *   bank_account, bank_transaction, bank_invoice_match, financial_movement_classification
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-bank-reconciliation-tables.ts
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
    CREATE TABLE IF NOT EXISTS "bank_account" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "bank_name" text NOT NULL,
      "account_number" text,
      "currency" text NOT NULL DEFAULT 'ARS',
      "alias" text,
      "cbu" text,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );
  console.log('Tabla bank_account: OK.');

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "bank_transaction" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "bank_account_id" uuid NOT NULL REFERENCES "bank_account"("id") ON DELETE CASCADE,
      "transaction_date" timestamp NOT NULL,
      "description" text,
      "amount" numeric(14,2) NOT NULL,
      "direction" text NOT NULL,
      "counterparty_name" text,
      "counterparty_identity_number" text,
      "external_id" text,
      "raw_data" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );
  console.log('Tabla bank_transaction: OK.');

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "bank_invoice_match" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "bank_transaction_id" uuid NOT NULL REFERENCES "bank_transaction"("id") ON DELETE CASCADE,
      "invoice_id" uuid NOT NULL REFERENCES "invoice"("id") ON DELETE CASCADE,
      "match_type" text NOT NULL,
      "confidence" numeric(5,2),
      "reviewed_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "reviewed_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );
  console.log('Tabla bank_invoice_match: OK.');

  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS "financial_movement_classification" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "source_type" text NOT NULL,
      "source_id" uuid NOT NULL,
      "client_id" uuid NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "category" text NOT NULL,
      "is_business_related" boolean NOT NULL DEFAULT true,
      "is_tax_relevant" boolean NOT NULL DEFAULT true,
      "is_cashflow_real" boolean NOT NULL DEFAULT true,
      "notes" text,
      "classified_by" text NOT NULL DEFAULT 'system',
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );
  console.log('Tabla financial_movement_classification: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
