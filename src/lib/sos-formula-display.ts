/**
 * Genera una cadena legible que describe cómo se calcula un concepto SOS,
 * derivada exclusivamente de los campos de metadata ya almacenados.
 * No requiere columna extra en la DB.
 *
 * Usa abreviaturas en la fórmula; el significado filtrado está en
 * `leyendaRelacionadaFormulaSos` (solo lo que aplica a esa fórmula).
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
  sueldo: 'SL',
  sueldoLegajo: 'SL',
  valHora: 'VH',
  sub1_9: 'S1-9',
  sub1_19: 'S1-19',
  sub1_26: 'S1-26',
  sub1_39: 'S1-39',
  sub1_199: 'S1-199',
  sub411_469: 'S411-469',
  sub1_199_plus_411_469: '(S1-199 + S411-469)',
  sub411_414_qty: 'S411-414',
  os_base: 'S-OS',
};

/** Mapeo baseColumna → clave de leyenda para subtotales (no el string de fórmula). */
const SUB_BASE_LEYENDA: Record<string, string> = {
  sub1_9: 'S1-9',
  sub1_19: 'S1-19',
  sub1_26: 'S1-26',
  sub1_39: 'S1-39',
  sub1_199: 'S1-199',
  sub411_469: 'S411-469',
  sub1_199_plus_411_469: 'S1-199 + S411-469',
  os_base: 'S-OS',
};

const SUB_BASES = new Set([
  'sub1_9',
  'sub1_19',
  'sub1_26',
  'sub1_39',
  'sub1_199',
  'sub411_469',
  'sub1_199_plus_411_469',
  'os_base',
]);

/** Leyenda completa (índice por `sigla`). */
export const LEYENDA_FORMULA_SOS: readonly { sigla: string; texto: string }[] =
  [
    {
      sigla: 'SL',
      texto:
        'Sueldo del legajo (básico de escala vigente o valor cargado en el legajo).',
    },
    {
      sigla: 'VH',
      texto:
        'Valor hora: sueldo básico ÷ horas normales mensuales (según configuración del concepto).',
    },
    {
      sigla: 'S1-9',
      texto: 'Subtotal acumulado de conceptos con código de fila 1 a 9.',
    },
    {
      sigla: 'S1-19',
      texto: 'Subtotal acumulado de conceptos con código de fila 1 a 19.',
    },
    {
      sigla: 'S1-26',
      texto: 'Subtotal acumulado de conceptos con código de fila 1 a 26.',
    },
    {
      sigla: 'S1-39',
      texto: 'Subtotal acumulado de conceptos con código de fila 1 a 39.',
    },
    {
      sigla: 'S1-199',
      texto:
        'Total haberes: suma de conceptos remunerativos en el rango 1 a 199.',
    },
    {
      sigla: 'S411-469',
      texto: 'Total no remunerativos: suma de conceptos en el rango 411 a 469.',
    },
    {
      sigla: 'S411-414',
      texto: 'Subtotal no remunerativos: suma de conceptos en el rango 411 a 414 (base para asignación complementaria no remunerativa).',
    },
    {
      sigla: 'S1-199 + S411-469',
      texto:
        'Suma del total haberes (1–199) más el total no remunerativo (411–469).',
    },
    {
      sigla: 'S-OS',
      texto:
        'Base obra social: básico de escala a jornada completa (para empleados part_time/reducida); equivale a S1-199 para jornada completa.',
    },
    {
      sigla: 'pct/100',
      texto: 'Porcentaje ingresado en el recibo, dividido 100.',
    },
    {
      sigla: 'cant',
      texto: 'Cantidad ingresada en el recibo.',
    },
    {
      sigla: 'imp',
      texto:
        'Importe ingresado en el recibo (a veces actúa como multiplicador).',
    },
    {
      sigla: 'imp ⚠',
      texto:
        'Importe como multiplicador (en SOS puede requerirse 1 para evitar error de triple campo).',
    },
    {
      sigla: 'CN',
      texto:
        'Importe tomado del concepto referenciado por número de concepto en el recibo.',
    },
    {
      sigla: '[mín/máx]',
      texto: 'Piso y techo aplicados al resultado del cálculo.',
    },
    {
      sigla: '[mín]',
      texto: 'Piso (importe mínimo) aplicado al resultado del cálculo.',
    },
    {
      sigla: '[máx]',
      texto: 'Techo (importe máximo) aplicado al resultado del cálculo.',
    },
  ];

const leyendaPorSigla = new Map(
  LEYENDA_FORMULA_SOS.map((item) => [item.sigla, item])
);

function agregarClamp(hasMin: boolean, hasMax: boolean, orden: string[]): void {
  if (hasMin && hasMax) orden.push('[mín/máx]');
  else if (hasMin) orden.push('[mín]');
  else if (hasMax) orden.push('[máx]');
}

