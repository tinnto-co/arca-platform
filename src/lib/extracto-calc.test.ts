import { describe, expect, it } from 'vitest';
import {
  cuadreExtracto,
  idExternoDeMovimiento,
  monedaIso,
  semaforoBancoVsFacturacion,
  type MovimientoExtraido,
} from './extracto-calc';

const mov = (
  direccion: 'ingreso' | 'egreso',
  importe: number,
  descripcion = 'X',
  fecha = '2026-01-15'
): MovimientoExtraido => ({ fecha, descripcion, importe, direccion });

describe('cuadreExtracto', () => {
  it('cuadra cuando inicial + ingresos − egresos = final', () => {
    const c = cuadreExtracto(100_000, 120_000, [
      mov('ingreso', 50_000),
      mov('egreso', 30_000),
    ]);
    expect(c.totalIngresos).toBe(50_000);
    expect(c.totalEgresos).toBe(30_000);
    expect(c.saldoCalculado).toBe(120_000);
    expect(c.cuadra).toBe(true);
  });

  it('detecta el descuadre y dice cuánto falta', () => {
    // Falta un ingreso de 10.000 que la lectura perdió.
    const c = cuadreExtracto(100_000, 120_000, [
      mov('ingreso', 40_000),
      mov('egreso', 30_000),
    ]);
    expect(c.cuadra).toBe(false);
    expect(c.diferencia).toBe(10_000);
  });

  it('tolera redondeos de centavos', () => {
    const c = cuadreExtracto(0, 99.99, [mov('ingreso', 100)]);
    expect(c.cuadra).toBe(true);
  });
});

describe('monedaIso', () => {
  it('traduce cómo el banco muestra la moneda al código de la columna', () => {
    // BBVA titula las cuentas "CC $": el signo no es un código ISO.
    expect(monedaIso('$')).toBe('ARS');
    expect(monedaIso('U$S')).toBe('USD');
    expect(monedaIso('usd')).toBe('USD');
    expect(monedaIso('ARS')).toBe('ARS');
    expect(monedaIso('')).toBe('ARS');
  });
});

describe('semaforoBancoVsFacturacion', () => {
  it('brecha chica queda verde', () => {
    const s = semaforoBancoVsFacturacion(10_500_000, 10_000_000);
    expect(s.nivel).toBe('ok');
    expect(s.porcentaje).toBe(5);
  });

  it('el caso del ticket ($800M entraron, $10M facturados) es alerta', () => {
    const s = semaforoBancoVsFacturacion(800_000_000, 10_000_000);
    expect(s.nivel).toBe('alerta');
    expect(s.diferencia).toBe(790_000_000);
  });

  it('un solo umbral superado queda en atención, no alerta', () => {
    // 25% de brecha pero apenas $10.000: porcentaje alto, monto chico.
    expect(semaforoBancoVsFacturacion(50_000, 40_000).nivel).toBe('atencion');
    // $2M de brecha sobre $200M: monto alto, 1% de porcentaje.
    expect(semaforoBancoVsFacturacion(202_000_000, 200_000_000).nivel).toBe(
      'atencion'
    );
  });

  it('sin facturación pero con ingresos grandes, alerta igual', () => {
    expect(semaforoBancoVsFacturacion(5_000_000, 0).nivel).toBe('alerta');
  });
});

describe('idExternoDeMovimiento', () => {
  it('es estable y distingue movimientos idénticos por ocurrencia', () => {
    const m = mov('ingreso', 1500.5, 'TRANSF  RECIB   cbu 123');
    expect(idExternoDeMovimiento(m, 0)).toBe(idExternoDeMovimiento(m, 0));
    expect(idExternoDeMovimiento(m, 0)).not.toBe(idExternoDeMovimiento(m, 1));
    // Normaliza espacios y mayúsculas: el mismo movimiento releído da igual.
    const m2 = mov('ingreso', 1500.5, 'transf recib CBU 123');
    expect(idExternoDeMovimiento(m, 0)).toBe(idExternoDeMovimiento(m2, 0));
  });
});
