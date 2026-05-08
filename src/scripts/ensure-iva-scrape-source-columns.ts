/**
 * Agrega columnas de origen/confianza a la tabla iva_scrape.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-iva-scrape-source-columns.ts
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
    `ALTER TABLE "iva_scrape" ADD COLUMN IF NOT EXISTS "source_confidence" text NOT NULL DEFAULT 'unknown'`,
    `ALTER TABLE "iva_scrape" ADD COLUMN IF NOT EXISTS "imported_manually" boolean NOT NULL DEFAULT false`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de origen de iva_scrape: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
