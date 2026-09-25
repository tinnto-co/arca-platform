/**
 * Clasificador de movimientos bancarios por palabras clave (TIN-1634).
 *
 * Lista FIJA de categorías + «varios» para lo que no matchea — decisión de
 * diseño: determinístico y testeable, sin IA ni configuración. Una persona
 * puede pisar la categoría de un movimiento (categoria_fuente = 'manual') y
 * el clasificador no la vuelve a tocar.
 *
 * Cada banco nombra las cosas distinto («TRANSF RECIB», «TRF CTA», «CREDITO
 * INMEDIATO»): las keywords acumulan variantes reales; agregar un banco
 * nuevo es sumar palabras acá, con su test.
 *
 * Los impuestos se abren uno por uno (TIN-1715, fase 2). «Impuestos» era un
 * bolsón de 468 movimientos donde convivían el impuesto al cheque, IIBB e
 * IVA: el estudio no podía ver cuánto se fue en cada cosa, que es justamente
 * lo que después va a cada cuenta contable.
 */

export const CATEGORIAS_MOVIMIENTO = [
  'transferencias',
  'transferencias_propias',
  'cobros_tarjeta',
  'compras_debito',
  'impuestos_idc',
  'retencion_iibb',
  'percepcion_iibb',
  'impuestos_iibb',
  'percepcion_iva',
  'retencion_iva',
  'impuestos_iva',
  'retencion_ganancias',
  'impuestos_ganancias',
  'impuestos_otros',
  'pago_impuestos',
  'impuestos',
  'comisiones',
  'sueldos',
  'cargas_sociales',
  'debitos_automaticos',
  'cheques',
  'efectivo',
  'plazo_fijo',
  'fci',
  'intereses',
  'varios',
] as const;

export type CategoriaMovimiento = (typeof CATEGORIAS_MOVIMIENTO)[number];

/**
 * Lo que nunca va a tener una factura que lo respalde: impuestos, cargas
 * sociales, comisiones del banco, sueldos, débitos automáticos, intereses,
 * retiros de efectivo, colocaciones y traspasos entre cuentas propias.
 *
 * Contarlos como "sin conciliar" infla el número y esconde lo que sí hay que
 * revisar: en Gastrotecno, enero 2026, son 82 de 153 movimientos.
 *
 * Los cheques quedan afuera a propósito: un cheque sí puede ser el pago de una
 * factura. Los débitos automáticos también podrían tenerla (la luz, el
 * teléfono), pero el banco no la trae y el estudio no la busca ahí.
 */
export const CATEGORIAS_SIN_FACTURA: readonly CategoriaMovimiento[] = [
  'impuestos_idc',
  'retencion_iibb',
  'percepcion_iibb',
  'impuestos_iibb',
  'percepcion_iva',
  'retencion_iva',
  'impuestos_iva',
  'retencion_ganancias',
  'impuestos_ganancias',
  'impuestos_otros',
  'pago_impuestos',
  'impuestos',
  'cargas_sociales',
  'comisiones',
  'sueldos',
  'debitos_automaticos',
  'intereses',
  'efectivo',
  'plazo_fijo',
  'fci',
  'transferencias_propias',
];

/** ¿Este movimiento puede llegar a tener una factura detrás? */
export function requiereFactura(categoria: string | null | undefined): boolean {
  return !CATEGORIAS_SIN_FACTURA.includes(categoria as CategoriaMovimiento);
}

/** Las que son un impuesto, para sumarlas juntas cuando hace falta. */
export const CATEGORIAS_IMPUESTO: readonly CategoriaMovimiento[] = [
  'impuestos_idc',
  'retencion_iibb',
  'percepcion_iibb',
  'impuestos_iibb',
  'percepcion_iva',
  'retencion_iva',
  'impuestos_iva',
  'retencion_ganancias',
  'impuestos_ganancias',
  'impuestos_otros',
  'pago_impuestos',
  'impuestos',
];

