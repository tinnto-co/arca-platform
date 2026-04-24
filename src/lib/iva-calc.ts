// Tipos de comprobante según AFIP
export const INVOICE_TYPES_A = ['1', '2', '3', '4', '51', '52', '53', '54', '201', '202', '203'];
export const INVOICE_TYPES_B = ['6', '7', '8'];
export const CREDIT_NOTE_TYPES = ['3', '8', '13', '21', '53', '114', '197', '203', '208', '213'];

export interface InvoiceIvaRow {
  direction: string | null;
  type: string | null;
  currency: string | null;
  currencyRate: string | null;
  amountIVA21: string | null;
  amountIVA105: string | null;
  amountIVA27: string | null;
  amountIVA5: string | null;
  amountIVA25: string | null;
  IVA21: string | null;
  IVA105: string | null;
  IVA27: string | null;
}

export interface IvaBreakdown {
  // Ventas (Outbound)
  netoA21: number;
  netoA105: number;
  totalAmountB21: number;
  totalAmountB105: number;
  totalAmountB27: number;
  debitoFiscal: number;
  // Compras (Inbound)
  netoInbound21: number;
  netoInbound105: number;
  netoInbound27: number;
  netoInbound5: number;
  netoInbound25: number;
  netoGravadoCompras: number;
  creditoFiscalCompras: number;
}

/**
 * Calcula débito y crédito fiscal a partir de un conjunto de facturas.
 * Misma lógica que getInvoiceStatsByProfile en invoice.tsx.
 */
export function calcularIvaDesdeFacturas(invoices: InvoiceIvaRow[]): IvaBreakdown {
  const n = (v: string | null | undefined) => parseFloat(v ?? '0') || 0;

  let netoA21 = 0, netoA105 = 0;
  let totalAmountB21 = 0, totalAmountB105 = 0, totalAmountB27 = 0;
  let netoInbound21 = 0, netoInbound105 = 0, netoInbound27 = 0, netoInbound5 = 0, netoInbound25 = 0;

  for (const inv of invoices) {
    const rate = inv.currency?.toUpperCase() === 'USD' ? n(inv.currencyRate) || 1 : 1;
    const sign = CREDIT_NOTE_TYPES.includes(inv.type ?? '') ? -1 : 1;
    const dir = inv.direction?.toLowerCase();
    const type = inv.type ?? '';

    if (dir === 'outbound' && INVOICE_TYPES_A.includes(type)) {
      netoA21 += sign * n(inv.amountIVA21) * rate;
      netoA105 += sign * n(inv.amountIVA105) * rate;
    }

    if (dir === 'outbound' && INVOICE_TYPES_B.includes(type)) {
      totalAmountB21 += sign * (n(inv.amountIVA21) + n(inv.IVA21)) * rate;
      totalAmountB105 += sign * (n(inv.amountIVA105) + n(inv.IVA105)) * rate;
      totalAmountB27 += sign * (n(inv.amountIVA27) + n(inv.IVA27)) * rate;
    }

    if (dir === 'inbound') {
      netoInbound21 += sign * n(inv.amountIVA21) * rate;
      netoInbound105 += sign * n(inv.amountIVA105) * rate;
      netoInbound27 += sign * n(inv.amountIVA27) * rate;
      netoInbound5 += sign * n(inv.amountIVA5) * rate;
      netoInbound25 += sign * n(inv.amountIVA25) * rate;
    }
  }

  const debitoFiscal =
    netoA21 * 0.21 +
    netoA105 * 0.105 +
    (totalAmountB21 / 1.21) * 0.21 +
    (totalAmountB105 / 1.105) * 0.105 +
    (totalAmountB27 / 1.27) * 0.27;

  const netoGravadoCompras = netoInbound27 + netoInbound21 + netoInbound105 + netoInbound5 + netoInbound25;

  const creditoFiscalCompras =
    netoInbound21 * 0.21 +
    netoInbound105 * 0.105 +
    netoInbound27 * 0.27 +
    netoInbound5 * 0.05 +
    netoInbound25 * 0.025;

  return {
    netoA21,
    netoA105,
    totalAmountB21,
    totalAmountB105,
    totalAmountB27,
    debitoFiscal,
    netoInbound21,
    netoInbound105,
    netoInbound27,
    netoInbound5,
    netoInbound25,
    netoGravadoCompras,
    creditoFiscalCompras,
  };
}
