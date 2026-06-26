/**
 * Normaliza un legajo para guardar en BD: elimina ceros a la izquierda si es numérico.
 * Devuelve string vacío si el valor es nulo/vacío (no "—").
 */
export function normalizeLegajo(raw: string | null | undefined): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (s === '') return '';
  if (/^\d+$/.test(s)) {
    const sinCeros = s.replace(/^0+/, '');
    return sinCeros === '' ? '0' : sinCeros;
  }
  return s;
}

/**
 * Muestra el legajo sin ceros a la izquierda cuando es numérico (ej. 00000000002 → 2).
 * Si no es solo dígitos, devuelve el texto tal cual (trim).
 */
export function legajoParaMostrar(raw: string | null | undefined): string {
  if (raw == null) return '—';
  const s = normalizeLegajo(raw);
  return s === '' ? '—' : s;
}
