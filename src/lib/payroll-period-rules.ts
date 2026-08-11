/**
 * Reglas de negocio para períodos en el módulo Sueldos:
 *
 * Se pueden generar y consultar recibos de cualquier mes del año en curso.
 */

/** Período en curso (YYYY-MM) según el calendario. */
/**
 * Normaliza cualquier "YYYY-M", "YYYY-MM" o "YYYY-MM-DD" a "YYYY-MM".
 * Vino con el cierre contable de sueldos (rama staging); en el modelo ideal el
 * período es date, pero la UI y las server functions siguen hablando "YYYY-MM".
 */
export function normalizarPeriodoYYYYMM(fechaStr: string): string {
  const t = fechaStr.trim();
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(t);
  if (!m) return t;
  const y = m[1];
  const mo = String(m[2]).padStart(2, '0');
  return `${y}-${mo}`;
}

export function getPeriodoMesActual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Período máximo que puede liquidarse: diciembre del año en curso.
 * Todos los meses del año actual están habilitados.
 */
export function getPeriodoMaxLiquidable(): string {
  const year = new Date().getFullYear();
  return `${year}-12`;
}

/** Período por defecto para el dashboard: mes anterior al actual. */
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
 * Permite cualquier período dentro del año en curso.
 */
export function puedeLiquidarPeriodo(periodo: string): boolean {
  return periodo <= getPeriodoMaxLiquidable();
}

/**
 * Indica si el período permite cargar novedades y ver recibos.
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
export function calcularDiasSemestre(
  fechaIngreso: string | null,
  periodo: string
): number {
  if (!fechaIngreso) return 180;
  const ingreso = new Date(fechaIngreso + 'T00:00:00');
  if (isNaN(ingreso.getTime())) return 180;
  const [yearStr, monthStr] = periodo.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const esPrimerSemestre = month <= 6;
  const semStart = new Date(year, esPrimerSemestre ? 0 : 6, 1); // 1/1 ó 1/7
  const semEnd = new Date(
    year,
    esPrimerSemestre ? 5 : 11,
    esPrimerSemestre ? 30 : 31
  ); // 30/6 ó 31/12
  if (ingreso <= semStart) return 180;
  if (ingreso > semEnd) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.min(
    180,
    Math.max(
      1,
      Math.floor((semEnd.getTime() - ingreso.getTime()) / msPerDay) + 1
    )
  );
}
