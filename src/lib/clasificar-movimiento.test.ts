import { describe, expect, it } from 'vitest';
import { clasificarMovimiento, requiereFactura } from './clasificar-movimiento';

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
    ).toBe('impuestos_idc');
    expect(clasificarMovimiento('SIRCREB ING BRUTOS')).toBe('retencion_iibb');
    expect(clasificarMovimiento('PERCEPCION IVA RG 2408')).toBe(
      'percepcion_iva'
    );
  });

  // Cada impuesto va a su propia cuenta contable, así que el bolsón
  // "impuestos" no servía. Todos estos salieron de extractos reales.
  it('separa el impuesto al cheque del resto', () => {
    for (const d of [
      'IMP. DEB. LEY 25413 GRAL.',
      'IMPUESTO LEY 25.413 DEBITO 0,6%',
      'IMP. CRE. LEY 25413',
      'LEY NRO 25.413 SOBRE CREDIT',
      'IMP S/DEBITOS EN CTA CTE',
      'IM LEY 25413 0.6% EX EF AL GEN REG',
      'IMP.LEY 25413 07/01/26 00004',
    ]) {
      expect(clasificarMovimiento(d), d).toBe('impuestos_idc');
    }
  });

  // El estudio las pidió abiertas una por una: lo que te retienen o perciben
  // es saldo a favor, el impuesto que el banco cobra es gasto.
  it('abre ingresos brutos, IVA, ganancias y el resto', () => {
    expect(clasificarMovimiento('ING. BRUTOS S/ CRED REG.RECAU.SIRCREB')).toBe(
      'retencion_iibb'
    );
    expect(clasificarMovimiento('REG REC SIRCREB F:30/12/25')).toBe(
      'retencion_iibb'
    );
    expect(
      clasificarMovimiento('ADELANTO IIBB TUC LETRA H RESP:30718161394')
    ).toBe('impuestos_iibb');
    expect(clasificarMovimiento('PERCEPCION INGRESOS BRUTOS CABA')).toBe(
      'percepcion_iibb'
    );
    // El IVA que el banco cobra sobre sus comisiones no es una percepción.
    expect(clasificarMovimiento('IVA TASA GENERAL')).toBe('impuestos_iva');
    expect(clasificarMovimiento('IVA 21% REG DE TRANSFISC LEY27743')).toBe(
      'impuestos_iva'
    );
    expect(clasificarMovimiento('IVA PERCEPCION RG 2408')).toBe(
      'percepcion_iva'
    );
    expect(clasificarMovimiento('RETENCION IVA RG 2854')).toBe('retencion_iva');
    expect(clasificarMovimiento('RETENCION GANANCIAS SICORE')).toBe(
      'retencion_ganancias'
    );
  });

  // Pagar el impuesto cancela una deuda; que te lo retengan deja saldo a
  // favor. Van a cuentas distintas, asi que no comparten categoria.
  it('el pago del impuesto no es lo mismo que la retencion', () => {
    expect(clasificarMovimiento('PAGO DE SERVICIO ARCA')).toBe(
      'pago_impuestos'
    );
    expect(
      clasificarMovimiento('PAGO DE SERVICIOS IMP.AFIP: 30707920056924')
    ).toBe('pago_impuestos');
    expect(clasificarMovimiento('PAGO VEP 1234')).toBe('pago_impuestos');
    // Un VEP de IIBB es un pago, no una percepcion de ingresos brutos.
    expect(clasificarMovimiento('PAGO VEP IIBB CABA')).toBe('pago_impuestos');
    // Lo que el banco descuenta solo sigue en su impuesto.
    expect(clasificarMovimiento('REG REC SIRCREB F:30/12/25')).toBe(
      'retencion_iibb'
    );
    expect(clasificarMovimiento('PERCEPCION IVA RG 2408')).toBe(
      'percepcion_iva'
    );
  });

  it('las cargas sociales no se cuentan como sueldos', () => {
    expect(clasificarMovimiento('PAGO F931 SEGURIDAD SOCIAL')).toBe(
      'cargas_sociales'
    );
    expect(clasificarMovimiento('APORTE SINDICATO OSECAC')).toBe(
      'cargas_sociales'
    );
    expect(clasificarMovimiento('CUOTA ART PREVENCION')).toBe(
      'cargas_sociales'
    );
    // El neto que cobra el empleado sigue siendo sueldo.
    expect(clasificarMovimiento('DB/CR POR PAGO DE SUELDOS')).toBe('sueldos');
  });

  it('separa las colocaciones de lo que rinden', () => {
    expect(
      clasificarMovimiento('ACREDITACION VENCIMIENTO PLAZO FIJO 809343083344')
    ).toBe('plazo_fijo');
    expect(clasificarMovimiento('SUSCRIPCION CUOTAPARTES FIMA PREMIUM')).toBe(
      'fci'
    );
    // Lo que rinde sí es resultado del período.
    expect(clasificarMovimiento('RENDIMIENTOS')).toBe('intereses');
    expect(clasificarMovimiento('DEBITO LIQUIDACION INTERES')).toBe(
      'intereses'
    );
  });

  it('el traspaso entre cuentas propias no es una transferencia más', () => {
    expect(clasificarMovimiento('TRANSFERENCIA ENTRE CUENTAS PROPIAS')).toBe(
      'transferencias_propias'
    );
    expect(clasificarMovimiento('TRASPASO CUENTAS MISMO TITULAR')).toBe(
      'transferencias_propias'
    );
  });

  it('comisiones, tarjetas, sueldos, cheques, efectivo, intereses, débitos', () => {
    expect(clasificarMovimiento('COM. MANTENIMIENTO CUENTA')).toBe(
      'comisiones'
    );
    expect(clasificarMovimiento('LIQUIDACION VISA PRISMA MEDIOS DE PAGO')).toBe(
      'cobros_tarjeta'
    );
    // Así nombra Mercado Pago la acreditación de cada venta cobrada. La
    // descripción no dice "Mercado Pago": eso está en la cuenta.
    expect(clasificarMovimiento('LIQUIDACIÓN DE DINERO')).toBe(
      'cobros_tarjeta'
    );
    expect(clasificarMovimiento('Liquidacion de dinero')).toBe(
      'cobros_tarjeta'
    );
    // Los rendimientos de la cuenta remunerada siguen siendo resultado.
    expect(clasificarMovimiento('RENDIMIENTOS')).toBe('intereses');
    expect(clasificarMovimiento('ACREDITACION DE HABERES')).toBe('sueldos');
    expect(clasificarMovimiento('DEPOSITO CHEQUE 48HS')).toBe('cheques');
    expect(clasificarMovimiento('EXTRACCION CAJERO ATM RED LINK')).toBe(
      'efectivo'
    );
    expect(clasificarMovimiento('DEBITO LIQUIDACION INTERES')).toBe(
      'intereses'
    );
    expect(clasificarMovimiento('DEBITO AUTOM EDENOR')).toBe(
      'debitos_automaticos'
    );
  });

  it('retiros de efectivo, con la jerga real de los extractos', () => {
    expect(
      clasificarMovimiento('Retiro de efectivo en santander Tarj nro. 3260')
    ).toBe('efectivo');
    expect(
      clasificarMovimiento('Retiro en efvo por caja suc san cristobal')
    ).toBe('efectivo');
  });

  it('"Com …" al principio es una comisión, aunque nombre una extracción', () => {
    expect(
      clasificarMovimiento(
        'Com extraccion bca automatica Total depositos del dia $ 500000,00'
      )
    ).toBe('comisiones');
    expect(clasificarMovimiento('COM MANT MENS FRANCES PROYE 12/25')).toBe(
      'comisiones'
    );
    expect(
      clasificarMovimiento(
        'Comision pago ch y/o retiro efecti Total extracciones'
      )
    ).toBe('comisiones');
    // "Compra" empieza con "Com" pero no es una comisión.
    expect(clasificarMovimiento('Compra con tarjeta de debito')).not.toBe(
      'comisiones'
    );
  });

  it('compras con débito: plata que sale, no una liquidación de tarjeta', () => {
    for (const d of [
      'COMPRA CON TARJETA DE DEBITO MERPAGO*SHELLBOX - TARJ NRO. 3260',
      'COMPRA DEBITO VITAL SUPERMAYORISTA 4517699006778796',
      'COMPRA CON TARJETA DE DEBITO FARMACITY-INDEPENDENCIA - TARJ NRO. 3260',
      // La palabra "visa" no la convierte en un cobro: gana el patrón de
      // compras porque va primero.
      'COMPRA CON TARJETA DE DEBITO VISA ELECTRON',
    ]) {
      expect(clasificarMovimiento(d), d).toBe('compras_debito');
    }
    // Un débito automático sigue siendo un débito automático.
    expect(clasificarMovimiento('DEBITO AUTOM EDENOR')).toBe(
      'debitos_automaticos'
    );
    // Y la liquidación que entra sigue siendo un cobro.
    expect(clasificarMovimiento('LIQUIDACION VISA PRISMA')).toBe(
      'cobros_tarjeta'
    );
  });

  it('lo que no matchea cae en varios, sin romper', () => {
    expect(clasificarMovimiento('PAGO VS 84512')).toBe('varios');
    expect(clasificarMovimiento('')).toBe('varios');
    expect(clasificarMovimiento(null)).toBe('varios');
  });
});

