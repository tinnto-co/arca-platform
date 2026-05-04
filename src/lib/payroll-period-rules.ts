/**
 * Reglas de negocio para períodos en el módulo Sueldos:
 * - Solo se puede liquidar el mes anterior al en curso.
 * - Solo se puede cargar información (novedades) y ver recibos de meses anteriores al en curso.
 */

/** Período en curso (YYYY-MM) */
export function getPeriodoMesActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Mes anterior al en curso (YYYY-MM) — usado como período inicial por defecto en el dashboard. */
export function getPeriodoMesAnterior(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (month === 0) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Indica si el período puede liquidarse.
 * Se permite cualquier mes hasta el en curso (inclusive).
 */
export function puedeLiquidarPeriodo(periodo: string): boolean {
  return periodo <= getPeriodoMesActual();
}

/**
 * Indica si el período es anterior al mes en curso (permite cargar novedades y ver recibos).
 * Solo meses estrictamente anteriores al actual.
 */
export function puedeIngresarDatosPeriodo(periodo: string): boolean {
  return periodo < getPeriodoMesActual();
}

/** Mismo criterio que puedeIngresarDatosPeriodo: solo períodos anteriores al en curso */
export function puedeVerReciboPeriodo(periodo: string): boolean {
  return periodo < getPeriodoMesActual();
}
