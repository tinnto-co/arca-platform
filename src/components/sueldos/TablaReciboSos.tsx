'use client';

import {
  Fragment,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  SECCIONES_SOS,
  ORDEN_SECCIONES,
  getSeccionSos,
  type SeccionSos,
} from '@/components/sueldos/sos-concepto-map';
import {
  montoLiquidadoDesdeEditsSos,
  parseDecimalSos,
} from '@/lib/sos-recibo-totales';
import { dateAPeriodo } from '@/lib/periodo';
import { tipoReciboLabel } from '@/lib/sueldos-labels';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConceptoImportado {
  id: string;
  codigo: string;
  monto: string | null;
  cantidad: string | null;
  porcentaje: string | null;
  importeConceptoNumero: string | null;
  importe: string | null;
  importeMinimo: string | null;
  importeMaximo: string | null;
  nombre: string | null;
  codigoAfip: string | null;
  /** Base de cálculo SOS (ej. 'sueldo', 'sub1_9'). Solo en plantilla manual. */
  baseColumna?: string | null;
  /** Divisor de cantidad del concepto (ej. 30 para sueldo diario). Solo en plantilla manual. */
  divCantidad?: number | null;
  /** Si divide por horas normales mensuales. Solo en plantilla manual. */
  divHsNorm?: boolean | null;
  /** Columnas editables habilitadas para este concepto según catálogo SOS. */
  tieneCantidad?: boolean | null;
  tienePct?: boolean | null;
  tieneImpConceptoNro?: boolean | null;
  tieneImporte?: boolean | null;
  tieneImpMin?: boolean | null;
  tieneImpMax?: boolean | null;
  tieneMemo?: boolean | null;
  /** Valor del memo (descripción libre) guardado en el recibo. */
  memo?: string | null;
  /** Porcentaje fijo no editable (ej. 8.33 para Presentismo). */
  pctFijo?: number | null;
}

export interface ReciboImportadoHeader {
  id: string;
  periodo: string;
  tipo: string;
  haberes: string | null;
  noRemunerativo: string | null;
  descuentos: string | null;
  retenciones: string | null;
  neto: string | null;
}

/** Campos editables por concepto, indexados por código SOS */
export type EditsMap = Record<
  string,
  {
    monto: string;
    /** Override directo del resultado final. Cuando está seteado, el cascade no recalcula.
     *  No se persiste en DB — se pierde al reabrir el recibo. Para override permanente, ajustá % o cant. */
    montoFijo: string;
    cantidad: string;
    porcentaje: string;
    importeConceptoNumero: string;
    importe: string;
    importeMinimo: string;
    importeMaximo: string;
    memo: string;
  }
>;

const EMPTY_EDIT_ROW: EditsMap[string] = {
  monto: '',
  montoFijo: '',
  cantidad: '',
  porcentaje: '',
  importeConceptoNumero: '',
  importe: '',
  importeMinimo: '',
  importeMaximo: '',
  memo: '',
};

/** Bases de cálculo dinámicas (dependen de subtotales acumulados de otras filas). */
const SUB_BASES = new Set([
  'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39', 'sub1_199', 'sub411_469',
  'sub1_199_plus_411_469',
  'os_base',            // base OS rem: subtotal 1-99 como si concepto 1 estuviera al 100%
  'os_norem_base',      // base OS no-rem: subtotal 411-469 como si concepto 411 estuviera al 100%
  'basico_div25',          // basicoEscala / 25 × cantidad (legado)
  'mejor_div25',           // mejorSueldoSemestre / 25 × cantidad (legado)
  'bruto_anterior_div25',  // brutoMesAnterior / 25 × cantidad (vacaciones gozadas/no gozadas — conceptos 51 y 401)
  'concepto_401_div12',    // monto concepto 401 / 12 (SAC sobre vacaciones no gozadas — concepto 402)
]);

/**
 * Devuelve true si el row tiene una base de fórmula válida y explícita.
 *
 * Problema con datos importados: cuando SOS no tiene un campo importe_N explícito
 * (ej. Sueldo Básico, concepto 1), el scraper almacena el total liquidado como fallback
 * en `importe`. En ese caso `importe == monto` y la fórmula daría un resultado incorrecto
 * (ej. 30 días × 100% × $400.000 = $12.000.000 en vez de $400.000).
 *
 * Se detecta ese fallback cuando: importe ≈ monto Y el multiplicador (cantidad × %/100) ≠ 1.
 * Si el multiplicador es ≈ 1, importe ES el valor unitario y la fórmula es correcta.
 */
