/**
 * Actualiza fecha_ingreso en liquidacion_import_empleado
 * desde el CSV scrapeado de SOS Contador (Legajos).
 *
 * Columna: txfechaingreso_legajo ("Fecha de Ingreso (legajo)")
 * Clave de match: client.identity_number (CUIT) + empleado.cuil
 *
 * Uso: bun src/scripts/update-fecha-ingreso.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from '@/lib/db';
import { liquidacionImportEmpleado, client } from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';

const csvPath = join(import.meta.dir, 'fecha-ingreso-sos.csv');
const lines = readFileSync(csvPath, 'utf-8').trim().split('\n').slice(1); // skip header

// Parse DD/MM/YYYY → Date
function parseDate(str: string): Date | null {
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
}

// Load all clients (identity_number → id) once
const clients = await db.select({ id: client.id, cuit: client.identityNumber }).from(client);
const cuitToClientId = new Map(clients.map(c => [c.cuit, c.id]));

let updated = 0;
let notFound = 0;
let skipped = 0;

for (const line of lines) {
  const [cuit, cuil, fechaStr] = line.trim().split(',');
  if (!cuit || !cuil || !fechaStr) continue;

  const clientId = cuitToClientId.get(cuit);
  if (!clientId) {
    console.log(`⚠️  Cliente no encontrado: CUIT ${cuit}`);
    notFound++;
    continue;
  }

  const fecha = parseDate(fechaStr);
  if (!fecha) {
    console.log(`⚠️  Fecha inválida: ${fechaStr} para CUIL ${cuil}`);
    skipped++;
    continue;
  }

  const result = await db
    .update(liquidacionImportEmpleado)
    .set({ fechaIngreso: fecha })
    .where(
      and(
        eq(liquidacionImportEmpleado.clientId, clientId),
        eq(liquidacionImportEmpleado.cuil, cuil),
      )
    )
    .returning({ id: liquidacionImportEmpleado.id, nombre: liquidacionImportEmpleado.nombre });

  if (result.length === 0) {
    console.log(`⚠️  Empleado no encontrado: CUIT ${cuit}, CUIL ${cuil}`);
    notFound++;
  } else {
    console.log(`✓  ${result[0].nombre} (CUIL ${cuil}) → ${fechaStr}`);
    updated++;
  }
}

console.log(`\n✅ Completado: ${updated} actualizados, ${notFound} no encontrados, ${skipped} saltados`);
