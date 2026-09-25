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
  [
    'comisiones',
    /comisi[oó]n|com\.\s|^\s*com\s|mantenimiento|cargo\s|gastos?\s+(de\s+)?(mantenim|servicio|admin)|costo\s+paquete|seguro\s+de\s+vida/i,
  ],
  // "Liquidación de dinero" es como Mercado Pago nombra la acreditación de
  // cada venta cobrada: el extracto no dice "Mercado Pago" en la descripción
  // porque eso está en la cuenta. Sin esto caen en "Varios" y, en un comercio
  // que cobra solo por ahí, eso es el 100% de los ingresos.
  [
    'cobros_tarjeta',
    /prisma|first\s*data|fiserv|payway|posnet|lapos|mercado\s*pago.*(liquidaci|cobro)|liquidaci[oó]n\s+de\s+dinero|liquidaci[oó]n\s+(tarj|visa|master|cabal|naranja)|visa|mastercard|amex|cabal|naranja\s*x?/i,
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
    /d[eé]bito\s+autom|debito\s+directo|dda\b|pago\s+(de\s+)?servicio|edenor|edesur|metrogas|aysa|telecom|personal|claro|movistar|osde|swiss\s*medical|galeno/i,
  ],
  // Traspaso entre cuentas de la misma empresa: entra y sale la misma plata,
  // así que no se compara contra facturas. Por ahora sale del texto del
  // banco; cuando la contraparte venga con CUIT se puede reconocer sola.
  [
    'transferencias_propias',
    /entre\s+cuentas\s+propias|misma\s+titularidad|mismo\s+titular|traspaso\s+(entre\s+)?cuentas|transferencia\s+interna/i,
  ],
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
