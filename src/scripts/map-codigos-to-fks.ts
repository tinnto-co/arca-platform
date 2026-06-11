/**
 * Popula las FKs UUID de liquidacion_import_empleado a partir de los
 * campos de texto codigo_* importados del LSD.
 *
 * Uso: bun run src/scripts/map-codigos-to-fks.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
  if (!url) throw new Error("Falta DATABASE_URL o MIGRATION_URL");
  const sql = postgres(url, { prepare: false });

  const mappings = [
    {
      label: "situacion_id",
      fk: "situacion_id",
      codigo: "codigo_situacion",
      tabla: "payroll_situacion",
      pad: 2,
    },
    {
      label: "condicion_id",
      fk: "condicion_id",
      codigo: "codigo_condicion",
      tabla: "payroll_condicion",
      pad: 2,
    },
    {
      label: "modalidad_contratacion_id",
      fk: "modalidad_contratacion_id",
      codigo: "codigo_modalidad_contratacion",
      tabla: "payroll_modalidad_contratacion",
      pad: 3,
    },
    {
      label: "actividad_id",
      fk: "actividad_id",
      codigo: "codigo_actividad",
      tabla: "payroll_actividad",
      pad: 3,
    },
    {
      label: "siniestrado_id",
      fk: "siniestrado_id",
      codigo: "codigo_siniestrado",
      tabla: "payroll_siniestrado",
      pad: 2,
    },
  ];

  console.log("Mapeando códigos texto → FKs UUID...\n");

  for (const m of mappings) {
    const result = await sql.unsafe(`
      UPDATE liquidacion_import_empleado lie
      SET ${m.fk} = cat.id
      FROM ${m.tabla} cat
      WHERE cat.codigo = LPAD(lie.${m.codigo}, ${m.pad}, '0')
        AND lie.${m.codigo} IS NOT NULL
        AND lie.${m.codigo} != ''
        AND lie.${m.fk} IS NULL
      RETURNING lie.id
    `);

    // Contar sin match
    const sinMatch = await sql.unsafe(`
      SELECT COUNT(*) as total
      FROM liquidacion_import_empleado lie
      WHERE lie.${m.codigo} IS NOT NULL
        AND lie.${m.codigo} != ''
        AND lie.${m.fk} IS NULL
    `);

    const actualizados = result.length;
    const noMatch = Number(sinMatch[0]?.total ?? 0);
    console.log(`  ✓ ${m.label}: ${actualizados} actualizados${noMatch > 0 ? `, ${noMatch} sin match (código inválido)` : ""}`);
  }

  // Verificación final
  console.log("\nVerificación final:");
  const resumen = await sql`
    SELECT
      COUNT(*) FILTER (WHERE situacion_id IS NOT NULL)              AS con_situacion,
      COUNT(*) FILTER (WHERE condicion_id IS NOT NULL)              AS con_condicion,
      COUNT(*) FILTER (WHERE modalidad_contratacion_id IS NOT NULL) AS con_modalidad,
      COUNT(*) FILTER (WHERE actividad_id IS NOT NULL)              AS con_actividad,
      COUNT(*) FILTER (WHERE siniestrado_id IS NOT NULL)            AS con_siniestrado,
      COUNT(*)                                                       AS total
    FROM liquidacion_import_empleado
  `;
  const r = resumen[0];
  console.log(`  Total empleados: ${r.total}`);
  console.log(`  con situacion_id:              ${r.con_situacion}`);
  console.log(`  con condicion_id:              ${r.con_condicion}`);
  console.log(`  con modalidad_contratacion_id: ${r.con_modalidad}`);
  console.log(`  con actividad_id:              ${r.con_actividad}`);
  console.log(`  con siniestrado_id:            ${r.con_siniestrado}`);

  await sql.end();
  console.log("\nListo.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
