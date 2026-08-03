/**
 * Motor de ajuste por inflación (RT 6) y cálculo del RECPAM.
 *
 * Módulo puro: no toca la base de datos ni depende de React. Recibe saldos
 * anticuados + la serie de índices y devuelve la preplanilla (papel de trabajo)
 * y las líneas del asiento de ajuste. Toda la persistencia vive en
 * `src/actions/accounting.tsx`.
 *
 * Método: **indirecto**. Se reexpresan las partidas no monetarias y el RECPAM
 * surge por diferencia, como contrapartida neta de todos los ajustes. Es el que
 * admite la RT 6 (segunda parte, IV.B.8) y el que usa el papel de trabajo del
 * estudio.
 *
 * Convención de signos: **saldo deudor positivo, acreedor negativo**
 * (`debit - credit`), igual que `journalEntryLine`. Un ajuste positivo se imputa
 * al Debe; uno negativo, al Haber.
 *
 * Ver `docs/balances/09_AJUSTE_POR_INFLACION.md` para la metodología completa y
 * la verificación numérica contra los EECC de E-PRESIS SA.
 */

/**
 * Cómo trata el ajuste por inflación a una cuenta.
 *
 * - `monetaria`: no se reexpresa. Es la que **genera** el RECPAM (su poder
 *   adquisitivo se licúa). Caja, bancos, créditos y deudas en pesos.
 * - `no_monetaria_costo`: se reexpresa por coeficiente. Bienes de uso, bienes de
 *   cambio a costo, patrimonio neto, cuentas de resultado.
 * - `no_monetaria_valor_corriente`: **no** se reexpresa porque ya está medida en
 *   moneda de cierre (moneda extranjera al TC de cierre, títulos a cotización,
 *   bienes de cambio a VNR). Guía FACPCE: "las partidas no monetarias que se
 *   registran por valores corrientes del final del período no deben reexpresarse".
 * - `resultado_por_diferencia`: resultados financieros y por tenencia. No llevan
 *   coeficiente; quedan en el residuo junto con el RECPAM (Guía FACPCE, proceso
 *   secuencial, pasos i–j).
 */
export type InflationNature =
  | 'monetaria'
  | 'no_monetaria_costo'
  | 'no_monetaria_valor_corriente'
  | 'resultado_por_diferencia';

export const INFLATION_NATURE_LABELS: Record<InflationNature, string> = {
  monetaria: 'Monetaria (no se ajusta, genera RECPAM)',
  no_monetaria_costo: 'No monetaria a costo (se reexpresa)',
  no_monetaria_valor_corriente:
    'No monetaria a valor corriente (ya en moneda de cierre)',
  resultado_por_diferencia:
    'Resultado financiero / por tenencia (se determina por diferencia)',
};

/** Etiqueta corta, para columnas de tabla. */
export const INFLATION_NATURE_SHORT_LABELS: Record<InflationNature, string> = {
  monetaria: 'Monetaria',
  no_monetaria_costo: 'No monetaria a costo',
  no_monetaria_valor_corriente: 'No monetaria a valor corriente',
  resultado_por_diferencia: 'Resultado por diferencia',
};

/** Solo `no_monetaria_costo` lleva coeficiente. */
export function shouldReexpress(nature: InflationNature): boolean {
  return nature === 'no_monetaria_costo';
}

/* ─────────────────────── Clasificación por defecto ─────────────────────── */

/**
 * Naturaleza por defecto de cada rubro de exposición (`accountGroup`), según el
 * Cuadro N° 1 de RT 6. Es solo el default que propone el sistema: la naturaleza
 * efectiva se guarda por cuenta en `account.inflationNature`.
 */
export const DEFAULT_INFLATION_NATURE_BY_GROUP: Record<
  string,
  InflationNature
