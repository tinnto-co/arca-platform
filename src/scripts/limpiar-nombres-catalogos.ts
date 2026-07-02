/**
 * Script: limpiar-nombres-catalogos.ts
 *
 * Elimina el prefijo "código - " del campo `nombre` en los catálogos que lo tienen
 * embebido: payroll_modalidad_contratacion, payroll_zona, payroll_actividad.
 *
 * Antes: nombre = "8 - A Tiempo Indeterminado", codigo = "8"
 * Después: nombre = "A Tiempo Indeterminado",   codigo = "8"  (sin cambios)
 *
 * Solo toca filas donde el nombre empieza con el patrón "dígitos - ".
 * Idempotente: si ya está limpio, no hace nada.
 */

import { db } from "@/lib/db";
import {
  payrollModalidadContratacion,
  payrollZona,
  payrollActividad,
} from "@/drizzle/schema";
import { eq } from "drizzle-orm";

const PATRON = /^\d+\s*[-–]\s*/;

async function limpiarTabla(
  tabla: typeof payrollModalidadContratacion,
  label: string
) {
  // @ts-expect-error generic drizzle call
  const rows = await db.select({ id: tabla.id, codigo: tabla.codigo, nombre: tabla.nombre }).from(tabla);

  let actualizados = 0;
  let sinCambios = 0;

  for (const row of rows) {
    const nombreLimpio = row.nombre.replace(PATRON, "").trim();
    if (nombreLimpio === row.nombre) {
      sinCambios++;
      continue;
    }
    // @ts-expect-error generic drizzle call
    await db.update(tabla).set({ nombre: nombreLimpio }).where(eq(tabla.id, row.id));
    console.log(`  [${label}] "${row.nombre}" → "${nombreLimpio}"`);
    actualizados++;
  }

  console.log(`  ${label}: ${actualizados} actualizados, ${sinCambios} sin cambios\n`);
}

console.log("Limpiando nombres de catálogos...\n");

await limpiarTabla(payrollModalidadContratacion, "Modalidad");
await limpiarTabla(payrollZona, "Zona");
await limpiarTabla(payrollActividad, "Actividad");

console.log("Listo.");
process.exit(0);
