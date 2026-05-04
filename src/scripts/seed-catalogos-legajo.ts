/**
 * Carga los catálogos de referencia del legajo de empleados en la BD.
 * Lee los INSERT del archivo drizzle/0019_payroll_catalogos_legajo.sql
 * y los ejecuta. Es idempotente: usa ON CONFLICT DO NOTHING.
 *
 * Uso: bun run src/scripts/seed-catalogos-legajo.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Falta MIGRATION_URL o DATABASE_URL en el entorno.');

  const client = postgres(url, { prepare: false });

  const filePath = join(process.cwd(), 'drizzle/0019_payroll_catalogos_legajo.sql');
  const content = readFileSync(filePath, 'utf8');

  // Extraer solo los bloques INSERT (las CREATE TABLE ya las hizo db:push)
  const insertBlocks = content.match(/INSERT INTO[\s\S]*?;/g) ?? [];

  if (insertBlocks.length === 0) {
    console.log('No se encontraron sentencias INSERT en el archivo.');
    await client.end();
    return;
  }

  console.log(`Aplicando ${insertBlocks.length} INSERT en la BD...`);

  for (const stmt of insertBlocks) {
    // Agregar ON CONFLICT DO NOTHING para idempotencia
    const safeStmt = stmt.replace(/;$/, ' ON CONFLICT DO NOTHING;');
    await client.unsafe(safeStmt);
    // Extraer nombre de tabla para log
    const match = stmt.match(/INSERT INTO "([^"]+)"/);
    if (match) console.log(`  ✓ ${match[1]}`);
  }

  await client.end();
  console.log('\nListo. Catálogos cargados.');
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
