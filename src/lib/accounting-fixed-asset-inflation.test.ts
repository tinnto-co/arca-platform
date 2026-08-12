import { describe, expect, it } from 'vitest';
import {
  depreciationCoefficients,
  type FixedAssetForInflation,
} from './accounting-fixed-asset-inflation';
import { computeInflationAdjustment } from './accounting-inflation';

/**
 * Ejercicio 01/04/2025 – 31/03/2026, el mismo de E-PRESIS, con sus coeficientes
 * reales de la serie FACPCE. 1,3261 es el de apertura (marzo 2025).
 */
const FY_START = new Date(Date.UTC(2025, 3, 1));
const FY_END = new Date(Date.UTC(2026, 2, 31));
const OPENING_COEF = 1.3261;

const COEF_BY_MONTH: Record<string, number> = {
  '2025-4': 1.2902,
  '2025-8': 1.2143,
  '2025-12': 1.1204,
  '2026-3': 1.0,
};
const coefficientForMonth = (year: number, month: number) => {
  const c = COEF_BY_MONTH[`${year}-${month}`];
  if (c === undefined)
    throw new Error(`falta el coeficiente de ${year}-${month}`);
  return c;
};

const ACUM = 'cuenta-amort-acumulada';
const GASTO = 'cuenta-amort-ejercicio';

function asset(
  over: Partial<FixedAssetForInflation> & { id: string }
): FixedAssetForInflation {
  return {
    name: over.id,
    acquisitionDate: new Date(Date.UTC(2023, 2, 15)),
    originalValue: 1_000_000,
    residualValue: 0,
    usefulLifeYears: 10,
    disposalDate: null,
    accumDeprAccountId: ACUM,
    deprExpenseAccountId: GASTO,
    ...over,
  };
}

const run = (assets: FixedAssetForInflation[]) =>
  depreciationCoefficients({
    assets,
    fiscalYearStart: FY_START,
    fiscalYearEnd: FY_END,
    openingCoefficient: OPENING_COEF,
    coefficientForMonth,
  });

describe('depreciationCoefficients', () => {
  it('un bien de años anteriores amortiza por el coeficiente de apertura', () => {
    // Es el caso que describió el estudio: "desde la última vez que se ajustó
    // por inflación, o sea el cierre del año anterior".
    const r = run([asset({ id: 'maquina-2023' })]);

    expect(r.byAccount.get(ACUM)).toBe(1.3261);
    expect(r.byAccount.get(GASTO)).toBe(1.3261);
    // 1.000.000 / 10 años = 100.000 por los 12 meses del ejercicio.
    expect(r.registerDepreciation.get(GASTO)).toBe(100_000);
    expect(r.detail[0].months).toBe(12);
    expect(r.detail[0].acquiredInPeriod).toBe(false);
  });

  it('un bien comprado en el ejercicio va por el coeficiente de su mes de alta', () => {
    const r = run([
      asset({
        id: 'rodado-ago-2025',
        acquisitionDate: new Date(Date.UTC(2025, 7, 10)),
      }),
    ]);

    expect(r.byAccount.get(GASTO)).toBe(1.2143); // agosto 2025
    expect(r.detail[0].acquiredInPeriod).toBe(true);
    // De agosto a marzo, con el mes de alta completo: 8 meses.
    expect(r.detail[0].months).toBe(8);
    expect(r.registerDepreciation.get(GASTO)).toBe(
      Math.round(((100_000 * 8) / 12) * 100) / 100
    );
  });

  it('pondera por la amortización de cada bien', () => {
    const r = run([
      asset({ id: 'viejo' }), // 100.000 al 1,3261
      asset({
        id: 'nuevo',
        acquisitionDate: new Date(Date.UTC(2026, 2, 5)), // marzo 2026
        originalValue: 1_200_000,
        usefulLifeYears: 10,
      }), // 120.000/12 = 10.000 al 1,0000
    ]);

    const esperado = (100_000 * 1.3261 + 10_000 * 1.0) / (100_000 + 10_000);
    expect(r.byAccount.get(GASTO)).toBeCloseTo(esperado, 10);
    expect(r.registerDepreciation.get(GASTO)).toBe(110_000);
  });

  it('el promedio ponderado da igual que calcular bien por bien', () => {
    // Es la propiedad que justifica todo el enfoque: no se puede desagregar el
    // asiento del mayor, pero aplicarle el promedio ponderado al total da lo
    // mismo que reexpresar cada bien por separado.
    const assets = [
      asset({ id: 'a' }),
      asset({
        id: 'b',
        acquisitionDate: new Date(Date.UTC(2025, 3, 20)), // abril 2025
        originalValue: 600_000,
        usefulLifeYears: 5,
      }),
      asset({
        id: 'c',
        acquisitionDate: new Date(Date.UTC(2025, 11, 1)), // diciembre 2025
        originalValue: 480_000,
        usefulLifeYears: 4,
      }),
    ];
    const r = run(assets);

    const bienPorBien = r.detail.reduce(
      (s, d) => s + d.depreciation * d.coefficient,
      0
    );
    const total = r.registerDepreciation.get(GASTO)!;
    const porPromedio = total * r.byAccount.get(GASTO)!;

    // Exacto, no aproximado: es la propiedad, no una casualidad.
    expect(porPromedio).toBeCloseTo(bienPorBien, 6);
  });

  it('deja de amortizar cuando se agota la vida útil', () => {
    const r = run([
      asset({
        id: 'agotado',
        acquisitionDate: new Date(Date.UTC(2015, 2, 1)),
        usefulLifeYears: 5,
      }),
    ]);
    expect(r.detail[0].months).toBe(0);
    expect(r.byAccount.has(GASTO)).toBe(false); // no aporta coeficiente
  });

  it('prorratea el ejercicio en que se da de baja', () => {
    const r = run([
      asset({
        id: 'vendido',
        disposalDate: new Date(Date.UTC(2025, 8, 30)), // septiembre 2025
      }),
    ]);
    expect(r.detail[0].months).toBe(6); // abril a septiembre
  });

  it('ignora los bienes incorporados después del cierre', () => {
    const r = run([
      asset({
        id: 'futuro',
        acquisitionDate: new Date(Date.UTC(2026, 5, 1)),
      }),
    ]);
    expect(r.detail).toHaveLength(0);
    expect(r.byAccount.size).toBe(0);
  });

  it('separa las cuentas cuando los bienes amortizan contra cuentas distintas', () => {
    const r = run([
      asset({ id: 'maquinaria', accumDeprAccountId: 'acum-maq' }),
      asset({
        id: 'rodado',
        acquisitionDate: new Date(Date.UTC(2025, 7, 1)),
        accumDeprAccountId: 'acum-rod',
      }),
    ]);
    expect(r.byAccount.get('acum-maq')).toBe(1.3261);
    expect(r.byAccount.get('acum-rod')).toBe(1.2143);
    // El gasto es común a los dos, así que ahí sí pondera.
    expect(r.byAccount.get(GASTO)).toBeGreaterThan(1.2143);
    expect(r.byAccount.get(GASTO)).toBeLessThan(1.3261);
  });
});

