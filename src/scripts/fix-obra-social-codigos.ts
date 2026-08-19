/**
 * Normaliza la columna `codigo` de `obra_social`:
 * extrae el código AFIP/RNOS del inicio del campo `nombre`
 * (formato: "905008 - NOMBRE DE LA OBRA SOCIAL") y lo pone en `codigo`.
 * El campo `nombre` no se modifica.
 *
 * Casos que maneja:
 *  - nombre empieza con 4-6 dígitos → ese es el código AFIP → actualiza `codigo`
 *  - nombre no tiene ese formato → log de advertencia, no toca la fila
 *  - el código AFIP extraído ya existe en otra fila → log de conflicto, no toca la fila
 *
 * Es idempotente: si `codigo` ya coincide con el extraído, no hace nada.
 *
 * Uso: bun run src/scripts/fix-obra-social-codigos.ts
 */
import { db } from '@/lib/db';
import { obraSocial } from '@/drizzle/schema';
import { ne, eq } from 'drizzle-orm';

async function main() {
  const rows = await db
    .select({ id: obraSocial.id, codigo: obraSocial.codigo, nombre: obraSocial.nombre })
    .from(obraSocial);

  console.log(`Total filas: ${rows.length}`);

  // Índice de códigos existentes para detectar conflictos antes de actualizar
  const codigosPorId = new Map(rows.map((r) => [r.id, r.codigo]));
  const codigosUsados = new Map(rows.map((r) => [r.codigo, r.id]));

  let updated = 0;
  let skippedNoMatch = 0;
  let skippedYaCorrecto = 0;
  let skippedConflicto = 0;

  for (const row of rows) {
    // Extraer código AFIP del inicio del nombre (4-6 dígitos seguidos de espacio o guion)
    const match = /^(\d{4,6})\s*[-\s]/.exec(row.nombre);
    if (!match) {
      console.warn(`  ⚠ Sin código AFIP en nombre (id=${row.id}): "${row.nombre.slice(0, 60)}"`);
      skippedNoMatch++;
      continue;
    }

    const codigoAfip = match[1];

    if (codigoAfip === row.codigo) {
      skippedYaCorrecto++;
      continue;
    }

    // Verificar que el código AFIP extraído no esté ya asignado a OTRA fila
    const filaConflicto = codigosUsados.get(codigoAfip);
    if (filaConflicto && filaConflicto !== row.id) {
      console.warn(
        `  ⚠ Conflicto: código "${codigoAfip}" ya existe en otra fila (id=${filaConflicto}). Saltando id=${row.id}.`
      );
      skippedConflicto++;
      continue;
    }

    await db
      .update(obraSocial)
      .set({ codigo: codigoAfip })
      .where(eq(obraSocial.id, row.id));

    // Actualizar índice local para detectar conflictos en filas siguientes
    codigosUsados.delete(row.codigo);
    codigosUsados.set(codigoAfip, row.id);

    console.log(`  ✓ ${row.codigo} → ${codigoAfip}  |  ${row.nombre.slice(0, 50)}`);
    updated++;
  }

  console.log(`\nResumen:`);
  console.log(`  Actualizados:         ${updated}`);
  console.log(`  Ya correctos:         ${skippedYaCorrecto}`);
  console.log(`  Sin código en nombre: ${skippedNoMatch}`);
  console.log(`  Conflicto de código:  ${skippedConflicto}`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
