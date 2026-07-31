/**
 * Labels en español para los enums del módulo de Sueldos.
 * Los valores de enum son los nombres internos de la BD; acá viven las
 * etiquetas legibles para la UI y los PDF.
 */

/** `recibo.tipo`: qué se liquida en ese recibo. */
export type ReciboTipo =
  | 'mensual'
  | 'quincenal'
  | 'anticipo'
  | 'sac'
  | 'vacaciones'
  | 'liquidacion_final'
  | 'comisiones'
  | 'fondo_desempleo'
  | 'otros';

// Indexable por string (el tipo llega como string desde varios actions),
// pero `satisfies` obliga a que estén todos los valores del enum.
export const RECIBO_TIPO_LABELS: Record<string, string> = {
  mensual: 'Sueldo',
  quincenal: 'Quincenal',
  anticipo: 'Anticipo',
  sac: 'SAC',
  vacaciones: 'Vacaciones',
  liquidacion_final: 'Liquidación final',
  comisiones: 'Comisiones',
  fondo_desempleo: 'Fondo de desempleo',
  otros: 'Varios',
} satisfies Record<ReciboTipo, string>;

export function tipoReciboLabel(tipo: string | null | undefined): string {
  if (!tipo) return 'Sueldo';
  return RECIBO_TIPO_LABELS[tipo] ?? tipo;
}

/** `recibo.quincena` pasó de text ('0'|'1'|'2') a smallint. */
export function quincenaLabel(q: number | null | undefined): string {
  if (q === 1) return '1ra quincena';
  if (q === 2) return '2da quincena';
  return 'Mes completo';
}
