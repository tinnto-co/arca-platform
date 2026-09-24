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
export const CASH_ACCOUNT_GROUPS = [
  'caja_bancos',
  // El estudio cuenta plazos fijos y FCI como equivalentes de efectivo.
  'inversiones_temporarias',
] as const;

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

/**
 * Cuentas cuyo nombre contable no dice qué pasó con la plata (TIN-1431).
 *
 * En el Estado de Flujo de Efectivo lo que importa es el origen o el destino
 * de los fondos, no el nombre de la cuenta que los generó: «Deudores por
 * ventas» es un saldo, «Cobros por Ventas» es lo que efectivamente entró.
 *
 * El renombre es solo de presentación y vive acá: cambiar `cuenta.nombre`
 * afectaría al plan de cuentas, al mayor y a todos los demás estados.
 *
 * «Accionistas» además se reclasifica. Su rubro es `otros_creditos_cte`, que
 * por defecto es operativa, pero un aporte de los socios es financiación: no
 * sale del giro del negocio. La reclasificación por rubro no la alcanza porque
 * la cuenta no está en `aportes_irrevocables`.
 *
 * La clave es el nombre normalizado y no el código, a propósito: estas cuentas
 * pueden ser propias del cliente y ahí el código varía de una empresa a otra.
 * Un `cuenta.flujo_efectivo` cargado a mano sigue teniendo prioridad sobre
 * esto.
 */
const EFE_PRESENTACION: Record<
  string,
  { etiqueta: string; actividad?: CashFlowActivity }
> = {
  'deudores por ventas': { etiqueta: 'Cobros por Ventas' },
  proveedores: { etiqueta: 'Pagos por Compras' },
  accionistas: {
    etiqueta: 'Aportes de los propietarios',
    actividad: 'financing',
  },
};

/** minúsculas, sin acentos y sin espacios de más. */
function normalizar(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Cómo mostrar y clasificar una cuenta en el EFE. Coincidencia exacta por
 * nombre, no por substring: «Anticipos a proveedores» no es «Proveedores».
 */
export function presentacionEfe(
  nombre: string | null | undefined
): { etiqueta: string; actividad?: CashFlowActivity } | undefined {
  if (!nombre) return undefined;
  return EFE_PRESENTACION[normalizar(nombre)];
}

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
