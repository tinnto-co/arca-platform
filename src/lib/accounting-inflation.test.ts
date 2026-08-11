import { describe, expect, it } from 'vitest';
import {
  computeInflationAdjustment,
  defaultInflationNature,
  monthKey,
  reexpressionCoefficient,
  shouldReexpress,
  type InflationAccountInput,
  type InflationEngineInput,
} from './accounting-inflation';

/**
 * Fixture de aceptación: E-PRESIS SA, ejercicio 4 (01/04/2025 – 31/03/2026).
 *
 * Datos tomados del papel de trabajo del estudio (`Planilla Modelo PRESIS
 * 2026.xls`, hoja AXI) y contrastados contra los EECC publicados (`BALANCE
 * E-Presis bal2025 con axi.xls`). Los índices son la serie oficial FACPCE
 * "Índice RT 6 – Res. JG 539/18".
 *
 * Ver `docs/balances/09_AJUSTE_POR_INFLACION.md` §3.
 */

/** Serie FACPCE, marzo 2025 a marzo 2026. */
const FACPCE_INDEX: Record<string, number> = {
  '2025-03': 8353.3158,
  '2025-04': 8585.6078,
  '2025-05': 8714.4871,
  '2025-06': 8855.5681,
  '2025-07': 9023.973,
  '2025-08': 9193.2441,
  '2025-09': 9384.0922,
  '2025-10': 9603.8623,
  '2025-11': 9841.3581,
  '2025-12': 10121.3715,
  '2026-01': 10413.0309,
  '2026-02': 10714.6255,
  '2026-03': 11077.0608,
};

/** Los 12 meses del ejercicio, en orden. */
const MONTHS: [number, number][] = [
  [2025, 4],
  [2025, 5],
  [2025, 6],
  [2025, 7],
  [2025, 8],
  [2025, 9],
  [2025, 10],
  [2025, 11],
  [2025, 12],
  [2026, 1],
  [2026, 2],
  [2026, 3],
];

/** Arma los movimientos mensuales a partir de 12 importes históricos. */
const monthly = (amounts: number[], sign: 1 | -1 = 1) =>
  MONTHS.map(([year, month], i) => ({
    year,
    month,
    amount: sign * amounts[i],
  }));

// Saldos históricos mensuales de la hoja AXI.
const VENTAS = [
  69284248.1, 82053674.91, 70128665.47, 11428824.64, 81370055.25, 85526108.98,
  81037068.52, 96800526.79, 98906976.49, 106609637.3, 106476092.5, 97625445.08,
];
const COMPRAS = [
  64216563.18, 47844372.6, 78603867.59, 79042214.41, 70637049.88, 79335190.79,
  3900460.45, 35303220.23, 38506786.2, 26141486.74, 47701301.57, 45409295.72,
];
const SUELDOS = [
  8760355.47, 9086665.97, 13608648.91, 10063946.56, 9687963.31, 10535447.84,
  9936278.73, 10571682.99, 14462577.49, 10536011.69, 10552301.08, 10815987.5,
];
const CARGAS = [
  3468165.29, 3589220.21, 5487192.361, 3982099.92, 3956219.54, 4142010.13,
  3949528.35, 4203472.49, 5996966.77, 4276498.43, 4263797.34, 4349518.56,
];
const IIBB = [
  2231260.97, 4714253.18, 4016220.78, 2731236.83, 4701414.07, 2752674.19,
  4084276.55, 5939078.9, 3147674.52, 3407447.63, 3160771.58, 0,
];

const ACC_VENTAS = 'acc-ventas';
const ACC_CMV = 'acc-cmv';
const ACC_SUELDOS = 'acc-sueldos';
const ACC_CARGAS = 'acc-cargas';
const ACC_IIBB = 'acc-iibb';
const ACC_CAPITAL = 'acc-capital';
const ACC_AJ_CAPITAL = 'acc-ajuste-capital';
const ACC_RNA = 'acc-rna';
const ACC_RECPAM = 'acc-recpam';
const ACC_BANCO = 'acc-banco';

const account = (
  over: Partial<InflationAccountInput> &
    Pick<InflationAccountInput, 'accountId'>
): InflationAccountInput => ({
  code: over.code ?? '0.000',
  name: over.name ?? over.accountId,
  accountGroup: over.accountGroup ?? null,
  nature: over.nature ?? 'no_monetaria_costo',
  ...over,
});

