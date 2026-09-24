/**
 * Aplica tasks/fase1-higiene.sql sentencia por sentencia (CREATE INDEX CONCURRENTLY
 * no admite transacción). Dry-run por defecto: lista las sentencias sin ejecutar.
 *
 * SOLO contra NEW_DB — se niega a correr contra el server original (5.78.132.83).
 *
 * Uso: source .env && bun run src/scripts/apply-fase1.ts [--apply]
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const apply = process.argv.includes("--apply");
const url = process.env.NEW_DB;
if (!url) throw new Error("Falta NEW_DB en el entorno");
if (url.includes("5.78.132.83")) throw new Error("NEW_DB apunta al server ORIGINAL — abortado");

const stmts = readFileSync("tasks/fase1-higiene.sql", "utf8")
  .split("\n")
  .filter((l) => l.trim() && !l.trim().startsWith("--"))
  .map((l) => l.replace(/;$/, ""));

console.log(`Sentencias: ${stmts.length} | destino: ${url.replace(/:[^:@]*@/, ":****@")}`);

if (!apply) {
  console.log("DRY-RUN. Volver a correr con --apply para ejecutar.");
  process.exit(0);
}

const sql = postgres(url, { max: 1 });
let ok = 0;
const failed: { stmt: string; error: string }[] = [];
for (const [i, stmt] of stmts.entries()) {
  try {
    await sql.unsafe(stmt);
    ok++;
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${stmts.length}...`);
  } catch (e) {
    failed.push({ stmt, error: (e as Error).message });
    console.error(`FALLO: ${stmt}\n  -> ${(e as Error).message}`);
  }
}
console.log(`\nOK: ${ok}/${stmts.length} | Fallidas: ${failed.length}`);

// Verificación (misma lógica de cobertura por prefijo que gen-fase1-sql.ts)
const fks = await sql`
  select c.conrelid::regclass::text as tabla,
    array_agg(a.attname order by k.ord) as cols
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where c.contype = 'f' and ns.nspname = 'public'
  group by c.conrelid, c.conname
`;
const indexes = await sql`
  select i.indrelid::regclass::text as tabla,
    (select array_agg(a.attname order by k.ord)
     from unnest(i.indkey::int[]) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where k.ord <= i.indnkeyatts) as cols
  from pg_index i
  join pg_class rel on rel.oid = i.indrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
`;
const idxByTable = new Map<string, string[][]>();
for (const r of indexes) {
  if (!idxByTable.has(r.tabla)) idxByTable.set(r.tabla, []);
  if (r.cols) idxByTable.get(r.tabla)!.push(r.cols);
}
const fkSinIdx = fks.filter(
  (f) => !(idxByTable.get(f.tabla) ?? []).some((idx) => f.cols.every((c: string, i: number) => idx[i] === c)),
).length;
const [{ n: sinUpdated }] = await sql`
  select count(distinct table_name)::int as n
  from information_schema.tables t
  where table_schema = 'public' and table_type = 'BASE TABLE'
    and table_name <> 'empleados_categorias'
    and not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'updated_at'
    )
`;
console.log(`Post: FKs sin índice: ${fkSinIdx} | tablas sin updated_at: ${sinUpdated} (objetivo 0 y 0)`);

await sql.end();
