/**
 * Mismo fix que fix-obra-social-codigos.ts pero usa MIGRATION_URL.
 * Uso: bun run src/scripts/fix-obra-social-codigos-migration.ts
 */
import postgres from 'postgres';

async function main() {
  const url = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta MIGRATION_URL o DATABASE_URL.');

  const client = postgres(url, { prepare: false });

  const rows = await client`SELECT id, codigo, nombre FROM obra_social`;
  console.log(`Total filas: ${rows.length}`);

  const codigosUsados = new Map(rows.map((r) => [r.codigo, r.id]));
  let updated = 0, skippedNoMatch = 0, skippedYaCorrecto = 0, skippedConflicto = 0;

  for (const row of rows) {
    const match = row.nombre.match(/^(\d{4,6})\s*[-\s]/);
    if (!match) { skippedNoMatch++; continue; }

    const codigoAfip = match[1];
    if (codigoAfip === row.codigo) { skippedYaCorrecto++; continue; }

    const conflicto = codigosUsados.get(codigoAfip);
    if (conflicto && conflicto !== row.id) {
      console.warn(`  ⚠ Conflicto: "${codigoAfip}" ya existe. Saltando id=${row.id}`);
      skippedConflicto++;
      continue;
    }

    await client`UPDATE obra_social SET codigo = ${codigoAfip} WHERE id = ${row.id}`;
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
  await client.end();
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
