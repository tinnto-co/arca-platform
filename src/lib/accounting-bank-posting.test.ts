import { describe, expect, it } from 'vitest';
import {
  agruparMovimientos,
  armarLineasBanco,
  reglaMatcheaGrupo,
  type GrupoBancario,
  type MovimientoLike,
} from './accounting-bank-posting';
import type { ReglaLike } from './accounting-reglas';

const BBVA = '11111111-1111-1111-1111-111111111111';
const GALICIA = '22222222-2222-2222-2222-222222222222';
const CTA_BBVA = 'aaaaaaaa-0000-0000-0000-000000000001';
const CTA_GALICIA = 'aaaaaaaa-0000-0000-0000-000000000002';
const GASTOS = 'bbbbbbbb-0000-0000-0000-000000000001';
const PENDIENTE = 'cccccccc-0000-0000-0000-000000000001';

const mov = (p: Partial<MovimientoLike> & { id: string }): MovimientoLike => ({
  cuentaBancariaId: BBVA,
  fecha: '2026-01-15',
  direccion: 'egreso',
  importe: '1000',
  categoria: 'comisiones',
  ...p,
});

/** La regla que el estudio escribiría: una sola para todos los bancos. */
const reglaComisiones: ReglaLike = {
  id: 'regla-comisiones',
  nombre: 'Comisiones bancarias',
  tipo: 'condicional',
  condicion: { categoria: ['comisiones'] },
  prioridad: 1,
  lineas: [
    { cuentaId: GASTOS, lado: 'debe', base: 'total' },
    { cuentaId: null, usaCuentaBanco: true, lado: 'haber', base: 'total' },
  ],
};

