import { describe, expect, it } from 'vitest';
import {
  analizarCuadreRegla,
  describirAlcanceRegla,
  detectarReglasTapadas,
  direccionSugeridaPorNombre,
  reglaCubre,
  reglaMatchea,
  seleccionarRegla,
  type ComprobanteLike,
  type ReglaLike,
} from './accounting-invoice-posting';

const regla = (
  over: Partial<ReglaLike> & Pick<ReglaLike, 'id'>
): ReglaLike => ({
  nombre: over.nombre ?? over.id,
  tipo: 'condicional',
  condicion: null,
  prioridad: 100,
  lineas: [],
  ...over,
});

const comp = (over: Partial<ComprobanteLike>): ComprobanteLike => ({
  direccion: 'emitido',
  letra: 'A',
  total: 121,
  ivaTotal: 21,
  otrosTributos: 0,
  ...over,
});

describe('reglaMatchea / seleccionarRegla', () => {
  // El caso reportado: dos reglas con la misma condición de letras y sin
  // dirección. La primera se quedaba con las compras y con las ventas.
  it('separa ventas de compras cuando la regla filtra por dirección', () => {
    const reglas = [
      regla({
        id: 'compras',
        condicion: { direccion: 'recibido', letra: ['A', 'B', 'M'] },
      }),
      regla({
        id: 'ventas',
        condicion: { direccion: 'emitido', letra: ['A', 'B', 'M'] },
      }),
    ];
    expect(seleccionarRegla(reglas, comp({ direccion: 'recibido' }))?.id).toBe(
      'compras'
    );
    expect(seleccionarRegla(reglas, comp({ direccion: 'emitido' }))?.id).toBe(
      'ventas'
    );
  });

  it('agrupa ventas A/B, compras A y compras C con cuatro reglas', () => {
    const reglas = [
      regla({ id: 'va', condicion: { direccion: 'emitido', letra: ['A'] } }),
      regla({ id: 'vb', condicion: { direccion: 'emitido', letra: ['B'] } }),
      regla({ id: 'ca', condicion: { direccion: 'recibido', letra: ['A'] } }),
      regla({ id: 'cc', condicion: { direccion: 'recibido', letra: ['C'] } }),
    ];
    const id = (d: 'emitido' | 'recibido', l: string) =>
      seleccionarRegla(reglas, comp({ direccion: d, letra: l }))?.id ?? null;
    expect(id('emitido', 'A')).toBe('va');
    expect(id('emitido', 'B')).toBe('vb');
    expect(id('recibido', 'A')).toBe('ca');
    expect(id('recibido', 'C')).toBe('cc');
    expect(id('recibido', 'B')).toBeNull();
  });

  it('una default con dirección es fallback sólo de esa dirección', () => {
    const r = regla({
      id: 'd',
      tipo: 'default',
      condicion: { direccion: 'recibido' },
    });
    expect(reglaMatchea(r, comp({ direccion: 'recibido' }))).toBe(true);
    expect(reglaMatchea(r, comp({ direccion: 'emitido' }))).toBe(false);
  });

  it('una default vieja sin condición sigue aplicando a todo', () => {
    const r = regla({ id: 'd', tipo: 'default', condicion: null });
    expect(reglaMatchea(r, comp({ direccion: 'recibido' }))).toBe(true);
    expect(reglaMatchea(r, comp({ direccion: 'emitido' }))).toBe(true);
  });
});

