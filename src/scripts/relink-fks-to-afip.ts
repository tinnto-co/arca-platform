/**
 * Re-enlaza las FKs de liquidacion_import_empleado a los registros correctos
 * de AFIP (2-3 dígitos) usando los campos codigo_* como fuente de verdad.
 * Luego limpia los registros legacy de cada catálogo.
 *
 * Uso: bun run src/scripts/relink-fks-to-afip.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  const mappings = [
    { fk: "condicion_id",              codigo: "codigo_condicion",             tabla: "payroll_condicion",              pat: "^[0-9]{2}$", pad: 2 },
    { fk: "modalidad_contratacion_id", codigo: "codigo_modalidad_contratacion",tabla: "payroll_modalidad_contratacion", pat: "^[0-9]{3}$", pad: 3 },
    { fk: "siniestrado_id",            codigo: "codigo_siniestrado",           tabla: "payroll_siniestrado",            pat: "^[0-9]{2}$", pad: 2 },
    { fk: "actividad_id",              codigo: "codigo_actividad",             tabla: "payroll_actividad",              pat: "^[0-9]{3}$", pad: 3 },
  ];

  // ── 1. Re-enlazar FKs a registros AFIP correctos ───────────────────────
  console.log("Re-enlazando FKs a registros AFIP correctos...\n");

  for (const { fk, codigo, tabla, pad } of mappings) {
    const updated = await sql.unsafe(`
      UPDATE liquidacion_import_empleado lie
      SET ${fk} = cat.id
      FROM ${tabla} cat
      WHERE cat.codigo = LPAD(lie.${codigo}, ${pad}, '0')
        AND lie.${codigo} IS NOT NULL
        AND lie.${codigo} != ''
    `);

    const sinMatch = await sql.unsafe(`
      SELECT COUNT(*) as total
      FROM liquidacion_import_empleado
      WHERE ${codigo} IS NOT NULL
        AND ${codigo} != ''
        AND ${fk} IS NULL
    `);

    console.log(`  ✓ ${fk}: ${updated.count ?? '?'} actualizados${Number(sinMatch[0].total) > 0 ? `, ${sinMatch[0].total} sin match` : ''}`);
  }

  // ── 2. Verificar que ningún empleado apunta ya a legacy ────────────────
  console.log("\nVerificando...");
  let ok = true;
  for (const { fk, tabla, pat } of mappings) {
    const prob = await sql.unsafe(`
      SELECT COUNT(*) as total
      FROM liquidacion_import_empleado lie
      JOIN ${tabla} cat ON cat.id = lie.${fk}
      WHERE cat.codigo !~ '${pat}'
    `);
    if (Number(prob[0].total) > 0) {
      console.log(`  ⚠ ${fk}: ${prob[0].total} empleados aún en legacy`);
      ok = false;
    } else {
      console.log(`  ✓ ${fk}: OK`);
    }
  }

  if (!ok) {
    console.log("\n⚠ No se eliminaron los registros legacy. Revisá manualmente.");
    await sql.end();
    return;
  }

  // ── 3. Limpiar registros legacy ────────────────────────────────────────
  console.log("\nEliminando registros legacy...\n");

  for (const { tabla, pat } of mappings) {
    const del = await sql.unsafe(`
      DELETE FROM ${tabla} WHERE codigo !~ '${pat}' RETURNING codigo
    `);
    const queda = await sql.unsafe(`SELECT COUNT(*) as total FROM ${tabla}`);
    console.log(`  ✓ ${tabla}: eliminados ${del.length}, quedan ${queda[0].total}`);
  }

  // ── 4. Limpiar payroll_zona (sin códigos AFIP válidos) ─────────────────
  console.log("\nLimpiando payroll_zona...");
  const zCnt = await sql`SELECT COUNT(*) as total FROM payroll_zona`;
  await sql`DELETE FROM payroll_zona`;
  console.log(`  ✓ payroll_zona: eliminados ${zCnt[0].total} registros legacy`);

  // ── 5. Nulificar zona_id en empleados (ya no tiene registros válidos) ──
  const znull = await sql`UPDATE liquidacion_import_empleado SET zona_id = NULL WHERE zona_id IS NOT NULL`;
  console.log(`  ✓ zona_id: nulificado en empleados (${znull.count ?? 0})`);

  await sql.end();
  console.log("\nListo.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
