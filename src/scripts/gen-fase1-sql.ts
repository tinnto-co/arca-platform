/**
 * Fase 1 del plan de rediseño (tasks/plan-rediseno-db.md): genera el SQL de higiene
 * introspectando la BD real. NO ejecuta nada — solo escribe tasks/fase1-higiene.sql.
 *
 *  A) CREATE INDEX CONCURRENTLY para toda FK sin índice que la cubra.
 *  B) ALTER TABLE ADD COLUMN updated_at / created_at donde falten.
 *
 * Uso: source .env && bun run src/scripts/gen-fase1-sql.ts
 */
import postgres from "postgres";
import { writeFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

// --- A) FKs sin índice que las cubra (prefijo del índice = columnas de la FK) ---
const fks = await sql`
  select
    c.conrelid::regclass::text as tabla,
    c.conname,
    array_agg(a.attname order by k.ord) as cols
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where c.contype = 'f' and n.nspname = 'public'
  group by c.conrelid, c.conname
  order by 1, 2
`;

const indexes = await sql`
  select
    i.indrelid::regclass::text as tabla,
    (select array_agg(a.attname order by k.ord)
     from unnest(i.indkey::int[]) with ordinality as k(attnum, ord)
     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
     where k.ord <= i.indnkeyatts) as cols
  from pg_index i
  join pg_class rel on rel.oid = i.indrelid
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public'
`;

const idxByTable = new Map<string, string[][]>();
for (const r of indexes) {
  if (!idxByTable.has(r.tabla)) idxByTable.set(r.tabla, []);
  if (r.cols) idxByTable.get(r.tabla)!.push(r.cols);
}

const covered = (tabla: string, fkCols: string[]) =>
  (idxByTable.get(tabla) ?? []).some((idxCols) => fkCols.every((c, i) => idxCols[i] === c));

const missingIdx = fks.filter((f) => !covered(f.tabla, f.cols));

// --- B) Timestamps faltantes ---
const cols = await sql`
  select table_name, array_agg(column_name::text) as cols
  from information_schema.columns
  where table_schema = 'public'
  group by table_name
`;
const noUpdated: string[] = [];
const noCreated: string[] = [];
for (const r of cols) {
  if (r.table_name === "empleados_categorias") continue; // fuera de drizzle a propósito
  if (!r.cols.includes("updated_at")) noUpdated.push(r.table_name);
  if (!r.cols.includes("created_at")) noCreated.push(r.table_name);
}
noUpdated.sort();
noCreated.sort();

// --- Emitir SQL ---
const lines: string[] = [
  "-- Fase 1 (higiene) del plan de rediseño de BD — generado por src/scripts/gen-fase1-sql.ts",
  `-- Generado: ${new Date().toISOString().slice(0, 10)} contra la BD real.`,
  "-- APLICAR SOLO EN NEW_DB, POST-CUTOVER. NUNCA en ORIGINAL_DB. NUNCA db:push.",
  "-- CREATE INDEX CONCURRENTLY no puede correr dentro de una transacción:",
  "-- aplicar sentencia por sentencia (script bun con postgres, simple: true).",
  "",
  `-- ============ A) ${missingIdx.length} índices de FK faltantes ============`,
  "",
];

const idxNames = new Set<string>();
for (const f of missingIdx) {
  let name = `idx_${f.tabla}_${f.cols.join("_")}`;
  if (name.length > 63) name = name.slice(0, 63);
  // evitar colisiones por truncado
  let n = name;
  let i = 1;
  while (idxNames.has(n)) n = `${name.slice(0, 61)}_${i++}`;
  idxNames.add(n);
  lines.push(`create index concurrently if not exists ${n} on "${f.tabla}" (${f.cols.map((c) => `"${c}"`).join(", ")});`);
}

lines.push("", `-- ============ B) updated_at faltante en ${noUpdated.length} tablas ============`, "");
for (const t of noUpdated) {
  lines.push(`alter table "${t}" add column if not exists updated_at timestamptz not null default now();`);
}

lines.push("", `-- ============ C) created_at faltante en ${noCreated.length} tablas ============`, "");
for (const t of noCreated) {
  lines.push(`alter table "${t}" add column if not exists created_at timestamptz not null default now();`);
}

lines.push("");
const out = "tasks/fase1-higiene.sql";
writeFileSync(out, lines.join("\n"));

console.log(`FKs totales: ${fks.length} | sin índice: ${missingIdx.length}`);
console.log(`Tablas sin updated_at: ${noUpdated.length} | sin created_at: ${noCreated.length}`);
console.log(`SQL escrito en ${out}`);

await sql.end();
