/**
 * Crea la tabla asiento_template para templates/presets de asientos reutilizables.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-asiento-template-table.ts
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
    CREATE TABLE IF NOT EXISTS "asiento_template" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "org_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "cliente_id" uuid NOT NULL REFERENCES "cliente"("id") ON DELETE CASCADE,
      "nombre" text NOT NULL,
      "lineas" jsonb NOT NULL DEFAULT '[]',
      "creado_en" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "asiento_template_cliente_id_nombre_key" UNIQUE ("cliente_id", "nombre")
    )
  `));
  console.log('Tabla asiento_template: OK.');

  await db.execute(sql.raw(`
    CREATE INDEX IF NOT EXISTS "idx_asiento_template_cliente"
    ON "asiento_template" ("cliente_id")
  `));
  console.log('Índice idx_asiento_template_cliente: OK.');

  await db.execute(sql.raw(`
    ALTER TABLE "asiento_template" ENABLE ROW LEVEL SECURITY
  `));

  await db.execute(sql.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'asiento_template' AND policyname = 'tenant'
      ) THEN
        CREATE POLICY "tenant" ON "asiento_template"
          AS PERMISSIVE FOR ALL
          TO arca_app, arca_agent
          USING (org_id = current_setting('app.org_id', true))
          WITH CHECK (org_id = current_setting('app.org_id', true));
      END IF;
    END $$
  `));
  console.log('RLS asiento_template: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
