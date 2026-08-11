import { describe, expect, it } from 'vitest';
import {
  agregarConceptosSueldos,
  armarLineasSueldos,
  resolverTipoConcepto,
  reglaMatcheaConcepto,
  seleccionarReglaConcepto,
  type ConceptoAgregado,
} from './accounting-payroll-posting';
import type { ReglaLike } from './accounting-invoice-posting';

const PR = 'acct-pending-review';
const SUELDOS = 'acct-sueldos';
const A_PAGAR = 'acct-sueldos-a-pagar';
const APORTES = 'acct-aportes-a-pagar';

const rule = (over: Partial<ReglaLike> & Pick<ReglaLike, 'id'>): ReglaLike => ({
  nombre: over.nombre ?? over.id,
  tipo: 'condicional',
  condicion: null,
  prioridad: 100,
  lineas: [],
  ...over,
});

const concept = (over: Partial<ConceptoAgregado>): ConceptoAgregado => ({
  codigo: '1',
  tipo: 'remunerativo',
  monto: 1000,
  ...over,
});

describe('resolverTipoConcepto', () => {
  it('prioriza el tipo persistido por el motor', () => {
    expect(
      resolverTipoConcepto({
        codigo: '1',
        tipoLiquidacion: 'descuento',
        monto: 10,
      })
    ).toBe('descuento');
  });

  it('infiere del rango SOS cuando falta el tipo', () => {
    expect(resolverTipoConcepto({ codigo: '1', monto: 10 })).toBe(
      'remunerativo'
    );
    expect(resolverTipoConcepto({ codigo: '101', monto: 10 })).toBe(
      'descuento'
    );
    expect(resolverTipoConcepto({ codigo: '201', monto: 10 })).toBe(
      'retencion'
    );
    expect(resolverTipoConcepto({ codigo: '411', monto: 10 })).toBe(
      'no_remunerativo'
    );
    // 500-599 suma en retenciones, igual que en totalesReciboSosDesdeMontos
    expect(resolverTipoConcepto({ codigo: '553', monto: 10 })).toBe(
      'retencion'
    );
  });

  it('devuelve null para códigos LSD importados fuera de la numeración SOS', () => {
    expect(resolverTipoConcepto({ codigo: '810000', monto: 10 })).toBeNull();
  });

  it('ignora un tipoLiquidacion desconocido y cae al rango', () => {
    expect(
      resolverTipoConcepto({
        codigo: '101',
        tipoLiquidacion: 'basura',
        monto: 10,
      })
    ).toBe('descuento');
  });
});

