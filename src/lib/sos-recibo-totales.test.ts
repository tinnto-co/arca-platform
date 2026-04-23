import { describe, expect, it } from 'vitest';
import {
  montoLiquidadoDesdeEditsSos,
  totalesReciboSosDesdeMontos,
} from './sos-recibo-totales';

describe('totalesReciboSosDesdeMontos', () => {
  it('clasifica 500-599 dentro de retenciones', () => {
    const totals = totalesReciboSosDesdeMontos({
      '1': 100000,
      '101': 10000,
      '201': 11000,
      '411': 5000,
      '511': 3000,
      '553': 4500,
    });

    expect(totals.haberes).toBe(100000);
    expect(totals.descuentos).toBe(10000);
    expect(totals.retenciones).toBe(18500);
    expect(totals.noRemunerativo).toBe(5000);
    expect(totals.neto).toBe(76500);
  });
});

describe('montoLiquidadoDesdeEditsSos', () => {
  it('aplica fórmula con piso y techo', () => {
    const monto = montoLiquidadoDesdeEditsSos({
      monto: '',
      cantidad: '2',
      porcentaje: '150',
      importeConceptoNumero: '',
      importe: '100',
      importeMinimo: '50',
      importeMaximo: '250',
    });
    expect(monto).toBe(250);
  });
});
