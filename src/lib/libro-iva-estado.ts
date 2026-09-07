/**
 * Estado del Libro de IVA Digital respecto del estimado de comprobantes.
 *
 * El libro es un borrador vivo: se abre el 1° del mes siguiente y se llena
 * durante ~2-3 semanas. Un borrador a medio cargar mostraría números POR
 * DEBAJO del estimado — pisar el dato bueno con uno incompleto. La regla del
 * estudio: comprobantes es la base confiable y no se pisa; el libro se
 * muestra como preview hasta estar completo, recién ahí reemplaza.
 *
 * Heurístico de completitud: el libro completo siempre debería ser ≥ el
 * estimado (incluye lo electrónico MÁS importaciones, despachos y no
 * electrónicos). Si está por debajo, le faltan comprobantes. Límite honesto:
 * detecta «faltan electrónicos», no «falta una importación» — aceptable
 * porque el estimado tampoco puede ver importaciones.
 */

export type EstadoLibroIva = 'vacio' | 'preliminar' | 'completo' | 'definitivo';

/**
 * El libro «alcanzó» al estimado si llega al 99%: evita quedar en preliminar
 * para siempre por diferencias de centavos o de clasificación por alícuota.
 */
export const UMBRAL_LIBRO_COMPLETO = 0.99;

export interface LibroComparable {
  netoVentas: number;
  netoCompras: number;
  debito: number;
  credito: number;
}

export function estadoLibroIva(args: {
  libro: LibroComparable | null;
  /** Existe iva_declaracion presentada del período: manda la DDJJ. */
  ddjjPresentada: boolean;
  /** Neto gravado de ventas del estimado de comprobantes (sin ajustes manuales). */
  estimadoVentas: number;
  /** Neto gravado de compras del estimado de comprobantes. */
  estimadoCompras: number;
}): EstadoLibroIva {
  if (args.ddjjPresentada) return 'definitivo';

  const l = args.libro;
  if (!l) return 'vacio';
  if (
    l.netoVentas === 0 &&
    l.netoCompras === 0 &&
    l.debito === 0 &&
    l.credito === 0
  )
    return 'vacio';

  // Sin estimado contra el que comparar (cliente sin comprobantes cargados),
  // el libro es lo único que hay: se toma como completo.
  const alcanza = (libro: number, estimado: number) =>
    estimado <= 0 || libro >= estimado * UMBRAL_LIBRO_COMPLETO;

  return alcanza(l.netoVentas, args.estimadoVentas) &&
    alcanza(l.netoCompras, args.estimadoCompras)
    ? 'completo'
    : 'preliminar';
}
