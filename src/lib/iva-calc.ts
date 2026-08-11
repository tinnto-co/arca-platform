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

/** Un renglón del desglose por alícuota de las notas de crédito. */
export interface NcAlicuota {
  /** Alícuota en puntos porcentuales: 21, 10.5. */
  alicuota: number;
  neto: number;
  iva: number;
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
  /**
   * Las mismas NC recibidas abiertas por alícuota, ordenadas de menor a mayor.
   * Es el desglose que AFIP publica como "Compras en el Mercado Local que
   * generan Crédito Fiscal a Restituir"; suma exactamente `ncRecibidasNeto`.
   */
  ncRecibidasPorAlicuota: NcAlicuota[];
  /**
   * IVA de las ventas del período, sumado tal como viene discriminado en cada
   * comprobante. Es la columna "Débito Fiscal" del Libro IVA Ventas de AFIP:
   * NO incluye la restitución de las NC recibidas.
   */
  debitoFiscalVentas: number;
  /** `debitoFiscalVentas` + `ncRecibidasIva`. El de la declaración jurada. */
  debitoFiscal: number;
  // Compras (recibidos)
  netoInbound21: number;
  netoInbound105: number;
  netoInbound27: number;
  netoInbound5: number;
  netoInbound25: number;
  /**
   * Compras gravadas a tasa cero. No generan crédito, pero AFIP las cuenta en
   * el neto gravado del Libro IVA Compras — no son lo mismo que exento.
   */
  netoInbound0: number;
  /** Neto de las NC emitidas a clientes; integra el crédito fiscal. */
  ncEmitidasNeto: number;
  /** IVA de las NC emitidas a clientes; integra el crédito fiscal. */
  ncEmitidasIva: number;
  /** Idem `ncRecibidasPorAlicuota`, para las NC emitidas. */
  ncEmitidasPorAlicuota: NcAlicuota[];
  /**
   * Neto gravado de las compras del período. Es "Operaciones de Compras" del
   * Libro IVA: no incluye el neto de las NC emitidas, porque lo que el art. 12
   * permite recuperar es el impuesto, no la base — y esa base no es una compra.
   */
  netoGravadoCompras: number;
  /**
   * IVA de las compras, sumado tal como viene discriminado en cada comprobante.
   * Es la columna "Crédito Fiscal" del Libro IVA Compras: NO incluye las NC
   * emitidas. Contraparte de `debitoFiscalVentas`.
   */
  creditoFiscalComprasSinNc: number;
  /**
   * `creditoFiscalComprasSinNc` + `ncEmitidasIva`. El de la declaración jurada.
   * El nombre no dice "SinNc" por simetría con el de arriba, sino porque ya lo
   * consumen el copiloto, el agente y `verify-iva-nc`.
   */
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
    ncRecibidasPorAlicuota: [],
    debitoFiscalVentas: 0,
    debitoFiscal: 0,
    netoInbound21: 0,
    netoInbound105: 0,
    netoInbound27: 0,
    netoInbound5: 0,
    netoInbound25: 0,
    netoInbound0: 0,
    ncEmitidasNeto: 0,
    ncEmitidasIva: 0,
    ncEmitidasPorAlicuota: [],
    netoGravadoCompras: 0,
    creditoFiscalComprasSinNc: 0,
    creditoFiscalCompras: 0,
  };

  // Acumuladores del desglose de NC. Se agrupa por alícuota en vez de por
  // buckets fijos (21/10,5/...) porque acá no hay fórmula que dependa de la
  // alícuota: cualquier valor que traiga AFIP se muestra tal cual.
  const ncRecibidas = new Map<number, NcAlicuota>();
  const ncEmitidas = new Map<number, NcAlicuota>();
  const acumularNc = (
    m: Map<number, NcAlicuota>,
    a: number,
    neto: number,
    iva: number
  ) => {
    const fila = m.get(a) ?? { alicuota: a, neto: 0, iva: 0 };
    fila.neto += neto;
    fila.iva += iva;
    m.set(a, fila);
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
        acumularNc(ncRecibidas, alicuota, neto, iva);
      } else {
        b.ncEmitidasNeto += neto;
        b.ncEmitidasIva += iva;
        acumularNc(ncEmitidas, alicuota, neto, iva);
      }
      continue;
    }

    if (r.direccion === 'emitido') {
      // El débito sale del IVA discriminado de cada comprobante, no de
      // recalcular `neto × alícuota`: AFIP redondea comprobante por
      // comprobante y recalcular al final desvía centavos. Se suma sobre
      // todas las filas, así una alícuota fuera de los buckets de abajo
      // (que existen sólo para mostrar el desglose) igual aporta débito.
      b.debitoFiscalVentas += iva;

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

    // Igual que en ventas: el neto gravado y el crédito se acumulan sobre todas
    // las filas, no sobre los casilleros de abajo, que existen sólo para armar
    // el desglose. Así una alícuota que no tenga casillero propio igual entra
    // en los totales en vez de desaparecer.
    b.netoGravadoCompras += neto;
    b.creditoFiscalComprasSinNc += iva;

    if (alicuota === 21) b.netoInbound21 += neto;
    else if (alicuota === 10.5) b.netoInbound105 += neto;
    else if (alicuota === 27) b.netoInbound27 += neto;
    else if (alicuota === 5) b.netoInbound5 += neto;
    else if (alicuota === 2.5) b.netoInbound25 += neto;
    else if (alicuota === 0) b.netoInbound0 += neto;
  }

  const porAlicuota = (m: Map<number, NcAlicuota>) =>
    [...m.values()].sort((x, y) => x.alicuota - y.alicuota);
  b.ncRecibidasPorAlicuota = porAlicuota(ncRecibidas);
  b.ncEmitidasPorAlicuota = porAlicuota(ncEmitidas);

  b.debitoFiscal = b.debitoFiscalVentas + b.ncRecibidasIva;

  b.creditoFiscalCompras = b.creditoFiscalComprasSinNc + b.ncEmitidasIva;

  return b;
}
