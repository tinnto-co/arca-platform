/**
 * Respaldo dirigido: exporta a JSON las filas de `client` que se van a borrar
 * junto con TODAS sus filas hijas (cualquier tabla con FK a client.id).
 * Solo lectura.
 *
 * Uso: source .env && bun run src/scripts/export-clientes-espejo.ts "/path/planilla.csv" /tmp/salida
 */
import postgres from "postgres";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const csvPath = process.argv[2];
const outDir = process.argv[3];
if (!csvPath || !outDir) throw new Error("Uso: <planilla.csv> <dir-salida>");

const norm = (s: string) => (s ?? "").replace(/\D/g, "");
const cuitRow = readFileSync(csvPath, "utf8").split("\n").find((l) => l.startsWith("Cuit,"))!.split(",");
const planillaCuits = new Set(cuitRow.slice(1).map(norm).filter(Boolean));

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

const espejo = await sql`
  select c.*
  from client c
  join representative r on r.id = c.representative_id
  where regexp_replace(c.identity_number, '\\D', '', 'g') = regexp_replace(r.cuit, '\\D', '', 'g')
`;
const targets = espejo.filter((c) => !planillaCuits.has(norm(c.identity_number)));
const ids = targets.map((c) => c.id);

console.log(`Filas a exportar: ${targets.length}`);
if (targets.length !== 42) {
  console.warn(`!! Se esperaban 42 filas, se encontraron ${targets.length}. Revisar antes de seguir.`);
}

const children = await sql<{ table_name: string; column_name: string }[]>`
  select tc.table_name, kcu.column_name
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and ccu.table_name = 'client' and ccu.column_name = 'id'
  order by 1
`;

mkdirSync(outDir, { recursive: true });
const dump: Record<string, unknown[]> = { client: targets };
const summary: Record<string, number> = { client: targets.length };

for (const { table_name, column_name } of children) {
  const rows = await sql`select * from ${sql(table_name)} where ${sql(column_name)} = any(${ids})`;
  if (rows.length > 0) {
    dump[table_name] = rows;
    summary[table_name] = rows.length;
  }
}

const file = join(outDir, "clientes-espejo-backup.json");
writeFileSync(file, JSON.stringify(dump, null, 2));

console.log("\nFilas exportadas por tabla:");
console.table(summary);
console.log(`\nArchivo: ${file}`);

await sql.end();
