import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  const situaciones = await sql`
    SELECT
      codigo_situacion,
      situacion,
      COUNT(*) as empleados
    FROM liquidacion_import_empleado
    GROUP BY codigo_situacion, situacion
    ORDER BY COUNT(*) DESC
  `;
  console.log("Valores en codigo_situacion / situacion:");
  for (const r of situaciones) {
    console.log(`  codigo="${r.codigo_situacion ?? 'NULL'}" | texto="${r.situacion ?? 'NULL'}" | empleados: ${r.empleados}`);
  }

  const match = await sql`
    SELECT
      lie.codigo_situacion,
      ps.id as situacion_id_match,
      ps.nombre
    FROM (SELECT DISTINCT codigo_situacion FROM liquidacion_import_empleado WHERE codigo_situacion IS NOT NULL) lie
    LEFT JOIN payroll_situacion ps ON ps.codigo = lie.codigo_situacion
    ORDER BY lie.codigo_situacion
  `;
  console.log("\nMatch con payroll_situacion:");
  for (const r of match) {
    const status = r.situacion_id_match ? `✓ ${r.nombre}` : "✗ SIN MATCH";
    console.log(`  "${r.codigo_situacion}" → ${status}`);
  }

  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
