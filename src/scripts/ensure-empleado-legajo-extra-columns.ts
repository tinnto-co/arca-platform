/**
 * Agrega columnas de legajo extendido en liquidacion_import_empleado.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-empleado-legajo-extra-columns.ts
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
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "nacionalidad" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "fecha_nacimiento" date`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "conyuge" integer`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "hijos" integer`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "adherentes" integer`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "sexo" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "domicilio" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "localidad" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_postal" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "provincia" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_modalidad_contratacion" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "situacion" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_situacion" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "zona" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_zona" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "condicion" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_condicion" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "actividad" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_actividad" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "siniestrado" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "codigo_siniestrado" text`,
    `ALTER TABLE "liquidacion_import_empleado" ADD COLUMN IF NOT EXISTS "observaciones" text`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas extendidas de legajo: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
