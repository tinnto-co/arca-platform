/**
 * Motor de generación del asiento automático de sueldos (US 3.3.1).
 *
 * Funciones PURAS (no tocan la DB): dados los conceptos de todos los recibos de
 * un período y las reglas de mapeo `sourceModule='payroll'` de la empresa,
 * deciden qué regla aplica a cada concepto y construyen las líneas de UN único
 * asiento que agrupa todo el período.
 *
 * Se reusan los tipos y el contrato de salida del motor de facturas
 * (`accounting-invoice-posting.ts`) para que ambos orígenes produzcan asientos
 * indistinguibles aguas abajo.
 *
 * Garantía de diseño (igual que en facturas): el asiento SIEMPRE balancea.
 * Los conceptos sin regla aplicable y cualquier residuo por redondeo se imputan
 * a la cuenta de sistema `pending_review`, que bloquea el cierre del período
 * hasta que el contador lo corrija.
 */
import {
  tipoConceptoDesdeCodigoSos,
  type TipoConceptoSos,
} from './sos-recibo-totales';
import type {
  BuiltEntry,
  BuiltLine,
  RuleLike,
} from './accounting-invoice-posting';

/** Un concepto liquidado, tal como sale de `liquidacion_import_concepto_valor`. */
export interface PayrollConceptLike {
  /** Código SOS (1–699) o LSD importado (ej. "810000"). */
  codigo: string;
  /** Tipo persistido por el motor de liquidación; puede faltar en importados. */
  tipoLiquidacion?: string | null;
  monto: string | number | null;
}

/** Concepto agregado a nivel período: un renglón por código SOS. */
export interface AggregatedConcept {
  codigo: string;
  /** Tipo resuelto: el persistido si es válido, si no el inferido del rango SOS. */
  tipo: TipoConceptoSos | null;
  /** Suma del concepto sobre todos los recibos del período. */
  monto: number;
}

const num = (v: string | number | null | undefined): number => {
  const x = typeof v === 'number' ? v : parseFloat(v ?? '0');
  return isNaN(x) ? 0 : x;
};
const round2 = (x: number): number =>
  Math.round((x + Number.EPSILON) * 100) / 100;

const TIPOS_VALIDOS: readonly string[] = [
  'remunerativo',
  'no_remunerativo',
  'descuento',
  'retencion',
];

/**
 * Resuelve el tipo contable de un concepto. Prioriza `tipoLiquidacion` (lo que
 * decidió el motor al liquidar) y cae al rango del código SOS cuando falta o no
 * es un valor conocido — el caso de los recibos importados del LSD.
 */
export function resolveConceptTipo(
  c: PayrollConceptLike
): TipoConceptoSos | null {
  const persisted = (c.tipoLiquidacion ?? '').trim().toLowerCase();
  if (TIPOS_VALIDOS.includes(persisted)) return persisted as TipoConceptoSos;
  return tipoConceptoDesdeCodigoSos(c.codigo);
}

/**
 * Agrega los conceptos de todos los recibos del período sumando por código.
 * Descarta los que quedan en cero: no aportan líneas al asiento.
 * El orden de salida es estable (por código numérico asc, luego alfabético)
 * para que el asiento sea reproducible.
 */
