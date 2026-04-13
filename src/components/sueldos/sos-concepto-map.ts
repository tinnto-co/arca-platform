/**
 * Mapa estático de secciones y reglas de subtotales del formulario SOS Contador.
 * Las secciones clasifican conceptos por rango de código numérico.
 * Los subtotales se calculan como suma de `monto` en un rango de códigos.
 */

export type SeccionSos =
  | 'haberes'
  | 'descuentos'
  | 'retenciones'
  | 'liquidacion_final'
  | 'no_remunerativo'
  | 'retenciones_no_rem'
  | 'decretos';

export interface SeccionConfig {
  label: string;
  rangoMin: number;
  rangoMax: number;
  /** Columna de resultado en la que aparece el monto de los conceptos de esta sección */
  columna: 'haberes' | 'descuentos' | 'retenciones' | 'no_remunerativo';
}

export const SECCIONES_SOS: Record<SeccionSos, SeccionConfig> = {
  haberes: {
    label: 'Haberes remunerativos',
    rangoMin: 1,
    rangoMax: 99,
    columna: 'haberes',
  },
  descuentos: {
    label: 'Descuentos sobre haberes',
    rangoMin: 100,
    rangoMax: 199,
    columna: 'descuentos',
  },
  retenciones: {
    label: 'Retenciones',
    rangoMin: 200,
    rangoMax: 299,
    columna: 'retenciones',
  },
  liquidacion_final: {
    label: 'Liquidación final',
    rangoMin: 400,
    rangoMax: 409,
    columna: 'haberes',
  },
  no_remunerativo: {
    label: 'No remunerativos',
    rangoMin: 410,
    rangoMax: 499,
    columna: 'no_remunerativo',
  },
  retenciones_no_rem: {
    label: 'Retenciones sobre no remunerativos',
    rangoMin: 500,
    rangoMax: 599,
    columna: 'descuentos',
  },
  decretos: {
    label: 'Decretos y beneficios',
    rangoMin: 600,
    rangoMax: 699,
    columna: 'haberes',
  },
};

/** Orden de presentación de las secciones */
export const ORDEN_SECCIONES: SeccionSos[] = [
  'haberes',
  'descuentos',
  'retenciones',
  'liquidacion_final',
  'no_remunerativo',
  'retenciones_no_rem',
  'decretos',
];

export interface SubtotalSosConfig {
  key: string;
  label: string;
  /** Rango de códigos que contribuyen a este subtotal */
  rangoMin: number;
  rangoMax: number;
  /**
   * El subtotal se muestra después del último concepto cuyo código sea ≤ este valor.
   * Si no hay ningún concepto con código ≤ este valor, el subtotal se omite.
   */
  despuesDeCodigo: number;
}

/**
 * Subtotales intermedios del formulario SOS.
 * Según el HTML original, SOS usa estos subtotales como bases de cálculo para conceptos posteriores.
 * Subtot 1/9  → base para conceptos 19-24
 * Subtot 1/19 → base para conceptos 25-26, 29
 * Subtot 1/26 → base para concepto 30
 * Subtot 1/39 → base para concepto 43
 * Subtot 1/199 → base para retenciones 201-207, 209-210, 226-232
 * Subtot 411/469 → base para retenciones sobre no rem 501-504
 */
export const SUBTOTALES_SOS: SubtotalSosConfig[] = [
  { key: 'subtot_1_9', label: 'Subtotal 1/9', rangoMin: 1, rangoMax: 9, despuesDeCodigo: 9 },
  { key: 'subtot_1_19', label: 'Subtotal 1/19', rangoMin: 1, rangoMax: 19, despuesDeCodigo: 19 },
  { key: 'subtot_1_26', label: 'Subtotal 1/26', rangoMin: 1, rangoMax: 26, despuesDeCodigo: 26 },
  { key: 'subtot_1_39', label: 'Subtotal 1/39', rangoMin: 1, rangoMax: 39, despuesDeCodigo: 39 },
  {
    key: 'subtot_1_199',
    label: 'Total remunerativo (1/199)',
    rangoMin: 1,
    rangoMax: 199,
    despuesDeCodigo: 199,
  },
  {
    key: 'subtot_411_469',
    label: 'Subtotal 411/469',
    rangoMin: 411,
    rangoMax: 469,
    despuesDeCodigo: 469,
  },
];

/** Retorna la sección a la que pertenece un código, o null si no corresponde a ninguna. */
export function getSeccionSos(codigo: number): SeccionSos | null {
  for (const [key, cfg] of Object.entries(SECCIONES_SOS) as [SeccionSos, SeccionConfig][]) {
    if (codigo >= cfg.rangoMin && codigo <= cfg.rangoMax) return key;
  }
  return null;
}
