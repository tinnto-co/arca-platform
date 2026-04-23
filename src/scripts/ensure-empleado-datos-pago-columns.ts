/**
 * Asegura columnas de datos de pago en liquidacion_import_empleado (migración 0015).
 * Idempotente: usa ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-empleado-datos-pago-columns.ts
 * Requiere DATABASE_URL en el entorno (mismo que la app).
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
    sql`ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "lugar_pago" text`
  );
  await db.execute(
    sql`ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "forma_pago" text`
  );
  await db.execute(
    sql`ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "cbu" text`
  );
  await db.execute(
    sql`ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "banco" text`
  );
  console.log('Columnas lugar_pago, forma_pago, cbu, banco: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
