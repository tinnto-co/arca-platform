/**
 * Agrega columnas de enriquecimiento a la tabla notification.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-notification-enrichment-columns.ts
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
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "severity" text NOT NULL DEFAULT 'unclassified'`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "category" text`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "ai_summary" text`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "ai_classified_at" timestamp`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "assigned_to_user_id" text REFERENCES "user"("id") ON DELETE SET NULL`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "resolved_at" timestamp`,
    `ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "resolved_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS "idx_notification_severity" ON "notification" ("client_id", "severity")`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de enriquecimiento de notification: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
