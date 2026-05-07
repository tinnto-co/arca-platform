/**
 * Carga el catálogo de obras sociales desde src/data/obras-sociales-seed.json.
 * Idempotente: ignora duplicados por código.
 *
 * Uso: bun run src/scripts/seed-obras-sociales.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '@/lib/db';
import { obraSocial } from '@/drizzle/schema';
import { sql } from 'drizzle-orm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(__dirname, '../data/obras-sociales-seed.json');

interface Row {
  codigo: string;
  nombre: string;
}

async function main() {
  const raw = readFileSync(jsonPath, 'utf8');
  const rows: Row[] = JSON.parse(raw);
  const BATCH = 80;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await db
      .insert(obraSocial)
      .values(
        chunk.map((r) => ({
          codigo: r.codigo,
          nombre: r.nombre,
        }))
      )
      .onConflictDoNothing({ target: obraSocial.codigo });
    inserted += chunk.length;
    console.log(
      `Procesados ${Math.min(inserted, rows.length)} / ${rows.length}`
    );
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(obraSocial);
  console.log(`Total filas en obra_social: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
