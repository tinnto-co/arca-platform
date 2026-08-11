/**
 * Coeficiente de reexpresión de las amortizaciones de bienes de uso.
 *
 * El resto del ajuste anticúa cada partida por el mes en que se asentó. Con las
 * amortizaciones eso da mal: el contador las asienta una vez, casi siempre con
 * fecha de cierre, y entonces les tocaría coeficiente 1,0000 — mientras que el
 * costo del bien que amortizan está reexpresado a 1,3261 (por ejemplo). La
 * amortización es una porción de ese costo, así que tiene que llevar el mismo
 * coeficiente.
 *
 * Criterio del estudio (respuesta 10 del cuestionario):
 *
 *   El valor de origen se ajusta desde la última vez que se ajustó por
 *   inflación (cierre del año anterior), o desde la fecha de alta si el bien se
 *   adquirió en el ejercicio que se está liquidando. La amortización del
 *   ejercicio, la acumulada del ejercicio y la acumulada de años anteriores
 *   llevan todas el mismo coeficiente que el valor de origen.
 *
 * La acumulada de años anteriores sale sola: viene en el saldo de apertura y el
 * motor ya reexpresa las aperturas por el coeficiente del cierre anterior. Lo
 * que resuelve este módulo son las otras dos, que son movimientos del ejercicio.
 *
 * Por qué un promedio ponderado y no bien por bien: el mayor no dice a qué bien
 * corresponde cada línea de amortización, así que no se puede desagregar el
 * asiento. Pero el promedio ponderado por la amortización de cada bien da el
 * mismo resultado que calcular bien por bien, siempre que el total del mayor
 * coincida con el del registro:
 *
 *   total_mayor × [Σ(amort_i × coef_i) / Σ amort_i]  =  Σ(amort_i × coef_i)
 *
 * Por eso `registerDepreciation` devuelve el total del registro: quien llama
 * puede contrastarlo contra el mayor y avisar si difieren.
 */

/** Un bien del registro, con lo que hace falta para amortizar y anticuar. */
export interface FixedAssetForInflation {
  id: string;
  name: string;
  acquisitionDate: Date;
  originalValue: number;
  residualValue: number;
  usefulLifeYears: number;
  /** Fecha de baja, si el bien se dio de baja. */
  disposalDate: Date | null;
  /** Cuenta de amortizaciones acumuladas (regularizadora del activo). */
  accumDeprAccountId: string;
  /** Cuenta de amortización del ejercicio (resultado). */
  deprExpenseAccountId: string;
}

export interface DepreciationCoefficientInput {
  assets: FixedAssetForInflation[];
  /** Primer día del ejercicio que se está ajustando. */
  fiscalYearStart: Date;
  /** Último día del ejercicio. */
  fiscalYearEnd: Date;
  /** Coeficiente del cierre del ejercicio anterior. */
  openingCoefficient: number;
  /** Coeficiente de un mes cualquiera del ejercicio. */
  coefficientForMonth: (year: number, month: number) => number;
}

/** Lo que se calculó para un bien, para poder mostrarlo en el papel de trabajo. */
export interface FixedAssetDepreciationDetail {
  assetId: string;
  name: string;
  /** true si el bien se incorporó durante el ejercicio. */
  acquiredInPeriod: boolean;
  /** Meses que amortizó dentro del ejercicio. */
  months: number;
  /** Amortización del ejercicio según el registro. */
  depreciation: number;
  coefficient: number;
}

export interface DepreciationCoefficientResult {
  /**
   * Coeficiente único por cuenta de amortización — acumulada y del ejercicio.
   * Reemplaza al coeficiente del mes en los movimientos de esas cuentas.
   */
  byAccount: Map<string, number>;
  /** Amortización del ejercicio según el registro, por cuenta. */
  registerDepreciation: Map<string, number>;
  detail: FixedAssetDepreciationDetail[];
}

/** Índice de mes absoluto, para comparar y restar meses sin pelear con fechas. */
function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export function depreciationCoefficients(
  input: DepreciationCoefficientInput
): DepreciationCoefficientResult {
  const {
    assets,
    fiscalYearStart,
    fiscalYearEnd,
    openingCoefficient,
    coefficientForMonth,
  } = input;

  const startIdx = monthIndex(fiscalYearStart);
  const endIdx = monthIndex(fiscalYearEnd);

  const detail: FixedAssetDepreciationDetail[] = [];
  // Por cuenta: acumuladores de Σ(amort × coef) y Σ amort.
  const weighted = new Map<string, { num: number; den: number }>();

  for (const asset of assets) {
    const acqIdx = monthIndex(asset.acquisitionDate);
    if (acqIdx > endIdx) continue; // se incorporó después del cierre

    const acquiredInPeriod = acqIdx >= startIdx;
    // El bien viejo ya venía ajustado al cierre anterior: se reexpresa desde
    // ahí. El comprado en el ejercicio, desde su mes de alta.
    const coefficient = r4(
      acquiredInPeriod
        ? coefficientForMonth(
            asset.acquisitionDate.getUTCFullYear(),
            asset.acquisitionDate.getUTCMonth() + 1
          )
        : openingCoefficient
    );

    // Meses que el bien amortiza dentro del ejercicio. El mes de alta amortiza
    // completo y el de la vida útil también, así que el rango es inclusivo.
    const usefulEndIdx = acqIdx + asset.usefulLifeYears * 12 - 1;
    const disposalIdx = asset.disposalDate
      ? monthIndex(asset.disposalDate)
      : Infinity;
    const from = Math.max(acqIdx, startIdx);
    const to = Math.min(usefulEndIdx, disposalIdx, endIdx);
    const months = Math.max(0, to - from + 1);

    const annual =
      asset.usefulLifeYears > 0
        ? (asset.originalValue - asset.residualValue) / asset.usefulLifeYears
        : 0;
    const depreciation = r2((annual * months) / 12);

    detail.push({
      assetId: asset.id,
      name: asset.name,
      acquiredInPeriod,
      months,
      depreciation,
      coefficient,
    });

    if (depreciation <= 0) continue; // no pondera
    for (const accountId of [
      asset.accumDeprAccountId,
      asset.deprExpenseAccountId,
    ]) {
      const acc = weighted.get(accountId) ?? { num: 0, den: 0 };
      acc.num += depreciation * coefficient;
      acc.den += depreciation;
      weighted.set(accountId, acc);
    }
  }

  const byAccount = new Map<string, number>();
  const registerDepreciation = new Map<string, number>();
  for (const [accountId, { num, den }] of weighted) {
    if (den <= 0) continue;
    // El promedio va sin redondear, a propósito. La RT 6 manda redondear a
    // cuatro decimales el coeficiente de reexpresión, y eso se respeta: cada
    // bien lleva el suyo redondeado. Pero este promedio no es un coeficiente de
    // reexpresión sino el artificio que permite aplicar el resultado al total
    // del mayor; redondearlo rompería la igualdad con el cálculo bien por bien
    // que hace el contador. Se muestra a cuatro decimales, se calcula entero.
    byAccount.set(accountId, num / den);
    registerDepreciation.set(accountId, r2(den));
  }

  return { byAccount, registerDepreciation, detail };
}
