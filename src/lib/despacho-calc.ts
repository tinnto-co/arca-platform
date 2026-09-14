/**
 * Cálculo del despacho de importación (IVA aduanero, Concepto 415).
 *
 * A la IA solo se le piden los 3 datos LEÍDOS del documento (alícuota, IVA en
 * USD y tipo de cambio); la aritmética es nuestra y determinística:
 *   iva_pesos = iva_usd × tc
 *   neto      = iva_pesos / (alicuota/100)   ← base imponible implícita
 *   total     = neto + iva_pesos
 *
 * El «neto gravado» derivado es la base que hace cerrar el IVA: para el
 * crédito fiscal es exacto; el valor CIF+aranceles real del despacho no viene
 * en el Concepto 415 y no se inventa.
 */

/** Alícuotas de IVA aduanero esperables. Otra cosa va a revisión, no a cálculo. */
export const ALICUOTAS_VALIDAS = [21, 10.5] as const;

export interface DespachoDatos {
  alicuota: number;
  ivaUsd: number;
  tipoCambio: number;
}

export interface DespachoDerivados {
  ivaPesos: number;
  netoGravado: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function alicuotaValida(alicuota: number): boolean {
  return ALICUOTAS_VALIDAS.some((a) => Math.abs(a - alicuota) < 0.001);
}

export function calcularDespacho(d: DespachoDatos): DespachoDerivados {
  const ivaPesos = round2(d.ivaUsd * d.tipoCambio);
  const netoGravado =
    d.alicuota > 0 ? round2(ivaPesos / (d.alicuota / 100)) : 0;
  return { ivaPesos, netoGravado, total: round2(netoGravado + ivaPesos) };
}

/** El nombre de la compra, según la convención pedida por el estudio. */
export function nombreCompraDespacho(
  tipo: 'importacion_directa' | 'destinacion_simplificada',
  numero: string
): string {
  return tipo === 'importacion_directa'
    ? `Factura de despacho de importación N° ${numero}`
    : `Compra Importaciones - N° ${numero}`;
}

/**
 * `comprobante.numero` es bigint y el número real de un despacho es
 * alfanumérico («24001IC04123456A»): se deriva un número ESTABLE de hasta 15
 * dígitos a partir del texto, así el mismo despacho siempre produce el mismo
 * comprobante y el unique natural de comprobante deduplica solo. La identidad
 * legible vive en despacho_importacion.numero.
 */
export function numeroComprobanteSintetico(numero: string): number {
  const limpio = numero.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // FNV-1a de 32 bits, dos pasadas con semillas distintas para 15 dígitos.
  const fnv = (s: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  };
  const a = fnv(limpio, 0x811c9dc5);
  const b = fnv(limpio, 0x9747b28c) % 1_000_000;
  return Number(`${a}${String(b).padStart(6, '0')}`);
}
