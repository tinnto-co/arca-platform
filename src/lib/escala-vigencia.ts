/**
 * Cuánto puede durar una escala salarial.
 *
 * Una paritaria fija sueldos por meses, no por años: las escalas reales duran
 * uno, dos, a lo sumo unos pocos meses. Una fila que dice durar cinco años no
 * es una escala, es otra cosa mal leída — y como el cálculo toma siempre la
 * vigencia más reciente, esa fila le gana a todas las mensuales que vengan
 * después.
 *
 * Pasó: el scrapeo importó de una página una fila "Jul 2026 – Mar 2031" que en
 * realidad era la base de cálculo del acuerdo, y las liquidaciones de Comercio
 * de 34 empresas salieron con el básico de junio desde julio hasta que el
 * estudio lo notó en septiembre. Con este límite se cortaba en la carga.
 *
 * Sin fecha de fin sí se permite: es lo normal para la última escala cargada,
 * que rige hasta que se cargue la siguiente.
 */

/** Meses que puede abarcar una escala. Trece deja pasar un acuerdo anual. */
export const MESES_MAX_VIGENCIA = 13;

export interface RangoVigencia {
  desde: string;
  hasta?: string | null;
}

/**
 * Meses de calendario que toca el rango, contando los dos extremos: de
 * septiembre a septiembre es 1, no 0, y de enero de 2026 a enero de 2027 son
 * 13. Es la forma natural de decir "esta escala rige tantos meses".
 */
export function mesesAbarcados(desde: string, hasta: string): number {
  const [ad, md] = desde.split('-').map(Number);
  const [ah, mh] = hasta.split('-').map(Number);
  if (!ad || !md || !ah || !mh) return 0;
  return (ah - ad) * 12 + (mh - md) + 1;
}

/** `true` si dura más de lo que puede durar una escala. */
export function vigenciaExcedida({ desde, hasta }: RangoVigencia): boolean {
  if (!hasta) return false;
  return mesesAbarcados(desde, hasta) > MESES_MAX_VIGENCIA;
}

/** `true` si la fecha de fin es anterior al inicio. */
export function vigenciaInvertida({ desde, hasta }: RangoVigencia): boolean {
  return !!hasta && hasta < desde;
}

/** Mensaje para el estudio, o null si el rango está bien. */
export function problemaVigencia(rango: RangoVigencia): string | null {
  if (vigenciaInvertida(rango)) {
    return 'La escala termina antes de empezar: revisá las fechas de vigencia.';
  }
  if (vigenciaExcedida(rango)) {
    return `Una escala no puede durar más de ${MESES_MAX_VIGENCIA} meses. Si el acuerdo fija un valor por mes, cargá una escala por período; si lo que tenés es la base de cálculo del acuerdo, esa no es una escala.`;
  }
  return null;
}
