import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  const sql = postgres(url, { prepare: false });

  const tablas = [
    { tabla: "payroll_condicion",              formato: /^[0-9]{2}$/ },
    { tabla: "payroll_modalidad_contratacion", formato: /^[0-9]{3}$/ },
    { tabla: "payroll_siniestrado",            formato: /^[0-9]{2}$/ },
    { tabla: "payroll_actividad",              formato: /^[0-9]{3}$/ },
    { tabla: "payroll_zona",                   formato: /^[0-9]{2}$/ },
  ];

  for (const { tabla, formato } of tablas) {
    const rows = await sql.unsafe(
      `SELECT codigo, nombre FROM ${tabla} ORDER BY codigo LIMIT 500`
    );
    const validos   = rows.filter(r => formato.test(r.codigo));
    const invalidos = rows.filter(r => !formato.test(r.codigo));

    console.log(`\n${tabla} — total: ${rows.length}, válidos: ${validos.length}, inválidos: ${invalidos.length}`);
    console.log("  Válidos:");
    for (const r of validos.slice(0, 10))
      console.log(`    ✓ "${r.codigo}" — ${r.nombre}`);
    if (validos.length > 10)
      console.log(`    ... y ${validos.length - 10} más`);

    if (invalidos.length > 0) {
      console.log("  Inválidos (muestra):");
      for (const r of invalidos.slice(0, 5))
        console.log(`    ✗ "${r.codigo}" — ${r.nombre}`);
      if (invalidos.length > 5)
        console.log(`    ... y ${invalidos.length - 5} más`);
    }
  }

  await sql.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
