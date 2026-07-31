/**
 * Fase 0 del plan de rediseño de BD: audita la divergencia entre
 * drizzle/schema.ts (+ drizzle/auth.ts) y la BD real (DATABASE_URL).
 *
 * Uso: bun run src/scripts/audit-schema-vs-db.ts
 */
import postgres from "postgres";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "../../drizzle/schema";
import * as auth from "../../drizzle/auth";

const sql = postgres(process.env.DATABASE_URL!, { max: 4 });

// Tablas definidas en código
const codeTables = new Map<string, string[]>();
for (const mod of [schema, auth]) {
  for (const exp of Object.values(mod)) {
    if (exp instanceof PgTable) {
      const cfg = getTableConfig(exp);
      codeTables.set(
        cfg.name,
        cfg.columns.map((c) => c.name),
      );
    }
  }
}

// Tablas reales en la BD
const rows = await sql`
  select table_name, array_agg(column_name::text order by column_name) as cols
  from information_schema.columns
  where table_schema = 'public'
  group by table_name
`;
const dbTables = new Map<string, string[]>(rows.map((r) => [r.table_name, r.cols]));

const inCodeNotDb = [...codeTables.keys()].filter((t) => !dbTables.has(t)).sort();
const inDbNotCode = [...dbTables.keys()].filter((t) => !codeTables.has(t)).sort();

console.log(`Tablas en schema.ts/auth.ts: ${codeTables.size}`);
console.log(`Tablas en BD (public):       ${dbTables.size}\n`);

if (inCodeNotDb.length) {
  console.log("=== En CÓDIGO pero NO en BD ===");
  inCodeNotDb.forEach((t) => console.log(`  ${t}`));
  console.log();
}
if (inDbNotCode.length) {
  console.log("=== En BD pero NO en código ===");
  inDbNotCode.forEach((t) => console.log(`  ${t}`));
  console.log();
}

console.log("=== Divergencias de columnas (tablas en ambos lados) ===");
let diffCount = 0;
for (const [table, cols] of [...codeTables.entries()].sort()) {
  const dbCols = dbTables.get(table);
  if (!dbCols) continue;
  const codeSet = new Set(cols);
  const dbSet = new Set(dbCols);
  const onlyCode = cols.filter((c) => !dbSet.has(c)).sort();
  const onlyDb = dbCols.filter((c) => !codeSet.has(c)).sort();
  if (onlyCode.length || onlyDb.length) {
    diffCount++;
    console.log(`\n${table} (código: ${cols.length} cols, BD: ${dbCols.length} cols)`);
    if (onlyCode.length) console.log(`  solo en código: ${onlyCode.join(", ")}`);
    if (onlyDb.length) console.log(`  solo en BD:     ${onlyDb.join(", ")}`);
  }
}
console.log(`\nTablas con columnas divergentes: ${diffCount}`);

await sql.end();
