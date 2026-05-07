/**
 * Asegura columna de obra social en liquidacion_import_empleado.
 * Idempotente: usa ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-empleado-obra-social-column.ts
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
    sql`ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "obra_social_id" uuid`
  );
  await db
    .execute(
      sql`ALTER TABLE "liquidacion_import_empleado" ADD CONSTRAINT "liquidacion_import_empleado_obra_social_id_obra_social_id_fk" FOREIGN KEY ("obra_social_id") REFERENCES "obra_social"("id") ON DELETE SET NULL`
    )
    .catch(() => {
      // Si ya existe la FK, ignorar error para mantener idempotencia.
    });

  console.log('Columna obra_social_id en liquidacion_import_empleado: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
