/**
 * Clasificación de cuentas por actividad, para el Estado de Flujo de Efectivo.
 *
 * El EFE por método directo expone las cobranzas y los pagos del ejercicio
 * agrupados en operativas, de inversión y de financiación. La cuenta de efectivo
 * en sí no se clasifica: **es** el efectivo. Lo que define la actividad es la
 * contrapartida del movimiento.
 *
 * Ver `docs/balances/09_AJUSTE_POR_INFLACION.md` (AXI-7).
 */

export type CashFlowActivity = 'operating' | 'investing' | 'financing';

export const CASH_FLOW_ACTIVITY_LABELS: Record<CashFlowActivity, string> = {
  operating: 'Actividades operativas',
  investing: 'Actividades de inversión',
  financing: 'Actividades de financiación',
};

/** Orden de exposición en el estado. */
export const CASH_FLOW_ACTIVITY_ORDER: CashFlowActivity[] = [
  'operating',
  'investing',
  'financing',
];

/**
 * Rubros que componen el efectivo y sus equivalentes. Sus movimientos no son
 * "causas": son la variación que el estado explica.
 *
 * Las inversiones temporarias quedan afuera a propósito: solo son equivalentes
 * de efectivo si son de altísima liquidez y vencimiento menor a tres meses, y
 * eso depende del instrumento. El contador puede marcarlas cuenta por cuenta.
 */
export const CASH_ACCOUNT_GROUPS = ['caja_bancos'] as const;

/**
 * Actividad por defecto de cada rubro. Es solo la propuesta del sistema; la
 * efectiva se guarda por cuenta en `account.cashFlowActivity`.
 */
export const DEFAULT_CASH_FLOW_ACTIVITY_BY_GROUP: Record<
  string,
  CashFlowActivity
> = {
  // Operativas: el giro del negocio y su capital de trabajo.
  creditos_ventas: 'operating',
  otros_creditos_cte: 'operating',
  bienes_cambio: 'operating',
  otros_activos_cte: 'operating',
  otros_activos_no_cte: 'operating',
  deudas_comerciales: 'operating',
  deudas_sociales: 'operating',
  deudas_fiscales: 'operating',
  otras_deudas_cte: 'operating',
  previsiones: 'operating',
  ventas: 'operating',
  costo_ventas: 'operating',
  gastos_administracion: 'operating',
  gastos_comercializacion: 'operating',
  otros_resultados_pos: 'operating',
  otros_resultados_neg: 'operating',
  impuesto_ganancias: 'operating',
  // Inversión: colocación y recupero de fondos en activos.
  inversiones_temporarias: 'investing',
  inversiones_permanentes: 'investing',
  bienes_uso: 'investing',
  intangibles: 'investing',
  creditos_largo_plazo: 'investing',
  // Financiación: aportes de los propietarios y deuda financiera.
  capital: 'financing',
  aportes_irrevocables: 'financing',
  primas_emision: 'financing',
  reservas: 'financing',
  resultados_no_asignados: 'financing',
  resultado_ejercicio: 'financing',
  deudas_financieras: 'financing',
  deudas_largo_plazo: 'financing',
  // Los resultados financieros se exponen en operativas salvo que el ente los
  // asigne a financiación; RT 8 admite ambas.
  gastos_financieros: 'operating',
};

export function defaultCashFlowActivity(
  accountGroup: string | null | undefined
): CashFlowActivity | null {
  if (!accountGroup) return null;
  if ((CASH_ACCOUNT_GROUPS as readonly string[]).includes(accountGroup)) {
    return null; // es el efectivo, no una causa
  }
  return DEFAULT_CASH_FLOW_ACTIVITY_BY_GROUP[accountGroup] ?? 'operating';
}

export function isCashGroup(accountGroup: string | null | undefined): boolean {
  return (
    !!accountGroup &&
    (CASH_ACCOUNT_GROUPS as readonly string[]).includes(accountGroup)
  );
}