function canApplyFormula(row: EditsMap[string]): boolean {
  const imp = parseDecimalSos(row.importe);
  const impNro = parseDecimalSos(row.importeConceptoNumero);
  const hasCantidad = (row.cantidad ?? '').trim() !== '';
  const hasPct = (row.porcentaje ?? '').trim() !== '';

  // Sin importe ni cantidad ni %: nada que calcular
  if (imp === null && impNro === null && !hasCantidad && !hasPct) return false;

  // Si hay importe, verificar que no sea el caso fallback (importe == monto con multiplicador ≠ 1)
  if (imp !== null && imp !== 0) {
    const mont = parseDecimalSos(row.monto);
    if (mont !== null && Math.abs(imp - mont) < 0.01) {
      // importe == monto: verificar si es fallback o parámetro unitario real
      const cant = parseDecimalSos(row.cantidad) ?? 0;
      const pct = parseDecimalSos(row.porcentaje) ?? 100;
      const multiplier = cant * (pct / 100);
      if (Math.abs(multiplier - 1.0) > 0.001) return false; // fallback — no aplicar fórmula
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(s: string | null | undefined): number {
  return parseDecimalSos(s) ?? 0;
}

function fmtArs(n: number): string {
  return Math.abs(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtArsSign(n: number): string {
  if (n === 0) return '';
  return `$\u202f${fmtArs(n)}`;
}

const DASH = <span className="text-slate-300">—</span>;
const MAX_PCT_WARN = 500;

// ---------------------------------------------------------------------------
// Subtotal cascade (standalone — can be called from setField and effects)
// ---------------------------------------------------------------------------

function applySubtotalCascade(
  edits: EditsMap,
  allConcepts: ConceptoImportado[],
  activeCodigos?: Set<string>,
  osBase = 0,
  mejorSueldo = 0,
  diasSemestre = 0,
  brutoMesAnterior = 0,
  basicoEscala = 0,
): EditsMap {
  const subTotals: Record<string, number> = {
    sub1_9: 0, sub1_19: 0, sub1_26: 0,
    sub1_39: 0, sub1_99: 0, sub1_199: 0, sub411_469: 0, sub411_414: 0,
    // Subtotales paralelos "OS": se acumulan como si concepto 1 y 411 estuvieran al 100%.
    // Usados por os_base (concepto 203/204/221/222) y os_norem_base (concepto 502).
    sub1_9_os: 0, sub1_19_os: 0, sub1_26_os: 0, sub1_39_os: 0,
    sub1_99_os: 0, sub411_469_os: 0,
  };

  // Mapa de montos computados por código, para referencias entre conceptos.
  const conceptMontos: Record<string, number> = {};
  // Monto del concepto 1 (sueldo básico), base para conceptos con baseColumna='sueldo'.
  let sueldoBase = 0;
  // Versión "OS" del sueldo base: usa osBase (básico escala 100%) cuando está disponible.
  let sueldoBase_os = 0;

  const sorted = [...allConcepts].sort(
    (a, b) => (parseInt(a.codigo, 10) || 9999) - (parseInt(b.codigo, 10) || 9999)
  );

  let next = edits;

  for (const c of sorted) {
    const n = parseInt(c.codigo, 10);
    if (isNaN(n)) continue;

    // Conceptos inactivos no participan ni en recálculo ni en acumulación de subtotales.
    if (activeCodigos && !activeCodigos.has(c.codigo)) continue;

    const row = next[c.codigo] ?? EMPTY_EDIT_ROW;
    let effectiveMonto = toNum(row.monto);

    // Override manual: si el usuario pisó el resultado, respetar sin recalcular.
    const montoFijo = (row.montoFijo ?? '').trim();
    if (montoFijo !== '') {
      effectiveMonto = parseDecimalSos(montoFijo) ?? effectiveMonto;
      const montoFijoStr = effectiveMonto.toFixed(2);
      if (row.monto !== montoFijoStr) {
        next = { ...next, [c.codigo]: { ...row, monto: montoFijoStr } };
      }
      // Acumular subtotales con el valor override y continuar al siguiente concepto
    } else {

    const bc = c.baseColumna;
    if (bc != null && SUB_BASES.has(bc)) {
      const hasPct = (row.porcentaje ?? '').trim() !== '';
      const noUsaPct = c.tienePct === false;
      const effectivePct = hasPct
        ? (parseDecimalSos(row.porcentaje) ?? 0)
        : noUsaPct ? 100 : 0;

      if (hasPct || noUsaPct) {
        // Para retenciones (200–299) con base 'sub1_199': la base correcta es
        // haberes (1–99) minus descuentos (100–199), no la suma bruta de ambos.
        // 'os_base': usa sub1_99_os (haberes al 100% de jornada, independiente del pct del concepto 1).
        // 'os_norem_base': usa sub411_469_os (no-rem con concepto 411 siempre al 100%).
        const subBase =
          bc === 'os_base'
            ? (subTotals['sub1_99_os'] ?? 0)
            : bc === 'os_norem_base'
              ? (subTotals['sub411_469_os'] ?? 0)
              : bc === 'basico_div25'
                ? (osBase > 0 ? osBase : sueldoBase) / 25
                : bc === 'mejor_div25'
                  ? mejorSueldo / 25
                  : bc === 'bruto_anterior_div25'
                    ? brutoMesAnterior / 25
                    : bc === 'concepto_401_div12'
                      ? (conceptMontos['401'] ?? 0) / 12
                    : bc === 'sub1_199_plus_411_469'
                      ? (subTotals['sub1_199'] ?? 0) + (subTotals['sub411_469'] ?? 0)
                      : bc === 'sub1_199' && n >= 200 && n <= 299
                        ? (subTotals['sub1_99'] ?? 0) - ((subTotals['sub1_199'] ?? 0) - (subTotals['sub1_99'] ?? 0))
                        : (subTotals[bc] ?? 0);

        // Si el concepto tiene campo importe propio (tieneImporte/tieneImpConceptoNro) y el
        // usuario lo completó, ese valor tiene prioridad como base sobre el subtotal dinámico.
        const refCodigo = (row.importeConceptoNumero ?? '').trim();
        const refBase = refCodigo !== '' ? (conceptMontos[refCodigo] ?? 0) : 0;
        const ownImporte = (c.tieneImporte || c.tieneImpConceptoNro)
          ? (parseDecimalSos(row.importe) ?? 0)
          : 0;
        const explicitBase = refBase > 0 ? refBase : ownImporte;
        const effectiveBase = explicitBase > 0 ? explicitBase : subBase;

        if (effectiveBase > 0) {
          const cantNum =
            !c.tieneCantidad && (row.cantidad ?? '') === ''
              ? 1
              : (parseDecimalSos(row.cantidad) ?? 1);

          let raw = effectiveBase * (effectivePct / 100) * cantNum;

          const impMin = parseDecimalSos(row.importeMinimo);
          const impMax = parseDecimalSos(row.importeMaximo);
          if (impMin !== null && raw < impMin) raw = impMin;
          if (impMax !== null && raw > impMax) raw = impMax;

          effectiveMonto = Math.round(raw * 100) / 100;
          next = { ...next, [c.codigo]: { ...row, monto: effectiveMonto.toFixed(2) } };
        }
      }
    } else if (bc === 'valHora') {
      // Concepto 2 (Horas Normales): monto = valor_hora × horas_ingresadas.
      // valHora es el montoBasico de la escala (valor por hora).
      const divHs = c.divHsNorm ? 200 : 1;
      const valHora = basicoEscala / divHs / Math.max(1, c.divCantidad ?? 1);
      if (valHora > 0) {
        const cantNum = parseDecimalSos(row.cantidad) ?? 0;
        if (cantNum > 0) {
          effectiveMonto = Math.round(valHora * cantNum * 100) / 100;
          next = { ...next, [c.codigo]: { ...row, monto: effectiveMonto.toFixed(2) } };
        }
      }
      // Actualizar sueldoBase con el total liquidado para que conceptos
      // posteriores (Antigüedad, Presentismo) usen la base correcta.
      if (effectiveMonto > 0) sueldoBase = effectiveMonto;
    } else if (bc === 'sueldo' && n > 1) {
      // Base = monto del concepto 1 (sueldo básico).
      const hasPct = (row.porcentaje ?? '').trim() !== '';
      if (hasPct && sueldoBase > 0) {
        const pct = parseDecimalSos(row.porcentaje) ?? 0;
        const cantNum = !c.tieneCantidad && (row.cantidad ?? '') === ''
          ? 1
          : (parseDecimalSos(row.cantidad) ?? 1);
        effectiveMonto = Math.round(sueldoBase * (pct / 100) * cantNum * 100) / 100;
        next = { ...next, [c.codigo]: { ...row, monto: effectiveMonto.toFixed(2) } };
      }
    } else if (bc === 'importe_fijo') {
      // Base = importe propio del concepto, o el monto del concepto referenciado via importeConceptoNumero.
      const hasPct = (row.porcentaje ?? '').trim() !== '';
      if (hasPct) {
        const pct = parseDecimalSos(row.porcentaje) ?? 0;
        const cantNum = !c.tieneCantidad && (row.cantidad ?? '') === ''
          ? 1
          : (parseDecimalSos(row.cantidad) ?? 1);
        const refCodigo = (row.importeConceptoNumero ?? '').trim();
        const refBase = refCodigo !== '' ? (conceptMontos[refCodigo] ?? 0) : 0;
        const ownImporte = parseDecimalSos(row.importe) ?? 0;
        const base = refBase > 0 ? refBase : ownImporte;
        if (base > 0) {
          effectiveMonto = Math.round(base * (pct / 100) * cantNum * 100) / 100;
          next = { ...next, [c.codigo]: { ...row, monto: effectiveMonto.toFixed(2) } };
        }
      }
    } else if (bc === 'sub411_414_qty') {
      // La cantidad se auto-rellena con la suma de conceptos 411–414.
      // El resultado es: cantidad × (pct / 100).
      const sub = subTotals['sub411_414'] ?? 0;
      const hasPct = (row.porcentaje ?? '').trim() !== '';
      if (hasPct && sub > 0) {
        const pct = parseDecimalSos(row.porcentaje) ?? 0;
        effectiveMonto = Math.round(sub * (pct / 100) * 100) / 100;
        next = { ...next, [c.codigo]: { ...row, cantidad: sub.toFixed(2), monto: effectiveMonto.toFixed(2) } };
      } else if (sub > 0) {
        next = { ...next, [c.codigo]: { ...row, cantidad: sub.toFixed(2) } };
      }
    } else if (bc === 'sac_normal') {
      // Concepto 41: importe = SAC (mejor sueldo / 2). La cantidad manual sobreescribe la base si está seteada.
      if (mejorSueldo > 0) {
        const cantStr = (row.cantidad ?? '').trim();
        const base = cantStr !== '' ? (parseDecimalSos(cantStr) ?? mejorSueldo) : mejorSueldo;
        effectiveMonto = Math.round((base / 2) * 100) / 100;
        next = { ...next, [c.codigo]: { ...row, importe: effectiveMonto.toFixed(2), monto: effectiveMonto.toFixed(2) } };
      }
    } else if (bc === 'sac_proporcional') {
      // Concepto 42: importe = SAC proporcional (mejor sueldo / 360 × días). La cantidad manual sobreescribe la base.
      if (mejorSueldo > 0 && diasSemestre > 0) {
        const cantStr = (row.cantidad ?? '').trim();
        const base = cantStr !== '' ? (parseDecimalSos(cantStr) ?? mejorSueldo) : mejorSueldo;
        effectiveMonto = Math.round((base / 360) * diasSemestre * 100) / 100;
        next = { ...next, [c.codigo]: { ...row, importe: effectiveMonto.toFixed(2), monto: effectiveMonto.toFixed(2) } };
      }
    }
    } // cierre del else (montoFijo no seteado)

    // Registrar monto computado para que conceptos posteriores puedan referenciarlo.
    conceptMontos[c.codigo] = effectiveMonto;
    if (n === 1 || n === 2) sueldoBase = effectiveMonto;

    if (n >= 1 && n <= 199) {
      subTotals['sub1_199'] += effectiveMonto;
      if (n <= 99) subTotals['sub1_99'] += effectiveMonto;
      if (n <= 9) subTotals['sub1_9'] += effectiveMonto;
      if (n <= 19) subTotals['sub1_19'] += effectiveMonto;
      if (n <= 26) subTotals['sub1_26'] += effectiveMonto;
      if (n <= 39) subTotals['sub1_39'] += effectiveMonto;
    } else if (n >= 411 && n <= 469) {
      subTotals['sub411_469'] += effectiveMonto;
      if (n <= 414) subTotals['sub411_414'] += effectiveMonto;
    }

    // Acumulación de subtotales OS paralelos.
    // Los sub1_X_os replican sub1_X pero con concepto 1 anclado a osBase (básico 100%).
    // Los conceptos que cascadean desde sub-rangos usan la versión OS del sub-rango,
    // garantizando que todo el cascade de haberes refleje la jornada completa.
    if (n >= 1 && n <= 99) {
      let osContrib = effectiveMonto;
      if (n === 1) {
        sueldoBase_os = osBase > 0 ? osBase : effectiveMonto;
        osContrib = sueldoBase_os;
      } else if (c.baseColumna === 'sueldo' && sueldoBase_os > 0 && sueldoBase_os !== sueldoBase) {
        // Cascadea del básico (ej: antigüedad): reescalar con sueldoBase_os.
        const osPct = (row.porcentaje ?? '').trim() !== '' ? (parseDecimalSos(row.porcentaje) ?? 0) : 0;
        const osCant = !c.tieneCantidad && (row.cantidad ?? '') === '' ? 1 : (parseDecimalSos(row.cantidad) ?? 1);
        if (osPct > 0) osContrib = Math.round(sueldoBase_os * (osPct / 100) * osCant * 100) / 100;
      } else if (c.baseColumna != null && SUB_BASES.has(c.baseColumna)) {
        // Cascadea desde un sub-rango (ej: presentismo usa sub1_9): usar la versión OS.
        // Solo si existe el paralelo _os para ese sub-rango (sub1_9_os, sub1_19_os, etc.).
        const osSubName = c.baseColumna + '_os';
        const osSubVal = subTotals[osSubName]; // undefined si no tiene versión OS
        const realSubVal = subTotals[c.baseColumna] ?? 0;
        if (osSubVal !== undefined && osSubVal !== realSubVal && realSubVal > 0) {
          const osPct2 = (row.porcentaje ?? '').trim() !== '' ? (parseDecimalSos(row.porcentaje) ?? 0) : (c.tienePct === false ? 100 : 0);
          const osCant2 = !c.tieneCantidad && (row.cantidad ?? '') === '' ? 1 : (parseDecimalSos(row.cantidad) ?? 1);
          if (osPct2 > 0) osContrib = Math.round(osSubVal * (osPct2 / 100) * osCant2 * 100) / 100;
        }
      }
      subTotals['sub1_99_os'] += osContrib;
      if (n <= 9)  subTotals['sub1_9_os']  += osContrib;
      if (n <= 19) subTotals['sub1_19_os'] += osContrib;
      if (n <= 26) subTotals['sub1_26_os'] += osContrib;
      if (n <= 39) subTotals['sub1_39_os'] += osContrib;
    } else if (n >= 411 && n <= 469) {
      let noremsOsContrib = effectiveMonto;
      if (n === 411) {
        // Concepto 411: back-calcular al 100% del porcentaje efectivo.
        const pct411 = parseDecimalSos(row.porcentaje);
        noremsOsContrib = (pct411 !== null && pct411 > 0)
          ? Math.round((effectiveMonto / (pct411 / 100)) * 100) / 100
          : effectiveMonto;
      }
      subTotals['sub411_469_os'] += noremsOsContrib;
    }
  }

  return next;
}

function isCodeInRange(code: number, min: number, max: number): boolean {
  return code >= min && code <= max;
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

const ALLOWED_KEYS = new Set([
  'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Home', 'End',
]);

/** Solo dígitos, punto y coma decimal. Sin negativos, sin letras, sin símbolos. */
const sanitizeNumeric = (v: string) => v.replace(/[^0-9.,]/g, '');

function EditableCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);

  // Sincronizar cuando el reducer actualiza el valor (ej. monto recalculado)
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = () => onChange(local);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(sanitizeNumeric(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          return;
        }
        // Solo permitir números, punto/coma decimal y teclas de control
        if (
          !ALLOWED_KEYS.has(e.key) &&
          !e.ctrlKey &&
          !e.metaKey &&
          !/^[0-9.,]$/.test(e.key)
        ) {
          e.preventDefault();
        }
      }}
      className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[10px] text-right focus:bg-yellow-50 focus:ring-1 focus:ring-yellow-300 focus:border-yellow-300 outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Result cell with manual override
// ---------------------------------------------------------------------------

function ResultOverrideCell({
  monto,
  montoFijo,
  onOverride,
}: {
  monto: string;
  montoFijo: string;
  onOverride: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState('');

  const isOverridden = montoFijo.trim() !== '';
  const num = toNum(isOverridden ? montoFijo : monto);

  const startEdit = () => {
    setLocal(isOverridden ? montoFijo : monto);
    setEditing(true);
  };

  const commit = () => {
    onOverride(local.trim());
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          autoFocus
          type="text"
          value={local}
          onChange={(e) => setLocal(sanitizeNumeric(e.target.value))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { setEditing(false); }
            if (
              !ALLOWED_KEYS.has(e.key) &&
              !e.ctrlKey &&
              !e.metaKey &&
              !/^[0-9.,]$/.test(e.key)
            ) {
              e.preventDefault();
            }
          }}
          className="w-full bg-amber-50 border border-amber-300 rounded px-1 py-0.5 text-[10px] text-right focus:ring-1 focus:ring-amber-400 outline-none"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(false)}
          className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5 group/result">
      {isOverridden ? (
        <>
          <span className="text-amber-700 tabular-nums">{fmtArs(num)}</span>
          <button
            type="button"
            onClick={() => onOverride('')}
            className="text-amber-400 hover:text-red-500 shrink-0"
            title="Quitar override"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </>
      ) : (
        <>
          <span className="tabular-nums">{num !== 0 ? fmtArsSign(num) : '—'}</span>
          <button
            type="button"
            onClick={startEdit}
            className="opacity-0 group-hover/result:opacity-100 text-slate-300 hover:text-slate-500 shrink-0 transition-opacity ml-0.5"
            title="Override manual (solo esta sesión)"
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add concept button
// ---------------------------------------------------------------------------

function AgregarConceptoButton({
  seccion,
  catalogo,
  codigosActivos,
  codigosExcluidos = new Set(),
  onAdd,
}: {
  seccion: SeccionSos;
  catalogo: ConceptoImportado[];
  codigosActivos: Set<string>;
  /** Conceptos que se muestran deshabilitados (excluyentes con uno ya activo). */
  codigosExcluidos?: Set<string>;
  onAdd: (codigos: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const cfg = SECCIONES_SOS[seccion];

  const disponibles = catalogo.filter((c) => {
    const num = parseInt(c.codigo, 10);
    if (isNaN(num) || num < cfg.rangoMin || num > cfg.rangoMax) return false;
    if (codigosActivos.has(c.codigo)) return false;
    // codigosExcluidos permanecen visibles pero deshabilitados (exclusividad mutua)
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return c.codigo.includes(q) || (c.nombre ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  const toggleSeleccion = (codigo: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const confirmar = () => {
    if (seleccionados.size > 0) {
      onAdd([...seleccionados]);
    }
    setOpen(false);
    setBusqueda('');
    setSeleccionados(new Set());
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setBusqueda(''); setSeleccionados(new Set()); }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          tabIndex={-1}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Agregar concepto
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <input
          type="text"
          placeholder="Buscar por nombre o número…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="mb-2 w-full rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-slate-300"
          autoFocus
        />
        <div className="max-h-52 overflow-y-auto">
          {disponibles.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {busqueda
                ? 'Sin resultados.'
                : 'Todos los conceptos de esta sección ya están agregados.'}
            </p>
          ) : (
            disponibles.map((c) => {
              const excluido = codigosExcluidos.has(c.codigo);
              return (
                <label
                  key={c.codigo}
                  className={`flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs ${excluido ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-slate-100'}`}
                  title={excluido ? 'Excluyente con un concepto ya agregado' : undefined}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 accent-slate-600"
                    disabled={excluido}
                    checked={seleccionados.has(c.codigo)}
                    onChange={() => !excluido && toggleSeleccion(c.codigo)}
                  />
                  <span className="w-6 shrink-0 tabular-nums text-slate-400">{c.codigo}</span>
                  <span className="flex-1">{c.nombre ?? `Concepto ${c.codigo}`}</span>
                </label>
              );
            })
          )}
        </div>
        {disponibles.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <span className="text-[10px] text-slate-500">
              {seleccionados.size > 0 ? `${seleccionados.size} seleccionado${seleccionados.size > 1 ? 's' : ''}` : 'Seleccioná uno o más'}
            </span>
            <button
              type="button"
              disabled={seleccionados.size === 0}
              onClick={confirmar}
              className="rounded bg-slate-700 px-3 py-1 text-[10px] font-medium text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Agregar ({seleccionados.size})
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Section component
// ---------------------------------------------------------------------------

interface TableSectionProps {
  seccion: SeccionSos;
  cfg: (typeof SECCIONES_SOS)[SeccionSos];
  filas: ConceptoImportado[];
  edits: EditsMap;
  setField: (codigo: string, field: keyof EditsMap[string], value: string) => void;
  sectionTotal: (s: SeccionSos) => number;
  catalogoCompleto?: ConceptoImportado[];
  codigosActivos?: Set<string>;
  onAddConcepto?: (codigos: string[]) => void;
  onRemoveConcepto?: (codigo: string) => void;
  brutoMesAnterior?: number;
}

function TableSection({
  seccion,
  cfg,
  filas,
  edits,
  setField,
  sectionTotal,
  catalogoCompleto,
  codigosActivos,
  onAddConcepto,
  onRemoveConcepto,
  brutoMesAnterior = 0,
}: TableSectionProps) {
  const isHaberes = cfg.columna === 'haberes';
  const isDesc = cfg.columna === 'descuentos';
  const isReten = cfg.columna === 'retenciones';
  const isNoRem = cfg.columna === 'no_remunerativo';

  return (
    <>
      {/* Section header row */}
      <tr className="bg-slate-200 border-b border-t">
        <td
          colSpan={12}
          className="px-2 py-1 font-semibold text-slate-700 text-[11px] uppercase tracking-wide"
        >
          {cfg.label}
        </td>
      </tr>

      {/* Concept rows */}
      {filas.map((c) => {
        const edit = edits[c.codigo];

        return (
          <Fragment key={c.codigo}>
            <tr className="border-b hover:bg-slate-50 divide-x divide-slate-200">
              <td className="px-2 py-1.5 text-center text-slate-400 tabular-nums">{c.codigo}</td>
              <td className="px-2 py-1.5 font-medium">
                <div className="flex items-center gap-1 group/row">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span>
                      {c.nombre ?? `Concepto ${c.codigo}`}
                      {c.codigoAfip && c.codigoAfip !== '0' && (
                        <span className="ml-1 text-slate-400 font-normal">[{c.codigoAfip}]</span>
                      )}
                    </span>
                    {c.tieneMemo && (
                      <input
                        type="text"
                        placeholder="Descripción en recibo..."
                        value={edit?.memo ?? ''}
                        onChange={(ev) => setField(c.codigo, 'memo', ev.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-normal text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                    )}
                    {(c.codigo === '51' || c.codigo === '401') && brutoMesAnterior === 0 && (
                      <span className="text-amber-700 text-[10px] italic leading-tight">
                        No se ha cargado el recibo del período anterior para calcular automáticamente este concepto
                      </span>
                    )}
                  </div>
                  {onRemoveConcepto && (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onRemoveConcepto(c.codigo)}
                      className="ml-1 shrink-0 opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                      title="Eliminar concepto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </td>
              <td className="px-1 py-1.5 !border-l-2 !border-l-slate-400">
                {/* Para SAC (41/42): Cantidad = base manual opcional (no se auto-rellena) */}
                {c.tieneCantidad !== false
                  ? <EditableCell value={edit?.cantidad ?? ''} onChange={(v) => setField(c.codigo, 'cantidad', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {(c.pctFijo != null || c.tienePct !== false)
                  ? <EditableCell value={edit?.porcentaje ?? ''} onChange={(v) => setField(c.codigo, 'porcentaje', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {c.tieneImpConceptoNro !== false
                  ? <EditableCell value={edit?.importeConceptoNumero ?? ''} onChange={(v) => setField(c.codigo, 'importeConceptoNumero', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {(() => {
                  const impNroStr = (edit?.importeConceptoNumero ?? '').trim();
                  if (impNroStr) {
                    const resolved = parseDecimalSos(edits[impNroStr]?.monto);
                    return (
                      <span
                        className="block w-full px-1 py-0.5 text-right tabular-nums text-[10px] text-sky-600 italic select-none"
                        title={`Total del concepto ${impNroStr}`}
                      >
                        {resolved !== null && resolved !== 0 ? fmtArs(resolved) : '—'}
                      </span>
                    );
                  }
                  // Para SAC (41/42): siempre mostrar Importe (contiene el monto calculado)
                  const esSac = c.baseColumna === 'sac_normal' || c.baseColumna === 'sac_proporcional';
                  return (c.tieneImporte !== false || esSac)
                    ? <EditableCell value={edit?.importe ?? ''} onChange={(v) => setField(c.codigo, 'importe', v)} />
                    : DASH;
                })()}
              </td>
              <td className="px-1 py-1.5">
                {c.tieneImpMin !== false
                  ? <EditableCell value={edit?.importeMinimo ?? ''} onChange={(v) => setField(c.codigo, 'importeMinimo', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {c.tieneImpMax !== false
                  ? <EditableCell value={edit?.importeMaximo ?? ''} onChange={(v) => setField(c.codigo, 'importeMaximo', v)} />
                  : DASH}
              </td>
              <td className="px-2 py-1.5 !border-l-2 !border-l-slate-600">
                {isHaberes
                  ? <ResultOverrideCell monto={edit?.monto ?? ''} montoFijo={edit?.montoFijo ?? ''} onOverride={(v) => setField(c.codigo, 'montoFijo', v)} />
                  : DASH}
              </td>
              <td className="px-2 py-1.5">
                {isDesc
                  ? <ResultOverrideCell monto={edit?.monto ?? ''} montoFijo={edit?.montoFijo ?? ''} onOverride={(v) => setField(c.codigo, 'montoFijo', v)} />
                  : DASH}
              </td>
              <td className="px-2 py-1.5">
                {isReten
                  ? <ResultOverrideCell monto={edit?.monto ?? ''} montoFijo={edit?.montoFijo ?? ''} onOverride={(v) => setField(c.codigo, 'montoFijo', v)} />
                  : DASH}
              </td>
              <td className="px-2 py-1.5">
                {isNoRem
                  ? <ResultOverrideCell monto={edit?.monto ?? ''} montoFijo={edit?.montoFijo ?? ''} onOverride={(v) => setField(c.codigo, 'montoFijo', v)} />
                  : DASH}
              </td>
            </tr>

            {/* Subtotal rows hidden — only section totals are shown */}
          </Fragment>
        );
      })}

      {/* Add concept row */}
      {onAddConcepto && catalogoCompleto && codigosActivos && (
        <tr>
          <td colSpan={12} className="px-2 py-0.5 bg-slate-50">
            <AgregarConceptoButton
              seccion={seccion}
              catalogo={catalogoCompleto}
              codigosActivos={codigosActivos}
              codigosExcluidos={
                codigosActivos.has('41') ? new Set(['42']) :
                codigosActivos.has('42') ? new Set(['41']) :
                undefined
              }
              onAdd={onAddConcepto}
            />
          </td>
        </tr>
      )}

      {/* Section total row */}
      <tr className="border-b border-t-2 border-t-slate-300 bg-slate-100 divide-x divide-slate-300">
        <td className="px-2 py-1.5" />
        <td
          className="px-2 py-1.5 text-right font-semibold text-slate-600 text-[10px] italic"
          colSpan={7}
        >
          Total {cfg.label}
        </td>
        <td
          className={`px-2 py-1.5 text-right font-semibold !border-l-2 !border-l-slate-600 ${
            isHaberes ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
          {isHaberes ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td className={`px-2 py-1.5 text-right font-semibold ${isDesc ? 'text-slate-800' : 'text-slate-300'}`}>
          {isDesc ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td className={`px-2 py-1.5 text-right font-semibold ${isReten ? 'text-slate-800' : 'text-slate-300'}`}>
          {isReten ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td className={`px-2 py-1.5 text-right font-semibold ${isNoRem ? 'text-slate-800' : 'text-slate-300'}`}>
          {isNoRem ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
      </tr>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface TablaReciboSosProps {
  recibo: ReciboImportadoHeader;
  conceptos: ConceptoImportado[];
  /** Se invoca cada vez que el usuario edita un valor */
  onChange?: (edits: EditsMap) => void;
  /**
   * `importado`: datos del último recibo scrapeado de SOS.
   * `manual`: filas armadas desde payroll_concepto (número SOS); montos vacíos hasta que el usuario complete.
   */
  variant?: 'importado' | 'manual';
  /**
   * Básico de escala salarial vigente (solo en modo `manual`).
   * Se usa como base implícita de cálculo cuando el campo Importe está vacío.
   * No se muestra en la columna Importe — el usuario solo ve el resultado en Haberes.
   */
  basico?: number;
  /** URL (data URL o URL pública) de la imagen de firma del empleador. */
  firmaEmpleadorUrl?: string | null;
  /**
   * Si se define, solo se muestran filas cuyo `codigo` está en el set (carga manual con "+").
   * Si no se define, se muestran todas las filas de `conceptos` (último recibo importado).
   */
  activeCodigos?: Set<string>;
  /**
   * Básico de escala a jornada completa (pesos). Solo para empleados `part_time` o `reducida`.
   * Cuando se provee (> 0), los conceptos con `baseColumna = 'os_base'` (obra social) lo usan
   * como base en lugar del subtotal real liquidado, que estaría reducido proporcionalmente.
   */
  basicoJornadaCompleta?: number;
  /**
   * Mejor sueldo del semestre (rem + no-rem) para el empleado.
   * Usado por los conceptos con `baseColumna = 'mejor_div25'` (vacaciones no gozadas — concepto 401)
   * y `baseColumna = 'sac_normal'` / `'sac_proporcional'` (SAC conceptos 41/42).
   */
  mejorSueldoSemestre?: number;
  /**
   * Días trabajados en el semestre (calculados desde fechaIngreso).
   * 180 = semestre completo. Usado por concepto 42 (SAC proporcional, base 'sac_proporcional').
   */
  diasSemestre?: number;
  /**
   * Bruto del período anterior (haberes + no remunerativo del último recibo del empleado).
   * Usado por conceptos con baseColumna = 'bruto_anterior_div25' (vacaciones — conceptos 51 y 401).
   * Si es 0, se muestra un aviso en la fila del concepto.
   */
  brutoMesAnterior?: number;
  /** Catálogo para "Agregar concepto" (toda la plantilla). Por defecto coincide con `conceptos`. */
  catalogoCompleto?: ConceptoImportado[];
  onAddConcepto?: (codigos: string[]) => void;
  onRemoveConcepto?: (codigo: string) => void;
  /** Recalcula montos desde `basico` cuando el usuario activa escala vigente en modo copia. */
  recalculateWithBasico?: boolean;
}

export function TablaReciboSos({
  recibo,
  conceptos,
  onChange,
  variant = 'importado',
  basico,
  firmaEmpleadorUrl,
  activeCodigos: activeCodigosProp,
  catalogoCompleto: catalogoCompletoProp,
  onAddConcepto,
  onRemoveConcepto,
  recalculateWithBasico = false,
  basicoJornadaCompleta = 0,
  mejorSueldoSemestre = 0,
  diasSemestre = 180,
  brutoMesAnterior = 0,
}: TablaReciboSosProps) {
  const catalogoCompleto = catalogoCompletoProp ?? conceptos;
  const initialEdits = useMemo<EditsMap>(() => {
    const map: EditsMap = {};
    for (const c of conceptos) {
      map[c.codigo] = {
        monto: c.monto ?? '',
        montoFijo: '',
        cantidad: c.cantidad ?? '',
        porcentaje: c.porcentaje ?? (c.pctFijo != null ? String(c.pctFijo) : ''),
        importeConceptoNumero: c.importeConceptoNumero ?? '',
        importe: c.importe ?? '',
        importeMinimo: c.importeMinimo ?? '',
        importeMaximo: c.importeMaximo ?? '',
        memo: c.memo ?? '',
      };
    }
    return map;
  }, [conceptos]);

  const [edits, setEdits] = useState<EditsMap>(initialEdits);

  // Ref con la tasa unitaria implícita por código (basico / divCantidad).
  // Se actualiza cuando cambia el básico o los conceptos, sin causar re-renders.
  const implicitBaseRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = {};
    const b = basico ?? 0;
    if (b > 0) {
      for (const c of conceptos) {
        const bc = c.baseColumna;
        if (bc === 'sueldo' || bc === 'sueldoLegajo') {
          map[c.codigo] = b / Math.max(1, c.divCantidad ?? 1);
        } else if (bc === 'valHora') {
          const divHs = c.divHsNorm ? 200 : 1;
          map[c.codigo] = b / divHs / Math.max(1, c.divCantidad ?? 1);
        }
      }
    }
    implicitBaseRef.current = map;
  }, [basico, conceptos]);

  // Ref estable de conceptos para acceder dentro del updater de setEdits sin recrear callbacks.
  const conceptosRef = useRef(conceptos);
  useEffect(() => { conceptosRef.current = conceptos; }, [conceptos]);

  const codigosActivosSet = useMemo(() => {
    if (activeCodigosProp) return activeCodigosProp;
    return new Set(conceptos.map((c) => c.codigo));
  }, [activeCodigosProp, conceptos]);

  // Ref estable de activeCodigos para acceder dentro del updater de setEdits.
  const activeCodigosRef = useRef<Set<string>>(new Set());
  useEffect(() => { activeCodigosRef.current = codigosActivosSet; }, [codigosActivosSet]);

  const basicoEscalaRef = useRef(basico ?? 0);
  useEffect(() => { basicoEscalaRef.current = basico ?? 0; }, [basico]);

  const osBaseRef = useRef(basicoJornadaCompleta);
  useEffect(() => { osBaseRef.current = basicoJornadaCompleta; }, [basicoJornadaCompleta]);

  const mejorSueldoRef = useRef(mejorSueldoSemestre);
  useEffect(() => { mejorSueldoRef.current = mejorSueldoSemestre; }, [mejorSueldoSemestre]);

  const diasSemestreRef = useRef(diasSemestre);
  useEffect(() => { diasSemestreRef.current = diasSemestre; }, [diasSemestre]);

  const brutoMesAnteriorRef = useRef(brutoMesAnterior);
  useEffect(() => { brutoMesAnteriorRef.current = brutoMesAnterior; }, [brutoMesAnterior]);

  // Cuando basicoEscala carga por primera vez (async), calcular montos de conceptos con base
  // implícita que todavía tienen monto vacío (recibo nuevo desde cero).
  // También re-ejecuta cuando activeCodigosProp cambia: puede ocurrir que basico llegue antes
  // de que la plantilla cargue y los conceptos activos estén vacíos, en cuyo caso la primera
  // ejecución no hace nada; cuando los códigos activos se populan hay que recalcular.
  // Debe correr DESPUÉS de los effects que actualizan implicitBaseRef y activeCodigosRef
  // (declarados antes de este effect, mismo orden de declaración garantiza el orden).
  useEffect(() => {
    const b = basico ?? 0;
    if (b <= 0) return;
    setEdits((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const c of conceptosRef.current) {
        if (!activeCodigosRef.current.has(c.codigo)) continue;
        const row = next[c.codigo] ?? EMPTY_EDIT_ROW;
        const currentMonto = parseDecimalSos(row.monto);
        if (currentMonto !== null && currentMonto !== 0) continue; // ya tiene valor, no pisar
        const implicitBase = implicitBaseRef.current[c.codigo];
        if (implicitBase == null || implicitBase <= 0) continue;
        const hasPct = (row.porcentaje ?? '').trim() !== '';
        const noUsaPct = c.tienePct === false;
        if (!hasPct && !noUsaPct) continue;
        const rowParaFormula = {
          ...row,
          importe: String(implicitBase),
          ...(noUsaPct && !hasPct ? { porcentaje: '100' } : {}),
        };
        if (!canApplyFormula(rowParaFormula)) continue;
        const m = montoLiquidadoDesdeEditsSos(rowParaFormula, { forceFormula: true }).toFixed(2);
        next = { ...next, [c.codigo]: { ...row, importe: String(implicitBase), monto: m } };
        changed = true;
      }
      if (!changed) return prev;
      return applySubtotalCascade(next, conceptosRef.current, activeCodigosRef.current, osBaseRef.current, mejorSueldoRef.current, diasSemestreRef.current, brutoMesAnteriorRef.current, basicoEscalaRef.current);
    });
  // activeCodigosProp como dep: si basico llegó antes de que los conceptos estén activos,
  // este effect vuelve a ejecutarse cuando la plantilla carga y los códigos se populan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basico, activeCodigosProp]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current?.(edits);
  }, [edits]);

  // Inicializar edits para conceptos recién agregados sin sobreescribir los existentes
  useEffect(() => {
    setEdits((prev) => {
      const newEntries: EditsMap = {};
      for (const c of conceptos) {
        if (!prev[c.codigo]) {
          newEntries[c.codigo] = {
            monto: c.monto ?? '',
            montoFijo: '',
            cantidad: c.cantidad ?? '',
            porcentaje: c.porcentaje ?? (c.pctFijo != null ? String(c.pctFijo) : ''),
            importeConceptoNumero: c.importeConceptoNumero ?? '',
            importe: c.importe ?? '',
            importeMinimo: c.importeMinimo ?? '',
            importeMaximo: c.importeMaximo ?? '',
            memo: c.memo ?? '',
          };
        }
      }
      if (Object.keys(newEntries).length === 0) return prev;
      return { ...prev, ...newEntries };
    });
  }, [conceptos]);

  // Recalcula montos que dependen del básico vigente cuando se solicita explícitamente.
  useEffect(() => {
    if (!recalculateWithBasico) return;
    if (!basico || basico <= 0) return;

    const filasParaRecalc = activeCodigosProp
      ? conceptos.filter((c) => activeCodigosProp.has(c.codigo))
      : conceptos;

    setEdits((prev) => {
      let changed = false;
      const next: EditsMap = { ...prev };

      for (const c of filasParaRecalc) {
        const current = next[c.codigo] ?? EMPTY_EDIT_ROW;
        const hasExplicitPorcentaje = (current.porcentaje ?? '').trim() !== '';
        if (!hasExplicitPorcentaje) continue;

        const bc = c.baseColumna;
        let implicitBase: number | null = null;
        if (bc === 'sueldo' || bc === 'sueldoLegajo') {
          implicitBase = basico / Math.max(1, c.divCantidad ?? 1);
        } else if (bc === 'valHora') {
          const divHs = c.divHsNorm ? 200 : 1;
          implicitBase = basico / divHs / Math.max(1, c.divCantidad ?? 1);
        }
        if (implicitBase == null || !Number.isFinite(implicitBase) || implicitBase <= 0) {
          continue;
        }

        // En modo "recalcular con escala vigente" la base implícita del período
        // debe prevalecer sobre valores heredados del recibo copiado.
        const rowParaFormula = {
          ...current,
          importeConceptoNumero: '',
          importe: String(implicitBase),
        };

        if (!canApplyFormula(rowParaFormula)) continue;

        const nuevoMonto = montoLiquidadoDesdeEditsSos(rowParaFormula, {
          forceFormula: true,
        }).toFixed(2);

        if (
          (current.monto ?? '') !== nuevoMonto ||
          (current.importe ?? '') !== rowParaFormula.importe ||
          (current.importeConceptoNumero ?? '') !== ''
        ) {
          next[c.codigo] = {
            ...current,
            importeConceptoNumero: '',
            importe: rowParaFormula.importe,
            monto: nuevoMonto,
          };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [recalculateWithBasico, basico, conceptos, activeCodigosProp]);

  const conceptosVisibles = useMemo(() => {
    if (!activeCodigosProp) return conceptos;
    return conceptos.filter((c) => activeCodigosProp.has(c.codigo));
  }, [conceptos, activeCodigosProp]);

  const setField = useCallback(
    (editedCodigo: string, field: keyof EditsMap[string], value: string) => {
      setEdits((prev) => {
        const prevRow = prev[editedCodigo] ?? EMPTY_EDIT_ROW;
        const updated = { ...prevRow, [field]: value };

        // Edición directa del monto: guardar sin recalcular ni cascadear
        if (field === 'monto') return { ...prev, [editedCodigo]: updated };

        // Determinar si el concepto editado usa una base de subtotal (dinámica)
        const editedConcepto = conceptosRef.current.find((c) => c.codigo === editedCodigo);
        const isSubBased = editedConcepto?.baseColumna != null &&
          SUB_BASES.has(editedConcepto.baseColumna);

        const hasExplicitPorcentaje = (updated.porcentaje ?? '').trim() !== '';
        // Para conceptos sin campo %, usar pct=100 implícitamente (fórmula: cantidad × importe)
        const conceptoNoUsaPct = editedConcepto?.tienePct === false;
        const rowParaCalculo = conceptoNoUsaPct && !hasExplicitPorcentaje
          ? { ...updated, porcentaje: '100' }
          : updated;
        const tieneBaseParaCalcular = hasExplicitPorcentaje || conceptoNoUsaPct;

        let newEdits: EditsMap = { ...prev, [editedCodigo]: updated };

        if (!isSubBased) {
          // Conceptos con base estática (sueldo, valHora, importe_fijo…)
          if (!tieneBaseParaCalcular) {
            newEdits = { ...newEdits, [editedCodigo]: { ...updated, monto: '' } };
          } else {
            const implicitBase = implicitBaseRef.current[editedCodigo];
            // Resolver Imp. N → monto del concepto referenciado
            const impNroStr = (updated.importeConceptoNumero ?? '').trim();
            const resolvedImpN = impNroStr ? parseDecimalSos(prev[impNroStr]?.monto) : null;

            let rowParaFormula: typeof rowParaCalculo;
            if (resolvedImpN !== null) {
              rowParaFormula = { ...rowParaCalculo, importe: String(resolvedImpN), importeConceptoNumero: '' };
            } else if (
              implicitBase != null &&
              (rowParaCalculo.importe === '' || rowParaCalculo.importe == null) &&
              (rowParaCalculo.importeConceptoNumero === '' || rowParaCalculo.importeConceptoNumero == null)
            ) {
              rowParaFormula = { ...rowParaCalculo, importe: String(implicitBase) };
            } else {
              rowParaFormula = rowParaCalculo;
            }

            if (canApplyFormula(rowParaFormula)) {
              newEdits = {
                ...newEdits,
                [editedCodigo]: {
                  ...updated,
                  monto: montoLiquidadoDesdeEditsSos(rowParaFormula, { forceFormula: true }).toFixed(2),
                },
              };
            } else if (!conceptoNoUsaPct && (field === 'cantidad' || field === 'porcentaje')) {
              const prevMonto = parseDecimalSos(prevRow.monto);
              if (prevMonto !== null && prevMonto !== 0) {
                const prevFactor =
                  field === 'cantidad'
                    ? (parseDecimalSos(prevRow.cantidad) ?? 0)
                    : (parseDecimalSos(prevRow.porcentaje) ?? 0);
                const newFactor = parseDecimalSos(value);
                if (prevFactor !== 0 && newFactor !== null && newFactor !== 0) {
                  const scaled = prevMonto * (newFactor / prevFactor);
                  newEdits = {
                    ...newEdits,
                    [editedCodigo]: { ...updated, monto: (Math.round(scaled * 100) / 100).toFixed(2) },
                  };
                }
              }
            }
          }
        } else {
          // Concepto con base de subtotal: si no tiene % ni es no-pct, limpiar monto.
          // El monto se calcula en la cascada de abajo.
          if (!tieneBaseParaCalcular) {
            newEdits = { ...newEdits, [editedCodigo]: { ...updated, monto: '' } };
          }
        }

        // Propagar cambio de monto a conceptos que referencian editedCodigo vía Imp. N
        const nuevoMontoRef = parseDecimalSos(newEdits[editedCodigo]?.monto);
        if (nuevoMontoRef !== null) {
          for (const dep of conceptosRef.current) {
            if (dep.codigo === editedCodigo) continue;
            const depEdit = newEdits[dep.codigo] ?? EMPTY_EDIT_ROW;
            if ((depEdit.importeConceptoNumero ?? '').trim() !== editedCodigo) continue;

            const depNoUsaPct = dep.tienePct === false;
            const depHasPct = (depEdit.porcentaje ?? '').trim() !== '';
            if (!depHasPct && !depNoUsaPct) continue;

            const depRow = {
              ...depEdit,
              importe: String(nuevoMontoRef),
              importeConceptoNumero: '',
              ...(depNoUsaPct && !depHasPct ? { porcentaje: '100' } : {}),
            };

            if (canApplyFormula(depRow)) {
              newEdits = {
                ...newEdits,
                [dep.codigo]: {
                  ...depEdit,
                  monto: montoLiquidadoDesdeEditsSos(depRow, { forceFormula: true }).toFixed(2),
                },
              };
            }
          }
        }

        return applySubtotalCascade(newEdits, conceptosRef.current, activeCodigosRef.current, osBaseRef.current, mejorSueldoRef.current, diasSemestreRef.current, brutoMesAnteriorRef.current, basicoEscalaRef.current);
      });
    },
    []
  );

  const conceptosPorSeccion = useMemo(() => {
    const groups: Partial<Record<SeccionSos, ConceptoImportado[]>> = {};
    for (const c of conceptosVisibles) {
      const num = parseInt(c.codigo, 10);
      if (isNaN(num)) continue;
      const seccion = getSeccionSos(num);
      if (!seccion) continue;
      if (!groups[seccion]) groups[seccion] = [];
      groups[seccion]!.push(c);
    }
    return groups;
  }, [conceptosVisibles]);

  // Re-ejecutar cascada cuando cambian los conceptos activos (ej: usuario agrega 501/502/503)
  // para que conceptos subtotal-based con % pre-cargado calculen su monto automáticamente.
  useEffect(() => {
    activeCodigosRef.current = codigosActivosSet;
    setEdits((prev) => applySubtotalCascade(prev, conceptosRef.current, codigosActivosSet, osBaseRef.current, mejorSueldoRef.current, diasSemestreRef.current, brutoMesAnteriorRef.current, basicoEscalaRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigosActivosSet]);

  const sumaRango = useCallback(
    (min: number, max: number): number => {
      let total = 0;
      for (const [cod, vals] of Object.entries(edits)) {
        const n = parseInt(cod, 10);
        if (!isNaN(n) && n >= min && n <= max && codigosActivosSet.has(cod)) {
          total += toNum(vals.monto);
        }
      }
      return total;
    },
    [edits, codigosActivosSet]
  );

  const sectionTotal = useCallback(
    (s: SeccionSos): number => {
      const cfg = SECCIONES_SOS[s];
      return sumaRango(cfg.rangoMin, cfg.rangoMax);
    },
    [sumaRango]
  );

  const totales = useMemo(() => {
    const haberes =
      sectionTotal('haberes') + sectionTotal('liquidacion_final') + sectionTotal('decretos');
    const descuentos = sectionTotal('descuentos');
    const retenciones =
      sectionTotal('retenciones') + sectionTotal('retenciones_no_rem');
    const noRemunerativo = sectionTotal('no_remunerativo');
    const neto = haberes - descuentos - retenciones + noRemunerativo;
    const redondeo = neto > 0 && neto % 1 > 0.001 ? Math.ceil(neto) - neto : 0;
    const netoRedondeado = redondeo > 0 ? Math.ceil(neto) : neto;
    return { haberes, descuentos, retenciones, noRemunerativo, neto, redondeo, netoRedondeado };
  }, [sectionTotal]);

  const guardrails = useMemo(() => {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const c of conceptosVisibles) {
      const n = parseInt(c.codigo, 10);
      if (isNaN(n)) continue;
      const row = edits[c.codigo] ?? EMPTY_EDIT_ROW;

      const pct = parseDecimalSos(row.porcentaje);
      const imp = parseDecimalSos(row.importe);
      const impN = parseDecimalSos(row.importeConceptoNumero);
      const impMin = parseDecimalSos(row.importeMinimo);
      const impMax = parseDecimalSos(row.importeMaximo);

      if (pct != null && pct < 0) {
        errors.push(`Concepto ${c.codigo}: porcentaje negativo no permitido.`);
      } else if (pct != null && pct > MAX_PCT_WARN) {
        warnings.push(`Concepto ${c.codigo}: porcentaje muy alto (${pct}%).`);
      }

      if (impMin != null && impMax != null && impMin > impMax) {
        errors.push(`Concepto ${c.codigo}: importe mínimo es mayor que importe máximo.`);
      }

      if (
        (isCodeInRange(n, 511, 520) || isCodeInRange(n, 551, 562)) &&
        (pct ?? 0) > 0 &&
        (imp == null || imp === 0)
      ) {
        warnings.push(
          `Concepto ${c.codigo}: para retención sobre base dinámica, usar importe=1 evita resultado en cero.`
        );
      }

      if (
        (isCodeInRange(n, 511, 520) || isCodeInRange(n, 551, 562)) &&
        (pct ?? 0) > 0 &&
        (imp ?? 0) > 1
      ) {
        warnings.push(
          `Concepto ${c.codigo}: posible triple-campo (base × % × importe). Revisar importe=1.`
        );
      }

      if (
        (isCodeInRange(n, 511, 520) || isCodeInRange(n, 551, 562)) &&
        impN != null &&
        impN > 0 &&
        (pct ?? 0) > 0
      ) {
        warnings.push(
          `Concepto ${c.codigo}: Imp.N + % en base dinámica puede distorsionar el cálculo.`
        );
      }

      if (n === 42 && (parseDecimalSos(row.cantidad) ?? 0) > 0) {
        warnings.push(
          'Concepto 42 (SAC proporcional): el valor final puede recalcularse en servidor al guardar.'
        );
      }
    }

    return { warnings, errors };
  }, [conceptosVisibles, edits]);

  const seccionesAMostrar = onAddConcepto
    ? ORDEN_SECCIONES
    : ORDEN_SECCIONES.filter((s) => (conceptosPorSeccion[s]?.length ?? 0) > 0);

  if (seccionesAMostrar.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {variant === 'manual'
          ? 'No hay conceptos SOS vinculados a este perfil (concepto_sos_profile), o ninguno tiene código de fila 1–699. Revisá la configuración del perfil en ARCA.'
          : 'No hay conceptos en el último recibo importado.'}
      </p>
    );
  }

  const pieNota =
    variant === 'manual'
      ? onAddConcepto
        ? 'Usá el botón "+" de cada sección para agregar los conceptos que necesites. Completá los valores y guardá el recibo.'
        : 'Plantilla según conceptos SOS del perfil (mismos códigos de fila que en el import). Completá montos en la columna que corresponda; al Calcular reemplazan la fórmula si el concepto salarial tiene el mismo número SOS.'
      : 'Datos del último recibo importado de SOS Contador — los campos son editables';

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {/* `recibo.periodo` puede venir del server como date ('YYYY-MM-01'). */}
        Período <strong>{dateAPeriodo(recibo.periodo)}</strong> · Tipo <strong>{tipoReciboLabel(recibo.tipo)}</strong> · {pieNota}
      </p>
      {guardrails.errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          {guardrails.errors.slice(0, 4).map((msg) => (
            <p key={`err-${msg}`}>{msg}</p>
          ))}
        </div>
      )}
      {guardrails.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {guardrails.warnings.slice(0, 4).map((msg) => (
            <p key={`warn-${msg}`}>{msg}</p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border text-[10px]">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-100 text-slate-600 border-b text-[10px] divide-x divide-slate-300">
              <th className="px-1 py-1.5 text-center w-[4%]">#</th>
              <th className="px-1 py-1.5 text-left w-[18%]">Concepto</th>
              <th className="px-1 py-1.5 text-right w-[7%] !border-l-2 !border-l-slate-400">Cantidad</th>
              <th className="px-1 py-1.5 text-right w-[5%]">%</th>
              <th className="px-1 py-1.5 text-right w-[8%]">Imp.&nbsp;N</th>
              <th className="px-1 py-1.5 text-right w-[8%]">Importe</th>
              <th className="px-1 py-1.5 text-right w-[7%]">Imp.&nbsp;mín.</th>
              <th className="px-1 py-1.5 text-right w-[7%]">Imp.&nbsp;máx.</th>
              <th className="px-1 py-1.5 text-right w-[9%] !border-l-2 !border-l-slate-600">Haberes</th>
              <th className="px-1 py-1.5 text-right w-[9%]">Desc.</th>
              <th className="px-1 py-1.5 text-right w-[9%]">Reten.</th>
              <th className="px-1 py-1.5 text-right w-[9%]">No&nbsp;Rem.</th>
            </tr>
          </thead>
          <tbody>
            {seccionesAMostrar.map((seccion) => (
              <TableSection
                key={seccion}
                seccion={seccion}
                cfg={SECCIONES_SOS[seccion]}
                filas={conceptosPorSeccion[seccion] ?? []}
                edits={edits}
                setField={setField}
                sectionTotal={sectionTotal}
                catalogoCompleto={catalogoCompleto}
                codigosActivos={codigosActivosSet}
                onAddConcepto={onAddConcepto}
                onRemoveConcepto={onRemoveConcepto}
                brutoMesAnterior={brutoMesAnterior}
              />
            ))}
          </tbody>

          <tfoot>
            <tr className="bg-slate-200 border-t-2 border-slate-500 font-bold text-[10px] divide-x divide-slate-400">
              <td className="px-2 py-1.5" />
              <td
                className="px-2 py-1.5 text-right text-slate-700 uppercase tracking-wide"
                colSpan={7}
              >
                Totales
              </td>
              <td className="px-2 py-1.5 text-right text-slate-900 !border-l-2 !border-l-slate-600">
                {fmtArsSign(totales.haberes)}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-900">
                {fmtArsSign(totales.descuentos)}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-900">
                {fmtArsSign(totales.retenciones)}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-900">
                {fmtArsSign(totales.noRemunerativo)}
              </td>
            </tr>
            {totales.redondeo > 0 && (
              <tr className="bg-amber-50 border-t border-amber-300 text-[10px]">
                <td className="px-2 py-1" />
                <td
                  colSpan={7}
                  className="px-2 py-1 text-right text-amber-800 italic"
                >
                  Redondeo ↑ entero
                </td>
                <td colSpan={3} className="px-2 py-1 !border-l-2 !border-l-slate-600" />
                <td className="px-2 py-1 text-right text-amber-800 font-medium">
                  +{fmtArs(totales.redondeo)}
                </td>
              </tr>
            )}
            <tr className="bg-slate-300 font-bold">
              <td colSpan={8} className="px-2 py-1.5" />
              <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-slate-900 border-l-2 border-l-slate-600">
                Neto a cobrar: ${'\u202f'}
                {fmtArs(totales.netoRedondeado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sección de firmas */}
      <div className="mt-4 grid grid-cols-2 gap-6 border-t pt-4 text-[11px] text-muted-foreground">
        <div className="flex flex-col">
          {firmaEmpleadorUrl && (
            <img
              src={firmaEmpleadorUrl}
              alt="Firma del empleador"
              className="h-16 max-w-[200px] object-contain mb-2"
            />
          )}
          <div className="mt-auto border-t border-slate-400 pt-1 font-medium text-slate-600">
            Firma y sello del empleador
          </div>
        </div>
        <div className="flex flex-col">
          <div className="mt-auto border-t border-slate-400 pt-1 font-medium text-slate-600">
            Firma del trabajador / Acuse de recibo
          </div>
        </div>
      </div>
    </div>
  );
}
