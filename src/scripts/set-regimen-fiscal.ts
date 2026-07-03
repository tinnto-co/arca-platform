/**
 * Actualiza los flags convenio_multilateral y regimen_local en la tabla representative
 * basándose en las facturas outbound importadas.
 *
 * Solo toca empresas con clasificación de ALTA confianza:
 *   MULTILATERAL → > 1 provincia distinta con receipt_province
 *   LOCAL        → exactamente 1 provincia distinta, con ≥ 3 facturas con provincia
 *
 * NO toca empresas SIN DATOS ni de BAJA CONFIANZA (< 3 facturas con provincia).
 *
 * Uso: bun run src/scripts/set-regimen-fiscal.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const log = (s = '') => console.log(s);

// ─── Query: misma lógica que analyze-regimen-fiscal ─────────────────────────

const rows = await sql.unsafe(`
  SELECT
    r.id,
    r.name,
    r.cuit,
    r.convenio_multilateral,
    r.regimen_local,
    COUNT(i.id) FILTER (WHERE lower(i.direction) = 'outbound' AND i.receipt_province IS NOT NULL AND i.receipt_province != 'sin datos') AS outbound_con_provincia,
    COUNT(DISTINCT i.receipt_province) FILTER (WHERE lower(i.direction) = 'outbound' AND i.receipt_province IS NOT NULL AND i.receipt_province != 'sin datos') AS provincias_distintas
  FROM representative r
  LEFT JOIN invoice i ON i.representative_id = r.id
  GROUP BY r.id, r.name, r.cuit, r.convenio_multilateral, r.regimen_local
`);

// ─── Clasificar ──────────────────────────────────────────────────────────────

const toMultilateral: typeof rows = [];
const toLocal: typeof rows       = [];
const skipped: typeof rows       = [];

for (const row of rows) {
  const distintas = Number(row.provincias_distintas);
  const conProv   = Number(row.outbound_con_provincia);

  if (distintas > 1) {
    toMultilateral.push(row);
  } else if (distintas === 1 && conProv >= 3) {
    toLocal.push(row);
  } else {
    skipped.push(row);
  }
}

// ─── Preview ─────────────────────────────────────────────────────────────────

log('');
log('══════════════════════════════════════════════════════════════════════');
log('  SET RÉGIMEN FISCAL — PREVIEW');
log(`  Generado: ${new Date().toLocaleString('es-AR')}`);
log('══════════════════════════════════════════════════════════════════════');
log('');
log(`  Marcar como MULTILATERAL : ${toMultilateral.length} empresas`);
log(`  Marcar como LOCAL        : ${toLocal.length} empresas`);
log(`  Omitir (sin datos/baja conf): ${skipped.length} empresas`);
log('');

// ─── Ejecutar updates ────────────────────────────────────────────────────────

log('▶ Actualizando MULTILATERAL...');
let updatedMultilateral = 0;
for (const row of toMultilateral) {
  await sql`
    UPDATE representative
    SET convenio_multilateral = true, regimen_local = false
    WHERE id = ${row.id as string}
  `;
  log(`  ✓ ${row.name} (${row.cuit})`);
  updatedMultilateral++;
}

log('');
log('▶ Actualizando RÉGIMEN LOCAL...');
let updatedLocal = 0;
for (const row of toLocal) {
  await sql`
    UPDATE representative
    SET convenio_multilateral = false, regimen_local = true
    WHERE id = ${row.id as string}
  `;
  log(`  ✓ ${row.name} (${row.cuit})`);
  updatedLocal++;
}

log('');
log('▶ Omitidos (sin datos o baja confianza — sin cambios):');
for (const row of skipped) {
  log(`  - ${row.name} (${row.cuit})`);
}

// ─── Resumen final ────────────────────────────────────────────────────────────

log('');
log('══════════════════════════════════════════════════════════════════════');
log('  RESUMEN');
log('──────────────────────────────────────────────────────────────────────');
log(`  Actualizados como multilateral : ${updatedMultilateral}`);
log(`  Actualizados como local        : ${updatedLocal}`);
log(`  Total actualizados             : ${updatedMultilateral + updatedLocal}`);
log(`  Omitidos                       : ${skipped.length}`);
log('══════════════════════════════════════════════════════════════════════');
log('');
log('Los casos omitidos deben asignarse manualmente desde la UI (edición de cliente).');
log('');

await sql.end();
