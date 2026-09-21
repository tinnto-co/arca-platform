import { describe, expect, it } from 'vitest';
import {
  cuitValido,
  cuitsEnDescripcion,
  dniDeCuit,
  formatearCuit,
} from './cuit-descripcion';

describe('cuitValido', () => {
  it('acepta CUITs reales de empresas y personas', () => {
    expect(cuitValido('30697293287')).toBe(true);
    expect(cuitValido('30615773383')).toBe(true);
    expect(cuitValido('20258557205')).toBe(true);
  });

  it('rechaza dígito verificador, prefijo o largo incorrectos', () => {
    expect(cuitValido('30697293288')).toBe(false);
    expect(cuitValido('12697293287')).toBe(false);
    expect(cuitValido('3069729328')).toBe(false);
  });
});

describe('cuitsEnDescripcion', () => {
  it('encuentra el CUIT suelto de una transferencia', () => {
    expect(cuitsEnDescripcion('TRANSFERENCIA 30697293287')).toEqual([
      { cuit: '30697293287', suelto: true },
    ]);
  });

  it('no se confunde con letras que no son latinas (СОЕ en cirílico)', () => {
    expect(
      cuitsEnDescripcion('TRANSFERENCIA INMEDIATA СОЕ 30716985829')
    ).toEqual([{ cuit: '30716985829', suelto: true }]);
  });

  it('marca como pegado el CUIT al comienzo de un número más largo', () => {
    expect(
      cuitsEnDescripcion(
        'Pago a proveedores recibido Instituto de obra social de l 30714292141035453609'
      )
    ).toEqual([{ cuit: '30714292141', suelto: false }]);
  });

  it('descarta números largos que no empiezan con un CUIT válido', () => {
    expect(
      cuitsEnDescripcion(
        'Debito automatico Federacion patro-2403951522000000231225'
      )
    ).toEqual([]);
  });

  it('pone primero los sueltos y no repite', () => {
    expect(
      cuitsEnDescripcion(
        'X 30714292141035453609 Y 30697293287 Z 30697293287'
      ).map((c) => c.cuit)
    ).toEqual(['30697293287', '30714292141']);
  });

  it('sin descripción no hay CUITs', () => {
    expect(cuitsEnDescripcion(null)).toEqual([]);
    expect(cuitsEnDescripcion('IMP. DEB. LEY 25413 GRAL.')).toEqual([]);
  });
});

describe('dniDeCuit', () => {
  it('saca el DNI de un CUIT de persona, sin ceros adelante', () => {
    expect(dniDeCuit('20258557205')).toBe('25855720');
    expect(dniDeCuit('27042731876')).toBe('4273187');
  });

  it('las empresas no tienen DNI', () => {
    expect(dniDeCuit('30697293287')).toBeNull();
  });
});

describe('formatearCuit', () => {
  it('agrega los guiones', () => {
    expect(formatearCuit('30697293287')).toBe('30-69729328-7');
  });
});
