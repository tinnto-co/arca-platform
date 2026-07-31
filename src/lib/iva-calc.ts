/**
 * Cálculo de débito y crédito fiscal sobre el modelo ideal.
 *
 * A diferencia del modelo viejo (una fila `invoice` con 10 columnas
 * `amount_iva_XX`/`iva_XX`), acá cada comprobante trae sus alícuotas como filas
 * de `comprobante_alicuota`, con el neto y el IVA ya discriminados. El cálculo
 * es entonces una suma sobre esas filas: no hace falta despejar el IVA del
 * total dividiendo por 1,21.
 *
 * La letra (A/B/C/M/E) y si es nota de crédito salen del catálogo
 * `comprobante_tipo`, no de listas de códigos hardcodeadas.
 */

/** Una fila de `comprobante_alicuota` con los datos de su comprobante. */
export interface ComprobanteAlicuotaRow {
  direccion: 'emitido' | 'recibido';
  /** `comprobante_tipo.letra` — null en los tipos sin letra (tique genérico). */
  letra: string | null;
  /** `comprobante_tipo.es_nc`. */
  esNc: boolean;
  moneda: string | null;
  cotizacion: string | null;
  /** Alícuota en puntos porcentuales: '21.00', '10.50'. */
  alicuota: string;
  neto: string;
  iva: string;
}

export interface IvaBreakdown {
  // Ventas (emitidos)
  netoA21: number;
  netoA105: number;
  totalAmountB21: number;
  totalAmountB105: number;
  totalAmountB27: number;
  /** Neto de las NC recibidas de proveedores; integra el débito fiscal. */
  ncRecibidasNeto: number;
  /** IVA de las NC recibidas de proveedores; integra el débito fiscal. */
  ncRecibidasIva: number;
  debitoFiscal: number;
  // Compras (recibidos)
  netoInbound21: number;
  netoInbound105: number;
  netoInbound27: number;
  netoInbound5: number;
  netoInbound25: number;
  /** Neto de las NC emitidas a clientes; integra el crédito fiscal. */
  ncEmitidasNeto: number;
  /** IVA de las NC emitidas a clientes; integra el crédito fiscal. */
  ncEmitidasIva: number;
  netoGravadoCompras: number;
  creditoFiscalCompras: number;
}

/** Los comprobantes A y M discriminan IVA igual; el reporte los muestra juntos. */
const LETRAS_DISCRIMINADAS = ['A', 'M'];

/**
 * Calcula débito y crédito fiscal a partir de las alícuotas de un conjunto de
 * comprobantes.
 *
 * Las notas de crédito no se restan del lado en el que se emitieron: según los
 * arts. 11 y 12 de la Ley de IVA, la NC recibida de un proveedor se computa
 * como débito fiscal (devuelve el crédito que se había tomado) y la NC emitida
 * a un cliente se computa como crédito fiscal (recupera el débito declarado).
 */
export function calcularIva(rows: ComprobanteAlicuotaRow[]): IvaBreakdown {
  const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

  const b: IvaBreakdown = {
    netoA21: 0,
    netoA105: 0,
    totalAmountB21: 0,
    totalAmountB105: 0,
    totalAmountB27: 0,
    ncRecibidasNeto: 0,
    ncRecibidasIva: 0,
    debitoFiscal: 0,
    netoInbound21: 0,
    netoInbound105: 0,
    netoInbound27: 0,
    netoInbound5: 0,
    netoInbound25: 0,
    ncEmitidasNeto: 0,
    ncEmitidasIva: 0,
    netoGravadoCompras: 0,
    creditoFiscalCompras: 0,
  };

  for (const r of rows) {
    // Los importes se guardan en la moneda del comprobante; el reporte es en pesos.
    const cot = r.moneda?.toUpperCase() === 'ARS' ? 1 : n(r.cotizacion) || 1;
    const neto = n(r.neto) * cot;
    const iva = n(r.iva) * cot;
    const alicuota = n(r.alicuota);

    if (r.esNc) {
      if (r.direccion === 'recibido') {
        b.ncRecibidasNeto += neto;
        b.ncRecibidasIva += iva;
      } else {
        b.ncEmitidasNeto += neto;
        b.ncEmitidasIva += iva;
      }
      continue;
    }

    if (r.direccion === 'emitido') {
      if (r.letra && LETRAS_DISCRIMINADAS.includes(r.letra)) {
        if (alicuota === 21) b.netoA21 += neto;
        else if (alicuota === 10.5) b.netoA105 += neto;
      } else if (r.letra === 'B') {
        // El comprobante B no discrimina IVA en el papel: el reporte muestra el
        // total (neto + IVA), aunque el dato scrapeado venga separado.
        if (alicuota === 21) b.totalAmountB21 += neto + iva;
        else if (alicuota === 10.5) b.totalAmountB105 += neto + iva;
        else if (alicuota === 27) b.totalAmountB27 += neto + iva;
      }
      continue;
    }

    if (alicuota === 21) b.netoInbound21 += neto;
    else if (alicuota === 10.5) b.netoInbound105 += neto;
    else if (alicuota === 27) b.netoInbound27 += neto;
    else if (alicuota === 5) b.netoInbound5 += neto;
    else if (alicuota === 2.5) b.netoInbound25 += neto;
  }

  b.debitoFiscal =
    b.netoA21 * 0.21 +
    b.netoA105 * 0.105 +
    (b.totalAmountB21 / 1.21) * 0.21 +
    (b.totalAmountB105 / 1.105) * 0.105 +
    (b.totalAmountB27 / 1.27) * 0.27 +
    b.ncRecibidasIva;

  b.netoGravadoCompras =
    b.netoInbound27 +
    b.netoInbound21 +
    b.netoInbound105 +
    b.netoInbound5 +
    b.netoInbound25 +
    b.ncEmitidasNeto;

  b.creditoFiscalCompras =
    b.netoInbound21 * 0.21 +
    b.netoInbound105 * 0.105 +
    b.netoInbound27 * 0.27 +
    b.netoInbound5 * 0.05 +
    b.netoInbound25 * 0.025 +
    b.ncEmitidasIva;

  return b;
}
