/**
 * Crea la tabla employee_event para historial del legajo de empleados.
 * Idempotente: usa CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-employee-event-table.ts
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
    CREATE TABLE IF NOT EXISTS "employee_event" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "empleado_id" uuid NOT NULL REFERENCES "liquidacion_import_empleado"("id") ON DELETE CASCADE,
      "type" text NOT NULL,
      "title" text NOT NULL,
      "description" text,
      "event_date" timestamp NOT NULL,
      "affects_payroll" boolean NOT NULL DEFAULT false,
      "metadata" jsonb,
      "created_by_user_id" text REFERENCES "user"("id") ON DELETE SET NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `)
  );

  console.log('Tabla employee_event: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
