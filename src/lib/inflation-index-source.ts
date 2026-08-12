/**
 * Descarga y carga de la serie de índices de FACPCE para el ajuste por inflación.
 *
 * Lo comparten el script de seed (`bun run db:seed-inflation-index`) y el cron
 * mensual, para que los dos parseen la planilla igual: si FACPCE cambia el
 * formato, hay un solo lugar donde arreglarlo.
 *
 * Fuente: "Índice RT 6 – Res. JG 539/18", planilla mensual publicada en
 * https://www.facpce.org.ar/indices-facpce/. Es un .xlsx de una sola hoja con
 * dos columnas: mes (fecha) e índice de nivel general, desde enero de 1993.
 */
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { indiceInflacion } from '@/drizzle/schema';
import { sql } from 'drizzle-orm';

export const FACPCE_INDEX_PAGE = 'https://www.facpce.org.ar/indices-facpce/';

export interface InflationIndexRowInput {
  year: number;
  month: number;
  value: number;
}

export interface ParsedSeries {
  rows: InflationIndexRowInput[];
  /** Filas con fecha pero sin índice publicado todavía (vienen con "*"). */
  skipped: number;
}

/**
 * Busca en la página de FACPCE el link a la planilla. El nombre del archivo
 * lleva el período (ej. `Indice-FACPCE-Res.-JG-539-18-2026-06-1.xlsx`), así que
 * cambia todos los meses y no se puede hardcodear.
 */
export async function resolveLatestFacpceUrl(): Promise<string> {
  const res = await fetch(FACPCE_INDEX_PAGE);
  if (!res.ok) {
    throw new Error(
      `No se pudo leer ${FACPCE_INDEX_PAGE} (HTTP ${res.status}).`
    );
  }
  const html = await res.text();
  const matches = [
    ...html.matchAll(/https?:\/\/[^"'\s]*Indice-FACPCE[^"'\s]*\.xlsx/gi),
  ].map((m) => m[0]);
  if (matches.length === 0) {
    throw new Error(
      `No encontré el link al .xlsx en ${FACPCE_INDEX_PAGE}: puede haber cambiado la página.`
    );
  }
  // Si hay varias, la de nombre mayor es la más reciente (llevan AAAA-MM).
  return matches.sort()[matches.length - 1];
}

/**
 * Extrae (mes, índice) de la planilla. Tolera las filas de encabezado y el mes
 * en curso, que FACPCE publica con un `*` en lugar del número hasta que sale el
 * dato definitivo.
 */
export function parseFacpceWorkbook(data: ArrayBuffer | Buffer): ParsedSeries {
  const wb = XLSX.read(data, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('La planilla no tiene hojas.');
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
  });

  const rows: InflationIndexRowInput[] = [];
  let skipped = 0;
  for (const row of raw) {
    const rawDate = row?.[0];
    const rawValue = row?.[1];
    if (!(rawDate instanceof Date)) continue; // encabezados y filas sueltas
    const value =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number(rawValue.replace(',', '.'))
          : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      skipped++;
      continue;
    }
    rows.push({
      year: rawDate.getFullYear(),
      month: rawDate.getMonth() + 1,
      value,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      'No se pudo leer ninguna fila de la planilla. ¿Cambió el formato de FACPCE?'
    );
  }
  return { rows, skipped };
}

/** Baja la última planilla publicada y la parsea. */
export async function fetchFacpceSeries(
  url?: string
): Promise<ParsedSeries & { url: string }> {
  const resolved = url ?? (await resolveLatestFacpceUrl());
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`No se pudo descargar la planilla (HTTP ${res.status}).`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { ...parseFacpceWorkbook(buf), url: resolved };
}

/**
 * Upsert de la serie. Idempotente: se puede correr todos los meses con la
 * planilla nueva y solo actualiza lo que cambió.
 */
export async function upsertInflationIndexes(
  rows: InflationIndexRowInput[],
  source: 'facpce_rt6' | 'indec_ipc' | 'manual' = 'facpce_rt6'
): Promise<{ processed: number; from: string; to: string }> {
  const key = (r: InflationIndexRowInput) =>
    `${r.year}-${String(r.month).padStart(2, '0')}`;

  // Una misma (año, mes) repetida rompería el upsert.
  const dedup = new Map<string, InflationIndexRowInput>();
  for (const r of rows) dedup.set(key(r), r);
  const clean = [...dedup.values()].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );

  const BATCH = 200;
  for (let i = 0; i < clean.length; i += BATCH) {
    await db
      .insert(indiceInflacion)
      .values(
        clean.slice(i, i + BATCH).map((r) => ({
          fuente: source,
          anio: r.year,
          mes: r.month,
          valor: r.value.toFixed(6),
        }))
      )
      .onConflictDoUpdate({
        target: [
          indiceInflacion.fuente,
          indiceInflacion.anio,
          indiceInflacion.mes,
        ],
        set: { valor: sql`excluded.valor`, updatedAt: new Date() },
      });
  }

  return {
    processed: clean.length,
    from: key(clean[0]),
    to: key(clean[clean.length - 1]),
  };
}
