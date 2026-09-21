import { describe, expect, it } from 'vitest';
import {
  asignarCruces,
  type FacturaDisponible,
  type MovimientoACruzar,
} from './cruce-conciliacion';

const cobro = (
  id: string,
  fecha: string,
  extra: Partial<MovimientoACruzar> = {}
): MovimientoACruzar => ({
  id,
  fecha,
  importe: 14900,
  direccion: 'ingreso',
  contraparteId: null,
  ...extra,
});

const factura = (
  id: string,
  fechaEmision: string,
  extra: Partial<FacturaDisponible> = {}
): FacturaDisponible => ({
  id,
  fechaEmision,
  total: 14900,
  direccion: 'emitido',
  contraparteId: null,
  ...extra,
});

describe('asignarCruces', () => {
  it('una factura y cinco cobros: se la lleva el del mismo día, no el primero de la lista', () => {
    const cruces = asignarCruces(
      [
        cobro('a', '2026-01-02'),
        cobro('b', '2026-01-04'),
        cobro('c', '2026-01-06'), // mismo día que la factura
        cobro('d', '2026-01-08'),
        cobro('e', '2026-01-09'),
      ],
      [factura('f', '2026-01-06')]
    );
    expect(cruces).toHaveLength(1);
    expect(cruces[0]).toMatchObject({ movimientoId: 'c', comprobanteId: 'f' });
    expect(cruces[0].confianza).toBeCloseTo(0.6);
  });

  it('la misma contraparte gana aunque la fecha esté más lejos', () => {
    const cruces = asignarCruces(
      [
        cobro('mismo-dia', '2026-01-06'),
        cobro('de-mica', '2026-01-09', { contraparteId: 'mica' }),
      ],
      [factura('f', '2026-01-06', { contraparteId: 'mica' })]
    );
    expect(cruces).toEqual([
      expect.objectContaining({ movimientoId: 'de-mica', comprobanteId: 'f' }),
    ]);
    expect(cruces[0].confianza).toBeCloseTo(0.94);
  });

  it('a igual distancia, el cobro posterior a la factura antes que el anterior', () => {
    const cruces = asignarCruces(
      [cobro('antes', '2026-01-05'), cobro('despues', '2026-01-07')],
      [factura('f', '2026-01-06')]
    );
    expect(cruces[0].movimientoId).toBe('despues');
  });

  it('varias facturas del mismo importe: cada una al cobro más cercano, sin repetir', () => {
    const cruces = asignarCruces(
      [
        cobro('a', '2026-01-02'),
        cobro('b', '2026-01-02'),
        cobro('c', '2026-01-06'),
      ],
      [
        factura('f1', '2026-01-02'),
        factura('f2', '2026-01-02'),
        factura('f3', '2026-01-06'),
      ]
    );
    const pares = cruces.map((c) => `${c.movimientoId}-${c.comprobanteId}`);
    expect(pares).toHaveLength(3);
    expect(new Set(cruces.map((c) => c.comprobanteId)).size).toBe(3);
    expect(pares).toContain('c-f3');
  });

  it('el resultado no depende del orden en que llegan los datos', () => {
    const movimientos = [
      cobro('a', '2026-01-02'),
      cobro('b', '2026-01-04'),
      cobro('c', '2026-01-06'),
    ];
    const facturas = [factura('f1', '2026-01-03'), factura('f2', '2026-01-06')];
    const ida = asignarCruces(movimientos, facturas);
    const vuelta = asignarCruces(
      [...movimientos].reverse(),
      [...facturas].reverse()
    );
    const clave = (xs: typeof ida) =>
      xs.map((x) => `${x.movimientoId}-${x.comprobanteId}`).sort();
    expect(clave(vuelta)).toEqual(clave(ida));
  });

  it('respeta lado, importe, ventana de días y lo descartado', () => {
    expect(
      asignarCruces(
        [cobro('a', '2026-01-06')],
        [factura('f', '2026-01-06', { direccion: 'recibido' })]
      )
    ).toEqual([]);
    expect(
      asignarCruces(
        [cobro('a', '2026-01-06')],
        [factura('f', '2026-01-06', { total: 15000 })]
      )
    ).toEqual([]);
    expect(
      asignarCruces([cobro('a', '2026-01-20')], [factura('f', '2026-01-06')])
    ).toEqual([]);
    // Descartado a → f: pasa al siguiente candidato.
    expect(
      asignarCruces(
        [cobro('a', '2026-01-06'), cobro('b', '2026-01-07')],
        [factura('f', '2026-01-06')],
        new Set(['a|f'])
      )
    ).toEqual([expect.objectContaining({ movimientoId: 'b' })]);
  });
});
