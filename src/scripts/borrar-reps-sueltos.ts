/**
 * Borra los 3 representantes "sueltos" (no son login en la planilla, 0 clients,
 * solo jobs fallidos): Classic Drinks (30719065313, CUIT de empresa mal cargado
 * como login), Gaabriel Sekzer (20178994930) y Alan Sfintzi (20443663534).
 *
 * Exporta antes a JSON todas sus filas hijas (FK a representative.id).
 * Aborta si alguno tiene clients colgando. Dry-run por defecto; --apply para borrar.
 *
 * Uso: source .env && bun run src/scripts/borrar-reps-sueltos.ts /path/dir-backup [--apply]
 */
import postgres from "postgres";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!outDir) throw new Error("Uso: <dir-backup> [--apply]");

const CUITS = ["30719065313", "20178994930", "20443663534"];

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

const reps = await sql`
  select id, name, cuit from representative
  where regexp_replace(cuit, '\\D', '', 'g') = any(${CUITS})
`;
console.log(`Representantes encontrados: ${reps.length}/3`);
for (const r of reps) console.log(`  - ${r.name} (${r.cuit})`);
if (reps.length !== 3) {
  console.error("!! No son exactamente 3 — ABORTADO");
  await sql.end();
  process.exit(1);
}
const ids = reps.map((r) => r.id);

const clients = await sql`select id, name from client where representative_id = any(${ids})`;
if (clients.length > 0) {
  console.error(`!! Tienen ${clients.length} clients colgando — ABORTADO`);
  console.table(clients.map((c) => ({ ...c })));
  await sql.end();
  process.exit(1);
}

// Backup de todas las filas hijas
const children = await sql<{ table_name: string; column_name: string }[]>`
  select tc.table_name, kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and ccu.table_name = 'representative' and ccu.column_name = 'id'
  order by 1
`;

const dump: Record<string, unknown[]> = { representative: reps };
const summary: Record<string, number> = {};
for (const { table_name, column_name } of children) {
  const rows = await sql`select * from ${sql(table_name)} where ${sql(column_name)} = any(${ids})`;
  if (rows.length > 0) {
    dump[table_name] = rows;
    summary[table_name] = rows.length;
  }
}
// job_log cuelga de job
const jobIds = (dump.job as { id: string }[] | undefined)?.map((j) => j.id) ?? [];
if (jobIds.length > 0) {
  const logs = await sql`select * from job_log where job_id = any(${jobIds})`;
  if (logs.length > 0) {
    dump.job_log = logs;
    summary.job_log = logs.length;
  }
}

console.log("\nFilas hijas afectadas:");
console.table(summary);

mkdirSync(outDir, { recursive: true });
const file = join(outDir, "reps-sueltos-backup.json");
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`Backup: ${file}`);

if (!apply) {
  console.log("\nDRY-RUN. Volver a correr con --apply para borrar.");
  await sql.end();
  process.exit(0);
}

const del = await sql`delete from representative where id = any(${ids})`;
console.log(`\nRepresentantes borrados: ${del.count}`);
const [after] = await sql`select count(*)::int as n from representative`;
console.log(`representative restantes: ${after.n}`);
await sql.end();
