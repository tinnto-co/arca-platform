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
 */

export const CATEGORIAS_MOVIMIENTO = [
  'transferencias',
  'cobros_tarjeta',
  'impuestos',
  'comisiones',
  'sueldos',
  'debitos_automaticos',
  'cheques',
  'efectivo',
  'intereses',
  'varios',
] as const;

export type CategoriaMovimiento = (typeof CATEGORIAS_MOVIMIENTO)[number];

export const CATEGORIA_MOVIMIENTO_LABEL: Record<CategoriaMovimiento, string> = {
  transferencias: 'Transferencias',
  cobros_tarjeta: 'Cobros con tarjeta',
  impuestos: 'Impuestos',
  comisiones: 'Comisiones bancarias',
  sueldos: 'Sueldos',
  debitos_automaticos: 'Débitos automáticos',
  cheques: 'Cheques',
  efectivo: 'Efectivo',
  intereses: 'Intereses',
  varios: 'Varios',
};

/**
 * El ORDEN importa: gana la primera categoría cuyo patrón matchee. Lo más
 * específico va antes (un «IMPUESTO DEBITO S/TRANSFERENCIA» es impuesto,
 * no transferencia).
 */
const REGLAS: [CategoriaMovimiento, RegExp][] = [
  [
    'impuestos',
    /sircreb|iibb|ing\.?\s*brutos|ingresos brutos|imp\.?\s*(deb|cred|debitos|creditos|ley)|impuesto|afip|arca|iva\b|percepci[oó]n|retenci[oó]n|sicore|ganancias|ley\s*25\.?413/i,
  ],
  [
    'comisiones',
    /comisi[oó]n|com\.\s|mantenimiento|cargo\s|gastos?\s+(de\s+)?(mantenim|servicio|admin)|costo\s+paquete|seguro\s+de\s+vida/i,
  ],
  [
    'cobros_tarjeta',
    /prisma|first\s*data|fiserv|payway|posnet|lapos|mercado\s*pago.*(liquidaci|cobro)|liquidaci[oó]n\s+(tarj|visa|master|cabal|naranja)|visa|mastercard|amex|cabal|naranja\s*x?/i,
  ],
  [
    'sueldos',
    /haberes|sueldo|acreditaci[oó]n\s+de\s+haberes|pago\s+de\s+haberes|plan\s+sueldo/i,
  ],
  ['cheques', /cheque|ch\.\s*\d|valores?\s+al\s+cobro|clearing|echeq/i],
  [
    'efectivo',
    /extracci[oó]n|dep[oó]sito\s+(en\s+)?efectivo|cajero|atm|extracautom|dep\.?\s*efvo/i,
  ],
  [
    'intereses',
    /inter[eé]s|rendimiento|plazo\s+fijo|fima|fondo\s+com[uú]n|money\s*market/i,
  ],
  [
    'debitos_automaticos',
    /d[eé]bito\s+autom|debito\s+directo|dda\b|pago\s+(de\s+)?servicio|edenor|edesur|metrogas|aysa|telecom|personal|claro|movistar|osde|swiss\s*medical|galeno/i,
  ],
  [
    'transferencias',
    /transferencia|transf|trf\b|cr[eé]dito\s+inmediato|debin\b|cbu|cvu|env[ií]o\s+de\s+dinero|te\s+transfirieron/i,
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
