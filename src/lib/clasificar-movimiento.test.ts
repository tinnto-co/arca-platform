import { describe, expect, it } from 'vitest';
import { clasificarMovimiento } from './clasificar-movimiento';

describe('clasificarMovimiento', () => {
  it('reconoce transferencias con la jerga de varios bancos', () => {
    expect(
      clasificarMovimiento('TRANSF RECIB CBU 2850590940090418135201')
    ).toBe('transferencias');
    expect(clasificarMovimiento('Credito inmediato - DEBIN')).toBe(
      'transferencias'
    );
    expect(clasificarMovimiento('Te transfirieron dinero')).toBe(
      'transferencias'
    ); // Mercado Pago
    expect(clasificarMovimiento('TRF CTA 12345')).toBe('transferencias');
  });

  it('los impuestos le ganan a la transferencia (orden de reglas)', () => {
    expect(
      clasificarMovimiento('IMPUESTO DEBITOS S/TRANSFERENCIA LEY 25413')
    ).toBe('impuestos');
    expect(clasificarMovimiento('SIRCREB ING BRUTOS')).toBe('impuestos');
    expect(clasificarMovimiento('PERCEPCION IVA RG 2408')).toBe('impuestos');
  });

  it('comisiones, tarjetas, sueldos, cheques, efectivo, intereses, débitos', () => {
    expect(clasificarMovimiento('COM. MANTENIMIENTO CUENTA')).toBe(
      'comisiones'
    );
    expect(clasificarMovimiento('LIQUIDACION VISA PRISMA MEDIOS DE PAGO')).toBe(
      'cobros_tarjeta'
    );
    expect(clasificarMovimiento('ACREDITACION DE HABERES')).toBe('sueldos');
    expect(clasificarMovimiento('DEPOSITO CHEQUE 48HS')).toBe('cheques');
    expect(clasificarMovimiento('EXTRACCION CAJERO ATM RED LINK')).toBe(
      'efectivo'
    );
    expect(clasificarMovimiento('RENDIMIENTO FIMA PREMIUM')).toBe('intereses');
    expect(clasificarMovimiento('DEBITO AUTOM EDENOR')).toBe(
      'debitos_automaticos'
    );
  });

  it('lo que no matchea cae en varios, sin romper', () => {
    expect(clasificarMovimiento('PAGO VS 84512')).toBe('varios');
    expect(clasificarMovimiento('')).toBe('varios');
    expect(clasificarMovimiento(null)).toBe('varios');
  });
});
