/**
 * Reglas de banco que el sistema propone, para no arrancar con la pantalla
 * vacía.
 *
 * Son **sugerencias**, no una verdad: cada estudio imputa distinto y algunas
 * decisiones (a qué cuenta va una percepción, cómo se reparte el impuesto al
 * cheque) las tiene que tomar el contador. Por eso no se siembran solas al
 * activar el módulo, como sí pasa con el plan de cuentas: se muestran, se
 * elige cuáles sirven, y recién ahí se crean. Después se editan como
 * cualquier otra.
 *
 * Salen de lo que el estudio dijo en la reunión del 23/09: comisiones a
 * gastos bancarios, sueldos y cargas sociales contra sus cuentas a pagar, el
 * impuesto al cheque a la suya, el cobro de un cliente contra Deudores y el
 * pago a un proveedor contra Proveedores.
 *
 * La contrapartida siempre es el banco, así que ninguna nombra una cuenta
 * bancaria: usan "la cuenta del banco del movimiento" y sirven para todas las
 * cuentas del cliente.
 */
import type { CategoriaMovimiento } from './clasificar-movimiento';

export interface ReglaBancoSugerida {
  /** Identificador estable, para saber cuáles ya se crearon. */
  clave: string;
  nombre: string;
  categorias: CategoriaMovimiento[];
  /** Sin esto, la regla toma lo que entra y lo que sale. */
  direccion?: 'ingreso' | 'egreso';
  /** Código del plan base: la cuenta del concepto. */
  codigoCuenta: string;
  /** De qué lado va el concepto; el banco va del otro. */
  lado: 'debe' | 'haber';
  /** Por qué se propone, en una línea. Se muestra junto a la regla. */
  porque: string;
}

export const REGLAS_BANCO_SUGERIDAS: ReglaBancoSugerida[] = [
  {
    clave: 'comisiones',
    nombre: 'Comisiones bancarias',
    categorias: ['comisiones'],
    direccion: 'egreso',
    codigoCuenta: '5.4.002',
    lado: 'debe',
    porque: 'Lo que cobra el banco por mantener la cuenta es un gasto.',
  },
  {
    clave: 'impuesto_cheque',
    nombre: 'Impuesto al cheque (ley 25.413)',
    categorias: ['impuestos_idc'],
    direccion: 'egreso',
    codigoCuenta: '5.4.002',
    lado: 'debe',
    porque:
      'Va todo a gasto. Si lo computan a cuenta de Ganancias, después se parte con la base «porcentaje»: 67% acá y 33% a la cuenta de pago a cuenta.',
  },
  {
    clave: 'retenciones_percepciones',
    nombre: 'Retenciones y percepciones sufridas',
    categorias: [
      'retencion_iibb',
      'percepcion_iibb',
      'percepcion_iva',
      'retencion_iva',
      'retencion_ganancias',
    ],
    direccion: 'egreso',
    codigoCuenta: '1.1.04.003',
    lado: 'debe',
    porque:
      'Lo que el banco descuenta queda como saldo a favor, no como gasto. Si prefieren una cuenta por impuesto, se crean y se hace una regla para cada una.',
  },
  {
    clave: 'pago_impuestos',
    nombre: 'Pago de impuestos',
    categorias: ['pago_impuestos', 'impuestos_otros'],
    direccion: 'egreso',
    codigoCuenta: '2.1.04.002',
    lado: 'debe',
    porque:
      'Pagar un impuesto cancela una deuda. Si el extracto no dice cuál es, conviene una cuenta puente y desarmarla después.',
  },
  {
    clave: 'sueldos',
    nombre: 'Pago de sueldos',
    categorias: ['sueldos'],
    direccion: 'egreso',
    codigoCuenta: '2.1.03.001',
    lado: 'debe',
    porque:
      'El sueldo ya se devengó desde el módulo de Sueldos: lo que sale del banco cancela esa deuda.',
  },
  {
    clave: 'cargas_sociales',
    nombre: 'Pago de cargas sociales',
    categorias: ['cargas_sociales'],
    direccion: 'egreso',
    codigoCuenta: '2.1.03.002',
    lado: 'debe',
    porque: 'Igual que los sueldos, contra su propia cuenta a pagar.',
  },
  {
    clave: 'cobros',
    nombre: 'Cobros de clientes',
    categorias: ['transferencias', 'cheques', 'cobros_tarjeta'],
    direccion: 'ingreso',
    codigoCuenta: '1.1.03.001',
    lado: 'haber',
    porque:
      'La venta ya se asentó con la factura: lo que entra cancela lo que el cliente debía. Ojo: acá pueden colarse préstamos o aportes, que no son cobros.',
  },
  {
    clave: 'pagos_proveedores',
    nombre: 'Pagos a proveedores',
    categorias: ['transferencias', 'cheques'],
    direccion: 'egreso',
    codigoCuenta: '2.1.01.001',
    lado: 'debe',
    porque:
      'La compra ya se asentó con la factura recibida: lo que sale cancela esa deuda.',
  },
  {
    clave: 'efectivo',
    nombre: 'Retiros de efectivo',
    categorias: ['efectivo'],
    direccion: 'egreso',
    codigoCuenta: '1.1.01.001',
    lado: 'debe',
    porque: 'La plata no se gastó: pasó del banco a la caja.',
  },
  {
    clave: 'intereses',
    nombre: 'Intereses ganados',
    categorias: ['intereses'],
    direccion: 'ingreso',
    codigoCuenta: '4.2.001',
    lado: 'haber',
    porque: 'Lo que rinde la cuenta es un resultado, no una cobranza.',
  },
];