const EPRESIS_ACCOUNTS: InflationAccountInput[] = [
  // Resultados. Ventas es acreedora → signo negativo.
  account({
    accountId: ACC_VENTAS,
    code: '4.1.001',
    name: 'Ventas',
    accountGroup: 'ventas',
    monthly: monthly(VENTAS, -1),
  }),
  account({
    accountId: ACC_CMV,
    code: '5.1.001',
    name: 'Costo de mercaderías vendidas',
    accountGroup: 'costo_ventas',
    monthly: monthly(COMPRAS),
  }),
  account({
    accountId: ACC_SUELDOS,
    code: '5.2.001',
    name: 'Sueldos y jornales',
    accountGroup: 'gastos_administracion',
    monthly: monthly(SUELDOS),
  }),
  account({
    accountId: ACC_CARGAS,
    code: '5.2.002',
    name: 'Cargas sociales',
    accountGroup: 'gastos_administracion',
    monthly: monthly(CARGAS),
  }),
  account({
    accountId: ACC_IIBB,
    code: '5.3.002',
    name: 'Ingresos brutos',
    accountGroup: 'gastos_comercializacion',
    monthly: monthly(IIBB),
  }),
  // Patrimonio neto: solo saldo de apertura, acreedor → negativo.
  // El capital queda a valor nominal; su reexpresión va a Ajuste de capital.
  account({
    accountId: ACC_CAPITAL,
    code: '3.1.001',
    name: 'Capital social',
    accountGroup: 'capital',
    targetAccountId: ACC_AJ_CAPITAL,
    opening: -500000,
  }),
  account({
    accountId: ACC_AJ_CAPITAL,
    code: '3.1.002',
    name: 'Ajuste de capital',
    accountGroup: 'capital',
    opening: -4546140.83,
  }),
  account({
    accountId: ACC_RNA,
    code: '3.5.001',
    name: 'Resultados no asignados',
    accountGroup: 'resultados_no_asignados',
    opening: -112270711.21,
  }),
];

const EPRESIS_INPUT: InflationEngineInput = {
  closing: { year: 2026, month: 3 },
  openingMonth: { year: 2025, month: 3 },
  indexes: FACPCE_INDEX,
  accounts: EPRESIS_ACCOUNTS,
  recpamAccountId: ACC_RECPAM,
};

const summaryOf = (
  result: ReturnType<typeof computeInflationAdjustment>,
  accountId: string
) => result.byAccount.find((a) => a.accountId === accountId)!;

describe('reexpressionCoefficient', () => {
  it('reproduce los 13 coeficientes del papel de trabajo del estudio', () => {
    // Los coeficientes que el contador cargó a mano en la hoja AXI.
    const expected: Record<string, number> = {
      '2025-03': 1.3261,
      '2025-04': 1.2902,
      '2025-05': 1.2711,
      '2025-06': 1.2509,
      '2025-07': 1.2275,
      '2025-08': 1.2049,
      '2025-09': 1.1804,
      '2025-10': 1.1534,
      '2025-11': 1.1256,
      '2025-12': 1.0944,
      '2026-01': 1.0638,
      '2026-02': 1.0338,
      '2026-03': 1.0,
    };
    const closing = FACPCE_INDEX['2026-03'];
    for (const [key, coef] of Object.entries(expected)) {
      expect(reexpressionCoefficient(closing, FACPCE_INDEX[key])).toBe(coef);
    }
  });

  it('el coeficiente del mes de cierre es 1', () => {
    const c = FACPCE_INDEX['2026-03'];
    expect(reexpressionCoefficient(c, c)).toBe(1);
  });

  it('rechaza un índice de origen inválido', () => {
    expect(() => reexpressionCoefficient(100, 0)).toThrow(/Índice de origen/);
  });
});

describe('clasificación por defecto', () => {
  it('solo reexpresa las partidas no monetarias a costo', () => {
    expect(shouldReexpress('no_monetaria_costo')).toBe(true);
    expect(shouldReexpress('monetaria')).toBe(false);
    expect(shouldReexpress('no_monetaria_valor_corriente')).toBe(false);
    expect(shouldReexpress('resultado_por_diferencia')).toBe(false);
  });

  it('clasifica los rubros según el Cuadro N° 1 de RT 6', () => {
    expect(defaultInflationNature('caja_bancos')).toBe('monetaria');
    expect(defaultInflationNature('creditos_ventas')).toBe('monetaria');
    expect(defaultInflationNature('deudas_fiscales')).toBe('monetaria');
    expect(defaultInflationNature('bienes_uso')).toBe('no_monetaria_costo');
    expect(defaultInflationNature('capital')).toBe('no_monetaria_costo');
    expect(defaultInflationNature('ventas')).toBe('no_monetaria_costo');
    // Monetarias: el estudio las cuenta como equivalentes de efectivo.
    expect(defaultInflationNature('inversiones_temporarias')).toBe('monetaria');
    // A VPP, ya en moneda de cierre: no se reexpresan.
    expect(defaultInflationNature('inversiones_permanentes')).toBe(
      'no_monetaria_valor_corriente'
    );
    // Se determinan por diferencia, junto con el RECPAM.
    expect(defaultInflationNature('gastos_financieros')).toBe(
      'resultado_por_diferencia'
    );
  });

  it('cae en monetaria ante un rubro desconocido o nulo', () => {
    expect(defaultInflationNature(null)).toBe('monetaria');
    expect(defaultInflationNature('rubro_inventado')).toBe('monetaria');
  });
});

