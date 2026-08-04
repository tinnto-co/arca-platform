import { describe, expect, it } from 'vitest';
import { AXW_BASE, AXW_PRIOR } from './mayor-export';

/**
 * react-pdf reparte las columnas por porcentaje: si no suman 100 la tabla se
 * desborda o deja un hueco, y no hay error que lo avise. Es el único modo en
 * que agregar una columna al Anexo I rompe el maquetado en silencio.
 */
const suma = (w: Record<string, string>) =>
  Object.values(w).reduce((s, v) => s + Number(v.replace('%', '')), 0);

describe('anchos de columna del Anexo I', () => {
  it('sin comparativo suman 100%', () => {
    expect(suma(AXW_BASE)).toBe(100);
  });

  it('con la columna del ejercicio anterior también suman 100%', () => {
    expect(suma(AXW_PRIOR)).toBe(100);
  });

  it('los dos juegos declaran las mismas columnas', () => {
    expect(Object.keys(AXW_PRIOR).sort()).toEqual(Object.keys(AXW_BASE).sort());
  });

  it('sin comparativo, la columna del anterior no ocupa lugar', () => {
    expect(AXW_BASE.netoPrior).toBe('0%');
    expect(Number(AXW_PRIOR.netoPrior.replace('%', ''))).toBeGreaterThan(0);
  });
});
