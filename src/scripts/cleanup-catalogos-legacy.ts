/**
 * 1. Verifica que ningún empleado tenga FKs apuntando a registros legacy.
 * 2. Elimina los registros con códigos en formato incorrecto (legacy 4-5 dígitos).
 * 3. Para payroll_zona: vacía toda la tabla (los códigos actuales no corresponden
 *    al formato LSD — requiere re-seed con códigos correctos).
 *
 * Uso: bun run src/scripts/cleanup-catalogos-legacy.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  // ── 1. Verificar que los empleados no apuntan a registros inválidos ─────
  console.log("Verificando FKs de empleados...\n");

  const checks = [
    { fk: "condicion_id",              tabla: "payroll_condicion",              pat: "^[0-9]{2}$" },
    { fk: "modalidad_contratacion_id", tabla: "payroll_modalidad_contratacion", pat: "^[0-9]{3}$" },
    { fk: "siniestrado_id",            tabla: "payroll_siniestrado",            pat: "^[0-9]{2}$" },
    { fk: "actividad_id",              tabla: "payroll_actividad",              pat: "^[0-9]{3}$" },
  ];

  let hayProblemas = false;
  for (const { fk, tabla, pat } of checks) {
    const problemas = await sql.unsafe(`
      SELECT COUNT(*) as total
      FROM liquidacion_import_empleado lie
      JOIN ${tabla} cat ON cat.id = lie.${fk}
      WHERE cat.codigo !~ '${pat}'
    `);
    const n = Number(problemas[0].total);
    if (n > 0) {
      console.log(`  ⚠ ${fk}: ${n} empleado(s) apuntan a registros legacy`);
      hayProblemas = true;
    } else {
      console.log(`  ✓ ${fk}: sin empleados en registros legacy`);
    }
  }

  if (hayProblemas) {
    console.log("\n⚠ Hay empleados apuntando a registros legacy. Corregir antes de limpiar.");
    await sql.end();
    return;
  }

  // ── 2. Limpiar registros legacy de cada catálogo ─────────────────────────
  console.log("\nEliminando registros legacy...\n");

  const limpiezas = [
    { tabla: "payroll_condicion",              pat: "^[0-9]{2}$",  label: "2 dígitos" },
    { tabla: "payroll_modalidad_contratacion", pat: "^[0-9]{3}$",  label: "3 dígitos" },
    { tabla: "payroll_siniestrado",            pat: "^[0-9]{2}$",  label: "2 dígitos" },
    { tabla: "payroll_actividad",              pat: "^[0-9]{3}$",  label: "3 dígitos" },
  ];

  for (const { tabla, pat, label } of limpiezas) {
    const antes = await sql.unsafe(`SELECT COUNT(*) as total FROM ${tabla}`);
    const eliminados = await sql.unsafe(`
      DELETE FROM ${tabla} WHERE codigo !~ '${pat}' RETURNING codigo
    `);
    const despues = await sql.unsafe(`SELECT COUNT(*) as total FROM ${tabla}`);
    console.log(
      `  ✓ ${tabla}: eliminados ${eliminados.length} (formato inválido), quedan ${despues[0].total} (${label})`
    );
  }

  // ── 3. Vaciar payroll_zona (códigos históricos sin relación con LSD actual) ──
  console.log("\nLimpiando payroll_zona...");
  const zonasAntes = await sql`SELECT COUNT(*) as total FROM payroll_zona`;
  await sql`DELETE FROM payroll_zona`;
  console.log(`  ✓ payroll_zona: eliminados ${zonasAntes[0].total} registros legacy`);
  console.log("  (Requiere re-seed con códigos AFIP LSD correctos)");

  // ── Resumen final ────────────────────────────────────────────────────────
  console.log("\nResumen final:");
  const tablas = [
    "payroll_condicion",
    "payroll_modalidad_contratacion",
    "payroll_siniestrado",
    "payroll_actividad",
    "payroll_zona",
  ];
  for (const t of tablas) {
    const cnt = await sql.unsafe(`SELECT COUNT(*) as total FROM ${t}`);
    console.log(`  ${t}: ${cnt[0].total} registros`);
  }

  await sql.end();
  console.log("\nListo.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