describe('agregarConceptosSueldos', () => {
  it('suma el mismo código a través de todos los recibos del período', () => {
    const out = agregarConceptosSueldos([
      { codigo: '1', monto: '1000.00' },
      { codigo: '1', monto: '500.50' },
      { codigo: '101', monto: '150' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ codigo: '1', monto: 1500.5 });
    expect(out[1]).toMatchObject({ codigo: '101', monto: 150 });
  });

  it('descarta conceptos en cero', () => {
    const out = agregarConceptosSueldos([
      { codigo: '1', monto: '0' },
      { codigo: '2', monto: null },
    ]);
    expect(out).toHaveLength(0);
  });

  it('ordena por código numérico, no alfabético', () => {
    const out = agregarConceptosSueldos([
      { codigo: '101', monto: 1 },
      { codigo: '2', monto: 1 },
      { codigo: '20', monto: 1 },
    ]);
    expect(out.map((c) => c.codigo)).toEqual(['2', '20', '101']);
  });

  it('un tipo explícito en cualquier recibo gana sobre el inferido nulo', () => {
    const out = agregarConceptosSueldos([
      { codigo: '810000', monto: 100 },
      { codigo: '810000', tipoLiquidacion: 'descuento', monto: 50 },
    ]);
    expect(out[0]).toMatchObject({ tipo: 'descuento', monto: 150 });
  });
});

describe('reglaMatcheaConcepto', () => {
  it('una regla default matchea siempre', () => {
    expect(
      reglaMatcheaConcepto(rule({ id: 'r', tipo: 'default' }), concept({}))
    ).toBe(true);
  });

  it('matchea por sosCode exacto y por array', () => {
    const r = rule({ id: 'r', condicion: { sosCode: [101, 102] } });
    expect(reglaMatcheaConcepto(r, concept({ codigo: '101' }))).toBe(true);
    expect(reglaMatcheaConcepto(r, concept({ codigo: '103' }))).toBe(false);
  });

  it('compara sosCode numéricamente ("0101" matchea 101)', () => {
    const r = rule({ id: 'r', condicion: { sosCode: 101 } });
    expect(reglaMatcheaConcepto(r, concept({ codigo: '0101' }))).toBe(true);
  });

  it('matchea por tipo', () => {
    const r = rule({ id: 'r', condicion: { tipo: 'descuento' } });
    expect(reglaMatcheaConcepto(r, concept({ tipo: 'descuento' }))).toBe(true);
    expect(reglaMatcheaConcepto(r, concept({ tipo: 'remunerativo' }))).toBe(
      false
    );
  });

  it('un concepto sin tipo no matchea una regla por tipo', () => {
    const r = rule({ id: 'r', condicion: { tipo: 'descuento' } });
    expect(reglaMatcheaConcepto(r, concept({ tipo: null }))).toBe(false);
  });

  it('matchea por rango de códigos', () => {
    const r = rule({
      id: 'r',
      condicion: { sosCodeFrom: 100, sosCodeTo: 199 },
    });
    expect(reglaMatcheaConcepto(r, concept({ codigo: '150' }))).toBe(true);
    expect(reglaMatcheaConcepto(r, concept({ codigo: '200' }))).toBe(false);
  });

  it('una clave no soportada invalida la regla (no imputa a ciegas)', () => {
    const r = rule({ id: 'r', condicion: { direction: 'sale' } });
    expect(reglaMatcheaConcepto(r, concept({}))).toBe(false);
  });
});

describe('seleccionarReglaConcepto', () => {
  it('gana la primera aplicable según el orden recibido (priority asc)', () => {
    const rules = [
      rule({ id: 'especifica', condicion: { sosCode: 101 } }),
      rule({ id: 'generica', condicion: { tipo: 'descuento' } }),
    ];
    expect(
      seleccionarReglaConcepto(
        rules,
        concept({ codigo: '101', tipo: 'descuento' })
      )?.id
    ).toBe('especifica');
    expect(
      seleccionarReglaConcepto(
        rules,
        concept({ codigo: '150', tipo: 'descuento' })
      )?.id
    ).toBe('generica');
  });

  it('devuelve null si ninguna aplica', () => {
    const rules = [rule({ id: 'r', condicion: { sosCode: 999 } })];
    expect(
      seleccionarReglaConcepto(rules, concept({ codigo: '1' }))
    ).toBeNull();
  });
});

describe('armarLineasSueldos', () => {
  // Escenario del ticket: haberes al Debe, neto y aportes al Haber.
  const rulesCompletas: ReglaLike[] = [
    rule({
      id: 'r-haberes',
      nombre: 'Sueldos brutos',
      prioridad: 10,
      condicion: { tipo: 'remunerativo' },
      lineas: [
        {
          cuentaId: SUELDOS,
          lado: 'debe',
          base: 'valor_concepto',
          descripcion: 'Sueldos y jornales',
        },
        {
          cuentaId: A_PAGAR,
          lado: 'haber',
          base: 'valor_concepto',
          descripcion: 'Sueldos a pagar',
        },
      ],
    }),
    rule({
      id: 'r-desc',
      nombre: 'Aportes del trabajador',
      prioridad: 20,
      condicion: { tipo: 'descuento' },
      lineas: [
        {
          cuentaId: A_PAGAR,
          lado: 'debe',
          base: 'valor_concepto',
          descripcion: 'Menor neto a pagar',
        },
        {
          cuentaId: APORTES,
          lado: 'haber',
          base: 'valor_concepto',
          descripcion: 'Aportes a pagar',
        },
      ],
    }),
  ];

  it('genera un único asiento balanceado agrupando por cuenta', () => {
    const concepts = agregarConceptosSueldos([
      { codigo: '1', monto: 1000000 }, // básico
      { codigo: '2', monto: 100000 }, // antigüedad → misma cuenta que el básico
      { codigo: '101', monto: 110000 }, // jubilación
    ]);
    const built = armarLineasSueldos(concepts, rulesCompletas, PR);

    expect(built.usoPendienteRevision).toBe(false);
    expect(built.motivo).toBeNull();

    const sumD = built.lineas.reduce((s, l) => s + l.debe, 0);
    const sumC = built.lineas.reduce((s, l) => s + l.haber, 0);
    expect(sumD).toBeCloseTo(sumC, 2);

    // Los dos conceptos remunerativos colapsan en un solo renglón de Sueldos.
    const sueldos = built.lineas.filter((l) => l.cuentaId === SUELDOS);
    expect(sueldos).toHaveLength(1);
    expect(sueldos[0].debe).toBeCloseTo(1100000, 2);

    // Sueldos a pagar: 1.100.000 al Haber menos 110.000 al Debe, en renglones distintos.
    const aPagarCredit = built.lineas.find(
      (l) => l.cuentaId === A_PAGAR && l.haber > 0
    );
    const aPagarDebit = built.lineas.find(
      (l) => l.cuentaId === A_PAGAR && l.debe > 0
    );
    expect(aPagarCredit?.haber).toBeCloseTo(1100000, 2);
    expect(aPagarDebit?.debe).toBeCloseTo(110000, 2);

    expect(built.lineas.some((l) => l.cuentaId === PR)).toBe(false);
    expect(built.reglasUsadasIds).toEqual(['r-haberes', 'r-desc']);
  });

  it('manda a pending_review los conceptos sin regla y sigue balanceando', () => {
    const concepts = agregarConceptosSueldos([
      { codigo: '1', monto: 1000000 },
      { codigo: '201', monto: 50000 }, // retención: ninguna regla la cubre
    ]);
    const built = armarLineasSueldos(concepts, rulesCompletas, PR);

    expect(built.usoPendienteRevision).toBe(true);
    expect(built.totalSinRegla).toBeCloseTo(50000, 2);
    expect(built.mapeos.find((m) => m.codigo === '201')?.sinRegla).toBe(true);
    expect(built.mapeos.find((m) => m.codigo === '1')?.sinRegla).toBe(false);

    const sumD = built.lineas.reduce((s, l) => s + l.debe, 0);
    const sumC = built.lineas.reduce((s, l) => s + l.haber, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect(built.lineas.some((l) => l.cuentaId === PR)).toBe(true);
  });

  it('sin ninguna regla, todo el período cae a pending_review balanceado', () => {
    const concepts = agregarConceptosSueldos([{ codigo: '1', monto: 500000 }]);
    const built = armarLineasSueldos(concepts, [], PR);

    expect(built.usoPendienteRevision).toBe(true);
    expect(built.lineas.every((l) => l.cuentaId === PR)).toBe(true);
    const sumD = built.lineas.reduce((s, l) => s + l.debe, 0);
    const sumC = built.lineas.reduce((s, l) => s + l.haber, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
    expect(sumD).toBeCloseTo(500000, 2);
  });

  it('una regla cuyas líneas no cubren el total cierra el residuo en pending_review', () => {
    const cojo: ReglaLike[] = [
      rule({
        id: 'r-cojo',
        condicion: { tipo: 'remunerativo' },
        lineas: [
          {
            cuentaId: SUELDOS,
            lado: 'debe',
            base: 'valor_concepto',
            descripcion: null,
          },
        ],
      }),
    ];
    const concepts = agregarConceptosSueldos([{ codigo: '1', monto: 1000 }]);
    const built = armarLineasSueldos(concepts, cojo, PR);

    expect(built.usoPendienteRevision).toBe(true);
    const pr = built.lineas.find((l) => l.cuentaId === PR);
    expect(pr?.haber).toBeCloseTo(1000, 2);
    const sumD = built.lineas.reduce((s, l) => s + l.debe, 0);
    const sumC = built.lineas.reduce((s, l) => s + l.haber, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
  });

  it('el monto fijo se aplica una sola vez aunque matcheen varios conceptos', () => {
    const conFijo: ReglaLike[] = [
      rule({
        id: 'r-fijo',
        condicion: { tipo: 'remunerativo' },
        lineas: [
          {
            cuentaId: SUELDOS,
            lado: 'debe',
            base: 'valor_concepto',
            descripcion: null,
          },
          {
            cuentaId: A_PAGAR,
            lado: 'haber',
            base: 'valor_concepto',
            descripcion: null,
          },
          {
            cuentaId: APORTES,
            lado: 'haber',
            base: 'fijo',
            importeFijo: '500',
            descripcion: null,
          },
        ],
      }),
    ];
    const concepts = agregarConceptosSueldos([
      { codigo: '1', monto: 1000 },
      { codigo: '2', monto: 1000 },
    ]);
    const built = armarLineasSueldos(concepts, conFijo, PR);

    const aportes = built.lineas.filter((l) => l.cuentaId === APORTES);
    expect(aportes).toHaveLength(1);
    expect(aportes[0].haber).toBeCloseTo(500, 2);
  });

  it('un concepto negativo invierte el lado de sus líneas', () => {
    const concepts = agregarConceptosSueldos([{ codigo: '1', monto: -1000 }]);
    const built = armarLineasSueldos(concepts, rulesCompletas, PR);

    const sueldos = built.lineas.find((l) => l.cuentaId === SUELDOS);
    expect(sueldos?.haber).toBeCloseTo(1000, 2);
    expect(sueldos?.debe).toBe(0);
    const sumD = built.lineas.reduce((s, l) => s + l.debe, 0);
    const sumC = built.lineas.reduce((s, l) => s + l.haber, 0);
    expect(sumD).toBeCloseTo(sumC, 2);
  });

  it('un período sin conceptos no genera líneas ni pending_review', () => {
    const built = armarLineasSueldos([], rulesCompletas, PR);
    expect(built.lineas).toHaveLength(0);
    expect(built.usoPendienteRevision).toBe(false);
    expect(built.motivo).toBe('El período no tiene conceptos con importe');
  });
});
