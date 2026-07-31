import type { WorkSheet } from 'xlsx';
import * as XLSX from 'xlsx';
import { normalizeLegajo } from '@/lib/legajo';

/**
 * Normaliza texto de encabezado (minúsculas, sin tildes, espacios).
 */
export function normalizeHeaderKey(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los exports SOS de legajos suelen traer:
 * - Fila 1: título ("Listado de Legajos - CUIT ...")
 * - Fila 2: encabezados reales (CUIT Empresa, Legajo, CUIL, ...)
 *
 * `sheet_to_json` sin rango usa la primera fila como keys → rompe CUIL/Legajo.
 * Esta función busca la fila que contiene la columna "CUIL" y arma objetos por fila.
 */
export function parseSosLegajosRows(
  sheet: WorkSheet
): Record<string, unknown>[] {
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  let headerRowIdx = -1;
  // `sheet_to_json` devuelve `unknown[]`; nos quedamos con la fila ya
  // estrechada por `Array.isArray` en vez de re-indexar el array crudo.
  let headerRow: unknown[] = [];
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = aoa[i];
    if (!Array.isArray(row)) continue;
    const hasCuil = row.some((cell) => {
      const s = normalizeHeaderKey(String(cell ?? ''));
      return s === 'cuil' || s.includes('cuil');
    });
    if (hasCuil) {
      headerRowIdx = i;
      headerRow = row;
      break;
    }
  }

  if (headerRowIdx === -1) return [];

  const headers = headerRow.map((c) => normalizeHeaderKey(String(c ?? '')));

  /**
   * SOS suele dejar la columna A vacía en la fila de encabezados (título arriba),
   * pero la fila de datos sí trae CUIT empresa en la columna 0. Sin compensar,
   * "Legajo" y "CUIL" quedan corridos y el CUIL termina en la columna del nombre.
   */
  const leadSkip = !headers[0] || String(headers[0]).trim() === '' ? 1 : 0;

  const out: Record<string, unknown>[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!Array.isArray(row)) continue;
    const o: Record<string, unknown> = {};
    for (let c = 0; c < row.length; c++) {
      const hi = c + leadSkip;
      if (hi >= headers.length) break;
      const key = headers[hi];
      if (!key) continue;
      if (o[key] !== undefined) continue;
      o[key] = row[c];
    }
    const hasData = Object.values(o).some(
      (v) => v != null && String(v).trim() !== ''
    );
    if (!hasData) continue;
    out.push(o);
  }

  return out;
}

/**
 * Obtiene CUIL de una fila ya parseada (clave normalizada o nombre de columna).
 */
export function getCuilFromLegajoRow(row: Record<string, unknown>): string {
  for (const k of Object.keys(row)) {
    const nk = normalizeHeaderKey(k);
    if (nk === 'cuil' || nk.includes('cuil')) {
      return normalizeCuilValue(row[k]);
    }
  }
  return '';
}

export function getLegajoFromLegajoRow(row: Record<string, unknown>): string {
  for (const k of Object.keys(row)) {
    if (normalizeHeaderKey(k) === 'legajo') {
      return normalizeLegajo(String(row[k] ?? ''));
    }
  }
  return '';
}

/**
 * CUIL desde Excel: puede venir como número (sin guiones); asegurar 11 dígitos si aplica.
 */
export function normalizeCuilValue(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.round(v);
    const s = String(n);
    if (s.length <= 11) return s.padStart(11, '0');
    return s.replace(/\D/g, '').slice(0, 11);
  }
  return String(v).replace(/\D/g, '');
}