describe('el motor aplica el coeficiente del bien a la amortización', () => {
  const indexes = { '2025-03': 7548.7, '2026-03': 10012.32 };
  // 10012.32 / 7548.7 = 1,3264 — cerca del 1,3261 real, alcanza para el test.
  const closingCoef = 1.3264;

  const base = {
    closing: { year: 2026, month: 3 },
    openingMonth: { year: 2025, month: 3 },
    indexes,
    recpamAccountId: 'recpam',
  };

  const amortizacion = {
    accountId: GASTO,
    code: '5.2.010',
    name: 'Amortización de bienes de uso',
    accountGroup: 'gastos_administracion',
    nature: 'no_monetaria_costo' as const,
    // Asentada al cierre, que es como la asienta el contador.
    monthly: [{ year: 2026, month: 3, amount: 100_000 }],
  };

  it('sin el coeficiente del bien, la amortización queda al mes del asiento', () => {
    const r = computeInflationAdjustment({
      ...base,
      accounts: [amortizacion],
    });
    const s = r.byAccount.find((x) => x.accountId === GASTO)!;
    expect(s.adjusted).toBe(100_000); // coeficiente de marzo 2026 = 1,0000
    expect(s.difference).toBe(0);
  });

  it('con el coeficiente del bien, se reexpresa junto con su costo', () => {
    const r = computeInflationAdjustment({
      ...base,
      accounts: [{ ...amortizacion, monthlyCoefficient: closingCoef }],
    });
    const s = r.byAccount.find((x) => x.accountId === GASTO)!;
    expect(s.adjusted).toBe(132_640);
    expect(s.difference).toBe(32_640);
    // El RECPAM absorbe el ajuste, con signo contrario.
    expect(r.recpam).toBe(-32_640);
    expect(r.balanced).toBe(true);
  });

  it('el coeficiente del bien no toca el saldo de apertura', () => {
    // La amortización acumulada de años anteriores viene en la apertura y ya va
    // por el coeficiente del cierre anterior: el override no debe pisarla.
    const r = computeInflationAdjustment({
      ...base,
      accounts: [
        {
          accountId: ACUM,
          code: '1.2.02.900',
          name: 'Amortizaciones acumuladas',
          accountGroup: 'bienes_uso',
          nature: 'no_monetaria_costo' as const,
          opening: -300_000,
          monthly: [{ year: 2026, month: 3, amount: -100_000 }],
          monthlyCoefficient: 1.1,
        },
      ],
    });
    const opening = r.lines.find((l) => l.isOpening)!;
    const movimiento = r.lines.find((l) => !l.isOpening)!;
    expect(opening.coefficient).toBe(closingCoef); // el de apertura, no 1,1
    expect(movimiento.coefficient).toBe(1.1);
  });
});
