/**
 * Motor de amortización de bienes de uso (Fase 4) — funciones PURAS (no tocan DB).
 *
 * Método: lineal. Criterio de cómputo mensual:
 *  - El mes de alta amortiza completo (mes 1).
 *  - El mes de baja NO amortiza ("a partir de la fecha de baja no entra en el cálculo").
 *  - La amortización acumulada nunca supera la base amortizable (valor origen − residual).
 *
 * Es el insumo del Anexo I y de los asientos de amortización al cierre.
 */

export interface DepreciableAsset {
  acquisitionDate: Date | string;
  originalValue: number | string;
  usefulLifeYears: number;
  residualValue: number | string;
  status: 'active' | 'sold' | 'discarded';
  disposalDate?: Date | string | null;
}

const num = (v: number | string | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;
const toDate = (d: Date | string): Date =>
  d instanceof Date ? d : new Date(d);
const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));

/** Base amortizable = valor de origen − valor residual (nunca negativa). */
export function amortizableBase(asset: DepreciableAsset): number {
  return Math.max(
    0,
    round2(num(asset.originalValue) - num(asset.residualValue))
  );
}

/** Cuota de amortización mensual (lineal). 0 si la vida útil es inválida. */
export function monthlyDepreciation(asset: DepreciableAsset): number {
  const months = asset.usefulLifeYears * 12;
  if (months <= 0) return 0;
  return round2(amortizableBase(asset) / months);
}

/**
 * Meses devengados al `asOf` (default: hoy). Mes de alta inclusive; mes de baja excluido.
 * Topeado a la vida útil total (no devenga más allá del final de vida).
 */
export function monthsAccrued(asset: DepreciableAsset, asOf: Date): number {
  const acq = toDate(asset.acquisitionDate);
  const totalMonths = asset.usefulLifeYears * 12;

  let end = asOf;
  let excludeEndMonth = false;
  if (asset.status !== 'active' && asset.disposalDate) {
    end = toDate(asset.disposalDate);
    excludeEndMonth = true; // el mes de baja no amortiza
  }

  let m =
    (end.getUTCFullYear() - acq.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - acq.getUTCMonth()) +
    1; // +1: el mes de alta cuenta completo
  if (excludeEndMonth) m -= 1;

  return clamp(m, 0, totalMonths);
}

/** Amortización acumulada al `asOf` (default: hoy), topeada a la base amortizable. */
export function accumulatedDepreciation(
  asset: DepreciableAsset,
  asOf: Date = new Date()
): number {
  const accrued = round2(
    monthlyDepreciation(asset) * monthsAccrued(asset, asOf)
  );
  return Math.min(accrued, amortizableBase(asset));
}

/** Valor residual contable (valor de libros) = origen − amortización acumulada. */
export function bookValue(
  asset: DepreciableAsset,
  asOf: Date = new Date()
): number {
  return round2(
    num(asset.originalValue) - accumulatedDepreciation(asset, asOf)
  );
}

export interface DepreciationSnapshot {
  monthly: number;
  monthsAccrued: number;
  accumulated: number;
  bookValue: number;
  fullyDepreciated: boolean;
}

/** Resumen de amortización a una fecha (todo en un cálculo, para listas/UI). */
export function depreciationSnapshot(
  asset: DepreciableAsset,
  asOf: Date = new Date()
): DepreciationSnapshot {
  const accumulated = accumulatedDepreciation(asset, asOf);
  return {
    monthly: monthlyDepreciation(asset),
    monthsAccrued: monthsAccrued(asset, asOf),
    accumulated,
    bookValue: round2(num(asset.originalValue) - accumulated),
    fullyDepreciated: accumulated >= amortizableBase(asset) - 0.005,
  };
}

/**
 * Amortización que corresponde a UN mes calendario (year, month=1..12).
 * Devuelve la cuota mensual si el bien estaba activo y dentro de su vida útil ese mes;
 * 0 si no. Insumo de los asientos de amortización al cierre.
 */
export function depreciationForMonth(
  asset: DepreciableAsset,
  year: number,
  month: number
): number {
  const acq = toDate(asset.acquisitionDate);
  const acqIndex = acq.getUTCFullYear() * 12 + acq.getUTCMonth();
  const target = year * 12 + (month - 1);
  const totalMonths = asset.usefulLifeYears * 12;

  // Antes del alta o pasada la vida útil → no amortiza.
  if (target < acqIndex) return 0;
  if (target > acqIndex + totalMonths - 1) return 0;

  // Mes de baja (o posterior) → no amortiza.
  if (asset.status !== 'active' && asset.disposalDate) {
    const dis = toDate(asset.disposalDate);
    const disIndex = dis.getUTCFullYear() * 12 + dis.getUTCMonth();
    if (target >= disIndex) return 0;
  }

  // No exceder la base (último mes puede ser un ajuste, pero con cuota fija lo dejamos parejo).
  return monthlyDepreciation(asset);
}
