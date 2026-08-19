/**
 * Migración: reemplaza el campo situacion_revista (enum) de liquidacion_import_recibo
 * por tres FKs a payroll_situacion + dia_inicio, y agrega campos faltantes del LSD.
 *
 * Idempotente: usa IF NOT EXISTS / IF EXISTS.
 *
 * Uso: bun run src/scripts/migrate-situacion-revista.ts
 */
import postgres from "postgres";

async function main() {
  const url = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Falta MIGRATION_URL o DATABASE_URL en el entorno.");

  const sql = postgres(url, { prepare: false });

  console.log("Aplicando migración de situacion_revista...\n");

  // 1. Agregar nuevas columnas si no existen
  const newColumns = [
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista1_id uuid REFERENCES payroll_situacion(id) ON DELETE SET NULL`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista1_dia_inicio integer`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista2_id uuid REFERENCES payroll_situacion(id) ON DELETE SET NULL`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista2_dia_inicio integer`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista3_id uuid REFERENCES payroll_situacion(id) ON DELETE SET NULL`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS situacion_revista3_dia_inicio integer`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS dias_trabajados integer`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS horas_trabajadas integer`,
    `ALTER TABLE liquidacion_import_recibo ADD COLUMN IF NOT EXISTS importe_maternidad_art13 numeric(12,2)`,
  ];

  for (const stmt of newColumns) {
    await sql.unsafe(stmt);
    const colName = (/ADD COLUMN IF NOT EXISTS (\w+)/.exec(stmt))?.[1];
    console.log(`  ✓ Columna agregada: ${colName}`);
  }

  // 2. Eliminar columna vieja (enum) si existe
  const oldColCheck = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'liquidacion_import_recibo' AND column_name = 'situacion_revista'
  `;
  if (oldColCheck.length > 0) {
    await sql.unsafe(`ALTER TABLE liquidacion_import_recibo DROP COLUMN situacion_revista`);
    console.log("  ✓ Columna eliminada: situacion_revista (enum)");
  } else {
    console.log("  - Columna situacion_revista ya no existe, ok");
  }

  // 3. Eliminar el tipo enum si existe
  const enumCheck = await sql`
    SELECT typname FROM pg_type WHERE typname = 'payroll_situacion_revista'
  `;
  if (enumCheck.length > 0) {
    await sql.unsafe(`DROP TYPE payroll_situacion_revista`);
    console.log("  ✓ Tipo eliminado: payroll_situacion_revista (enum)");
  } else {
    console.log("  - Tipo payroll_situacion_revista ya no existe, ok");
  }

  await sql.end();
  console.log("\nMigración completada.");
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
