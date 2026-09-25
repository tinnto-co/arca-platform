import { describe, expect, it } from 'vitest';
import {
  alicuotaValida,
  calcularDespacho,
  inferirLineas,
  nombreCompraDespacho,
  numeroComprobanteSintetico,
} from './despacho-calc';

describe('calcularDespacho', () => {
  it('deriva iva en pesos, neto y total (21%)', () => {
    // IVA USD 210 a TC 1000 → IVA $210.000; neto = 210.000/0,21 = 1.000.000
    const r = calcularDespacho({
      lineas: [{ alicuota: 21, ivaUsd: 210 }],
      tipoCambio: 1000,
    });
    expect(r.ivaPesos).toBe(210_000);
    expect(r.netoGravado).toBe(1_000_000);
    expect(r.total).toBe(1_210_000);
  });

  it('deriva con 10,5% y decimales de TC reales', () => {
    const r = calcularDespacho({
      lineas: [{ alicuota: 10.5, ivaUsd: 52.5 }],
      tipoCambio: 1043.75,
    });
    expect(r.ivaPesos).toBe(54_796.88); // 52,5 × 1043,75 redondeado a 2
    expect(r.netoGravado).toBe(521_875.05);
    expect(r.total).toBe(576_671.93);
  });

  it('el neto por alícuota siempre hace cerrar el IVA', () => {
    const r = calcularDespacho({
      lineas: [{ alicuota: 21, ivaUsd: 33.33 }],
      tipoCambio: 987.65,
    });
    expect(Math.abs(r.netoGravado * 0.21 - r.ivaPesos)).toBeLessThan(0.05);
    expect(r.total).toBe(r.netoGravado + r.ivaPesos);
  });

  it('con dos alícuotas, cada una conserva su propio neto', () => {
    // Lo que el libro de IVA compras necesita discriminado: no alcanza con
    // sumar los dos IVA, porque cada alícuota tiene su base.
    const r = calcularDespacho({
      lineas: [
        { alicuota: 21, ivaUsd: 210 },
        { alicuota: 10.5, ivaUsd: 105 },
      ],
      tipoCambio: 1000,
    });
    expect(r.lineas).toHaveLength(2);
    expect(r.lineas[0]).toMatchObject({
      alicuota: 21,
      ivaPesos: 210_000,
      netoGravado: 1_000_000,
    });
    expect(r.lineas[1]).toMatchObject({
      alicuota: 10.5,
      ivaPesos: 105_000,
      netoGravado: 1_000_000,
    });
    expect(r.ivaPesos).toBe(315_000);
    expect(r.netoGravado).toBe(2_000_000);
    expect(r.total).toBe(2_315_000);
  });

  it('dos conceptos 415 de la misma alícuota se suman, no se pisan', () => {
    // El caso de una Importación Directa: un concepto 415 por ítem. Antes se
    // guardaba uno solo y el resto desaparecía sin aviso.
    const r = calcularDespacho({
      lineas: [
        { alicuota: 21, ivaUsd: 4536.58 },
        { alicuota: 21, ivaUsd: 885.27 },
        { alicuota: 21, ivaUsd: 230.47 },
      ],
      tipoCambio: 1000,
    });
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].ivaUsd).toBe(5652.32);
    expect(r.ivaPesos).toBe(5_652_320);
  });

  it('una línea sin alícuota no aporta nada, en vez de romper el total', () => {
    const r = calcularDespacho({
      lineas: [
        { alicuota: 21, ivaUsd: 100 },
        { alicuota: 0, ivaUsd: 50 },
      ],
      tipoCambio: 1000,
    });
    expect(r.lineas).toHaveLength(1);
    expect(r.ivaPesos).toBe(100_000);
  });
});

describe('inferirLineas', () => {
  it('deduce 10,5% de un despacho que no lo dice (caso ARGPOST)', () => {
    // Destinación Simplificada real: base imponible 2.734,11 e IVA 287,08.
    const r = inferirLineas(287.08, 2734.11);
    expect(r).not.toBeNull();
    expect(r!.mezcla).toBe(false);
    expect(r!.lineas).toEqual([{ alicuota: 10.5, ivaUsd: 287.08 }]);
  });

  it('deduce 21% igual de bien', () => {
    const r = inferirLineas(210, 1000);
    expect(r!.mezcla).toBe(false);
    expect(r!.lineas[0].alicuota).toBe(21);
  });

  it('despeja la mezcla cuando el cociente cae en el medio (caso MELTRO)', () => {
    // Courier con 6 envíos consolidados: la liquidación de Aduana lista un
    // solo "415 I.V.A. 1.888,67" y ningún porcentaje. Sobre una base de
    // 12.085,58 el cociente da 15,63%: no es ninguna de las dos, hay de las
    // dos. El despeje tiene que reconstruir el IVA exacto del documento.
    const r = inferirLineas(1888.67, 12_085.58);
    expect(r).not.toBeNull();
    expect(r!.mezcla).toBe(true);
    expect(r!.lineas.map((l) => l.alicuota)).toEqual([21, 10.5]);
    const suma = r!.lineas.reduce((s, l) => s + l.ivaUsd, 0);
    expect(Math.abs(suma - 1888.67)).toBeLessThan(0.02);
  });

  it('no inventa nada fuera del rango posible', () => {
    // Un 27% no sale de mezclar 21 y 10,5: pedir el dato es lo correcto.
    expect(inferirLineas(270, 1000)).toBeNull();
    // Por debajo del 10,5% tampoco.
    expect(inferirLineas(50, 1000)).toBeNull();
    expect(inferirLineas(0, 1000)).toBeNull();
    expect(inferirLineas(100, 0)).toBeNull();
  });

  it('lo inferido, pasado por el cálculo, reconstruye el IVA del documento', () => {
    const r = inferirLineas(1888.67, 12_085.58)!;
    const calc = calcularDespacho({ lineas: r.lineas, tipoCambio: 1514 });
    // El TC real del despacho MELTRO: 1.514,0000.
    expect(Math.abs(calc.ivaPesos - 1888.67 * 1514)).toBeLessThan(35);
    // Y cada neto cierra contra su propia alícuota.
    for (const l of calc.lineas)
      expect(
        Math.abs(l.netoGravado * (l.alicuota / 100) - l.ivaPesos)
      ).toBeLessThan(0.05);
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
