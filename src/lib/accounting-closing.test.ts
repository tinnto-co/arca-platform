import { describe, expect, it } from 'vitest';
import {
  buildClosingEntries,
  type FyAccountBalance,
} from './accounting-closing';

const RESULTADO = {
  id: 'res',
  code: '3.6.001',
  name: 'Resultado del ejercicio',
};

/** Saldo en signo contable: positivo deudor, negativo acreedor. */
const cta = (
  accountId: string,
  name: string,
  group: string,
  saldo: number
): FyAccountBalance => ({ accountId, code: accountId, name, group, saldo });

/**
 * Un balance con los cinco rubros que tienen que arrastrarse de un ejercicio al
 * siguiente, más las cuentas de resultado que se refunden.
 */
const BALANCE: FyAccountBalance[] = [
  cta('1.1.01.002', 'Banco cuenta corriente', 'caja_bancos', 4_000_000),
  cta('1.1.05.001', 'Mercaderías', 'bienes_cambio', 3_000_000),
  cta('1.2.02.011', 'Maquinarias', 'bienes_uso', 10_000_000),
  cta(
    '1.2.02.012',
    '(-) Amortización acumulada maquinarias',
    'bienes_uso',
    -2_500_000
  ),
  cta('2.1.01.001', 'Proveedores', 'deudas_comerciales', -1_500_000),
  cta('3.1.001', 'Capital social', 'capital', -10_000_000),
  cta(
    '3.5.001',
    'Resultados no asignados',
    'resultados_no_asignados',
    -1_000_000
  ),
  // Resultados del ejercicio: ganancia de 2.000.000.
  cta('4.1.001', 'Ventas', 'ventas', -9_000_000),
  cta('5.1.001', 'Costo de mercaderías vendidas', 'costo_ventas', 5_000_000),
  cta('5.2.001', 'Sueldos', 'gastos_administracion', 2_000_000),
];

const run = () => buildClosingEntries(BALANCE, RESULTADO);

/** Saldo con el que una cuenta reabre: positivo si el asiento la deja deudora. */
const apertura = (accountId: string) => {
  const l = run().apertura.lines.find((x) => x.accountId === accountId);
  return l ? l.debit - l.credit : 0;
};

describe('refundición', () => {
  it('lleva las cuentas de resultado a cero contra Resultado del ejercicio', () => {
    const { refundicion } = run();
    const saldoFinal = (id: string) => {
      const l = refundicion.lines.find((x) => x.accountId === id);
      return l ? l.debit - l.credit : 0;
    };
    // Cada cuenta se cancela con el importe opuesto a su saldo.
    expect(saldoFinal('4.1.001')).toBe(9_000_000);
    expect(saldoFinal('5.1.001')).toBe(-5_000_000);
    expect(saldoFinal('5.2.001')).toBe(-2_000_000);
    expect(refundicion.balanced).toBe(true);
  });

  it('la ganancia queda acreedora en Resultado del ejercicio', () => {
    const { refundicion, net } = run();
    expect(net).toBe(2_000_000); // 9.000.000 − 5.000.000 − 2.000.000
    const res = refundicion.lines.find((l) => l.accountId === RESULTADO.id)!;
    expect(res.credit).toBe(2_000_000);
    expect(res.debit).toBe(0);
  });

  it('una pérdida queda deudora', () => {
    const conPerdida = BALANCE.map((b) =>
      b.accountId === '4.1.001' ? { ...b, saldo: -3_000_000 } : b
    );
    const { net, refundicion } = buildClosingEntries(conPerdida, RESULTADO);
    expect(net).toBe(-4_000_000);
    const res = refundicion.lines.find((l) => l.accountId === RESULTADO.id)!;
    expect(res.debit).toBe(4_000_000);
  });
});

describe('arrastre de saldos al ejercicio siguiente', () => {
  it('el efectivo reabre con el saldo del cierre', () => {
    expect(apertura('1.1.01.002')).toBe(4_000_000);
  });

  it('la existencia final pasa a existencia inicial', () => {
    expect(apertura('1.1.05.001')).toBe(3_000_000);
  });

  it('el bien de uso y su amortización acumulada se arrastran por separado', () => {
    // El valor residual no se guarda: sale de las dos cuentas, como en el
    // Anexo I. Arrastrar el neto perdería el valor de origen.
    expect(apertura('1.2.02.011')).toBe(10_000_000);
    expect(apertura('1.2.02.012')).toBe(-2_500_000);
    expect(apertura('1.2.02.011') + apertura('1.2.02.012')).toBe(7_500_000);
  });

  it('el pasivo reabre acreedor', () => {
    expect(apertura('2.1.01.001')).toBe(-1_500_000);
  });

  it('el resultado del ejercicio pasa al patrimonio neto inicial', () => {
    // Refundido, viaja como saldo acreedor de «Resultado del ejercicio»: es el
    // patrimonio con el que arranca el año siguiente.
    expect(apertura(RESULTADO.id)).toBe(-2_000_000);
    expect(apertura('3.1.001')).toBe(-10_000_000);
    expect(apertura('3.5.001')).toBe(-1_000_000);

    const pn =
      apertura('3.1.001') + apertura('3.5.001') + apertura(RESULTADO.id);
    expect(-pn).toBe(13_000_000); // 10.000.000 + 1.000.000 + 2.000.000
  });

  it('ninguna cuenta de resultado se arrastra', () => {
    for (const id of ['4.1.001', '5.1.001', '5.2.001']) {
      expect(apertura(id)).toBe(0);
    }
  });

  it('la apertura es el espejo exacto del cierre', () => {
    const { cierre, apertura: ap } = run();
    expect(cierre.balanced).toBe(true);
    expect(ap.balanced).toBe(true);
    expect(ap.lines).toHaveLength(cierre.lines.length);
    for (const l of ap.lines) {
      const c = cierre.lines.find((x) => x.accountId === l.accountId)!;
      expect(l.debit).toBe(c.credit);
      expect(l.credit).toBe(c.debit);
    }
  });

  it('el activo reabierto iguala pasivo más patrimonio neto', () => {
    const { apertura: ap } = run();
    const total = ap.lines.reduce((s, l) => s + l.debit - l.credit, 0);
    expect(total).toBe(0);
  });

  it('no arrastra cuentas en cero', () => {
    const conCero = [...BALANCE, cta('1.1.01.001', 'Caja', 'caja_bancos', 0)];
    const { apertura: ap } = buildClosingEntries(conCero, RESULTADO);
    expect(ap.lines.some((l) => l.accountId === '1.1.01.001')).toBe(false);
  });

  it('arrastra un rubro que no conoce, sin tocar este código', () => {
    const conNuevo = [
      ...BALANCE,
      cta('1.2.03.001', 'Marcas y patentes', 'intangibles', 500_000),
    ];
    const { apertura: ap } = buildClosingEntries(conNuevo, RESULTADO);
    const l = ap.lines.find((x) => x.accountId === '1.2.03.001')!;
    expect(l.debit).toBe(500_000);
  });
});
