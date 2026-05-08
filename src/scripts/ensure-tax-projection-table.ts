/**
 * Crea la tabla tax_projection para proyecciones de impuestos estimadas vs reales por perfil.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-tax-projection-table.ts
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
    CREATE TABLE IF NOT EXISTS "tax_projection" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "profile_id" uuid NOT NULL REFERENCES "profile"("id") ON DELETE CASCADE,
      "period" text NOT NULL,
      "tax" text NOT NULL,
      "projected_amount" numeric(14, 2) NOT NULL,
      "confidence" text,
      "factors" jsonb,
      "generated_at" timestamp DEFAULT now() NOT NULL,
      CONSTRAINT "tax_projection_profile_id_period_tax_unique" UNIQUE ("profile_id", "period", "tax")
    )
  `)
  );

  console.log('Tabla tax_projection: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