describe('computeInflationAdjustment — fixture E-PRESIS SA', () => {
  const result = computeInflationAdjustment(EPRESIS_INPUT);

  it('el asiento de ajuste cuadra', () => {
    expect(result.balanced).toBe(true);
  });

  it('reexpresa las ventas a 1.126.221.976,09', () => {
    const ventas = summaryOf(result, ACC_VENTAS);
    expect(ventas.historical).toBeCloseTo(-987247324.03, 2);
    expect(ventas.adjusted).toBeCloseTo(-1126221976.09, 2);
    expect(ventas.difference).toBeCloseTo(-138974652.06, 2);
  });

  it('reexpresa el costo de ventas a 726.685.066,06', () => {
    const cmv = summaryOf(result, ACC_CMV);
    expect(cmv.historical).toBeCloseTo(616641809.36, 2);
    expect(cmv.adjusted).toBeCloseTo(726685066.06, 2);
    expect(cmv.difference).toBeCloseTo(110043256.7, 2);
  });

  it('reexpresa sueldos, cargas sociales e ingresos brutos', () => {
    expect(summaryOf(result, ACC_SUELDOS).adjusted).toBeCloseTo(
      148459295.35,
      2
    );
    expect(summaryOf(result, ACC_SUELDOS).difference).toBeCloseTo(
      19841427.81,
      1
    );
    expect(summaryOf(result, ACC_CARGAS).adjusted).toBeCloseTo(59601585.27, 2);
    expect(summaryOf(result, ACC_CARGAS).difference).toBeCloseTo(7936895.88, 1);
    expect(summaryOf(result, ACC_IIBB).adjusted).toBeCloseTo(47894629.56, 2);
    expect(summaryOf(result, ACC_IIBB).difference).toBeCloseTo(7008320.36, 1);
  });

  it('reexpresa el patrimonio neto inicial por el coeficiente del cierre anterior', () => {
    expect(summaryOf(result, ACC_CAPITAL).adjusted).toBeCloseTo(-663050, 2);
    expect(summaryOf(result, ACC_CAPITAL).difference).toBeCloseTo(-163050, 2);
    expect(summaryOf(result, ACC_AJ_CAPITAL).adjusted).toBeCloseTo(
      -6028637.35,
      2
    );
    expect(summaryOf(result, ACC_RNA).adjusted).toBeCloseTo(-148882190.14, 2);
    expect(summaryOf(result, ACC_RNA).difference).toBeCloseTo(-36611478.93, 1);
  });

  it('el PN inicial ajustado da 155.573.877,49 (columna 2025 del ESP)', () => {
    const pn =
      summaryOf(result, ACC_CAPITAL).adjusted +
      summaryOf(result, ACC_AJ_CAPITAL).adjusted +
      summaryOf(result, ACC_RNA).adjusted;
    expect(-pn).toBeCloseTo(155573877.49, 2);
  });

  it('calcula el RECPAM en −32.401.776,77 (pérdida)', () => {
    // Signo contable: positivo = deudor = pérdida.
    expect(result.recpam).toBeGreaterThan(0);
    // Tolerancia de 5 cts: el RECPAM es el residuo y absorbe el redondeo de
    // todas las cuentas. La planilla del estudio da 32.401.776,7709.
    expect(result.recpam).toBeCloseTo(32401776.77, 1);
  });

  it('imputa la reexpresión del capital a Ajuste de capital, no al capital', () => {
    const capitalLine = result.entryLines.find(
      (l) => l.accountId === ACC_CAPITAL
    );
    expect(capitalLine).toBeUndefined();

    // Ajuste de capital recibe su propia reexpresión (1.482.496,52) más la del
    // capital social (163.050) → 1.645.546,52 al Haber.
    const ajLine = result.entryLines.find(
      (l) => l.accountId === ACC_AJ_CAPITAL
    )!;
    expect(ajLine.debit).toBe(0);
    expect(ajLine.credit).toBeCloseTo(1645546.52, 1);
  });

  it('el Ajuste de capital final da 6.191.687,35 (columna del EEPN)', () => {
    const ajLine = result.entryLines.find(
      (l) => l.accountId === ACC_AJ_CAPITAL
    )!;
    const historico = 4546140.83;
    expect(historico + ajLine.credit).toBeCloseTo(6191687.35, 1);
  });

  it('el RECPAM es la única contrapartida y cierra el asiento', () => {
    const recpamLine = result.entryLines.find(
      (l) => l.accountId === ACC_RECPAM
    )!;
    expect(recpamLine.debit).toBeCloseTo(32401776.77, 1);
    expect(recpamLine.credit).toBe(0);

    const debit = result.entryLines.reduce((s, l) => s + l.debit, 0);
    const credit = result.entryLines.reduce((s, l) => s + l.credit, 0);
    expect(debit).toBeCloseTo(credit, 1);
  });

  it('genera una fila de preplanilla por cuenta y por mes', () => {
    // 5 cuentas de resultado × 12 meses, menos IIBB de marzo que es cero,
    // más 3 saldos de apertura patrimoniales.
    expect(result.lines).toHaveLength(5 * 12 - 1 + 3);
    const ventasAbril = result.lines.find(
      (l) => l.accountId === ACC_VENTAS && l.year === 2025 && l.month === 4
    )!;
    expect(ventasAbril.coefficient).toBe(1.2902);
    expect(ventasAbril.historical).toBeCloseTo(-69284248.1, 2);
    expect(ventasAbril.adjusted).toBeCloseTo(-89390536.9, 1);
  });
});

