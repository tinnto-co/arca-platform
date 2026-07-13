/**
 * Labels en español para los enums del módulo de Balances.
 * Los valores de enum son nombres internos (español normativo); acá viven
 * las etiquetas legibles para la UI.
 */

export type AccountGroup =
  | 'caja_bancos'
  | 'inversiones_temporarias'
  | 'creditos_ventas'
  | 'otros_creditos_cte'
  | 'bienes_cambio'
  | 'otros_activos_cte'
  | 'creditos_largo_plazo'
  | 'bienes_uso'
  | 'intangibles'
  | 'inversiones_permanentes'
  | 'otros_activos_no_cte'
  | 'deudas_comerciales'
  | 'deudas_financieras'
  | 'deudas_sociales'
  | 'deudas_fiscales'
  | 'otras_deudas_cte'
  | 'deudas_largo_plazo'
  | 'previsiones'
  | 'capital'
  | 'aportes_irrevocables'
  | 'primas_emision'
  | 'reservas'
  | 'resultados_no_asignados'
  | 'resultado_ejercicio'
  | 'ventas'
  | 'costo_ventas'
  | 'gastos_administracion'
  | 'gastos_comercializacion'
  | 'gastos_financieros'
  | 'otros_resultados_pos'
  | 'otros_resultados_neg'
  | 'impuesto_ganancias';

/** Macro-categoría de exposición (para agrupar el filtro de rubros). */
export const ACCOUNT_GROUP_SECTIONS: {
  section: string;
  groups: AccountGroup[];
}[] = [
  {
    section: 'Activo Corriente',
    groups: [
      'caja_bancos',
      'inversiones_temporarias',
      'creditos_ventas',
      'otros_creditos_cte',
      'bienes_cambio',
      'otros_activos_cte',
    ],
  },
  {
    section: 'Activo No Corriente',
    groups: [
      'creditos_largo_plazo',
      'bienes_uso',
      'intangibles',
      'inversiones_permanentes',
      'otros_activos_no_cte',
    ],
  },
  {
    section: 'Pasivo Corriente',
    groups: [
      'deudas_comerciales',
      'deudas_financieras',
      'deudas_sociales',
      'deudas_fiscales',
      'otras_deudas_cte',
    ],
  },
  {
    section: 'Pasivo No Corriente',
    groups: ['deudas_largo_plazo', 'previsiones'],
  },
  {
    section: 'Patrimonio Neto',
    groups: [
      'capital',
      'aportes_irrevocables',
      'primas_emision',
      'reservas',
      'resultados_no_asignados',
      'resultado_ejercicio',
    ],
  },
  {
    section: 'Resultados',
    groups: [
      'ventas',
      'costo_ventas',
      'gastos_administracion',
      'gastos_comercializacion',
      'gastos_financieros',
      'otros_resultados_pos',
      'otros_resultados_neg',
      'impuesto_ganancias',
    ],
  },
];

export const ACCOUNT_GROUP_LABELS: Record<AccountGroup, string> = {
  caja_bancos: 'Caja y Bancos',
  inversiones_temporarias: 'Inversiones temporarias',
  creditos_ventas: 'Créditos por ventas',
  otros_creditos_cte: 'Otros créditos',
  bienes_cambio: 'Bienes de cambio',
  otros_activos_cte: 'Otros activos corrientes',
  creditos_largo_plazo: 'Créditos a largo plazo',
  bienes_uso: 'Bienes de uso',
  intangibles: 'Activos intangibles',
  inversiones_permanentes: 'Inversiones permanentes',
  otros_activos_no_cte: 'Otros activos no corrientes',
  deudas_comerciales: 'Deudas comerciales',
  deudas_financieras: 'Deudas financieras',
  deudas_sociales: 'Deudas sociales',
  deudas_fiscales: 'Deudas fiscales',
  otras_deudas_cte: 'Otras deudas',
  deudas_largo_plazo: 'Deudas a largo plazo',
  previsiones: 'Previsiones',
  capital: 'Capital',
  aportes_irrevocables: 'Aportes irrevocables',
  primas_emision: 'Primas de emisión',
  reservas: 'Reservas',
  resultados_no_asignados: 'Resultados no asignados',
  resultado_ejercicio: 'Resultado del ejercicio',
  ventas: 'Ventas',
  costo_ventas: 'Costo de ventas',
  gastos_administracion: 'Gastos de administración',
  gastos_comercializacion: 'Gastos de comercialización',
  gastos_financieros: 'Gastos financieros',
  otros_resultados_pos: 'Otros resultados positivos',
  otros_resultados_neg: 'Otros resultados negativos',
  impuesto_ganancias: 'Impuesto a las ganancias',
};