> = {
  // Activo corriente
  caja_bancos: 'monetaria',
  // Monetarias por decisión del estudio: las consideran equivalentes de
  // efectivo (integran el efectivo del EFE), y el efectivo es monetario. Si
  // fueran no monetarias no generarían RECPAM y el control cruzado del EFE
  // —variación del efectivo menos flujos reexpresados— dejaría de cerrar.
  inversiones_temporarias: 'monetaria',
  creditos_ventas: 'monetaria',
  otros_creditos_cte: 'monetaria',
  bienes_cambio: 'no_monetaria_costo',
  otros_activos_cte: 'monetaria',
  // Activo no corriente
  creditos_largo_plazo: 'monetaria',
  bienes_uso: 'no_monetaria_costo',
  intangibles: 'no_monetaria_costo',
  // El estudio las valúa a VPP, que ya está en moneda de cierre. Hoy ningún
  // cliente tiene participaciones; si apareciera alguna a costo, hay que
  // reclasificarla a mano.
  inversiones_permanentes: 'no_monetaria_valor_corriente',
  otros_activos_no_cte: 'monetaria',
  // Pasivo
  deudas_comerciales: 'monetaria',
  deudas_financieras: 'monetaria',
  deudas_sociales: 'monetaria',
  deudas_fiscales: 'monetaria',
  otras_deudas_cte: 'monetaria',
  deudas_largo_plazo: 'monetaria',
  previsiones: 'monetaria',
  // Patrimonio neto — todo no monetario a costo
  capital: 'no_monetaria_costo',
  aportes_irrevocables: 'no_monetaria_costo',
  primas_emision: 'no_monetaria_costo',
  reservas: 'no_monetaria_costo',
  resultados_no_asignados: 'no_monetaria_costo',
  // Se refunde al cierre; no se ajusta directo (sale del ER ya ajustado).
  resultado_ejercicio: 'no_monetaria_valor_corriente',
  // Resultados
  ventas: 'no_monetaria_costo',
  costo_ventas: 'no_monetaria_costo',
  gastos_administracion: 'no_monetaria_costo',
  gastos_comercializacion: 'no_monetaria_costo',
  gastos_financieros: 'resultado_por_diferencia',
  otros_resultados_pos: 'no_monetaria_costo',
  otros_resultados_neg: 'no_monetaria_costo',
  impuesto_ganancias: 'no_monetaria_costo',
};

/**
 * Rubros donde el default no alcanza y el contador tiene que confirmar, con el
 * motivo. Alimenta la pantalla de validación de clasificación (AXI-2).
 */
/**
 * Rubros donde la clasificación no se puede deducir del rubro solo. El resto
 * quedó cerrado con las respuestas del estudio (julio 2026): moneda extranjera
 * e inversiones temporarias no se reexpresan, los otros créditos son todos
 * monetarios, los anticipos van en una sola cuenta monetaria, los bienes de
 * cambio se reexpresan por el mes de origen de la existencia y los resultados
 * financieros van por diferencia.
 */
export const INFLATION_NATURE_NEEDS_REVIEW: Record<string, string> = {
  caja_bancos:
    'Las cuentas en moneda extranjera no se reexpresan (ya están al TC de cierre). Deben ir en cuenta separada.',
  inversiones_permanentes:
    'Medidas a VPP no se reexpresan; si alguna quedara a costo, hay que reexpresarla.',
  otros_activos_cte: 'Depende de la naturaleza de cada cuenta.',
  otros_activos_no_cte: 'Depende de la naturaleza de cada cuenta.',
};

export function defaultInflationNature(
  accountGroup: string | null | undefined
): InflationNature {
  if (!accountGroup) return 'monetaria';
  return DEFAULT_INFLATION_NATURE_BY_GROUP[accountGroup] ?? 'monetaria';
}

/* ──────────────────────────── Coeficientes ──────────────────────────── */

