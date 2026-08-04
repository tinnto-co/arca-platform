import { describe, expect, it } from 'vitest';
import {
  aggregatePayrollConcepts,
  buildPayrollEntryLines,
  resolveConceptTipo,
  ruleMatchesConcept,
  selectRuleForConcept,
  type AggregatedConcept,
} from './accounting-payroll-posting';
import type { RuleLike } from './accounting-invoice-posting';

const PR = 'acct-pending-review';
const SUELDOS = 'acct-sueldos';
const A_PAGAR = 'acct-sueldos-a-pagar';
const APORTES = 'acct-aportes-a-pagar';

const rule = (over: Partial<RuleLike> & Pick<RuleLike, 'id'>): RuleLike => ({
  name: over.name ?? over.id,
  ruleType: 'conditional',
  condition: null,
  priority: 100,
  lines: [],
  ...over,
});

const concept = (over: Partial<AggregatedConcept>): AggregatedConcept => ({
  codigo: '1',
  tipo: 'remunerativo',
  monto: 1000,
  ...over,
});

describe('resolveConceptTipo', () => {
  it('prioriza el tipo persistido por el motor', () => {
    expect(
      resolveConceptTipo({
        codigo: '1',
        tipoLiquidacion: 'descuento',
        monto: 10,
      })
    ).toBe('descuento');
  });

  it('infiere del rango SOS cuando falta el tipo', () => {
    expect(resolveConceptTipo({ codigo: '1', monto: 10 })).toBe('remunerativo');
    expect(resolveConceptTipo({ codigo: '101', monto: 10 })).toBe('descuento');
    expect(resolveConceptTipo({ codigo: '201', monto: 10 })).toBe('retencion');
    expect(resolveConceptTipo({ codigo: '411', monto: 10 })).toBe(
      'no_remunerativo'
    );
    // 500-599 suma en retenciones, igual que en totalesReciboSosDesdeMontos
    expect(resolveConceptTipo({ codigo: '553', monto: 10 })).toBe('retencion');
  });

  it('devuelve null para códigos LSD importados fuera de la numeración SOS', () => {
    expect(resolveConceptTipo({ codigo: '810000', monto: 10 })).toBeNull();
  });

  it('ignora un tipoLiquidacion desconocido y cae al rango', () => {
    expect(
      resolveConceptTipo({
        codigo: '101',
        tipoLiquidacion: 'basura',
        monto: 10,
      })
    ).toBe('descuento');
  });
});

