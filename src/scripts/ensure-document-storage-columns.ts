/**
 * Agrega columnas de metadatos de almacenamiento a la tabla document.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-document-storage-columns.ts
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
    `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "storage_provider" text NOT NULL DEFAULT 'external'`,
    `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "storage_key" text`,
    `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "mime_type" text`,
    `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "size_bytes" integer`,
    `ALTER TABLE "document" ADD COLUMN IF NOT EXISTS "checksum" text`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de almacenamiento de document: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
