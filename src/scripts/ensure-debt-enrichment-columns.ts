/**
 * Agrega columnas de enriquecimiento a la tabla debt.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-debt-enrichment-columns.ts
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

  const stmts = [
    `ALTER TABLE "debt" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'open'`,
    `ALTER TABLE "debt" ADD COLUMN IF NOT EXISTS "detected_at" timestamp NOT NULL DEFAULT now()`,
    `ALTER TABLE "debt" ADD COLUMN IF NOT EXISTS "source_period" text`,
    `ALTER TABLE "debt" ADD COLUMN IF NOT EXISTS "is_intimated" boolean NOT NULL DEFAULT false`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de enriquecimiento de debt: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
