/**
 * Carga la serie de índices de reexpresión para el ajuste por inflación (RT 6).
 *
 * La descarga y el parseo viven en `src/lib/inflation-index-source.ts`, que se
 * comparte con el cron mensual: si FACPCE cambia el formato de la planilla, hay
 * un solo lugar donde arreglarlo.
 *
 * Idempotente: hace upsert por (source, año, mes), así que se puede correr todos
 * los meses con la planilla nueva.
 *
 * Uso:
 *   bun run db:seed-inflation-index                  # baja la última de FACPCE
 *   bun run db:seed-inflation-index --file ruta.xlsx # usa un archivo local
 *   bun run db:seed-inflation-index --url https://... # URL puntual
 */
import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { inflationIndex } from '@/drizzle/schema';
import { sql } from 'drizzle-orm';
import {
  fetchFacpceSeries,
  parseFacpceWorkbook,
  upsertInflationIndexes,
  type ParsedSeries,
} from '@/lib/inflation-index-source';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function loadSeries(): Promise<ParsedSeries> {
  const file = argValue('--file');
  if (file) {
    console.log(`Leyendo ${file}`);
    return parseFacpceWorkbook(readFileSync(file));
  }
  const result = await fetchFacpceSeries(argValue('--url'));
  console.log(`Descargado ${result.url}`);
  return result;
}

async function main() {
  const { rows, skipped } = await loadSeries();
  if (skipped > 0) {
    console.log(`Salteadas ${skipped} fila(s) sin índice publicado todavía.`);
  }

  const { processed, from, to } = await upsertInflationIndexes(rows);
  console.log(`Serie cargada: ${processed} meses, de ${from} a ${to}.`);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inflationIndex);
  console.log(`Total filas en inflation_index: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