describe('requiereFactura', () => {
  it('lo que nunca va a tener factura no cuenta como pendiente', () => {
    for (const d of [
      'IMPUESTO DEBITOS S/TRANSFERENCIA LEY 25413',
      'COM. MANTENIMIENTO CUENTA',
      'ACREDITACION DE HABERES',
      'DEBITO AUTOM EDENOR',
      'RENDIMIENTOS',
      'IMP. DEB. LEY 25413 GRAL.',
      'PAGO F931 SEGURIDAD SOCIAL',
      'SUSCRIPCION CUOTAPARTES FIMA PREMIUM',
      'TRANSFERENCIA ENTRE CUENTAS PROPIAS',
      'Retiro de efectivo en santander Tarj nro. 3260',
    ]) {
      expect(requiereFactura(clasificarMovimiento(d)), d).toBe(false);
    }
  });

  it('lo que sí puede tener factura detrás sigue contando', () => {
    for (const d of [
      'TRANSFERENCIA 30697293287',
      'DEPOSITO CHEQUE 48HS',
      'Compra con tarjeta de debito Merpago*shellbox',
      'LIQUIDACION VISA PRISMA MEDIOS DE PAGO',
    ]) {
      expect(requiereFactura(clasificarMovimiento(d)), d).toBe(true);
    }
  });
});
