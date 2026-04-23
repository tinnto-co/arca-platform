/**
 * Marca todos los empleados como activos en toda la base:
 * - activo = true
 * - fecha_baja = NULL
 *
 * Uso: bun run src/scripts/activar-todos-empleados.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { liquidacionImportEmpleado } from '../../drizzle/schema';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const result = await db
    .update(liquidacionImportEmpleado)
    .set({
      activo: true,
      fechaBaja: null,
      updatedAt: new Date(),
    })
    .returning({ id: liquidacionImportEmpleado.id });

  console.log(`Empleados activados: ${result.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