export function aggregatePayrollConcepts(
  conceptos: PayrollConceptLike[]
): AggregatedConcept[] {
  const byCodigo = new Map<string, AggregatedConcept>();
  for (const c of conceptos) {
    const codigo = String(c.codigo ?? '').trim();
    if (!codigo) continue;
    const prev = byCodigo.get(codigo);
    if (prev) {
      prev.monto = round2(prev.monto + num(c.monto));
      // Un tipo explícito gana sobre uno inferido en cualquier recibo del período.
      prev.tipo ??= resolveConceptTipo(c);
    } else {
      byCodigo.set(codigo, {
        codigo,
        tipo: resolveConceptTipo(c),
        monto: round2(num(c.monto)),
      });
    }
  }

  return [...byCodigo.values()]
    .filter((c) => Math.abs(c.monto) > 0.005)
    .sort((a, b) => {
      const na = parseInt(a.codigo, 10);
      const nb = parseInt(b.codigo, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.codigo.localeCompare(b.codigo);
    });
}

/**
 * ¿La regla de sueldos matchea este concepto?
 * Vocabulario soportado en `condition`:
 *  - `sosCode` / `codigo`: código exacto; string, número o array (ej. 810000 o [101, 102])
 *  - `tipo`: remunerativo | no_remunerativo | descuento | retencion; string o array
 *  - `sosCodeFrom` / `sosCodeTo`: rango numérico inclusivo de códigos SOS
 * Una clave no soportada hace que la regla NO matchee, igual que en facturas:
 * es preferible caer a pending_review que imputar a una cuenta equivocada.
 */
export function ruleMatchesConcept(
  rule: RuleLike,
  concept: AggregatedConcept
): boolean {
  if (rule.ruleType === 'default') return true;
  const cond = rule.condition;
  if (!cond || typeof cond !== 'object') return true; // condicional sin condición = comodín

  const codigoNum = parseInt(concept.codigo, 10);

  for (const [key, raw] of Object.entries(cond)) {
    const k = key.toLowerCase();
    if (k === 'soscode' || k === 'codigo') {
      const vals = (Array.isArray(raw) ? raw : [raw]).map((v) =>
        String(v).trim()
      );
      // Compara como número cuando ambos lados lo son, para que "0101" y 101 matcheen.
      const hit = vals.some((v) => {
        if (v === concept.codigo) return true;
        const vn = parseInt(v, 10);
        return !isNaN(vn) && !isNaN(codigoNum) && vn === codigoNum;
      });
      if (!hit) return false;
    } else if (k === 'tipo') {
      if (concept.tipo === null) return false;
      const vals = (Array.isArray(raw) ? raw : [raw]).map((v) =>
        String(v).trim().toLowerCase()
      );
      if (!vals.includes(concept.tipo)) return false;
    } else if (k === 'soscodefrom') {
      const from = parseInt(String(raw), 10);
      if (isNaN(from) || isNaN(codigoNum) || codigoNum < from) return false;
    } else if (k === 'soscodeto') {
      const to = parseInt(String(raw), 10);
      if (isNaN(to) || isNaN(codigoNum) || codigoNum > to) return false;
    } else {
      return false; // clave no soportada
    }
  }
  return true;
}

/**
 * Primera regla aplicable a un concepto, por prioridad.
 * `rules` debe venir ordenado por priority asc (las más específicas primero).
 */
export function selectRuleForConcept(
  rules: RuleLike[],
  concept: AggregatedConcept
): RuleLike | null {
  for (const r of rules) {
    if (ruleMatchesConcept(r, concept)) return r;
  }
  return null;
}

/** Trazabilidad concepto → regla, para el log y la UI de revisión. */
export interface ConceptMapping {
  codigo: string;
  tipo: TipoConceptoSos | null;
  monto: number;
  ruleId: string | null;
  ruleName: string | null;
  /** true si el concepto terminó imputado a pending_review. */
  unmapped: boolean;
}

export interface BuiltPayrollEntry extends BuiltEntry {
  mappings: ConceptMapping[];
  /** Reglas efectivamente usadas, en orden de aparición. */
  usedRuleIds: string[];
  /** Suma de los conceptos que no matchearon ninguna regla. */
  unmappedTotal: number;
}

/** Clave de agrupación: una línea por cuenta y lado. */
const lineKey = (accountId: string, side: 'debit' | 'credit'): string =>
  `${accountId}|${side}`;

/**
 * Construye las líneas del asiento único del período.
 *
 * Para cada concepto agregado se busca su regla; las líneas-plantilla con base
 * `concept_value` toman el monto del concepto, y `fixed` un importe fijo (se
 * aplica una sola vez por regla, no por concepto, para no multiplicarlo).
 * Las bases de facturas (total/net/vat/other_taxes) no aplican a sueldos y se
 * ignoran.
 *
 * Las líneas se agrupan por cuenta+lado, de modo que N conceptos que apuntan a
 * "Sueldos y jornales" produzcan un único renglón.
 */
export function buildPayrollEntryLines(
  concepts: AggregatedConcept[],
  rules: RuleLike[],
  pendingReviewAccountId: string
): BuiltPayrollEntry {
  const acc = new Map<
    string,
    {
      accountId: string;
      side: 'debit' | 'credit';
      amount: number;
      description: string | null;
    }
  >();
  const mappings: ConceptMapping[] = [];
  const usedRuleIds: string[] = [];
  const fixedApplied = new Set<string>();
  let unmappedTotal = 0;

  const add = (
    accountId: string,
    side: 'debit' | 'credit',
    amount: number,
    description: string | null
  ) => {
    if (Math.abs(amount) <= 0.005) return;
    const key = lineKey(accountId, side);
    const prev = acc.get(key);
    if (prev) prev.amount = round2(prev.amount + amount);
    else acc.set(key, { accountId, side, amount: round2(amount), description });
  };

  for (const c of concepts) {
    const rule = selectRuleForConcept(rules, c);
    const ruleLines = rule?.lines ?? [];
    // Una regla sin líneas no imputa nada: se trata como si no hubiera regla.
    const usable = ruleLines.filter(
      (l) => l.amountBasis === 'concept_value' || l.amountBasis === 'fixed'
    );

    if (!rule || usable.length === 0) {
      unmappedTotal = round2(unmappedTotal + c.monto);
      add(
        pendingReviewAccountId,
        c.monto >= 0 ? 'debit' : 'credit',
        Math.abs(c.monto),
        'Conceptos de sueldos sin regla aplicable'
      );
      mappings.push({
        codigo: c.codigo,
        tipo: c.tipo,
        monto: c.monto,
        ruleId: rule?.id ?? null,
        ruleName: rule?.name ?? null,
        unmapped: true,
      });
      continue;
    }

    if (!usedRuleIds.includes(rule.id)) usedRuleIds.push(rule.id);

    for (const rl of usable) {
      let amt: number;
      if (rl.amountBasis === 'fixed') {
        const fixedKey = `${rule.id}|${rl.accountId}|${rl.side}`;
        if (fixedApplied.has(fixedKey)) continue;
        fixedApplied.add(fixedKey);
        amt = round2(num(rl.fixedAmount));
      } else {
        amt = c.monto;
      }
      // Un concepto negativo (ajuste en contra) invierte el lado de la línea.
      const side: 'debit' | 'credit' =
        amt >= 0 ? rl.side : rl.side === 'debit' ? 'credit' : 'debit';
      add(rl.accountId, side, Math.abs(amt), rl.description ?? null);
    }

    mappings.push({
      codigo: c.codigo,
      tipo: c.tipo,
      monto: c.monto,
      ruleId: rule.id,
      ruleName: rule.name,
      unmapped: false,
    });
  }

  const lines: BuiltLine[] = [...acc.values()].map((l) => ({
    accountId: l.accountId,
    debit: l.side === 'debit' ? l.amount : 0,
    credit: l.side === 'credit' ? l.amount : 0,
    description: l.description,
  }));

  let usedPendingReview = unmappedTotal !== 0;
  let reason: string | null = usedPendingReview
    ? 'Hay conceptos sin regla aplicable (imputados a pending_review)'
    : null;

  if (lines.length === 0) {
    return {
      lines: [],
      usedPendingReview: false,
      reason: 'El período no tiene conceptos con importe',
      mappings,
      usedRuleIds,
      unmappedTotal: 0,
    };
  }

  // Cierre por residuo: garantiza que el asiento balancee siempre.
  const sumD = round2(lines.reduce((s, l) => s + l.debit, 0));
  const sumC = round2(lines.reduce((s, l) => s + l.credit, 0));
  const residual = round2(sumD - sumC);
  if (Math.abs(residual) > 0.005) {
    lines.push({
      accountId: pendingReviewAccountId,
      debit: residual > 0 ? 0 : -residual,
      credit: residual > 0 ? residual : 0,
      description: 'Diferencia a imputar (redondeo / regla incompleta)',
    });
    usedPendingReview = true;
    reason =
      reason ??
      'Las reglas no cubren el total del período (diferencia a pending_review)';
  }

  return {
    lines,
    usedPendingReview,
    reason,
    mappings,
    usedRuleIds,
    unmappedTotal,
  };
}
