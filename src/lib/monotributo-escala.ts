/**
 * Escala de monotributo: tope de ingresos brutos anuales por categoría.
 *
 * Fuente: ARCA (https://www.afip.gob.ar/monotributo/categorias.asp),
 * valores vigentes desde el 01/08/2026. La escala se actualiza por ley cada
 * semestre (feb/ago, por IPC): cuando cambie hay que actualizar esta tabla y
 * su `VIGENCIA_DESDE` — el banner de "estimado" de la UI existe justamente
 * porque este dato envejece.
 *
 * La categoría REAL del cliente (en la que está inscripto) viene de AFIP vía
 * el scrapper a `cliente_monotributo`. Esta escala sirve para lo otro: qué
 * categoría le CORRESPONDE por lo que facturó, y qué tan cerca del tope está.
 */

export const MONOTRIBUTO_VIGENCIA_DESDE = '2026-08-01';

/** Tope de ingresos brutos (12 meses) por categoría, en pesos. */
export const MONOTRIBUTO_TOPES: Record<string, number> = {
  A: 12_009_410.45,
  B: 17_595_182.74,
  C: 24_670_494.31,
  D: 30_628_651.43,
  E: 36_028_231.33,
  F: 45_151_659.41,
  G: 53_995_798.87,
  H: 81_924_660.37,
  I: 91_699_761.9,
  J: 105_012_519.2,
  K: 126_610_838.75,
};

const LETRAS = Object.keys(MONOTRIBUTO_TOPES);

/** Tope de una categoría, o null si la letra no está en la escala. */
export function topeDeCategoria(categoria: string | null | undefined) {
  if (!categoria) return null;
  return MONOTRIBUTO_TOPES[categoria.toUpperCase()] ?? null;
}

/**
 * La categoría más baja cuyo tope cubre la facturación. Por encima del tope
 * de K no hay categoría: corresponde el régimen general (devuelve null).
 */
export function categoriaEstimada(facturacion12m: number): string | null {
  if (!Number.isFinite(facturacion12m) || facturacion12m < 0) return null;
  for (const letra of LETRAS) {
    if (facturacion12m <= MONOTRIBUTO_TOPES[letra]) return letra;
  }
  return null;
}

/**
 * Qué tan cerca del tope está el cliente, contra su categoría real si se
 * conoce (scrapeada de AFIP) o contra la estimada por facturación.
 */
export function usoDelTope(
  facturacion12m: number,
  categoriaReal: string | null | undefined
): {
  categoria: string | null;
  esEstimada: boolean;
  tope: number | null;
  /** 0–1 (puede superar 1 si ya se pasó del tope de su categoría). */
  uso: number | null;
} {
  const real = topeDeCategoria(categoriaReal);
  if (real !== null) {
    return {
      categoria: categoriaReal!.toUpperCase(),
      esEstimada: false,
      tope: real,
      uso: facturacion12m / real,
    };
  }
  const estimada = categoriaEstimada(facturacion12m);
  const tope = topeDeCategoria(estimada);
  return {
    categoria: estimada,
    esEstimada: true,
    tope,
    uso: tope ? facturacion12m / tope : null,
  };
}
