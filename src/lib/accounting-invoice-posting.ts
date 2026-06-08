/**
 * Motor de generación de asientos automáticos desde facturas (Fase 3.2).
 *
 * Funciones PURAS (no tocan la DB): dada una factura y las reglas de mapeo de la
 * empresa, deciden qué regla aplica y construyen las líneas del asiento.
 *
 * Garantía de diseño: el asiento SIEMPRE balancea. Cualquier residuo (otros
 * impuestos sin línea en la regla, redondeos, o ausencia total de regla) se
 * imputa a la cuenta de sistema `pending_review`, que bloquea el cierre del
 * período hasta que el contador la corrija.
 */

export interface InvoiceLike {
  /** 'Outbound' = venta/emitida · 'Inbound' = compra/recibida. */
  direction: string;
  /** Letra del comprobante (A/B/C/M/...). */
  type: string;
  /** Total del comprobante. */
  amount: string | number;
  /** IVA total discriminado. */
  totalIVA: string | number;
  /** Otros impuestos / percepciones. */
  other_taxes: string | number;
}

export interface InvoiceAmounts {
  total: number;
  /** total - IVA - otros impuestos (la base "neta" imputable a Ventas/Compras). */
  net: number;
  vat: number;
  otherTaxes: number;
}

const num = (v: string | number | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

/** Descompone los montos de una factura en total / neto / IVA / otros impuestos. */
export function computeInvoiceAmounts(inv: InvoiceLike): InvoiceAmounts {
  const total = round2(num(inv.amount));
  const vat = round2(num(inv.totalIVA));
  const otherTaxes = round2(num(inv.other_taxes));
  const net = round2(total - vat - otherTaxes);
  return { total, net, vat, otherTaxes };
}

export type NormalizedDirection = 'sale' | 'purchase';

/** Normaliza la dirección de la factura a 'sale' | 'purchase' (o null si no se reconoce). */
export function normalizeDirection(
  direction: string | null | undefined
): NormalizedDirection | null {
  const d = (direction ?? '').trim().toLowerCase();
  if (['outbound', 'sale', 'venta', 'emitida', 'emitido'].includes(d))
    return 'sale';
  if (['inbound', 'purchase', 'compra', 'recibida', 'recibido'].includes(d))
    return 'purchase';
  return null;
}

export type AmountBasis =
  | 'total'
  | 'net'
  | 'vat'
  | 'other_taxes'
  | 'concept_value'
  | 'fixed';

/** Resuelve el importe de una línea según su base de cálculo. */
export function basisAmount(
  basis: AmountBasis,
  amounts: InvoiceAmounts,
  fixedAmount?: number | string | null
): number {
  switch (basis) {
    case 'total':
      return amounts.total;
    case 'net':
      return amounts.net;
    case 'vat':
      return amounts.vat;
    case 'other_taxes':
      return amounts.otherTaxes;
    case 'fixed':
      return round2(num(fixedAmount));
    case 'concept_value':
      return 0; // solo aplica a sueldos, no a facturas
    default:
      return 0;
  }
}

export interface RuleLineLike {
  accountId: string;
  side: 'debit' | 'credit';
  amountBasis: AmountBasis;
  fixedAmount?: number | string | null;
  description?: string | null;
}

export interface RuleLike {
  id: string;
  name: string;
  ruleType: 'default' | 'conditional';
  condition: Record<string, unknown> | null;
  priority: number;
  lines: RuleLineLike[];
}

/**
 * ¿La regla condicional matchea la factura?
 * Vocabulario soportado en `condition`:
 *  - `direction`: "sale" | "purchase" (también acepta venta/compra/Outbound/Inbound)
 *  - `type` / `invoiceType`: letra del comprobante; string o array (ej. "A" o ["A","M"])
 * Una clave no soportada hace que la regla NO matchee (evita imputaciones erróneas).
 */
export function ruleMatchesInvoice(rule: RuleLike, inv: InvoiceLike): boolean {
  if (rule.ruleType === 'default') return true;
  const cond = rule.condition;
  if (!cond || typeof cond !== 'object') return true; // condicional sin condición = comodín

  for (const [key, raw] of Object.entries(cond)) {
    const k = key.toLowerCase();
    if (k === 'direction') {
      const want = normalizeDirection(String(raw));
      const have = normalizeDirection(inv.direction);
      if (!want || want !== have) return false;
    } else if (k === 'type' || k === 'invoicetype') {
      const have = (inv.type ?? '').trim().toUpperCase();
      const vals = Array.isArray(raw) ? raw : [raw];
      const want = vals.map((v) => String(v).trim().toUpperCase());
      if (!want.includes(have)) return false;
    } else {
      return false; // clave no soportada
    }
  }
  return true;
}

/**
 * Selecciona la primera regla aplicable por prioridad.
 * `rules` debe venir ordenado por priority asc (las más específicas primero).
 */
export function selectRuleForInvoice(
  rules: RuleLike[],
  inv: InvoiceLike
): RuleLike | null {
  for (const r of rules) {
    if (ruleMatchesInvoice(r, inv)) return r;
  }
  return null;
}

export interface BuiltLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface BuiltEntry {
  lines: BuiltLine[];
  usedPendingReview: boolean;
  /** Motivo por el que cayó (parcial o total) a pending_review, si aplica. */
  reason: string | null;
}

/**
 * Construye las líneas del asiento a partir de la regla (o sin regla).
 * Siempre devuelve un asiento balanceado. Asume amounts.total > 0
 * (los comprobantes con total <= 0, ej. notas de crédito, se filtran antes).
 */
export function buildEntryLines(
  rule: RuleLike | null,
  amounts: InvoiceAmounts,
  pendingReviewAccountId: string
): BuiltEntry {
  const placeholder = (desc: string, reason: string): BuiltEntry => ({
    lines: [
      {
        accountId: pendingReviewAccountId,
        debit: amounts.total,
        credit: 0,
        description: desc,
      },
      {
        accountId: pendingReviewAccountId,
        debit: 0,
        credit: amounts.total,
        description: desc,
      },
    ],
    usedPendingReview: true,
    reason,
  });

  if (!rule) {
    return placeholder(
      'Sin regla aplicable — imputar manualmente',
      'Sin regla aplicable'
    );
  }

  const lines: BuiltLine[] = [];
  for (const rl of rule.lines) {
    const amt = round2(basisAmount(rl.amountBasis, amounts, rl.fixedAmount));
    if (amt <= 0) continue; // descarta líneas en cero (ej. IVA en factura B)
    lines.push({
      accountId: rl.accountId,
      debit: rl.side === 'debit' ? amt : 0,
      credit: rl.side === 'credit' ? amt : 0,
      description: rl.description ?? null,
    });
  }

  if (lines.length === 0) {
    return placeholder(
      'Regla sin importes — imputar manualmente',
      'La regla no produjo importes'
    );
  }

  const sumD = round2(lines.reduce((s, l) => s + l.debit, 0));
  const sumC = round2(lines.reduce((s, l) => s + l.credit, 0));
  const residual = round2(sumD - sumC);

  let usedPendingReview = false;
  let reason: string | null = null;

  if (Math.abs(residual) > 0.005) {
    if (residual > 0) {
      lines.push({
        accountId: pendingReviewAccountId,
        debit: 0,
        credit: residual,
        description: 'Diferencia a imputar (otros impuestos / redondeo)',
      });
    } else {
      lines.push({
        accountId: pendingReviewAccountId,
        debit: -residual,
        credit: 0,
        description: 'Diferencia a imputar (otros impuestos / redondeo)',
      });
    }
    usedPendingReview = true;
    reason =
      'La regla no cubre el total del comprobante (diferencia a pending_review)';
  }

  return { lines, usedPendingReview, reason };
}
