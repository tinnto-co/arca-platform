import { describe, expect, it } from 'vitest';
import {
  evaluatePayrollFormula,
  evaluatePayrollFormulaStrict,
} from './payroll-formula';

describe('evaluatePayrollFormula', () => {
  it('calcula fórmula aritmética con variables permitidas', () => {
    const value = evaluatePayrollFormula('0.11 * totalRemunerativo', {
      totalRemunerativo: 200000,
    });
    expect(value).toBe(22000);
  });
});

describe('evaluatePayrollFormulaStrict', () => {
  it('reporta error en variable no permitida', () => {
    const result = evaluatePayrollFormulaStrict('evil + 1', {
      basico: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.value).toBe(0);
    expect(result.error).toContain('Variable no permitida');
  });
});
