/**
 * Aplica un archivo SQL crudo contra DATABASE_URL y MIGRATION_URL.
 * Uso: bun run src/scripts/run-migration-sql.ts drizzle/0019_empleado_catalog_fks.sql
 */
import postgres from 'postgres';
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Falta argumento: ruta al .sql'); process.exit(1); }
const sql = fs.readFileSync(file, 'utf8');

async function run(label: string, url: string) {
  const client = postgres(url, { prepare: false });
  await client.unsafe(sql);
  console.log(`[${label}] OK`);
  await client.end();
}

const dbUrl = process.env.DATABASE_URL!;
const migUrl = process.env.MIGRATION_URL!;
if (!dbUrl || !migUrl) throw new Error('Faltan DATABASE_URL / MIGRATION_URL');

await run('dump    ', dbUrl);
await run('postgres', migUrl);
