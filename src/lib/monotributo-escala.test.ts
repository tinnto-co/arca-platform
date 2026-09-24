import { describe, expect, it } from 'vitest';
import {
  MONOTRIBUTO_TOPES,
  categoriaEstimada,
  topeDeCategoria,
  usoDelTope,
} from './monotributo-escala';

describe('monotributo-escala', () => {
  it('la escala es creciente de A a K', () => {
    const topes = Object.values(MONOTRIBUTO_TOPES);
    for (let i = 1; i < topes.length; i++) {
      expect(topes[i]).toBeGreaterThan(topes[i - 1]);
    }
  });

  it('estima la categoría más baja que cubre la facturación', () => {
    expect(categoriaEstimada(0)).toBe('A');
    expect(categoriaEstimada(12_009_410.45)).toBe('A'); // justo en el tope
    expect(categoriaEstimada(12_009_410.46)).toBe('B');
    expect(categoriaEstimada(100_000_000)).toBe('J');
  });

  it('por encima de K no hay categoría (régimen general)', () => {
    expect(categoriaEstimada(126_610_838.76)).toBeNull();
  });

  it('facturación inválida no estima', () => {
    expect(categoriaEstimada(-1)).toBeNull();
    expect(categoriaEstimada(NaN)).toBeNull();
  });

  it('topeDeCategoria acepta minúsculas y rechaza letras fuera de escala', () => {
    expect(topeDeCategoria('f')).toBe(MONOTRIBUTO_TOPES.F);
    expect(topeDeCategoria('Z')).toBeNull();
    expect(topeDeCategoria(null)).toBeNull();
  });

  it('usoDelTope prefiere la categoría real de AFIP', () => {
    const r = usoDelTope(10_000_000, 'C');
    expect(r.categoria).toBe('C');
    expect(r.esEstimada).toBe(false);
    expect(r.uso).toBeCloseTo(10_000_000 / MONOTRIBUTO_TOPES.C, 6);
  });

  it('usoDelTope cae a la estimada cuando no hay categoría real', () => {
    const r = usoDelTope(20_000_000, null);
    expect(r.categoria).toBe('C');
    expect(r.esEstimada).toBe(true);
  });

  it('pasarse del tope de la categoría real da uso > 1', () => {
    const r = usoDelTope(MONOTRIBUTO_TOPES.A * 2, 'A');
    expect(r.uso).toBeGreaterThan(1);
  });
});
