/**
 * Cálculo del despacho de importación (IVA aduanero, Concepto 415).
 *
 * A la IA solo se le piden los datos LEÍDOS del documento; la aritmética es
 * nuestra y determinística:
 *   iva_pesos = iva_usd × tc
 *   neto      = iva_pesos / (alicuota/100)   ← base imponible implícita
 *   total     = neto + iva_pesos
 *
 * El «neto gravado» derivado es la base que hace cerrar el IVA: para el
 * crédito fiscal es exacto; el valor CIF+aranceles real del despacho no viene
 * en el Concepto 415 y no se inventa.
 *
 * **Un despacho tiene una lista de líneas, no una sola alícuota.** Sale de
 * mirar despachos reales: una Importación Directa trae un concepto 415 por
 * ítem (se vieron tres en un mismo despacho) y una Destinación Simplificada
 * de courier puede consolidar seis envíos con alícuotas distintas. Cuando se
 * guardaba una sola, el resto desaparecía sin aviso y el crédito fiscal
 * quedaba corto.
 *
 * El tipo de cambio es uno solo por despacho: es la cotización del documento.
 */

/** Alícuotas de IVA aduanero esperables. Otra cosa va a revisión, no a cálculo. */
export const ALICUOTAS_VALIDAS = [21, 10.5] as const;

/** Un concepto 415 del despacho: su alícuota y su IVA en dólares. */
export interface LineaDespacho {
  alicuota: number;
  ivaUsd: number;
}

export interface DespachoDatos {
  lineas: LineaDespacho[];
  tipoCambio: number;
}

export interface LineaDerivada extends LineaDespacho {
  ivaPesos: number;
  netoGravado: number;
  total: number;
}

export interface DespachoDerivados {
  /** Una por alícuota, que es como lo necesita el libro de IVA compras. */
  lineas: LineaDerivada[];
  ivaPesos: number;
  netoGravado: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function alicuotaValida(alicuota: number): boolean {
  return ALICUOTAS_VALIDAS.some((a) => Math.abs(a - alicuota) < 0.001);
}

/**
 * Suma las líneas del despacho, cada una con su propio neto.
 *
 * Las líneas de la misma alícuota se consolidan: el libro de IVA lleva un
 * renglón por alícuota, y `comprobante_alicuota` tiene un único registro por
 * (comprobante, alícuota). Sumar acá evita que dos conceptos 415 al 21% se
 * pisen al guardar.
 */
export function calcularDespacho(d: DespachoDatos): DespachoDerivados {
  const porAlicuota = new Map<number, number>();
  for (const l of d.lineas) {
    if (l.alicuota <= 0) continue;
    porAlicuota.set(l.alicuota, (porAlicuota.get(l.alicuota) ?? 0) + l.ivaUsd);
  }

  const lineas: LineaDerivada[] = [...porAlicuota.entries()]
    // Mayor primero: el 21% es el caso habitual y encabeza la lista.
    .sort((a, b) => b[0] - a[0])
    .map(([alicuota, ivaUsd]) => {
      const ivaPesos = round2(ivaUsd * d.tipoCambio);
      const netoGravado = round2(ivaPesos / (alicuota / 100));
      return {
        alicuota,
        ivaUsd: round2(ivaUsd),
        ivaPesos,
        netoGravado,
        total: round2(netoGravado + ivaPesos),
      };
    });

  const sumar = (f: (l: LineaDerivada) => number) =>
    round2(lineas.reduce((s, l) => s + f(l), 0));

  return {
    lineas,
    ivaPesos: sumar((l) => l.ivaPesos),
    netoGravado: sumar((l) => l.netoGravado),
    total: sumar((l) => l.total),
  };
}

/**
 * Deduce cómo se reparte un IVA cuando el documento no dice la alícuota.
 *
 * Pasa en las Destinaciones Simplificadas de courier que consolidan varios
 * envíos: la liquidación de Aduana lista "415 I.V.A. 1.888,67" y el tipo de
 * cambio, pero ningún porcentaje. Como solo existen dos alícuotas posibles, el
 * reparto se puede despejar de la base imponible:
 *
 *   base21 + base105 = base            (las dos partes suman la base)
 *   0,21·base21 + 0,105·base105 = iva  (y su IVA, el del documento)
 *
 * Si el cociente iva/base da 21% o 10,5% justo, hay una sola alícuota. Si cae
 * en el medio, hay mezcla y el sistema de dos ecuaciones la resuelve exacto.
 * Fuera de ese rango no se infiere nada: es preferible pedir el dato a
 * inventar un crédito fiscal.
 *
 * Devuelve una PROPUESTA para que alguien la confirme, no una verdad: el
 * despeje asume que las únicas alícuotas son 21 y 10,5, así que un despacho
 * con otra daría un resultado que parece correcto y no lo es.
 */
export function inferirLineas(
  ivaUsd: number,
  baseUsd: number
): { lineas: LineaDespacho[]; mezcla: boolean } | null {
  if (!(ivaUsd > 0) || !(baseUsd > 0)) return null;

  const [mayor, menor] = [21, 10.5];
  const pct = (ivaUsd / baseUsd) * 100;
  // Un centavo de diferencia sobre la base, llevado a puntos porcentuales:
  // los importes vienen redondeados a dos decimales y el cociente nunca da
  // exacto al infinito.
  const tolerancia = Math.max((0.01 / baseUsd) * 100, 0.01);

  for (const a of ALICUOTAS_VALIDAS) {
    if (Math.abs(pct - a) <= tolerancia)
      return {
        lineas: [{ alicuota: a, ivaUsd: round2(ivaUsd) }],
        mezcla: false,
      };
  }

  // Entre las dos alícuotas: hay de las dos. Fuera del rango no se infiere.
  if (pct <= menor || pct >= mayor) return null;

  const baseMayor =
    (ivaUsd - (menor / 100) * baseUsd) / ((mayor - menor) / 100);
  const baseMenor = baseUsd - baseMayor;
  if (baseMayor <= 0 || baseMenor <= 0) return null;

  return {
    lineas: [
      { alicuota: mayor, ivaUsd: round2(baseMayor * (mayor / 100)) },
      { alicuota: menor, ivaUsd: round2(baseMenor * (menor / 100)) },
    ],
    mezcla: true,
  };
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