/** Clave de la serie de índices: "YYYY-MM". */
export function monthKey(year: number, month: number): string {
  return `${year}-${month.toString().padStart(2, '0')}`;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

/**
 * Coeficiente de reexpresión (RT 6, IV.B.6): índice de cierre sobre índice del
 * mes de origen de la partida, redondeado a 4 decimales — igual que la planilla
 * de FACPCE y que el papel de trabajo del estudio.
 */
export function reexpressionCoefficient(
  closingIndex: number,
  originIndex: number
): number {
  if (!(originIndex > 0)) {
    throw new Error(
      `Índice de origen inválido (${originIndex}): debe ser mayor a cero.`
    );
  }
  return r4(closingIndex / originIndex);
}

/* ──────────────────────────── Motor ──────────────────────────── */

export interface MonthlyMovement {
  year: number;
  month: number;
  /** Movimiento neto del mes, signo contable (debe − haber). */
  amount: number;
}

export interface InflationAccountInput {
  accountId: string;
  code: string;
  name: string;
  accountGroup: string | null;
  nature: InflationNature;
  /**
   * Cuenta que recibe el ajuste, si es distinta de la propia. El caso de uso es
   * Capital social → Ajuste de capital: el capital queda a valor nominal y su
   * reexpresión se acumula aparte (RT 6 y requisito explícito del estudio).
   */
  targetAccountId?: string | null;
  /** Saldo al inicio del ejercicio, signo contable. */
  opening?: number;
  /** Movimientos netos del ejercicio, agrupados por mes. */
  monthly?: MonthlyMovement[];
  /**
   * Coeficiente único para los movimientos del ejercicio, en lugar del de cada
   * mes. El saldo de apertura no se ve afectado: sigue yendo por el coeficiente
   * del cierre anterior.
   *
   * Lo usan las amortizaciones de bienes de uso, que llevan el coeficiente del
   * bien que amortizan y no el del mes en que se asentaron —ver
   * `accounting-fixed-asset-inflation.ts`.
   */
  monthlyCoefficient?: number | null;
}

export interface InflationEngineInput {
  /** Mes de cierre del ejercicio que se está ajustando. */
  closing: { year: number; month: number };
  /**
   * Mes al que se anticúan los saldos de apertura: el cierre del ejercicio
   * anterior.
   */
  openingMonth: { year: number; month: number };
  /** Serie de índices por mes ("YYYY-MM" → índice). */
  indexes: Record<string, number>;
  accounts: InflationAccountInput[];
  /** Cuenta donde se imputa la contrapartida global (5.4.004 RECPAM). */
  recpamAccountId: string;
}

/** Una fila de la preplanilla: cuenta × mes. */
export interface InflationLine {
  accountId: string;
  code: string;
  name: string;
  /** null en la fila de saldo de apertura. */
  year: number | null;
  month: number | null;
  isOpening: boolean;
  historical: number;
  coefficient: number;
  adjusted: number;
  difference: number;
}

export interface InflationAccountSummary {
  accountId: string;
  code: string;
  name: string;
  nature: InflationNature;
  /** Cuenta que recibe el ajuste (puede diferir de accountId). */
  targetAccountId: string;
  historical: number;
  adjusted: number;
  difference: number;
}

export interface InflationEntryLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

export interface InflationEngineResult {
  /** Papel de trabajo: una fila por cuenta y mes. */
  lines: InflationLine[];
  /** Agregado por cuenta, para la vista resumida de la preplanilla. */
  byAccount: InflationAccountSummary[];
  /** Líneas del asiento de ajuste, RECPAM incluido. */
  entryLines: InflationEntryLine[];
  /**
   * RECPAM en signo contable: positivo = saldo deudor = **pérdida** por
   * exposición a la inflación.
   */
  recpam: number;
  /** El asiento cuadra (debe = haber). Debería ser siempre true. */
  balanced: boolean;
}

function indexFor(
  indexes: Record<string, number>,
  year: number,
  month: number
): number {
  const key = monthKey(year, month);
  const value = indexes[key];
  if (value === undefined) {
    throw new Error(
      `Falta el índice de inflación de ${key}. Cargá la serie FACPCE antes de generar el ajuste.`
    );
  }
  if (!(value > 0)) {
    throw new Error(`El índice de ${key} es inválido (${value}).`);
  }
  return value;
}

/**
 * Calcula el ajuste por inflación de un ejercicio.
 *
 * Para cada cuenta no monetaria a costo reexpresa el saldo de apertura (por el
 * coeficiente del cierre anterior) y cada movimiento mensual (por el coeficiente
 * de su mes). La diferencia se imputa a la cuenta destino y el RECPAM absorbe el
 * neto, de modo que el asiento cuadra por construcción.
 */
export function computeInflationAdjustment(
  input: InflationEngineInput
): InflationEngineResult {
  const { closing, openingMonth, indexes, accounts, recpamAccountId } = input;
  const closingIndex = indexFor(indexes, closing.year, closing.month);

  const lines: InflationLine[] = [];
  const byAccount: InflationAccountSummary[] = [];

  for (const acc of accounts) {
    const reexpress = shouldReexpress(acc.nature);
    const accLines: InflationLine[] = [];
    // Los totales por cuenta se acumulan sin redondear y se redondean una sola
    // vez, al imputar. Redondear cada mes arrastraría hasta 1-2 centavos de
    // diferencia contra el papel de trabajo del contador.
    let rawHistorical = 0;
    let rawAdjusted = 0;

    const opening = acc.opening ?? 0;
    if (Math.abs(opening) >= 0.005) {
      const coef = reexpress
        ? reexpressionCoefficient(
            closingIndex,
            indexFor(indexes, openingMonth.year, openingMonth.month)
          )
        : 1;
      const rawAdj = opening * coef;
      rawHistorical += opening;
      rawAdjusted += rawAdj;
      const adjusted = r2(rawAdj);
      accLines.push({
        accountId: acc.accountId,
        code: acc.code,
        name: acc.name,
        year: null,
        month: null,
        isOpening: true,
        historical: r2(opening),
        coefficient: coef,
        adjusted,
        difference: r2(adjusted - r2(opening)),
      });
    }

    for (const mv of acc.monthly ?? []) {
      if (Math.abs(mv.amount) < 0.005) continue;
      const coef = !reexpress
        ? 1
        : (acc.monthlyCoefficient ??
          reexpressionCoefficient(
            closingIndex,
            indexFor(indexes, mv.year, mv.month)
          ));
      const rawAdj = mv.amount * coef;
      rawHistorical += mv.amount;
      rawAdjusted += rawAdj;
      const adjusted = r2(rawAdj);
      accLines.push({
        accountId: acc.accountId,
        code: acc.code,
        name: acc.name,
        year: mv.year,
        month: mv.month,
        isOpening: false,
        historical: r2(mv.amount),
        coefficient: coef,
        adjusted,
        difference: r2(adjusted - r2(mv.amount)),
      });
    }

    if (accLines.length === 0) continue;
    lines.push(...accLines);

    const historical = r2(rawHistorical);
    const adjusted = r2(rawAdjusted);
    byAccount.push({
      accountId: acc.accountId,
      code: acc.code,
      name: acc.name,
      nature: acc.nature,
      targetAccountId: acc.targetAccountId ?? acc.accountId,
      historical,
      adjusted,
      difference: r2(adjusted - historical),
    });
  }

  // El ajuste de una cuenta puede ir a otra (Capital → Ajuste de capital), así
  // que se acumula por cuenta destino antes de armar el asiento.
  const byTarget = new Map<string, number>();
  for (const s of byAccount) {
    if (Math.abs(s.difference) < 0.005) continue;
    byTarget.set(
      s.targetAccountId,
      r2((byTarget.get(s.targetAccountId) ?? 0) + s.difference)
    );
  }

  const entryLines: InflationEntryLine[] = [];
  for (const [accountId, amount] of byTarget) {
    if (Math.abs(amount) < 0.005) continue;
    entryLines.push({
      accountId,
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? -amount : 0,
      description: 'Ajuste por inflación RT 6',
    });
  }

  // El RECPAM cierra el asiento: es el neto de todos los ajustes, con signo
  // invertido. Positivo (deudor) = pérdida por exposición a la inflación.
  const totalDifference = r2([...byTarget.values()].reduce((s, v) => s + v, 0));
  const recpam = r2(-totalDifference);
  if (Math.abs(recpam) >= 0.005) {
    entryLines.push({
      accountId: recpamAccountId,
      debit: recpam > 0 ? recpam : 0,
      credit: recpam < 0 ? -recpam : 0,
      description: 'RECPAM del ejercicio',
    });
  }

  const totalDebit = r2(entryLines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(entryLines.reduce((s, l) => s + l.credit, 0));

  return {
    lines,
    byAccount,
    entryLines,
    recpam,
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
}
