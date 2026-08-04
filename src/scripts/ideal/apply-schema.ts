/**
 * Aplica el schema ideal en BD_IDEAL (local, docker-compose.ideal.yml).
 * DESTRUCTIVO solo para BD_IDEAL: dropea el schema public y lo recrea.
 * Uso: bun src/scripts/ideal/apply-schema.ts
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";

if (!IDEAL_URL.includes("localhost") && !IDEAL_URL.includes("127.0.0.1")) {
  throw new Error("BD_IDEAL debe ser local — se niega a dropear un schema remoto");
}

const sql = postgres(IDEAL_URL, { max: 1 });

console.log("→ Recreando schema public en BD_IDEAL...");
await sql.unsafe("drop schema public cascade; create schema public;");

const files = [
  "schema-dominio1.sql",
  "schema-dominio2.sql",
  "schema-dominio3.sql",
  "schema-dominio4.sql",
  "schema-dominio5.sql",
  "schema-dominio6.sql",
  "schema-dominio7.sql",
  "schema-rls.sql",
  "schema-rls-portal.sql",
  "schema-rls-scrapper.sql",
];
for (const f of files) {
  console.log(`→ Aplicando ${f}...`);
  const ddl = readFileSync(join(import.meta.dir, f), "utf8");
  await sql.unsafe(ddl);
}

const tables = await sql.unsafe(
  "select tablename from pg_tables where schemaname = 'public' order by tablename"
);
console.log(`✓ Schema aplicado. ${tables.length} tablas:`);
for (const t of tables) console.log("  -", t.tablename);

await sql.end();
