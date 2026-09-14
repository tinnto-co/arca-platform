import { describe, expect, it } from 'vitest';
import {
  alicuotaValida,
  calcularDespacho,
  nombreCompraDespacho,
  numeroComprobanteSintetico,
} from './despacho-calc';

describe('calcularDespacho', () => {
  it('deriva iva en pesos, neto y total (21%)', () => {
    // IVA USD 210 a TC 1000 → IVA $210.000; neto = 210.000/0,21 = 1.000.000
    const r = calcularDespacho({ alicuota: 21, ivaUsd: 210, tipoCambio: 1000 });
    expect(r.ivaPesos).toBe(210_000);
    expect(r.netoGravado).toBe(1_000_000);
    expect(r.total).toBe(1_210_000);
  });

  it('deriva con 10,5% y decimales de TC reales', () => {
    const r = calcularDespacho({
      alicuota: 10.5,
      ivaUsd: 52.5,
      tipoCambio: 1043.75,
    });
    expect(r.ivaPesos).toBe(54_796.88); // 52,5 × 1043,75 redondeado a 2
    expect(r.netoGravado).toBe(521_875.05);
    expect(r.total).toBe(576_671.93);
  });

  it('el neto por alícuota siempre hace cerrar el IVA', () => {
    const r = calcularDespacho({
      alicuota: 21,
      ivaUsd: 33.33,
      tipoCambio: 987.65,
    });
    expect(Math.abs(r.netoGravado * 0.21 - r.ivaPesos)).toBeLessThan(0.05);
    expect(r.total).toBe(r.netoGravado + r.ivaPesos);
  });
});

describe('alicuotaValida', () => {
  it('acepta 21 y 10,5; rechaza el resto', () => {
    expect(alicuotaValida(21)).toBe(true);
    expect(alicuotaValida(10.5)).toBe(true);
    expect(alicuotaValida(27)).toBe(false);
    expect(alicuotaValida(0)).toBe(false);
  });
});

describe('nombreCompraDespacho', () => {
  it('usa la convención del estudio por tipo', () => {
    expect(
      nombreCompraDespacho('importacion_directa', '24001IC04123456A')
    ).toBe('Factura de despacho de importación N° 24001IC04123456A');
    expect(nombreCompraDespacho('destinacion_simplificada', 'MANI-5405')).toBe(
      'Compra Importaciones - N° MANI-5405'
    );
  });
});

describe('numeroComprobanteSintetico', () => {
  it('es estable y distinto por número', () => {
    const a = numeroComprobanteSintetico('24 001 IC04 123456 A');
    expect(a).toBe(numeroComprobanteSintetico('24001ic04123456a')); // normaliza
    expect(a).not.toBe(numeroComprobanteSintetico('24001IC04123457A'));
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
  });
});