export const ACCOUNT_TYPE_LABELS: Record<'imputable' | 'group', string> = {
  imputable: 'Imputable',
  group: 'Agrupación',
};

export const EXPECTED_BALANCE_LABELS: Record<
  'debit' | 'credit' | 'both',
  string
> = {
  debit: 'Deudor',
  credit: 'Acreedor',
  both: 'Ambos',
};

export const EXPENSE_FUNCTION_LABELS: Record<
  'administration' | 'sales' | 'financial' | 'other',
  string
> = {
  administration: 'Administración',
  sales: 'Comercialización',
  financial: 'Financiero',
  other: 'Otros',
};

/** Prefijo reservado para cuentas custom de cada empresa (esquema legacy "9.x"). */
export const CUSTOM_CODE_PREFIX = '9.';

/**
 * Inicio del rango reservado para cuentas propias dentro del último segmento del
 * código. Las cuentas base crecen `.001, .002…`; las propias se autoasignan
 * `.900, .901…` bajo el mismo padre, así quedan ordenadas junto a sus hermanas
 * sin colisionar con futuras cuentas base.
 */
export const CUSTOM_SEGMENT_START = 900;

/** Código de la cuenta de sistema "pendiente de revisión" (asientos auto sin regla). */
export const PENDING_REVIEW_CODE = '0.001';

/** Nombres de meses en español (índice 1 = Enero). */
export const MONTH_NAMES = [
  '',
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export const FISCAL_YEAR_STATUS_LABELS: Record<
  'open' | 'closing' | 'closed',
  string
> = {
  open: 'Abierto',
  closing: 'En cierre',
  closed: 'Cerrado',
};

export const JOURNAL_ORIGIN_LABELS: Record<string, string> = {
  manual: 'Manual',
  auto_invoice: 'Auto · Factura',
  auto_payroll: 'Auto · Sueldos',
  auto_closing: 'Auto · Cierre',
  auto_opening: 'Auto · Apertura',
  import_excel: 'Import Excel',
};

/* ── Reglas de mapeo (asientos automáticos) ── */

export const MAPPING_SOURCE_LABELS: Record<'invoice' | 'payroll', string> = {
  invoice: 'Facturas',
  payroll: 'Sueldos',
};

export const MAPPING_RULE_TYPE_LABELS: Record<
  'default' | 'conditional',
  string
> = {
  default: 'Default (fallback)',
  conditional: 'Condicional',
};

export const MAPPING_SIDE_LABELS: Record<'debit' | 'credit', string> = {
  debit: 'Debe',
  credit: 'Haber',
};

/** Base sobre la que se calcula el monto de cada línea del asiento generado. */
export const MAPPING_AMOUNT_BASIS_LABELS: Record<string, string> = {
  total: 'Total del comprobante',
  net: 'Neto (sin IVA)',
  vat: 'IVA',
  other_taxes: 'Otros impuestos / percepciones',
  concept_value: 'Valor del concepto (sueldos)',
  fixed: 'Monto fijo',
};

/* ── Bienes de uso (Fase 4) ── */

export const FIXED_ASSET_CATEGORY_LABELS: Record<string, string> = {
  rodados: 'Rodados',
  muebles_utiles: 'Muebles y útiles',
  equipos_computacion: 'Equipos de computación',
  instalaciones: 'Instalaciones',
  inmuebles: 'Inmuebles',
  maquinarias: 'Maquinarias',
  otros: 'Otros',
};

export const FIXED_ASSET_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  sold: 'Vendido',
  discarded: 'Dado de baja',
};

export const FIXED_ASSET_DISPOSAL_REASON_LABELS: Record<string, string> = {
  sale: 'Venta',
  disuse: 'Desuso',
  destruction: 'Destrucción',
};

/** Rubros considerados de gasto/resultado negativo (para validar la cuenta de amortización). */
export const EXPENSE_ACCOUNT_GROUPS = [
  'costo_ventas',
  'gastos_administracion',
  'gastos_comercializacion',
  'gastos_financieros',
  'otros_resultados_neg',
  'impuesto_ganancias',
] as const;

/* ── Cierre de ejercicio (Fase 5) ── */

/** Rubros de resultado (Estado de Resultados) que se refunden contra Resultado del ejercicio. */
export const RESULT_ACCOUNT_GROUPS = [
  'ventas',
  'costo_ventas',
  'gastos_administracion',
  'gastos_comercializacion',
  'gastos_financieros',
  'otros_resultados_pos',
  'otros_resultados_neg',
  'impuesto_ganancias',
] as const;

/** Grupo de la cuenta sistema "Resultado del ejercicio" (destino de la refundición). */
export const RESULT_TARGET_GROUP = 'resultado_ejercicio';