describe('reglaCubre / detectarReglasTapadas', () => {
  it('dos reglas con la misma condición: la segunda queda tapada', () => {
    const tapadas = detectarReglasTapadas([
      {
        id: 'compra',
        nombre: 'FACTURAS DE COMPRA',
        tipo: 'condicional',
        condicion: { letra: ['A', 'B', 'M'] },
        activa: true,
      },
      {
        id: 'venta',
        nombre: 'FACTURAS DE VENTA A Y B',
        tipo: 'condicional',
        condicion: { letra: ['A', 'B', 'M'] },
        activa: true,
      },
    ]);
    expect(tapadas.get('venta')?.nombre).toBe('FACTURAS DE COMPRA');
    expect(tapadas.has('compra')).toBe(false);
  });

  it('con direcciones distintas no se tapan', () => {
    expect(
      reglaCubre(
        { tipo: 'condicional', condicion: { direccion: 'recibido' } },
        { tipo: 'condicional', condicion: { direccion: 'emitido' } }
      )
    ).toBe(false);
  });

  it('una regla más amplia antes tapa a una más específica', () => {
    expect(
      reglaCubre(
        { tipo: 'condicional', condicion: { direccion: 'emitido' } },
        {
          tipo: 'condicional',
          condicion: { direccion: 'emitido', letra: ['A'] },
        }
      )
    ).toBe(true);
    expect(
      reglaCubre(
        {
          tipo: 'condicional',
          condicion: { direccion: 'emitido', letra: ['A'] },
        },
        { tipo: 'condicional', condicion: { direccion: 'emitido' } }
      )
    ).toBe(false);
  });

  it('una default antes tapa a las condicionales de su dirección', () => {
    expect(
      reglaCubre(
        { tipo: 'default', condicion: { direccion: 'recibido' } },
        {
          tipo: 'condicional',
          condicion: { direccion: 'recibido', letra: ['C'] },
        }
      )
    ).toBe(true);
  });

  it('ignora las inactivas', () => {
    const tapadas = detectarReglasTapadas([
      {
        id: 'a',
        nombre: 'a',
        tipo: 'condicional',
        condicion: null,
        activa: false,
      },
      {
        id: 'b',
        nombre: 'b',
        tipo: 'condicional',
        condicion: { direccion: 'emitido' },
        activa: true,
      },
    ]);
    expect(tapadas.size).toBe(0);
  });
});

describe('analizarCuadreRegla', () => {
  it('venta clásica cuadra', () => {
    expect(
      analizarCuadreRegla([
        { lado: 'debe', base: 'total' },
        { lado: 'haber', base: 'neto' },
        { lado: 'haber', base: 'iva' },
        { lado: 'haber', base: 'otros_tributos' },
      ]).estado
    ).toBe('ok');
  });

  it('sin línea de otros tributos avisa, pero no es un descuadre', () => {
    expect(
      analizarCuadreRegla([
        { lado: 'debe', base: 'total' },
        { lado: 'haber', base: 'neto' },
        { lado: 'haber', base: 'iva' },
      ]).estado
    ).toBe('sin_otros_tributos');
  });

  // La regla de compra reportada: "Otros egresos" con base total en el Debe.
  it('detecta el total contado dos veces', () => {
    const r = analizarCuadreRegla([
      { lado: 'debe', base: 'neto' },
      { lado: 'debe', base: 'iva' },
      { lado: 'haber', base: 'total' },
      { lado: 'debe', base: 'total' },
    ]);
    expect(r.estado).toBe('descuadra');
    expect(r.mensaje).toContain('Debe');
  });

  it('con importe fijo no opina', () => {
    expect(
      analizarCuadreRegla([
        { lado: 'debe', base: 'fijo' },
        { lado: 'haber', base: 'total' },
      ]).estado
    ).toBe('indeterminado');
  });
});

describe('direccionSugeridaPorNombre', () => {
  it.each([
    ['FACTURAS DE COMPRA', 'recibido'],
    ['Compras C - gastos', 'recibido'],
    ['FACTURAS DE VENTA A Y B', 'emitido'],
    ['Ventas', 'emitido'],
    ['Comprobantes', null],
    ['Compras y ventas', null],
  ])('%s → %s', (nombre, esperado) => {
    expect(direccionSugeridaPorNombre(nombre)).toBe(esperado);
  });
});

describe('describirAlcanceRegla', () => {
  it('resume dirección y letras', () => {
    expect(
      describirAlcanceRegla('condicional', {
        direccion: 'recibido',
        letra: ['A', 'M'],
      })
    ).toBe('Compras · letra A, M');
    expect(describirAlcanceRegla('condicional', { letra: ['A'] })).toBe(
      'Ventas y compras · letra A'
    );
  });
});
