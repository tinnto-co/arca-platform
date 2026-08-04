/**
 * Labels en español para los enums fiscales de `cliente`.
 * Los valores del enum son nombres internos; acá viven las etiquetas de la UI.
 */

export type CondicionIva =
  | 'responsable_inscripto'
  | 'monotributista'
  | 'exento'
  | 'no_alcanzado';

// Indexable por string (la condición llega como string desde los actions),
// pero `satisfies` obliga a que estén todos los valores del enum.
export const CONDICION_IVA_LABELS: Record<string, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  exento: 'Exento',
  no_alcanzado: 'No alcanzado',
} satisfies Record<CondicionIva, string>;
