/**
 * Limpia la tabla payroll_situacion eliminando registros con códigos
 * que no sean exactamente de 2 dígitos numéricos (los válidos de AFIP LSD).
 *
 * Uso: bun run src/scripts/cleanup-payroll-situacion.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta MIGRATION_URL o DATABASE_URL en el entorno.");

  const sql = postgres(url, { prepare: false });

  // Ver qué hay antes
  const antes = await sql`
    SELECT codigo, nombre FROM payroll_situacion ORDER BY codigo
  `;
  console.log(`\nRegistros actuales (${antes.length}):`);
  for (const r of antes) {
    const valido = /^[0-9]{2}$/.test(r.codigo);
    console.log(`  ${valido ? '✓' : '✗'} "${r.codigo}" — ${r.nombre}`);
  }

  // Eliminar los que NO son exactamente 2 dígitos numéricos
  const resultado = await sql`
    DELETE FROM payroll_situacion
    WHERE codigo !~ '^[0-9]{2}$'
    RETURNING codigo, nombre
  `;

  if (resultado.length === 0) {
    console.log("\nNo se encontraron registros a eliminar.");
  } else {
    console.log(`\nEliminados (${resultado.length}):`);
    for (const r of resultado) {
      console.log(`  - "${r.codigo}" — ${r.nombre}`);
    }
  }

  const despues = await sql`
    SELECT COUNT(*) as total FROM payroll_situacion
  `;
  console.log(`\nRegistros restantes: ${despues[0].total}`);

  await sql.end();
  console.log("Listo.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
