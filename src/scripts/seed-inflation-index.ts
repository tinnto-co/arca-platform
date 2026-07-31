/**
 * Carga la serie de índices de reexpresión para el ajuste por inflación (RT 6).
 *
 * Fuente: FACPCE, "Índice RT 6 – Res. JG 539/18", planilla mensual publicada en
 * https://www.facpce.org.ar/indices-facpce/. Es un .xlsx de una sola hoja con
 * dos columnas: mes (fecha) e índice de nivel general. La serie arranca en
 * enero de 1993 y se empalma IPIM → IPIM-FACPCE → IPC nacional INDEC.
 *
 * El coeficiente de reexpresión de un mes se calcula después como
 * `índice(mes de cierre) / índice(mes de origen)` (ver `accounting-inflation.ts`).
 *
 * Idempotente: hace upsert por (source, year, month), así que se puede correr
 * todos los meses con la planilla nueva.
 *
 * Uso:
 *   bun run db:seed-inflation-index                  # baja la última de FACPCE
 *   bun run db:seed-inflation-index --file ruta.xlsx # usa un archivo local
 *   bun run db:seed-inflation-index --url https://... # URL puntual
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { inflationIndex } from '@/drizzle/schema';
import { sql } from 'drizzle-orm';

const FACPCE_INDEX_PAGE = 'https://www.facpce.org.ar/indices-facpce/';
const SOURCE = 'facpce_rt6' as const;

interface SeriesRow {
  year: number;
  month: number;
  value: number;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * Busca en la página de FACPCE el link a la planilla de índices. El nombre del
 * archivo lleva el período (ej. `Indice-FACPCE-Res.-JG-539-18-2026-06-1.xlsx`),
 * así que cambia todos los meses y no se puede hardcodear.
 */
async function resolveLatestUrl(): Promise<string> {
  const res = await fetch(FACPCE_INDEX_PAGE);
  if (!res.ok) {
    throw new Error(
      `No se pudo leer ${FACPCE_INDEX_PAGE} (HTTP ${res.status}). Usá --file con la planilla descargada a mano.`
    );
  }
  const html = await res.text();
  const matches = [
    ...html.matchAll(/https?:\/\/[^"'\s]*Indice-FACPCE[^"'\s]*\.xlsx/gi),
  ].map((m) => m[0]);
  if (matches.length === 0) {
    throw new Error(
      `No encontré el link al .xlsx en ${FACPCE_INDEX_PAGE}. Puede haber cambiado la página: bajá la planilla a mano y usá --file.`
    );
  }
  // Si hay varias, la de nombre mayor es la más reciente (llevan AAAA-MM).
  return matches.sort()[matches.length - 1];
}

async function loadWorkbook(): Promise<XLSX.WorkBook> {
  const file = argValue('--file');
  if (file) {
    console.log(`Leyendo ${file}`);
    return XLSX.read(readFileSync(file), { type: 'buffer', cellDates: true });
  }
  const url = argValue('--url') ?? (await resolveLatestUrl());
  console.log(`Descargando ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la planilla (HTTP ${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

/**
 * Extrae (mes, índice) de la planilla. Tolera filas de encabezado y el mes en
 * curso, que FACPCE publica con un `*` en lugar del número hasta que sale el
 * dato definitivo.
 */
function parseSeries(wb: XLSX.WorkBook): SeriesRow[] {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('La planilla no tiene hojas.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  });

  const out: SeriesRow[] = [];
  let skippedPending = 0;
  for (const row of rows) {
    const rawDate = row?.[0];
    const rawValue = row?.[1];
    if (!(rawDate instanceof Date)) continue; // encabezados y filas sueltas
    const value =
      typeof rawValue === 'number'
        ? rawValue
        : Number(String(rawValue ?? '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      skippedPending++; // el mes todavía no publicado viene con "*"
      continue;
    }
    out.push({
      year: rawDate.getFullYear(),
      month: rawDate.getMonth() + 1,
      value,
    });
  }

  if (out.length === 0) {
    throw new Error(
      'No pude leer ninguna fila de la planilla. ¿Cambió el formato de FACPCE?'
    );
  }
  if (skippedPending > 0) {
    console.log(
      `Salteadas ${skippedPending} fila(s) sin índice publicado todavía.`
    );
  }
  return out;
}

async function main() {
  const wb = await loadWorkbook();
  const series = parseSeries(wb);

  const first = series[0];
  const last = series[series.length - 1];
  console.log(
    `Serie leída: ${series.length} meses, de ${first.year}-${String(first.month).padStart(2, '0')} a ${last.year}-${String(last.month).padStart(2, '0')}.`
  );

  const BATCH = 200;
  for (let i = 0; i < series.length; i += BATCH) {
    const chunk = series.slice(i, i + BATCH);
    await db
      .insert(inflationIndex)
      .values(
        chunk.map((r) => ({
          source: SOURCE,
          year: r.year,
          month: r.month,
          value: r.value.toFixed(6),
        }))
      )
      .onConflictDoUpdate({
        target: [
          inflationIndex.source,
          inflationIndex.year,
          inflationIndex.month,
        ],
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
    console.log(
      `Procesados ${Math.min(i + BATCH, series.length)} / ${series.length}`
    );
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inflationIndex);
  console.log(`Total filas en inflation_index: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