/**
 * Siglas que intervienen en la fórmula de este concepto (misma lógica que
 * `formulaLegibleSos`), sin duplicados, en orden de aparición lógico.
 */
export function siglasUsadasFormulaSos(c: ConceptoSosMetadata): string[] {
  const bc = c.baseColumna ?? 'importe_fijo';
  const hasCant = !!c.tieneCantidad;
  const hasPct = !!c.tienePct;
  const hasImp = !!c.tieneImporte;
  const hasCN = !!c.tieneImpConceptoNro;
  const hasMin = !!c.tieneImpMin;
  const hasMax = !!c.tieneImpMax;

  const orden: string[] = [];

  if (bc === 'sub411_414_qty') {
    orden.push('S411-414');
    if (hasPct) orden.push('pct/100');
    return [...new Set(orden)];
  }

  if (SUB_BASES.has(bc)) {
    orden.push(SUB_BASE_LEYENDA[bc] ?? BASE_LABEL[bc] ?? bc);
    if (hasPct) orden.push('pct/100');
    if (hasImp) orden.push('imp ⚠');
    if (hasCant) orden.push('cant');
    agregarClamp(hasMin, hasMax, orden);
    return [...new Set(orden)];
  }

  if (bc === 'valHora') {
    orden.push('VH');
    if (hasPct) orden.push('pct/100');
    if (hasCant) orden.push('cant');
    agregarClamp(hasMin, hasMax, orden);
    return [...new Set(orden)];
  }

  if (bc === 'sueldo' || bc === 'sueldoLegajo') {
    orden.push('SL');
    if (hasCant) orden.push('cant');
    if (hasPct) orden.push('pct/100');
    agregarClamp(hasMin, hasMax, orden);
    return [...new Set(orden)];
  }

  if (hasCN) {
    orden.push('CN');
    if (hasPct) orden.push('pct/100');
    if (hasCant) orden.push('cant');
    if (hasImp) orden.push('imp');
    agregarClamp(hasMin, hasMax, orden);
    return [...new Set(orden)];
  }

  if (hasImp) orden.push('imp');
  if (hasCant) orden.push('cant');
  if (hasPct) orden.push('pct/100');
  agregarClamp(hasMin, hasMax, orden);

  return [...new Set(orden)];
}

/**
 * Solo entradas de leyenda que aplican a la fórmula de este concepto,
 * en el mismo orden que `siglasUsadasFormulaSos`.
 */
export function leyendaRelacionadaFormulaSos(
  c: ConceptoSosMetadata
): { sigla: string; texto: string }[] {
  const siglas = siglasUsadasFormulaSos(c);
  const out: { sigla: string; texto: string }[] = [];
  for (const s of siglas) {
    const row = leyendaPorSigla.get(s);
    if (row) out.push(row);
  }
  return out;
}

export function formulaLegibleSos(c: ConceptoSosMetadata): string {
  const bc = c.baseColumna ?? 'importe_fijo';
  const divC = c.divCantidad ?? 1;
  const divH = c.divHsNorm ?? 1;
  const hasCant = !!c.tieneCantidad;
  const hasPct = !!c.tienePct;
  const hasImp = !!c.tieneImporte;
  const hasCN = !!c.tieneImpConceptoNro;
  const hasMin = !!c.tieneImpMin;
  const hasMax = !!c.tieneImpMax;

  const clamp =
    hasMin && hasMax
      ? ' [mín/máx]'
      : hasMin
        ? ' [mín]'
        : hasMax
          ? ' [máx]'
          : '';

  // ── Asignación complementaria no remunerativa (cant = suma 411–414) ──────
  if (bc === 'sub411_414_qty') {
    return `cant (auto: S411-414)${hasPct ? ' × pct/100' : ''}`;
  }

  // ── Conceptos con base de subtotal acumulado ──────────────────────────────
  if (SUB_BASES.has(bc)) {
    const base = BASE_LABEL[bc] ?? bc;
    const parts: string[] = [base];
    if (hasPct) parts.push('pct/100');
    if (hasImp) parts.push('imp ⚠');
    if (hasCant) parts.push('cant');
    return parts.join(' × ') + clamp;
  }

  // ── Valor hora ────────────────────────────────────────────────────────────
  if (bc === 'valHora') {
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
  if (hasCN) {
    const withCN: string[] = ['CN'];
    if (hasPct) withCN.push('pct/100');
    if (hasCant) withCN.push('cant');

    if (hasImp) {
      const withImp: string[] = ['imp'];
      if (hasPct) withImp.push('pct/100');
      if (hasCant) withImp.push('cant');
      return `${withCN.join(' × ')}  (o  ${withImp.join(' × ')})` + clamp;
    }
    return withCN.join(' × ') + clamp;
  }

  const parts: string[] = [];
  if (hasImp) parts.push('imp');
  if (hasCant) parts.push('cant');
  if (hasPct) parts.push('pct/100');
  return parts.length > 0 ? parts.join(' × ') + clamp : '—';
}
