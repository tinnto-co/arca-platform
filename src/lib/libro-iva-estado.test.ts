import { describe, expect, it } from 'vitest';
import { estadoLibroIva, UMBRAL_LIBRO_COMPLETO } from './libro-iva-estado';

const libro = (v: number, c: number) => ({
  netoVentas: v,
  netoCompras: c,
  debito: v * 0.21,
  credito: c * 0.21,
});

describe('estadoLibroIva', () => {
  it('sin fila es vacío', () => {
    expect(
      estadoLibroIva({
        libro: null,
        ddjjPresentada: false,
        estimadoVentas: 100,
        estimadoCompras: 100,
      })
    ).toBe('vacio');
  });

  it('con todos los importes en cero es vacío', () => {
    expect(
      estadoLibroIva({
        libro: { netoVentas: 0, netoCompras: 0, debito: 0, credito: 0 },
        ddjjPresentada: false,
        estimadoVentas: 100,
        estimadoCompras: 100,
      })
    ).toBe('vacio');
  });

  it('por debajo del estimado es preliminar (no pisa el dato bueno)', () => {
    expect(
      estadoLibroIva({
        libro: libro(50_000, 100_000),
        ddjjPresentada: false,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('preliminar');
  });

  it('basta que UNA banda esté por debajo para ser preliminar', () => {
    expect(
      estadoLibroIva({
        libro: libro(200_000, 50_000),
        ddjjPresentada: false,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('preliminar');
  });

  it('al alcanzar o superar el estimado es completo', () => {
    expect(
      estadoLibroIva({
        libro: libro(120_000, 110_000),
        ddjjPresentada: false,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('completo');
  });

  it('el umbral del 99% evita quedar preliminar por centavos', () => {
    const casi = 100_000 * UMBRAL_LIBRO_COMPLETO;
    expect(
      estadoLibroIva({
        libro: libro(casi, casi),
        ddjjPresentada: false,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('completo');
    expect(
      estadoLibroIva({
        libro: libro(casi - 1, casi - 1),
        ddjjPresentada: false,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('preliminar');
  });

  it('sin estimado contra el que comparar, el libro con datos es completo', () => {
    expect(
      estadoLibroIva({
        libro: libro(100_000, 50_000),
        ddjjPresentada: false,
        estimadoVentas: 0,
        estimadoCompras: 0,
      })
    ).toBe('completo');
  });

  it('la DDJJ presentada manda sobre todo lo demás', () => {
    expect(
      estadoLibroIva({
        libro: null,
        ddjjPresentada: true,
        estimadoVentas: 100,
        estimadoCompras: 100,
      })
    ).toBe('definitivo');
    expect(
      estadoLibroIva({
        libro: libro(1, 1),
        ddjjPresentada: true,
        estimadoVentas: 100_000,
        estimadoCompras: 100_000,
      })
    ).toBe('definitivo');
  });
});
