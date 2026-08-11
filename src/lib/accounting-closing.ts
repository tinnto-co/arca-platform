/**
 * Armado de los tres asientos del cierre de ejercicio.
 *
 * - **Refundición**: lleva a cero cada cuenta de resultado contra «Resultado
 *   del ejercicio», que es lo que queda como ganancia o pérdida del año.
 * - **Cierre patrimonial**: lleva a cero todos los saldos patrimoniales, ya con
 *   el resultado refundido adentro.
 * - **Apertura**: los reabre del lado contrario en el ejercicio siguiente.
 *
 * La apertura es el arrastre de saldos entre ejercicios: existencias, efectivo,
 * bienes de uso con su amortización acumulada y el patrimonio neto pasan solos
 * al año que viene. No elige cuentas —recorre todos los saldos patrimoniales—,
 * así que un rubro nuevo del plan se arrastra sin tocar este código.
 *
 * Función pura, sin base ni sesión, para poder probarla contra un balance
 * armado a mano.
 */
import {
  RESULT_ACCOUNT_GROUPS,
  RESULT_TARGET_GROUP,
} from './accounting-labels';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface FyAccountBalance {
  accountId: string;
  code: string;
  name: string;
  group: string | null;
  saldo: number; // debe − haber (>0 deudor, <0 acreedor)
}

/** Saldos por cuenta de un ejercicio (suma de todos sus asientos no anulados). */
export interface ClosingLine {
  accountId: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
}
export interface ClosingEntryPreview {
  lines: ClosingLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface ResultadoAccount {
  id: string;
  code: string;
  name: string;
}

/** Construye los asientos de refundición y cierre patrimonial a partir de los saldos. */
export function buildClosingEntries(
  balances: FyAccountBalance[],
  resultado: ResultadoAccount
): {
  refundicion: ClosingEntryPreview;
  cierre: ClosingEntryPreview;
  apertura: ClosingEntryPreview;
  net: number; // >0 ganancia, <0 pérdida
} {
  const RESULT = new Set<string>(RESULT_ACCOUNT_GROUPS);
  const resultAccts = balances.filter((b) => b.group && RESULT.has(b.group));
  const patrimonial = balances.filter((b) => !b.group || !RESULT.has(b.group));

  // ── Refundición: lleva cada cuenta de resultado a cero contra Resultado del ejercicio.
  const refLines: ClosingLine[] = [];
  let net = 0; // ingresos − gastos
  for (const a of resultAccts) {
    if (a.saldo > 0) {
      // saldo deudor (gasto/costo) → al Haber para cancelar
      refLines.push({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        debit: 0,
        credit: a.saldo,
      });
      net -= a.saldo;
    } else {
      // saldo acreedor (ingreso) → al Debe para cancelar
      refLines.push({
        accountId: a.accountId,
        code: a.code,
        name: a.name,
        debit: -a.saldo,
        credit: 0,
      });
      net += -a.saldo;
    }
  }
  const netR = r2(net);
  if (Math.abs(netR) > 0.005) {
    // Resultado del ejercicio: ganancia → Haber (PN aumenta); pérdida → Debe.
    refLines.push({
      accountId: resultado.id,
      code: resultado.code,
      name: resultado.name,
      debit: netR < 0 ? -netR : 0,
      credit: netR > 0 ? netR : 0,
    });
  }

  // ── Cierre patrimonial: saldos patrimoniales + el Resultado del ejercicio ya refundido.
  const cierreBalances = patrimonial.map((b) => ({ ...b }));
  const idx = cierreBalances.findIndex((b) => b.accountId === resultado.id);
  if (idx >= 0) {
    cierreBalances[idx].saldo = r2(cierreBalances[idx].saldo - netR);
  } else if (Math.abs(netR) > 0.005) {
    cierreBalances.push({
      accountId: resultado.id,
      code: resultado.code,
      name: resultado.name,
      group: RESULT_TARGET_GROUP,
      saldo: r2(-netR), // ganancia → acreedor
    });
  }

  const cierreLines: ClosingLine[] = [];
  const aperturaLines: ClosingLine[] = [];
  for (const b of cierreBalances) {
    if (Math.abs(b.saldo) < 0.005) continue;
    if (b.saldo > 0) {
      // deudor (activo) → cierre lo lleva al Haber; apertura lo reabre al Debe
      cierreLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: 0,
        credit: b.saldo,
      });
      aperturaLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: b.saldo,
        credit: 0,
      });
    } else {
      cierreLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: -b.saldo,
        credit: 0,
      });
      aperturaLines.push({
        accountId: b.accountId,
        code: b.code,
        name: b.name,
        debit: 0,
        credit: -b.saldo,
      });
    }
  }

  const summarize = (lines: ClosingLine[]): ClosingEntryPreview => {
    const totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
    return {
      lines,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) < 0.005,
    };
  };

  return {
    refundicion: summarize(refLines),
    cierre: summarize(cierreLines),
    apertura: summarize(aperturaLines),
    net: netR,
  };
}
