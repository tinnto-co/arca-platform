import { describe, expect, it } from 'vitest';
import {
  MESES_MAX_VIGENCIA,
  problemaVigencia,
  vigenciaExcedida,
  vigenciaInvertida,
} from './escala-vigencia';

describe('vigenciaExcedida', () => {
  it('deja pasar un mes, que es lo normal', () => {
    expect(vigenciaExcedida({ desde: '2026-09-01', hasta: '2026-09-30' })).toBe(
      false
    );
  });

  it('deja pasar la escala sin fecha de fin', () => {
    expect(vigenciaExcedida({ desde: '2026-09-01', hasta: null })).toBe(false);
    expect(vigenciaExcedida({ desde: '2026-09-01' })).toBe(false);
  });

  it('deja pasar un acuerdo anual', () => {
    expect(vigenciaExcedida({ desde: '2026-01-01', hasta: '2026-12-31' })).toBe(
      false
    );
  });

  it('corta la fila que rompió Comercio', () => {
    expect(vigenciaExcedida({ desde: '2026-07-01', hasta: '2031-03-31' })).toBe(
      true
    );
  });

  it('corta justo pasado el límite', () => {
    expect(vigenciaExcedida({ desde: '2026-01-01', hasta: '2027-02-01' })).toBe(
      true
    );
    expect(vigenciaExcedida({ desde: '2026-01-01', hasta: '2027-01-31' })).toBe(
      false
    );
  });

  it('el límite son trece meses', () => {
    expect(MESES_MAX_VIGENCIA).toBe(13);
  });
});

describe('vigenciaInvertida', () => {
  it('detecta el fin anterior al inicio', () => {
    expect(
      vigenciaInvertida({ desde: '2026-09-01', hasta: '2026-08-31' })
    ).toBe(true);
  });

  it('no molesta cuando el rango está bien o está abierto', () => {
    expect(
      vigenciaInvertida({ desde: '2026-09-01', hasta: '2026-09-30' })
    ).toBe(false);
    expect(vigenciaInvertida({ desde: '2026-09-01' })).toBe(false);
  });
});

describe('problemaVigencia', () => {
  it('no dice nada cuando el rango está bien', () => {
    expect(
      problemaVigencia({ desde: '2026-09-01', hasta: '2026-09-30' })
    ).toBeNull();
  });

  it('explica por qué no se puede cargar la de cinco años', () => {
    const msg = problemaVigencia({ desde: '2026-07-01', hasta: '2031-03-31' });
    expect(msg).toContain('13 meses');
    expect(msg).toContain('una escala por período');
  });

  it('avisa cuando las fechas están al revés', () => {
    expect(
      problemaVigencia({ desde: '2026-09-01', hasta: '2026-08-31' })
    ).toContain('termina antes de empezar');
  });
});