describe('computeInflationAdjustment — casos de borde', () => {
  it('no ajusta las cuentas monetarias', () => {
    const result = computeInflationAdjustment({
      ...EPRESIS_INPUT,
      accounts: [
        account({
          accountId: ACC_BANCO,
          code: '1.1.01.002',
          name: 'Banco cuenta corriente',
          accountGroup: 'caja_bancos',
          nature: 'monetaria',
          opening: 1000000,
          monthly: monthly(Array.from({ length: 12 }, () => 100000)),
        }),
      ],
    });
    expect(result.byAccount[0].difference).toBe(0);
    expect(result.entryLines).toHaveLength(0);
    expect(result.recpam).toBe(0);
    // Aparecen igual en la preplanilla, con coeficiente 1, como papel de trabajo.
    expect(result.lines.every((l) => l.coefficient === 1)).toBe(true);
  });

  it('no reexpresa los resultados financieros (van por diferencia)', () => {
    const result = computeInflationAdjustment({
      ...EPRESIS_INPUT,
      accounts: [
        account({
          accountId: 'acc-intereses',
          code: '5.4.001',
          name: 'Intereses perdidos',
          accountGroup: 'gastos_financieros',
          nature: 'resultado_por_diferencia',
          monthly: monthly(Array.from({ length: 12 }, () => 1000000)),
        }),
      ],
    });
    expect(result.byAccount[0].difference).toBe(0);
    expect(result.recpam).toBe(0);
  });

  it('ignora los importes despreciables', () => {
    const result = computeInflationAdjustment({
      ...EPRESIS_INPUT,
      accounts: [
        account({
          accountId: 'acc-chico',
          code: '5.2.006',
          name: 'Gastos de oficina',
          accountGroup: 'gastos_administracion',
          opening: 0,
          monthly: [{ year: 2025, month: 4, amount: 0.001 }],
        }),
      ],
    });
    expect(result.lines).toHaveLength(0);
    expect(result.entryLines).toHaveLength(0);
  });

  it('falla con un mensaje claro si falta un índice', () => {
    expect(() =>
      computeInflationAdjustment({
        ...EPRESIS_INPUT,
        accounts: [
          account({
            accountId: 'acc-x',
            accountGroup: 'ventas',
            monthly: [{ year: 2024, month: 9, amount: 1000 }],
          }),
        ],
      })
    ).toThrow(/Falta el índice de inflación de 2024-09/);
  });

  it('un ejercicio sin partidas no monetarias no genera RECPAM', () => {
    const result = computeInflationAdjustment({
      ...EPRESIS_INPUT,
      accounts: [],
    });
    expect(result.recpam).toBe(0);
    expect(result.balanced).toBe(true);
    expect(result.entryLines).toHaveLength(0);
  });
});

describe('monthKey', () => {
  it('normaliza el mes a dos dígitos', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(monthKey(2025, 12)).toBe('2025-12');
  });
});