describe('aggregatePayrollConcepts', () => {
  it('suma el mismo código a través de todos los recibos del período', () => {
    const out = aggregatePayrollConcepts([
      { codigo: '1', monto: '1000.00' },
      { codigo: '1', monto: '500.50' },
      { codigo: '101', monto: '150' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ codigo: '1', monto: 1500.5 });
    expect(out[1]).toMatchObject({ codigo: '101', monto: 150 });
  });

  it('descarta conceptos en cero', () => {
    const out = aggregatePayrollConcepts([
      { codigo: '1', monto: '0' },
      { codigo: '2', monto: null },
    ]);
    expect(out).toHaveLength(0);
  });

  it('ordena por código numérico, no alfabético', () => {
    const out = aggregatePayrollConcepts([
      { codigo: '101', monto: 1 },
      { codigo: '2', monto: 1 },
      { codigo: '20', monto: 1 },
    ]);
    expect(out.map((c) => c.codigo)).toEqual(['2', '20', '101']);
  });

  it('un tipo explícito en cualquier recibo gana sobre el inferido nulo', () => {
    const out = aggregatePayrollConcepts([
      { codigo: '810000', monto: 100 },
      { codigo: '810000', tipoLiquidacion: 'descuento', monto: 50 },
    ]);
    expect(out[0]).toMatchObject({ tipo: 'descuento', monto: 150 });
  });
});

describe('ruleMatchesConcept', () => {
  it('una regla default matchea siempre', () => {
    expect(
      ruleMatchesConcept(rule({ id: 'r', ruleType: 'default' }), concept({}))
    ).toBe(true);
  });

  it('matchea por sosCode exacto y por array', () => {
    const r = rule({ id: 'r', condition: { sosCode: [101, 102] } });
    expect(ruleMatchesConcept(r, concept({ codigo: '101' }))).toBe(true);
    expect(ruleMatchesConcept(r, concept({ codigo: '103' }))).toBe(false);
  });

  it('compara sosCode numéricamente ("0101" matchea 101)', () => {
    const r = rule({ id: 'r', condition: { sosCode: 101 } });
    expect(ruleMatchesConcept(r, concept({ codigo: '0101' }))).toBe(true);
  });

  it('matchea por tipo', () => {
    const r = rule({ id: 'r', condition: { tipo: 'descuento' } });
    expect(ruleMatchesConcept(r, concept({ tipo: 'descuento' }))).toBe(true);
    expect(ruleMatchesConcept(r, concept({ tipo: 'remunerativo' }))).toBe(
      false
    );
  });

  it('un concepto sin tipo no matchea una regla por tipo', () => {
    const r = rule({ id: 'r', condition: { tipo: 'descuento' } });
    expect(ruleMatchesConcept(r, concept({ tipo: null }))).toBe(false);
  });

  it('matchea por rango de códigos', () => {
    const r = rule({
      id: 'r',
      condition: { sosCodeFrom: 100, sosCodeTo: 199 },
    });
    expect(ruleMatchesConcept(r, concept({ codigo: '150' }))).toBe(true);
    expect(ruleMatchesConcept(r, concept({ codigo: '200' }))).toBe(false);
  });

  it('una clave no soportada invalida la regla (no imputa a ciegas)', () => {
    const r = rule({ id: 'r', condition: { direction: 'sale' } });
    expect(ruleMatchesConcept(r, concept({}))).toBe(false);
  });
});

describe('selectRuleForConcept', () => {
  it('gana la primera aplicable según el orden recibido (priority asc)', () => {
    const rules = [
      rule({ id: 'especifica', condition: { sosCode: 101 } }),
      rule({ id: 'generica', condition: { tipo: 'descuento' } }),
    ];
    expect(
      selectRuleForConcept(rules, concept({ codigo: '101', tipo: 'descuento' }))
        ?.id
    ).toBe('especifica');
    expect(
      selectRuleForConcept(rules, concept({ codigo: '150', tipo: 'descuento' }))
        ?.id
    ).toBe('generica');
  });

  it('devuelve null si ninguna aplica', () => {
    const rules = [rule({ id: 'r', condition: { sosCode: 999 } })];
    expect(selectRuleForConcept(rules, concept({ codigo: '1' }))).toBeNull();
  });
});

describe('buildPayrollEntryLines', () => {
  // Escenario del ticket: haberes al Debe, neto y aportes al Haber.
  const rulesCompletas: RuleLike[] = [
    rule({
      id: 'r-haberes',
      name: 'Sueldos brutos',
      priority: 10,
      condition: { tipo: 'remunerativo' },
      lines: [
        {
          accountId: SUELDOS,
          side: 'debit',
          amountBasis: 'concept_value',
          description: 'Sueldos y jornales',
        },
        {
          accountId: A_PAGAR,
          side: 'credit',
          amountBasis: 'concept_value',
          description: 'Sueldos a pagar',
        },
      ],
    }),
    rule({
      id: 'r-desc',
      name: 'Aportes del trabajador',
      priority: 20,
      condition: { tipo: 'descuento' },
      lines: [
        {
          accountId: A_PAGAR,
          side: 'debit',
          amountBasis: 'concept_value',
          description: 'Menor neto a pagar',
        },
        {
          accountId: APORTES,
          side: 'credit',
          amountBasis: 'concept_value',
          description: 'Aportes a pagar',
        },
      ],
    }),
  ];

  it('genera un único asiento balanceado agrupando por cuenta', () => {
    const concepts = aggregatePayrollConcepts([
      { codigo: '1', monto: 1000000 }, // básico
      { codigo: '2', monto: 100000 }, // antigüedad → misma cuenta que el básico
      { codigo: '101', monto: 110000 }, // jubilación
    ]);
    const built = buildPayrollEntryLines(concepts, rulesCompletas, PR);

    expect(built.usedPendingReview).toBe(false);
    expect(built.reason).toBeNull();

    const sumD = built.lines.reduce((s, l) => s + l.debit, 0);
    const sumC = built.lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBeCloseTo(sumC, 2);

    // Los dos conceptos remunerativos colapsan en un solo renglón de Sueldos.
    const sueldos = built.lines.filter((l) => l.accountId === SUELDOS);
    expect(sueldos).toHaveLength(1);
    expect(sueldos[0].debit).toBeCloseTo(1100000, 2);

    // Sueldos a pagar: 1.100.000 al Haber menos 110.000 al Debe, en renglones distintos.
    const aPagarCredit = built.lines.find(
      (l) => l.accountId === A_PAGAR && l.credit > 0
    );
    const aPagarDebit = built.lines.find(
      (l) => l.accountId === A_PAGAR && l.debit > 0
    );
    expect(aPagarCredit?.credit).toBeCloseTo(1100000, 2);
    expect(aPagarDebit?.debit).toBeCloseTo(110000, 2);

    expect(built.lines.some((l) => l.accountId === PR)).toBe(false);
    expect(built.usedRuleIds).toEqual(['r-haberes', 'r-desc']);
  });

  it('manda a pending_review los conceptos sin regla y sigue balanceando', () => {
    const concepts = aggregatePayrollConcepts([
      { codigo: '1', monto: 1000000 },
      { codigo: '201', monto: 50000 }, // retención: ninguna regla la cubre
    ]);
    const built = buildPayrollEntryLines(concepts, rulesCompletas, PR);

    expect(built.usedPendingReview).toBe(true);
    expect(built.unmappedTotal).toBeCloseTo(50000, 2);
    expect(built.mappings.find((m) => m.codigo === '201')?.unmapped).toBe(true);
    expect(built.mappings.find((m) => m.codigo === '1')?.unmapped).toBe(false);

    const sumD = built.lines.reduce((s, l) => s + l.debit, 0);
    const sumC = built.lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect(built.lines.some((l) => l.accountId === PR)).toBe(true);
  });

  it('sin ninguna regla, todo el período cae a pending_review balanceado', () => {
    const concepts = aggregatePayrollConcepts([{ codigo: '1', monto: 500000 }]);
    const built = buildPayrollEntryLines(concepts, [], PR);

    expect(built.usedPendingReview).toBe(true);
    expect(built.lines.every((l) => l.accountId === PR)).toBe(true);
    const sumD = built.lines.reduce((s, l) => s + l.debit, 0);
    const sumC = built.lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect(sumD).toBeCloseTo(500000, 2);
  });

  it('una regla cuyas líneas no cubren el total cierra el residuo en pending_review', () => {
    const cojo: RuleLike[] = [
      rule({
        id: 'r-cojo',
        condition: { tipo: 'remunerativo' },
        lines: [
          {
            accountId: SUELDOS,
            side: 'debit',
            amountBasis: 'concept_value',
            description: null,
          },
        ],
      }),
    ];
    const concepts = aggregatePayrollConcepts([{ codigo: '1', monto: 1000 }]);
    const built = buildPayrollEntryLines(concepts, cojo, PR);

    expect(built.usedPendingReview).toBe(true);
    const pr = built.lines.find((l) => l.accountId === PR);
    expect(pr?.credit).toBeCloseTo(1000, 2);
    const sumD = built.lines.reduce((s, l) => s + l.debit, 0);
    const sumC = built.lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
  });

  it('el monto fijo se aplica una sola vez aunque matcheen varios conceptos', () => {
    const conFijo: RuleLike[] = [
      rule({
        id: 'r-fijo',
        condition: { tipo: 'remunerativo' },
        lines: [
          {
            accountId: SUELDOS,
            side: 'debit',
            amountBasis: 'concept_value',
            description: null,
          },
          {
            accountId: A_PAGAR,
            side: 'credit',
            amountBasis: 'concept_value',
            description: null,
          },
          {
            accountId: APORTES,
            side: 'credit',
            amountBasis: 'fixed',
            fixedAmount: '500',
            description: null,
          },
        ],
      }),
    ];
    const concepts = aggregatePayrollConcepts([
      { codigo: '1', monto: 1000 },
      { codigo: '2', monto: 1000 },
    ]);
    const built = buildPayrollEntryLines(concepts, conFijo, PR);

    const aportes = built.lines.filter((l) => l.accountId === APORTES);
    expect(aportes).toHaveLength(1);
    expect(aportes[0].credit).toBeCloseTo(500, 2);
  });

  it('un concepto negativo invierte el lado de sus líneas', () => {
    const concepts = aggregatePayrollConcepts([{ codigo: '1', monto: -1000 }]);
    const built = buildPayrollEntryLines(concepts, rulesCompletas, PR);

    const sueldos = built.lines.find((l) => l.accountId === SUELDOS);
    expect(sueldos?.credit).toBeCloseTo(1000, 2);
    expect(sueldos?.debit).toBe(0);
    const sumD = built.lines.reduce((s, l) => s + l.debit, 0);
    const sumC = built.lines.reduce((s, l) => s + l.credit, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
  });

  it('un período sin conceptos no genera líneas ni pending_review', () => {
    const built = buildPayrollEntryLines([], rulesCompletas, PR);
    expect(built.lines).toHaveLength(0);
    expect(built.usedPendingReview).toBe(false);
    expect(built.reason).toBe('El período no tiene conceptos con importe');
  });
});