export const CATEGORIA_MOVIMIENTO_LABEL: Record<CategoriaMovimiento, string> = {
  transferencias: 'Transferencias',
  transferencias_propias: 'Entre cuentas propias',
  cobros_tarjeta: 'Cobros con tarjeta',
  compras_debito: 'Compras con tarjeta de débito',
  impuestos_idc: 'Impuesto al cheque (deb. y créd.)',
  retencion_iibb: 'Retención IIBB (SIRCREB)',
  percepcion_iibb: 'Percepción IIBB',
  impuestos_iibb: 'Ingresos brutos',
  percepcion_iva: 'Percepción IVA',
  retencion_iva: 'Retención IVA',
  impuestos_iva: 'IVA',
  retencion_ganancias: 'Retención Ganancias (SICORE)',
  impuestos_ganancias: 'Ganancias',
  impuestos_otros: 'Otros impuestos',
  pago_impuestos: 'Pago de impuestos',
  // Queda para los movimientos que alguien marcó a mano antes de que los
  // impuestos se abrieran: el clasificador ya no la devuelve.
  impuestos: 'Impuestos (sin detallar)',
  comisiones: 'Comisiones bancarias',
  sueldos: 'Sueldos',
  cargas_sociales: 'Cargas sociales',
  debitos_automaticos: 'Débitos automáticos',
  cheques: 'Cheques',
  efectivo: 'Efectivo',
  plazo_fijo: 'Plazos fijos',
  fci: 'Fondos comunes de inversión',
  intereses: 'Intereses',
  varios: 'Varios',
};

/**
 * El ORDEN importa: gana la primera categoría cuyo patrón matchee. Lo más
 * específico va antes (un «IMPUESTO DEBITO S/TRANSFERENCIA» es impuesto,
 * no transferencia; y es el impuesto al cheque, no "otros impuestos").
 */