describe('agruparMovimientos', () => {
  it('suma por mes, cuenta bancaria y concepto', () => {
    const grupos = agruparMovimientos([
      mov({ id: '1', importe: '100' }),
      mov({ id: '2', importe: '250' }),
      mov({ id: '3', importe: '70', cuentaBancariaId: GALICIA }),
      mov({ id: '4', importe: '900', categoria: 'sueldos' }),
      // Otro mes: no se mezcla, el ajuste por inflación necesita el mes.
      mov({ id: '5', importe: '500', fecha: '2026-02-03' }),
    ]);
    expect(grupos).toHaveLength(4);
    const comisionesEnero = grupos.find(
      (g) =>
        g.periodo === '2026-01' &&
        g.categoria === 'comisiones' &&
        g.cuentaBancariaId === BBVA
    )!;
    expect(comisionesEnero.total).toBe(350);
    expect(comisionesEnero.movimientos).toBe(2);
    expect(comisionesEnero.movimientoIds).toEqual(['1', '2']);
  });

  it('separa lo que entra de lo que sale', () => {
    // Una transferencia que entra es un cobro y una que sale es un pago: no
    // van a la misma cuenta, así que tampoco al mismo asiento.
    const grupos = agruparMovimientos([
      mov({ id: '1', categoria: 'transferencias', direccion: 'ingreso' }),
      mov({ id: '2', categoria: 'transferencias', direccion: 'egreso' }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it('sin categoría, va a varios; el importe se toma en positivo', () => {
    const [g] = agruparMovimientos([
      mov({ id: '1', categoria: null, importe: '-500' }),
    ]);
    expect(g.categoria).toBe('varios');
    expect(g.total).toBe(500);
  });
});

describe('reglaMatcheaGrupo', () => {
  const grupo: GrupoBancario = {
    periodo: '2026-01',
    cuentaBancariaId: BBVA,
    categoria: 'comisiones',
    direccion: 'egreso',
    total: 350,
    movimientos: 2,
    movimientoIds: ['1', '2'],
  };

  it('matchea por categoría, dirección y cuenta bancaria', () => {
    expect(reglaMatcheaGrupo(reglaComisiones, grupo)).toBe(true);
    expect(
      reglaMatcheaGrupo(
        { ...reglaComisiones, condicion: { direccion: 'egreso' } },
        grupo
      )
    ).toBe(true);
    expect(
      reglaMatcheaGrupo(
        { ...reglaComisiones, condicion: { cuenta_bancaria_id: GALICIA } },
        grupo
      )
    ).toBe(false);
  });

  it('una condición que no se entiende no matchea', () => {
    // Preferible caer a "Pendiente de revisión" que imputar a una cuenta
    // equivocada por una clave que el motor no sabe leer.
    expect(
      reglaMatcheaGrupo(
        { ...reglaComisiones, condicion: { letra: 'A' } },
        grupo
      )
    ).toBe(false);
  });

  it('una default aplica siempre', () => {
    expect(
      reglaMatcheaGrupo(
        { ...reglaComisiones, tipo: 'default', condicion: null },
        grupo
      )
    ).toBe(true);
  });
});

describe('armarLineasBanco', () => {
  const grupo = (p: Partial<GrupoBancario> = {}): GrupoBancario => ({
    periodo: '2026-01',
    cuentaBancariaId: BBVA,
    categoria: 'comisiones',
    direccion: 'egreso',
    total: 350,
    movimientos: 2,
    movimientoIds: ['1', '2'],
    ...p,
  });

  it('resuelve "la cuenta del banco" con la de esa cuenta bancaria', () => {
    const bbva = armarLineasBanco(
      grupo(),
      [reglaComisiones],
      PENDIENTE,
      CTA_BBVA
    );
    expect(bbva.lineas).toEqual([
      expect.objectContaining({ cuentaId: GASTOS, debe: 350, haber: 0 }),
      expect.objectContaining({ cuentaId: CTA_BBVA, debe: 0, haber: 350 }),
    ]);
    expect(bbva.usoPendienteRevision).toBe(false);

    // La MISMA regla, en otro banco, va contra la cuenta de ese banco.
    const galicia = armarLineasBanco(
      grupo({ cuentaBancariaId: GALICIA, total: 70 }),
      [reglaComisiones],
      PENDIENTE,
      CTA_GALICIA
    );
    expect(galicia.lineas[1]).toMatchObject({
      cuentaId: CTA_GALICIA,
      haber: 70,
    });
  });

  it('sin cuenta contable en la cuenta bancaria, el grupo va a revisión', () => {
    const r = armarLineasBanco(grupo(), [reglaComisiones], PENDIENTE, null);
    expect(r.usoPendienteRevision).toBe(true);
    expect(r.motivo).toContain('no tiene cuenta contable');
    // Aun así el asiento balancea.
    expect(r.lineas.reduce((s, l) => s + l.debe, 0)).toBe(
      r.lineas.reduce((s, l) => s + l.haber, 0)
    );
  });

  it('sin regla, el grupo va a revisión y el asiento cuadra igual', () => {
    const r = armarLineasBanco(grupo(), [], PENDIENTE, CTA_BBVA);
    expect(r.usoPendienteRevision).toBe(true);
    expect(r.reglaId).toBeNull();
    expect(r.motivo).toContain('Sin regla');
    expect(r.lineas.reduce((s, l) => s + l.debe, 0)).toBe(350);
    expect(r.lineas.reduce((s, l) => s + l.haber, 0)).toBe(350);
  });

  it('una regla que no cuadra manda la diferencia a revisión', () => {
    // El caso del impuesto al cheque partido, mal escrito: el 67% y el 33%
    // tienen que sumar el total.
    const partida: ReglaLike = {
      ...reglaComisiones,
      id: 'regla-parcial',
      nombre: 'Impuesto al cheque',
      lineas: [
        { cuentaId: GASTOS, lado: 'debe', base: 'fijo', importeFijo: 100 },
        { cuentaId: null, usaCuentaBanco: true, lado: 'haber', base: 'total' },
      ],
    };
    const r = armarLineasBanco(grupo(), [partida], PENDIENTE, CTA_BBVA);
    expect(r.usoPendienteRevision).toBe(true);
    expect(r.lineas.at(-1)).toMatchObject({
      cuentaId: PENDIENTE,
      debe: 250,
    });
    expect(r.lineas.reduce((s, l) => s + l.debe, 0)).toBe(350);
  });
});
