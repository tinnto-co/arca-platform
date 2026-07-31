/**
 * Los períodos fiscales se manejan como "YYYY-MM" en la app (inputs, filtros,
 * URLs), pero en la BD son columnas `date` con el primer día del mes. Acá viven
 * las dos conversiones para no repetir el `slice`/concat por todos lados.
 */

/** "2025-06" → "2025-06-01" (como se guarda en BD). */
export function periodoADate(periodo: string): string {
  return `${periodo}-01`;
}

/** "2025-06-01" → "2025-06" (como lo consume la UI). */
export function dateAPeriodo(fecha: string): string {
  return fecha.slice(0, 7);
}

/**
 * Rango inclusivo de períodos de un año, para filtrar columnas `date` que
 * siempre guardan el primer día del mes.
 */
export function rangoAnio(anio: number | string): { desde: string; hasta: string } {
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-01` };
}