const REGLAS: [CategoriaMovimiento, RegExp][] = [
  // Pagar un impuesto y que te lo retengan son cosas opuestas: el pago
  // cancela una deuda, la retención deja un saldo a favor. Como van a cuentas
  // contables distintas, el pago se separa acá y va primero (un "PAGO VEP
  // IIBB" es un pago, no una percepción de ingresos brutos).
  [
    'pago_impuestos',
    /\bveps?\b|pago\s+(de\s+)?(servicios?\s+)?(imp\.?\s*)?(afip|arca)\b|pagos?\s+afip|presentaci[oó]n\s+y\s+pago|pago\s+de\s+servicios?\s+gcba|pago\s+(de\s+)?impuestos?/i,
  ],
  // Impuesto sobre los débitos y créditos (ley 25.413), el "impuesto al
  // cheque": es el más repetido de todos y el estudio lo quiere aparte para
  // ver el acumulado. Va primero porque su texto menciona "débito" y
  // "crédito", que cualquier otra regla se llevaría puesto.
  [
    'impuestos_idc',
    /ley\s*(nro\.?\s*)?25\.?413|imp\.?\s*s\/?\s*(deb|cred)|impuesto\s+s\/?\s*(d[eé]bitos?|cr[eé]ditos?)|imp\.?\s*(deb|cre|debitos?|creditos?)\b|impuesto\s+(al\s+)?(d[eé]bito|cheque)/i,
  ],
  // Lo que te retienen o perciben es un saldo a favor; el impuesto que el
  // banco te cobra es un gasto. El estudio los pidió abiertos uno por uno,
  // así que cada uno va antes que su impuesto "a secas".
  //
  // SIRCREB es el régimen de recaudación sobre acreditaciones bancarias: le
  // dicen retención de ingresos brutos.
  [
    'retencion_iibb',
    /sircreb|r[eé]g(imen)?\.?\s*(de\s*)?recaud|retenci[oó]n[^.]{0,25}(iibb|ing\.?\s*brutos|ingresos\s+brutos)/i,
  ],
  [
    'percepcion_iibb',
    /percepci[oó]n[^.]{0,25}(iibb|ing\.?\s*brutos|ingresos\s+brutos)|(iibb|ingresos\s+brutos)[^.]{0,25}percepci[oó]n/i,
  ],
  [
    'impuestos_iibb',
    /iibb|ing\.?\s*brutos|ingresos\s+brutos|convenio\s+multilateral/i,
  ],
  ['percepcion_iva', /percepci[oó]n[^.]{0,15}iva|iva[^.]{0,15}percepci[oó]n/i],
  ['retencion_iva', /retenci[oó]n[^.]{0,15}iva|iva[^.]{0,15}retenci[oó]n/i],
  ['impuestos_iva', /\biva\b|impuesto\s+al\s+valor\s+agregado/i],
  ['retencion_ganancias', /sicore|retenci[oó]n[^.]{0,25}(ganancias|gcias)/i],
  ['impuestos_ganancias', /ganancias|imp\.?\s*a?\s*las?\s*gcias/i],
  // Cargas sociales antes que sueldos: un F931 es carga social, no el neto
  // que cobra el empleado.
  [
    'cargas_sociales',
    /f\.?\s*931|f931|cargas\s+sociales|seguridad\s+social|(pago|aporte|cuota|dep[oó]sito)[^.]{0,20}obra\s+social|sindicato|uocra|uatre|osecac|\bart\b|aseguradora\s+de\s+riesgos|\bsipa\b|contribuciones\s+patronales/i,
  ],
  // El resto de los impuestos: pagos a ARCA/AFIP por el sistema de pagos del
  // banco, retenciones y percepciones sueltas.
  [
    'impuestos_otros',
    /impuesto|\bafip\b|\barca\b|percepci[oó]n|retenci[oó]n|\brentas\b|\bagip\b|\barba\b|tasa\s+municipal|\babl\b/i,
  ],
  // Traspaso entre cuentas de la misma empresa, antes que la transferencia a
  // secas: "transferencia de cuenta propia" es las dos cosas y gana esta.
  [
    'transferencias_propias',
    /entre\s+cuentas\s+propias|misma\s+titularidad|mismo\s+titular|traspaso\s+(entre\s+)?cuentas|transferencia\s+interna/i,
  ],
  /**
   * Una transferencia que se anuncia como tal gana sobre cualquier marca.
   *
   * Sale de un caso real: "Transf recibida cvu dif titular De micaela
   * giselle fernandez/personal pay/27387074045" se leía como débito
   * automático, porque abajo hay una regla con la palabra "personal" (la
   * telefónica) y el texto trae "personal pay" (la billetera). Con el
   * nombre de una persona y el de una billetera en la misma línea, las
   * coincidencias sobran; que el banco diga "transf recibida" no deja lugar
   * a dudas y tiene que pesar más.
   *
   * Va después de los impuestos a propósito: un "IMPUESTO DEBITOS
   * S/TRANSFERENCIA" es un impuesto, no una transferencia.
   */
  [
    'transferencias',
    /\b(transf|transferencia)\w*\s+(recibida|enviada|recibido|enviado|a\s+terceros)|te\s+transfirieron|env[ií]o\s+de\s+dinero/i,
  ],
  [
    'comisiones',
    /comisi[oó]n|com\.\s|^\s*com\s|mantenimiento|cargo\s|gastos?\s+(de\s+)?(mantenim|servicio|admin)|costo\s+paquete|seguro\s+de\s+vida/i,
  ],
  // Antes que los cobros con tarjeta: "COMPRA CON TARJETA DE DÉBITO VISA" es
  // plata que sale, no una liquidación de la tarjeta, y si no va primero se
  // la lleva el patrón de abajo por la palabra "visa".
  //
  // No se imputa sola a ninguna cuenta y eso es a propósito: acá conviven la
  // nafta de la camioneta con una compra de mercadería de un millón, y lo
  // único que se ve es el nombre del comercio. Separarlas de "Varios" alcanza
  // para que el contador las encuentre juntas y decida.
  [
    'compras_debito',
    /compras?\s+(con\s+)?(tarj(eta)?\.?\s*(de\s+)?)?d[eé]bito/i,
  ],
  // "Liquidación de dinero" es como Mercado Pago nombra la acreditación de
  // cada venta cobrada: el extracto no dice "Mercado Pago" en la descripción
  // porque eso está en la cuenta. Sin esto caen en "Varios" y, en un comercio
  // que cobra solo por ahí, eso es el 100% de los ingresos.
  [
    'cobros_tarjeta',
    // Las marcas, con límites de palabra: "visa" suelta agarraba "revisa" y
    // "divisa", y "cabal" agarraba el apellido Caballero.
    /\b(prisma|fiserv|payway|posnet|lapos)\b|\bfirst\s*data\b|mercado\s*pago.*(liquidaci|cobro)|liquidaci[oó]n\s+de\s+dinero|liquidaci[oó]n\s+(tarj|visa|master|cabal|naranja)|\b(visa|mastercard|amex|cabal|naranja\s*x?)\b/i,
  ],
  [
    'sueldos',
    /haberes|sueldo|acreditaci[oó]n\s+de\s+haberes|pago\s+de\s+haberes|plan\s+sueldo/i,
  ],
  ['cheques', /cheque|ch\.\s*\d|valores?\s+al\s+cobro|clearing|echeq/i],
  [
    'efectivo',
    /extracci[oó]n|retiro|efectivo|efvo|dep[oó]sito\s+(en\s+)?efectivo|cajero|atm|extracautom|dep\.?\s*efvo/i,
  ],
  // Colocaciones: mover plata a un plazo fijo o a un fondo no es un gasto ni
  // una venta, es la misma plata en otro lado. Los intereses que rinden sí
  // son resultado, y quedan en `intereses`.
  [
    'plazo_fijo',
    /plazo\s*fijo|pl\.?\s*fijo|constituci[oó]n\s+de\s+plazo|renovaci[oó]n\s+plazo/i,
  ],
  [
    'fci',
    /fondo\s+com[uú]n|\bfci\b|fima|money\s*market|suscripci[oó]n\s+(de\s+)?cuotapartes|rescate\s+(de\s+)?cuotapartes|cuotapartes/i,
  ],
  ['intereses', /inter[eé]s|intereses|rendimiento/i],
  [
    'debitos_automaticos',
    // Las marcas van con límites de palabra y en su propio grupo: sin eso
    // "personal" agarraba "personal pay" (una billetera, no la telefónica) y
    // "claro" agarraba cualquier frase que tuviera la palabra. Una marca
    // suelta dentro de un texto es una coincidencia, no un servicio.
    /d[eé]bito\s+autom|debito\s+directo|dda\b|pago\s+(de\s+)?servicio|\b(edenor|edesur|metrogas|aysa|telecom|movistar|osde|galeno)\b|\bswiss\s*medical\b|\bpersonal\b(?!\s*pay)|\bclaro\b(?!\s+(que|est))/i,
  ],
  // El resto de lo que mueve plata sin decirse transferencia en la primera
  // línea: un DEBIN, un crédito inmediato, un CBU suelto.
  [
    'transferencias',
    // "Servicio pago a proveedores" es el nombre que le ponen Galicia y
    // Santander a su módulo de pagos masivos: es una transferencia hecha
    // desde otra pantalla del homebanking.
    /transferencia|transf|trf\b|cr[eé]dito\s+inmediato|debin\b|cbu|cvu|env[ií]o\s+de\s+dinero|te\s+transfirieron|(servicio\s+)?pago\s+a\s+proveedores/i,
  ],
];

/** Clasifica por la descripción del extracto. Sin match → 'varios'. */
export function clasificarMovimiento(
  descripcion: string | null | undefined
): CategoriaMovimiento {
  const texto = (descripcion ?? '').trim();
  if (!texto) return 'varios';
  for (const [categoria, patron] of REGLAS) {
    if (patron.test(texto)) return categoria;
  }
  return 'varios';
}
