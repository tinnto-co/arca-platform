/**
 * Normaliza el nombre de todos los empleados a "Title Case":
 * - pone todo en minúscula
 * - capitaliza la primera letra de cada palabra
 * - preserva separadores como coma (ej: "PEREZ, JUAN" -> "Perez, Juan")
 *
 * Uso: bun run src/scripts/normalizar-nombres-empleados-title-case.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { liquidacionImportEmpleado } from '../../drizzle/schema';
import { eq } from 'drizzle-orm';

function toTitleCaseSegment(segment: string): string {
  return segment
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function normalizarNombre(raw: string): string {
  return raw
    .trim()
    .split(',')
    .map((segment) => toTitleCaseSegment(segment))
    .filter(Boolean)
    .join(', ');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const empleados = await db
    .select({ id: liquidacionImportEmpleado.id, nombre: liquidacionImportEmpleado.nombre })
    .from(liquidacionImportEmpleado);

  let updated = 0;
  for (const emp of empleados) {
    const original = (emp.nombre ?? '').trim();
    if (!original) continue;
    const normalizado = normalizarNombre(original);
    if (normalizado === original) continue;

    await db
      .update(liquidacionImportEmpleado)
      .set({ nombre: normalizado, updatedAt: new Date() })
      .where(eq(liquidacionImportEmpleado.id, emp.id));
    updated += 1;
  }

  console.log(`Empleados evaluados: ${empleados.length}`);
  console.log(`Empleados actualizados: ${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
