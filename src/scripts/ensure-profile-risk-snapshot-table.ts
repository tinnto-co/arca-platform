/**
 * Crea la tabla profile_risk_snapshot para snapshots periódicos de riesgo por perfil.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-profile-risk-snapshot-table.ts
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
    CREATE TABLE IF NOT EXISTS "profile_risk_snapshot" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "profile_id" uuid NOT NULL REFERENCES "profile"("id") ON DELETE CASCADE,
      "period" text NOT NULL,
      "score" numeric(5, 2) NOT NULL,
      "risk_level" text NOT NULL,
      "factors" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "profile_risk_snapshot_profile_id_period_unique" UNIQUE ("profile_id", "period")
    )
  `)
  );

  console.log('Tabla profile_risk_snapshot: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
