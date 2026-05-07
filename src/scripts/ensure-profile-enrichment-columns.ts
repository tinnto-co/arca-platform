/**
 * Agrega columnas de enriquecimiento al perfil fiscal (profile).
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-profile-enrichment-columns.ts
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
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "managed_by_study" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "disabled_reason" text`,
    `ALTER TABLE "profile" ADD COLUMN IF NOT EXISTS "profile_type" text NOT NULL DEFAULT 'unknown'`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de enriquecimiento de perfil: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
