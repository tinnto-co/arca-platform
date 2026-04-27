/**
 * Agrega la columna fecha_antiguedad_reconocida a liquidacion_import_empleado.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-fecha-antiguedad-reconocida.ts
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
    sql.raw(
      `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "fecha_antiguedad_reconocida" timestamp`
    )
  );

  console.log(
    'Columna fecha_antiguedad_reconocida en liquidacion_import_empleado: OK.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
