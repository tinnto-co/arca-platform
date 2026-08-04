/**
 * Totales de recibo alineados con TablaReciboSos / SECCIONES_SOS.
 * Suma montos liquidados por código de fila (1–699).
 */

type SeccionKey =
  | 'haberes'
  | 'descuentos'
  | 'retenciones'
  | 'liquidacion_final'
  | 'no_remunerativo'
  | 'retenciones_no_rem'
  | 'decretos';

const SECCIONES: Record<
  SeccionKey,
  { rangoMin: number; rangoMax: number; columna: string }
> = {
  haberes: { rangoMin: 1, rangoMax: 99, columna: 'haberes' },
  descuentos: { rangoMin: 100, rangoMax: 199, columna: 'descuentos' },
  retenciones: { rangoMin: 200, rangoMax: 299, columna: 'retenciones' },
  liquidacion_final: { rangoMin: 400, rangoMax: 409, columna: 'haberes' },
  no_remunerativo: { rangoMin: 410, rangoMax: 499, columna: 'no_remunerativo' },
  retenciones_no_rem: { rangoMin: 500, rangoMax: 599, columna: 'descuentos' },
  decretos: { rangoMin: 600, rangoMax: 699, columna: 'haberes' },
};

function sumaRango(
  montoByCodigo: Record<string, number>,
  min: number,
  max: number
): number {
  let total = 0;
  for (const [cod, val] of Object.entries(montoByCodigo)) {
    const n = parseInt(cod, 10);
    if (!isNaN(n) && n >= min && n <= max) total += val;
  }
  return total;
}

function sectionTotal(
  montoByCodigo: Record<string, number>,
  s: SeccionKey
): number {
  const cfg = SECCIONES[s];
  return sumaRango(montoByCodigo, cfg.rangoMin, cfg.rangoMax);
}

export function totalesReciboSosDesdeMontos(
  montoByCodigo: Record<string, number>
): {
  haberes: number;
  descuentos: number;
  retenciones: number;
  noRemunerativo: number;
  neto: number;
} {
  const haberes =
    sectionTotal(montoByCodigo, 'haberes') +
    sectionTotal(montoByCodigo, 'liquidacion_final') +
    sectionTotal(montoByCodigo, 'decretos');
  const descuentos = sectionTotal(montoByCodigo, 'descuentos');
  const retenciones =
    sectionTotal(montoByCodigo, 'retenciones') +
    sectionTotal(montoByCodigo, 'retenciones_no_rem');
  const noRemunerativo = sectionTotal(montoByCodigo, 'no_remunerativo');
  const neto = haberes - descuentos - retenciones + noRemunerativo;
  return { haberes, descuentos, retenciones, noRemunerativo, neto };
}

export function parseDecimalSos(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  // Un solo punto es decimal (así vienen los numeric de Postgres). Dos o más
  // sólo pueden ser separadores de miles tipeados a mano ("1.137.677"), que
  // parseFloat cortaría en 1.137 sin avisar.
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : (t.match(/\./g)?.length ?? 0) > 1
      ? t.replace(/\./g, '')
      : t;
  const n = parseFloat(normalized);
  return isNaN(n) ? null : n;
}

/**
 * Los numeric de Postgres vuelven con sus decimales completos ("30.0000"), y en
 * un input se leen como treinta mil. Recorta los ceros sobrantes para mostrar.
 * Sólo toca strings que ya son un decimal con punto: lo que el usuario está
 * tipeando (con coma, o a medio escribir) pasa intacto.
 */
export function limpiarDecimalesSos(raw: string | null | undefined): string {
  const t = (raw ?? '').trim();
  if (!/^-?\d+\.\d+$/.test(t)) return t;
  return t.replace(/\.?0+$/, '');
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface MontoLiquidadoSosOptions {
  /** Si es true, ignora el texto en `monto` y aplica siempre la fórmula (p. ej. tras editar % o importe). */
  forceFormula?: boolean;
}

/**
 * Monto liquidado por fila: si hay texto en `monto`, ese valor gana; si no, fórmula SOS:
 * cantidad × (%/100) × (importeConceptoNumero ?? importe); luego piso por importeMinimo.
 */
export function montoLiquidadoDesdeEditsSos(
  row: {
    monto: string;
    cantidad: string;
    porcentaje: string;
    importeConceptoNumero: string;
    importe: string;
    importeMinimo: string;
    importeMaximo: string;
  },
  options?: MontoLiquidadoSosOptions
): number {
  const forceFormula = options?.forceFormula === true;
  const montoStr = row.monto?.trim() ?? '';
  if (!forceFormula && montoStr !== '') {
    const direct = parseDecimalSos(row.monto);
    return roundMoney(direct ?? 0);
  }

  // Cantidad vacía cuenta como 1 (igual que el motor de cálculo): la cantidad
  // solo multiplica cuando el concepto la usa (días, años, horas).
  const cant = parseDecimalSos(row.cantidad) ?? 1;
  const pct = parseDecimalSos(row.porcentaje) ?? 0;
  const impNro = parseDecimalSos(row.importeConceptoNumero);
  const imp = parseDecimalSos(row.importe);

  // Caso: importe directo sin porcentaje (ej. monto fijo override).
  // Evita calcular importe x 0% = 0 cuando el usuario solo ingresa un importe.
  if (pct === 0) {
    const directAmount = impNro ?? imp;
    if (directAmount !== null) return roundMoney(directAmount);
    return 0;
  }
  // Si no hay base explícita, la fórmula reduce a: cantidad × (pct/100)
  const base = impNro ?? imp ?? 1;
  let result = cant * (pct / 100) * base;
  const impMin = parseDecimalSos(row.importeMinimo);
  if (impMin !== null && result < impMin) result = impMin;
  const impMax = parseDecimalSos(row.importeMaximo);
  if (impMax !== null && result > impMax) result = impMax;
  return roundMoney(result);
}
