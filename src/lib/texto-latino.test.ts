import { describe, expect, it } from 'vitest';
import { aLatino } from './texto-latino';

describe('aLatino', () => {
  it('corrige las descripciones reales que leyó la IA', () => {
    // С, О y Е cirílicas, tal como quedaron en Gastrotecno, enero 2026.
    expect(aLatino('TRANSFERENCIA INMEDIATA СОЕ 30716985829')).toBe(
      'TRANSFERENCIA INMEDIATA COE 30716985829'
    );
    expect(aLatino('TRANSF. CLIENTЕ СТА. ССР147 008559 1')).toBe(
      'TRANSF. CLIENTE CTA. CCP147 008559 1'
    );
  });

  it('también cambia las gemelas griegas, por cómo se ven', () => {
    expect(aLatino('ΝΟΤΑ ΚΜ')).toBe('NOTA KM');
    // La rho griega se ve como una P, no como una R.
    expect(aLatino('Ρ')).toBe('P');
  });

  it('deja intacto el texto latino, con tildes y ñ', () => {
    const texto = 'Transferencia recibida De Muñoz, José / var';
    expect(aLatino(texto)).toBe(texto);
  });
});
