/**
 * Genera una cadena legible que describe cómo se calcula un concepto,
 * derivada del `modo` del catálogo y de los flags `usa_*` ya almacenados.
 *
 * Usa abreviaturas en la fórmula; el significado filtrado está en
 * `leyendaRelacionadaFormulaSos` (solo lo que aplica a esa fórmula).
 */

export type ConceptoModoCalculo =
  | 'importe_manual'
  | 'pct_sobre_base'
  | 'pct_sobre_concepto'
  | 'sueldo_basico'
  | 'valor_hora'
  | 'sac'
  | 'sac_proporcional'
  | 'dia_vacaciones'
  | 'promedio_anual_concepto';

export interface ConceptoSosMetadata {
  modo?: ConceptoModoCalculo | null;
  /** `base_calculo.codigo` cuando modo = pct_sobre_base. */
  baseCodigo?: string | null;
  divCantidad?: number | null;
  divHsNorm?: number | null;
  tieneCantidad?: boolean | null;
  tienePct?: boolean | null;
  tieneImporte?: boolean | null;
  tieneImpConceptoNro?: boolean | null;
  tieneImpMin?: boolean | null;
  tieneImpMax?: boolean | null;
}

/** Sigla por base de cálculo (base_calculo.codigo). */
const BASE_LABEL: Record<string, string> = {
  sueldo_y_adicionales: 'B-SYA',
  remunerativo_habitual: 'B-RH',
  total_remunerativo: 'B-REM',
  total_no_remunerativo: 'B-NOREM',
  bruto: 'B-BRUTO',
  no_remunerativo_con_os: 'B-NOREM-OS',
  base_obra_social: 'B-OS',
};

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
      sigla: 'B-SYA',
      texto:
        'Base "Sueldo y adicionales": básico, horas normales, antigüedad y otros haberes directos. Base típica de presentismo y antigüedad (los fija cada CCT).',
    },
    {
      sigla: 'B-RH',
      texto:
        'Base "Remunerativo habitual": sueldo y adicionales más feriados y presentismo.',
    },
    {
      sigla: 'B-REM',
      texto:
        'Base "Total remunerativo": todos los conceptos remunerativos (art. 103 LCT). Base de los aportes de ley: jubilación 11%, PAMI 3%, obra social 3%, cuota sindical.',
    },
    {
      sigla: 'B-NOREM',
      texto:
        'Base "Total no remunerativo": sumas no remunerativas de acuerdos salariales y decretos.',
    },
    {
      sigla: 'B-BRUTO',
      texto: 'Base "Bruto": total remunerativo + total no remunerativo.',
    },
    {
      sigla: 'B-NOREM-OS',
      texto:
        'Base "No remunerativo con aportes OS": sumas no remunerativas que tributan obra social porque el acuerdo homologado así lo dispone.',
    },
    {
      sigla: 'B-OS',
      texto:
        'Base "Obra social": total remunerativo + no remunerativo con aportes de OS (aporte del 3% + 1,5% por adherente, Ley 23.660).',
    },
    {
      sigla: 'SAC',
      texto:
        'Sueldo anual complementario: mejor remuneración mensual del semestre ÷ 2 (arts. 121/122 LCT).',
    },
    {
      sigla: 'meses/6',
      texto:
        'Proporción del semestre trabajado (SAC proporcional, art. 123 LCT).',
    },
    {
      sigla: 'BRUTO-ANT ÷ 25',
      texto:
        'Valor día de vacaciones: bruto del mes anterior dividido 25 (art. 155 LCT).',
    },
    {
      sigla: 'CN ÷ 12',
      texto:
        'Promedio anual del concepto referenciado: su importe dividido 12.',
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
  const modo = c.modo ?? 'importe_manual';
  const hasCant = !!c.tieneCantidad;
  const hasPct = !!c.tienePct;
  const hasImp = !!c.tieneImporte;
  const hasCN = !!c.tieneImpConceptoNro;
  const hasMin = !!c.tieneImpMin;
  const hasMax = !!c.tieneImpMax;

  const orden: string[] = [];

  switch (modo) {
    case 'pct_sobre_base': {
      orden.push(BASE_LABEL[c.baseCodigo ?? ''] ?? (c.baseCodigo ?? 'base'));
      if (hasPct) orden.push('pct/100');
      if (hasImp) orden.push('imp ⚠');
      if (hasCant) orden.push('cant');
      agregarClamp(hasMin, hasMax, orden);
      break;
    }
    case 'valor_hora': {
      orden.push('VH');
      if (hasPct) orden.push('pct/100');
      if (hasCant) orden.push('cant');
      agregarClamp(hasMin, hasMax, orden);
      break;
    }
    case 'sueldo_basico': {
      orden.push('SL');
      if (hasCant) orden.push('cant');
      if (hasPct) orden.push('pct/100');
      agregarClamp(hasMin, hasMax, orden);
      break;
    }
    case 'sac': {
      orden.push('SAC');
      break;
    }
    case 'sac_proporcional': {
      orden.push('SAC', 'meses/6');
      break;
    }
    case 'dia_vacaciones': {
      orden.push('BRUTO-ANT ÷ 25');
      if (hasCant) orden.push('cant');
      break;
    }
    case 'promedio_anual_concepto': {
      orden.push('CN ÷ 12');
      if (hasPct) orden.push('pct/100');
      break;
    }
    case 'pct_sobre_concepto': {
      orden.push('CN');
      if (hasPct) orden.push('pct/100');
      if (hasCant) orden.push('cant');
      if (hasImp) orden.push('imp');
      agregarClamp(hasMin, hasMax, orden);
      break;
    }
    case 'importe_manual':
    default: {
      if (hasCN) {
        orden.push('CN');
        if (hasPct) orden.push('pct/100');
        if (hasCant) orden.push('cant');
        if (hasImp) orden.push('imp');
      } else {
        if (hasImp) orden.push('imp');
        if (hasCant) orden.push('cant');
        if (hasPct) orden.push('pct/100');
      }
      agregarClamp(hasMin, hasMax, orden);
      break;
    }
  }

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
  const modo = c.modo ?? 'importe_manual';
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

  switch (modo) {
    // ── % sobre una base de cálculo ─────────────────────────────────────────
    case 'pct_sobre_base': {
      const base = BASE_LABEL[c.baseCodigo ?? ''] ?? (c.baseCodigo ?? 'base');
      const parts: string[] = [base];
      if (hasPct) parts.push('pct/100');
      if (hasImp) parts.push('imp ⚠');
      if (hasCant) parts.push('cant');
      return parts.join(' × ') + clamp;
    }

    // ── Valor hora ──────────────────────────────────────────────────────────
    case 'valor_hora': {
      const parts: string[] = ['VH'];
      if (hasPct) parts.push('pct/100');
      if (hasCant) parts.push('cant');
      return parts.join(' × ') + clamp;
    }

    // ── Sueldo del legajo (con divisores de horas y/o días) ─────────────────
    case 'sueldo_basico': {
      let base = 'SL';
      if (divH > 1) base += ` / ${divH}`;
      if (divC > 1) base += ` / ${divC}`;
      const parts: string[] = [base];
      if (hasCant) parts.push('cant');
      if (hasPct) parts.push('pct/100');
      return parts.join(' × ') + clamp;
    }

    // ── Cálculos especiales de ley ──────────────────────────────────────────
    case 'sac':
      return 'SAC (mejor rem. mensual del semestre ÷ 2)';
    case 'sac_proporcional':
      return 'SAC × meses/6';
    case 'dia_vacaciones':
      return `BRUTO-ANT ÷ 25${hasCant ? ' × cant' : ''}`;
    case 'promedio_anual_concepto':
      return `CN ÷ 12${hasPct ? ' × pct/100' : ''}`;

    // ── % sobre otra línea del recibo ───────────────────────────────────────
    case 'pct_sobre_concepto': {
      const parts: string[] = ['CN'];
      if (hasPct) parts.push('pct/100');
      if (hasCant) parts.push('cant');
      return parts.join(' × ') + clamp;
    }

    // ── Importe manual (con o sin concepto de referencia) ───────────────────
    case 'importe_manual':
    default: {
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
  }
}
