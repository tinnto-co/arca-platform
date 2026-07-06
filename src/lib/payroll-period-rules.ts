/**
 * Reglas de negocio para períodos en el módulo Sueldos:
 *
 * El período máximo liquidable se habilita el día 25 de cada mes:
 * - Antes del día 25: solo se puede liquidar hasta el mes anterior.
 * - A partir del día 25: se habilita el mes actual para liquidar.
 *
 * Ejemplo: el 25 de junio se habilita el período "Junio" (2025-06).
 *          Hasta el 24 de junio, el máximo es "Mayo" (2025-05).
 */

/** Período en curso (YYYY-MM) según el calendario. */
export function getPeriodoMesActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Período máximo que puede liquidarse en este momento.
 * - día >= 25 → mes actual
 * - día < 25  → mes anterior
 */
export function getPeriodoMaxLiquidable(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  if (now.getDate() >= 25) {
    // Se habilita el mes actual
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }
  // Solo hasta el mes anterior
  if (month === 0) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Período por defecto para el dashboard: el máximo liquidable. */
export function getPeriodoMesAnterior(): string {
  return getPeriodoMaxLiquidable();
}

/**
 * Indica si el período puede liquidarse según la regla del día 25.
 */
export function puedeLiquidarPeriodo(periodo: string): boolean {
  return periodo <= getPeriodoMaxLiquidable();
}

/**
 * Indica si el período permite cargar novedades y ver recibos.
 * Solo períodos hasta el máximo liquidable (inclusive).
 */
export function puedeIngresarDatosPeriodo(periodo: string): boolean {
  return periodo <= getPeriodoMaxLiquidable();
}

/** Mismo criterio que puedeIngresarDatosPeriodo. */
export function puedeVerReciboPeriodo(periodo: string): boolean {
  return periodo <= getPeriodoMaxLiquidable();
}

/**
 * Calcula los días que trabajó un empleado en el semestre del período dado.
 * - Si ingresó antes o el mismo día del inicio del semestre → 180 (semestre completo).
 * - Si ingresó dentro del semestre → días desde el ingreso hasta el último día del semestre.
 * - `fechaIngreso` acepta cadena ISO "YYYY-MM-DD" o null.
 */
export function calcularDiasSemestre(fechaIngreso: string | null, periodo: string): number {
  if (!fechaIngreso) return 180;
  const ingreso = new Date(fechaIngreso + 'T00:00:00');
  if (isNaN(ingreso.getTime())) return 180;
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const esPrimerSemestre = month <= 6;
  const semStart = new Date(year, esPrimerSemestre ? 0 : 6, 1);            // 1/1 ó 1/7
  const semEnd   = new Date(year, esPrimerSemestre ? 5 : 11, esPrimerSemestre ? 30 : 31); // 30/6 ó 31/12
  if (ingreso <= semStart) return 180;
  if (ingreso > semEnd)    return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.min(180, Math.max(1, Math.floor((semEnd.getTime() - ingreso.getTime()) / msPerDay) + 1));
}
