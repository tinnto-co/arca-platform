import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  const campos = [
    { col: "codigo_situacion",             tabla: "payroll_situacion",             pad: 2 },
    { col: "codigo_condicion",             tabla: "payroll_condicion",             pad: 2 },
    { col: "codigo_zona",                  tabla: "payroll_zona",                  pad: 0 },
    { col: "codigo_modalidad_contratacion",tabla: "payroll_modalidad_contratacion",pad: 3 },
    { col: "codigo_actividad",             tabla: "payroll_actividad",             pad: 3 },
    { col: "codigo_siniestrado",           tabla: "payroll_siniestrado",           pad: 2 },
  ];

  for (const { col, tabla, pad } of campos) {
    const rows = await sql.unsafe(`
      SELECT
        lie.${col} as raw_codigo,
        LPAD(lie.${col}, ${pad}, '0') as codigo_padded,
        COUNT(*) as empleados,
        cat.nombre
      FROM liquidacion_import_empleado lie
      LEFT JOIN ${tabla} cat ON cat.codigo = LPAD(lie.${col}, ${pad === 0 ? `LENGTH(lie.${col})` : pad}, '0')
      WHERE lie.${col} IS NOT NULL AND lie.${col} != ''
      GROUP BY lie.${col}, cat.nombre
      ORDER BY COUNT(*) DESC
    `);

    console.log(`\n${col} → ${tabla}:`);
    if (rows.length === 0) {
      console.log("  (sin datos)");
    } else {
      for (const r of rows) {
        const match = r.nombre ? `✓ ${r.nombre}` : "✗ SIN MATCH";
        console.log(`  "${r.raw_codigo}" (pad→"${r.codigo_padded}") [${r.empleados} emp] → ${match}`);
      }
    }
  }

  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
