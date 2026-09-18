import { describe, expect, it } from 'vitest';
import { enmascararFecha, fechaDesdeTexto } from './selector-fecha';

const iso = (d: Date | undefined) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : undefined;

describe('fechaDesdeTexto', () => {
  it('lee la fecha como la escribe el estudio', () => {
    expect(iso(fechaDesdeTexto('18/09/2026'))).toBe('2026-09-18');
    expect(iso(fechaDesdeTexto('1/3/2010'))).toBe('2010-03-01');
    expect(iso(fechaDesdeTexto('18-09-2026'))).toBe('2026-09-18');
    expect(iso(fechaDesdeTexto('18.09.2026'))).toBe('2026-09-18');
    // De corrido, sin separadores.
    expect(iso(fechaDesdeTexto('18092026'))).toBe('2026-09-18');
  });

  it('completa el año de dos cifras con el corte 69/70', () => {
    expect(iso(fechaDesdeTexto('18/09/26'))).toBe('2026-09-18');
    expect(iso(fechaDesdeTexto('01/03/10'))).toBe('2010-03-01');
    expect(iso(fechaDesdeTexto('15/06/85'))).toBe('1985-06-15');
  });

  it('rechaza fechas que no existen en vez de correrlas de mes', () => {
    // new Date(2026, 1, 31) daría 3 de marzo: eso sería un dato falso.
    expect(fechaDesdeTexto('31/02/2026')).toBeUndefined();
    expect(fechaDesdeTexto('32/01/2026')).toBeUndefined();
    expect(fechaDesdeTexto('18/13/2026')).toBeUndefined();
  });

  it('devuelve undefined con basura o campo vacío', () => {
    expect(fechaDesdeTexto('')).toBeUndefined();
    expect(fechaDesdeTexto('   ')).toBeUndefined();
    expect(fechaDesdeTexto('ayer')).toBeUndefined();
    expect(fechaDesdeTexto('18/09')).toBeUndefined();
  });
});

describe('enmascararFecha', () => {
  it('pone las barras mientras se escribe', () => {
    expect(enmascararFecha('1')).toBe('1');
    expect(enmascararFecha('18')).toBe('18');
    // La barra recién con el tercer dígito: así el retroceso no se traba.
    expect(enmascararFecha('189')).toBe('18/9');
    expect(enmascararFecha('1809')).toBe('18/09');
    expect(enmascararFecha('180920')).toBe('18/09/20');
    expect(enmascararFecha('18092026')).toBe('18/09/2026');
  });

  it('corta en ocho dígitos y descarta lo que no sea número', () => {
    // El caso que reportó Gastón: un chorizo no puede entrar entero.
    expect(enmascararFecha('100000028889999')).toBe('10/00/0002');
    expect(enmascararFecha('18/09/2026')).toBe('18/09/2026');
    expect(enmascararFecha('18-09-2026')).toBe('18/09/2026');
    expect(enmascararFecha('hola')).toBe('');
    expect(enmascararFecha('')).toBe('');
  });
});
