/**
 * Agrega columnas de completitud a la tabla due_date.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-due-date-completion-columns.ts
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
    `ALTER TABLE "due_date" ADD COLUMN IF NOT EXISTS "completed_at" timestamp`,
    `ALTER TABLE "due_date" ADD COLUMN IF NOT EXISTS "completed_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de completitud de due_date: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
