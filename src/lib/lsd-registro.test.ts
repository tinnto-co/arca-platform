import { describe, expect, it } from 'vitest';
import {
  describirProblemasLsd,
  LARGO_REGISTRO_LSD,
  verificarLargosLsd,
} from './lsd-registro';

const linea = (tipo: string, largo: number) =>
  tipo + 'x'.repeat(largo - tipo.length);

describe('verificarLargosLsd', () => {
  it('no marca nada cuando cada registro tiene su ancho', () => {
    const archivo = [
      linea('01', 35),
      linea('02', 115),
      linea('03', 51),
      linea('03', 51),
      linea('04', 370),
    ];
    expect(verificarLargosLsd(archivo)).toEqual([]);
  });

  it('marca el registro 02 de 116, que es como salía antes', () => {
    const p = verificarLargosLsd([linea('02', 116)]);
    expect(p).toEqual([{ linea: 1, tipo: '02', largo: 116, esperado: 115 }]);
  });

  it('marca los dos largos que generaba el registro 03', () => {
    const p = verificarLargosLsd([linea('03', 45), linea('03', 48)]);
    expect(p.map((x) => x.largo)).toEqual([45, 48]);
    expect(p.every((x) => x.esperado === 51)).toBe(true);
  });

  it('marca la línea vacía que dejaba el salto final', () => {
    const p = verificarLargosLsd([linea('01', 35), '']);
    expect(p).toEqual([{ linea: 2, tipo: '', largo: 0, esperado: null }]);
  });

  it('conoce los cuatro tipos del diseño de ARCA', () => {
    expect(LARGO_REGISTRO_LSD).toEqual({
      '01': 35,
      '02': 115,
      '03': 51,
      '04': 370,
    });
  });
});

describe('describirProblemasLsd', () => {
  it('nombra la línea, el registro y los dos anchos', () => {
    const msg = describirProblemasLsd(
      verificarLargosLsd([linea('02', 116), linea('03', 45)])
    );
    expect(msg).toContain(
      'línea 1 (registro 02): 116 caracteres en vez de 115'
    );
    expect(msg).toContain('línea 2 (registro 03): 45 caracteres en vez de 51');
  });

  it('corta a cinco y dice cuántas quedan', () => {
    const msg = describirProblemasLsd(
      verificarLargosLsd(Array.from({ length: 8 }, () => linea('03', 45)))
    );
    expect(msg).toContain('y 3 líneas más');
  });
});
