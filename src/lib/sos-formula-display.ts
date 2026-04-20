/**
 * Genera una cadena legible que describe cómo se calcula un concepto SOS,
 * derivada exclusivamente de los campos de metadata ya almacenados.
 * No requiere columna extra en la DB.
 *
 * Abreviaturas usadas:
 *   SL        = Sueldo del legajo
 *   VH        = Valor hora (SL / horas mensuales normales)
 *   S1-9      = Subtotal conceptos 1 a 9
 *   S1-19     = Subtotal conceptos 1 a 19
 *   S1-26     = Subtotal conceptos 1 a 26
 *   S1-39     = Subtotal conceptos 1 a 39
 *   S1-199    = Total haberes (conceptos 1 a 199)
 *   S411-469  = Total no remunerativos (conceptos 411 a 469)
 *   cant      = cantidad ingresada en el recibo
 *   pct       = porcentaje ingresado en el recibo
 *   imp       = importe ingresado en el recibo
 *   CN        = importe del concepto referenciado (conceptoNumero)
 */

export interface ConceptoSosMetadata {
  baseColumna?: string | null;
  divCantidad?: number | null;
  divHsNorm?: number | null;
  tieneCantidad?: boolean | null;
  tienePct?: boolean | null;
  tieneImporte?: boolean | null;
  tieneImpConceptoNro?: boolean | null;
  tieneImpMin?: boolean | null;
  tieneImpMax?: boolean | null;
}

const BASE_LABEL: Record<string, string> = {
  sueldo:                   'SL',
  sueldoLegajo:             'SL',
  valHora:                  'VH',
  sub1_9:                   'S1-9',
  sub1_19:                  'S1-19',
  sub1_26:                  'S1-26',
  sub1_39:                  'S1-39',
  sub1_199:                 'S1-199',
  sub411_469:               'S411-469',
  sub1_199_plus_411_469:    '(S1-199 + S411-469)',
};

const SUB_BASES = new Set([
  'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39',
  'sub1_199', 'sub411_469', 'sub1_199_plus_411_469',
]);

export function formulaLegibleSos(c: ConceptoSosMetadata): string {
  const bc       = c.baseColumna ?? 'importe_fijo';
  const divC     = c.divCantidad ?? 1;
  const divH     = c.divHsNorm ?? 1;
  const hasCant  = !!c.tieneCantidad;
  const hasPct   = !!c.tienePct;
  const hasImp   = !!c.tieneImporte;
  const hasCN    = !!c.tieneImpConceptoNro;
  const hasMin   = !!c.tieneImpMin;
  const hasMax   = !!c.tieneImpMax;

  const clamp =
    hasMin && hasMax ? ' [mín/máx]'
    : hasMin         ? ' [mín]'
    : hasMax         ? ' [máx]'
    : '';

  // ── Conceptos con base de subtotal acumulado ──────────────────────────────
  if (SUB_BASES.has(bc)) {
    const base = BASE_LABEL[bc] ?? bc;
    const parts: string[] = [base];
    if (hasPct) parts.push('pct/100');
    // El campo imp actúa como multiplicador (bug triple-campo verificado en SOS).
    // Si el concepto lo tiene, se indica; la nota ⚠ avisa del workaround imp=1.
    if (hasImp) parts.push('imp ⚠');
    if (hasCant) parts.push('cant');
    return parts.join(' × ') + clamp;
  }

  // ── Valor hora ────────────────────────────────────────────────────────────
  if (bc === 'valHora') {
    // VH = SL / hsNorm (el divisor ya está encapsulado en el campo valHora del legajo)
    const parts: string[] = ['VH'];
    if (hasPct) parts.push('pct/100');
    if (hasCant) parts.push('cant');
    return parts.join(' × ') + clamp;
  }

  // ── Sueldo del legajo (con divisores de horas y/o días) ───────────────────
  if (bc === 'sueldo' || bc === 'sueldoLegajo') {
    let base = 'SL';
    if (divH > 1) base += ` / ${divH}`;
    if (divC > 1) base += ` / ${divC}`;
    const parts: string[] = [base];
    if (hasCant) parts.push('cant');
    if (hasPct) parts.push('pct/100');
    return parts.join(' × ') + clamp;
  }

  // ── Sin base automática (importe_fijo / ref_concepto) ────────────────────
  // Prioridad: CN > imp. Si ambos existen se muestran las dos ramas.
  if (hasCN) {
    const withCN: string[] = ['CN'];
    if (hasPct) withCN.push('pct/100');
    if (hasCant) withCN.push('cant');

    if (hasImp) {
      // Dos modos posibles según lo que complete el usuario
      const withImp: string[] = ['imp'];
      if (hasPct) withImp.push('pct/100');
      if (hasCant) withImp.push('cant');
      return `${withCN.join(' × ')}  (o  ${withImp.join(' × ')})` + clamp;
    }
    return withCN.join(' × ') + clamp;
  }

  // Solo imp / cant / pct
  const parts: string[] = [];
  if (hasImp)  parts.push('imp');
  if (hasCant) parts.push('cant');
  if (hasPct)  parts.push('pct/100');
  return parts.length > 0 ? parts.join(' × ') + clamp : '—';
}
