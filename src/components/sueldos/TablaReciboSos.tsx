'use client';

import {
  Fragment,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Plus } from 'lucide-react';
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
    cantidad: string;
    porcentaje: string;
    importeConceptoNumero: string;
    importe: string;
    importeMinimo: string;
    importeMaximo: string;
  }
>;

const EMPTY_EDIT_ROW: EditsMap[string] = {
  monto: '',
  cantidad: '',
  porcentaje: '',
  importeConceptoNumero: '',
  importe: '',
  importeMinimo: '',
  importeMaximo: '',
};

/** Bases de cálculo dinámicas (dependen de subtotales acumulados de otras filas). */
const SUB_BASES = new Set([
  'sub1_9', 'sub1_19', 'sub1_26', 'sub1_39', 'sub1_199', 'sub411_469',
  'sub1_199_plus_411_469',
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

function isCodeInRange(code: number, min: number, max: number): boolean {
  return code >= min && code <= max;
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

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
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      className="w-full bg-white border border-slate-200 rounded px-1 py-1 text-[10px] text-right focus:bg-yellow-50 focus:ring-1 focus:ring-yellow-300 focus:border-yellow-300 outline-none"
    />
  );
}

// ---------------------------------------------------------------------------
// Add concept button
// ---------------------------------------------------------------------------

function AgregarConceptoButton({
  seccion,
  catalogo,
  codigosActivos,
  onAdd,
}: {
  seccion: SeccionSos;
  catalogo: ConceptoImportado[];
  codigosActivos: Set<string>;
  onAdd: (codigo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const cfg = SECCIONES_SOS[seccion];

  const disponibles = catalogo.filter((c) => {
    const num = parseInt(c.codigo, 10);
    if (isNaN(num) || num < cfg.rangoMin || num > cfg.rangoMax) return false;
    if (codigosActivos.has(c.codigo)) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      return c.codigo.includes(q) || (c.nombre ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setBusqueda('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Agregar concepto
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
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
            disponibles.map((c) => (
              <button
                key={c.codigo}
                type="button"
                className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-100"
                onClick={() => {
                  onAdd(c.codigo);
                  setOpen(false);
                  setBusqueda('');
                }}
              >
                <span className="w-6 shrink-0 tabular-nums text-slate-400">{c.codigo}</span>
                <span>{c.nombre ?? `Concepto ${c.codigo}`}</span>
              </button>
            ))
          )}
        </div>
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
  onAddConcepto?: (codigo: string) => void;
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
                {c.nombre ?? `Concepto ${c.codigo}`}
                {c.codigoAfip && c.codigoAfip !== '0' && (
                  <span className="ml-1 text-slate-400 font-normal">[{c.codigoAfip}]</span>
                )}
              </td>
              <td className="px-1 py-1.5 !border-l-2 !border-l-slate-400">
                {c.tieneCantidad !== false
                  ? <EditableCell value={edit?.cantidad ?? ''} onChange={(v) => setField(c.codigo, 'cantidad', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {c.pctFijo != null
                  ? <span className="block w-full px-1 text-right tabular-nums text-muted-foreground">{c.pctFijo}</span>
                  : c.tienePct !== false
                    ? <EditableCell value={edit?.porcentaje ?? ''} onChange={(v) => setField(c.codigo, 'porcentaje', v)} />
                    : DASH}
              </td>
              <td className="px-1 py-1.5">
                {c.tieneImpConceptoNro !== false
                  ? <EditableCell value={edit?.importeConceptoNumero ?? ''} onChange={(v) => setField(c.codigo, 'importeConceptoNumero', v)} />
                  : DASH}
              </td>
              <td className="px-1 py-1.5">
                {c.tieneImporte !== false
                  ? <EditableCell value={edit?.importe ?? ''} onChange={(v) => setField(c.codigo, 'importe', v)} />
                  : DASH}
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
              <td className="px-2 py-1.5 text-right tabular-nums !border-l-2 !border-l-slate-600">
                {isHaberes && toNum(edit?.monto) !== 0
                  ? fmtArsSign(toNum(edit?.monto))
                  : DASH}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {isDesc && toNum(edit?.monto) !== 0
                  ? fmtArsSign(toNum(edit?.monto))
                  : DASH}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {isReten && toNum(edit?.monto) !== 0
                  ? fmtArsSign(toNum(edit?.monto))
                  : DASH}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {isNoRem && toNum(edit?.monto) !== 0
                  ? fmtArsSign(toNum(edit?.monto))
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
  /** Catálogo completo SOS para los popovers de "Agregar concepto". */
  catalogoCompleto?: ConceptoImportado[];
  /** Callback para agregar un concepto activo por código. */
  onAddConcepto?: (codigo: string) => void;
}

export function TablaReciboSos({
  recibo,
  conceptos,
  onChange,
  variant = 'importado',
  basico,
  firmaEmpleadorUrl,
  catalogoCompleto,
  onAddConcepto,
}: TablaReciboSosProps) {
  const initialEdits = useMemo<EditsMap>(() => {
    const map: EditsMap = {};
    for (const c of conceptos) {
      map[c.codigo] = {
        monto: c.monto ?? '',
        cantidad: c.cantidad ?? '',
        porcentaje: c.porcentaje ?? (c.pctFijo != null ? String(c.pctFijo) : ''),
        importeConceptoNumero: c.importeConceptoNumero ?? '',
        importe: c.importe ?? '',
        importeMinimo: c.importeMinimo ?? '',
        importeMaximo: c.importeMaximo ?? '',
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
            cantidad: c.cantidad ?? '',
            porcentaje: c.porcentaje ?? (c.pctFijo != null ? String(c.pctFijo) : ''),
            importeConceptoNumero: c.importeConceptoNumero ?? '',
            importe: c.importe ?? '',
            importeMinimo: c.importeMinimo ?? '',
            importeMaximo: c.importeMaximo ?? '',
          };
        }
      }
      if (Object.keys(newEntries).length === 0) return prev;
      return { ...prev, ...newEntries };
    });
  }, [conceptos]);

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

        let newEdits: EditsMap = { ...prev, [editedCodigo]: updated };

        if (!isSubBased) {
          // Conceptos con base estática (sueldo, valHora, importe_fijo…)
          if (!hasExplicitPorcentaje) {
            newEdits = { ...newEdits, [editedCodigo]: { ...updated, monto: '' } };
          } else {
            const implicitBase = implicitBaseRef.current[editedCodigo];
            const rowParaFormula =
              implicitBase != null &&
              (updated.importe === '' || updated.importe == null) &&
              (updated.importeConceptoNumero === '' || updated.importeConceptoNumero == null)
                ? { ...updated, importe: String(implicitBase) }
                : updated;

            if (canApplyFormula(rowParaFormula)) {
              newEdits = {
                ...newEdits,
                [editedCodigo]: {
                  ...updated,
                  monto: montoLiquidadoDesdeEditsSos(rowParaFormula, { forceFormula: true }).toFixed(2),
                },
              };
            } else if (field === 'cantidad' || field === 'porcentaje') {
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
          // Concepto con base de subtotal: si no tiene %, limpiar monto.
          // El monto se calcula en la cascada de abajo.
          if (!hasExplicitPorcentaje) {
            newEdits = { ...newEdits, [editedCodigo]: { ...updated, monto: '' } };
          }
        }

        // ── Cascada de subtotales ────────────────────────────────────────────
        // Para los conceptos cuya base es un subtotal acumulado (sub1_9, sub1_19,
        // etc.), recalcular en orden ascendente de N° SOS para que cada uno use
        // el subtotal correcto de los anteriores.
        const subTotals: Record<string, number> = {
          sub1_9: 0, sub1_19: 0, sub1_26: 0,
          sub1_39: 0, sub1_199: 0, sub411_469: 0,
        };

        const sortedConcepts = [...conceptosRef.current].sort(
          (a, b) => (parseInt(a.codigo, 10) || 9999) - (parseInt(b.codigo, 10) || 9999)
        );

        for (const c of sortedConcepts) {
          const n = parseInt(c.codigo, 10);
          if (isNaN(n)) continue;

          const row = newEdits[c.codigo] ?? EMPTY_EDIT_ROW;
          let effectiveMonto = toNum(row.monto);

          const bc = c.baseColumna;
          if (bc != null && SUB_BASES.has(bc)) {
            const hasPct = (row.porcentaje ?? '').trim() !== '';
            if (hasPct) {
              // Calcular la base según el tipo (normal o combinada H+NR)
              const subBase =
                bc === 'sub1_199_plus_411_469'
                  ? (subTotals['sub1_199'] ?? 0) + (subTotals['sub411_469'] ?? 0)
                  : (subTotals[bc] ?? 0);

              if (subBase > 0) {
                const pctVal = parseDecimalSos(row.porcentaje) ?? 0;
                // Si el concepto no tiene campo cantidad, usar 1 como multiplicador.
                const cantNum =
                  !c.tieneCantidad && (row.cantidad ?? '') === ''
                    ? 1
                    : (parseDecimalSos(row.cantidad) ?? 1);
                // SOS triple-campo: importe actúa como multiplicador (bug verificado).
                // Con importe=1 (workaround) → subBase × pct/100 × 1 = correcto.
                // Con importe vacío/sin campo → multiplicador implícito = 1.
                const imp =
                  c.tieneImporte !== false && (row.importe ?? '').trim() !== ''
                    ? (parseDecimalSos(row.importe) ?? 1)
                    : 1;

                let raw = subBase * (pctVal / 100) * imp * cantNum;

                const impMin = parseDecimalSos(row.importeMinimo);
                const impMax = parseDecimalSos(row.importeMaximo);
                if (impMin !== null && raw < impMin) raw = impMin;
                if (impMax !== null && raw > impMax) raw = impMax;

                effectiveMonto = Math.round(raw * 100) / 100;
                newEdits = {
                  ...newEdits,
                  [c.codigo]: { ...row, monto: effectiveMonto.toFixed(2) },
                };
              }
            }
          }

          // Acumular subtotales para los conceptos siguientes
          if (n >= 1 && n <= 199) {
            subTotals['sub1_199'] += effectiveMonto;
            if (n <= 9) subTotals['sub1_9'] += effectiveMonto;
            if (n <= 19) subTotals['sub1_19'] += effectiveMonto;
            if (n <= 26) subTotals['sub1_26'] += effectiveMonto;
            if (n <= 39) subTotals['sub1_39'] += effectiveMonto;
          } else if (n >= 411 && n <= 469) {
            subTotals['sub411_469'] += effectiveMonto;
          }
        }

        return newEdits;
      });
    },
    []
  );

  const conceptosPorSeccion = useMemo(() => {
    const groups: Partial<Record<SeccionSos, ConceptoImportado[]>> = {};
    for (const c of conceptos) {
      const num = parseInt(c.codigo, 10);
      if (isNaN(num)) continue;
      const seccion = getSeccionSos(num);
      if (!seccion) continue;
      if (!groups[seccion]) groups[seccion] = [];
      groups[seccion]!.push(c);
    }
    return groups;
  }, [conceptos]);

  const codigosActivosSet = useMemo(
    () => new Set(conceptos.map((c) => c.codigo)),
    [conceptos]
  );

  const sumaRango = useCallback(
    (min: number, max: number): number => {
      let total = 0;
      for (const [cod, vals] of Object.entries(edits)) {
        const n = parseInt(cod, 10);
        if (!isNaN(n) && n >= min && n <= max) {
          total += toNum(vals.monto);
        }
      }
      return total;
    },
    [edits]
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
    return { haberes, descuentos, retenciones, noRemunerativo, neto };
  }, [sectionTotal]);

  const guardrails = useMemo(() => {
    const warnings: string[] = [];
    const errors: string[] = [];

    for (const c of conceptos) {
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
  }, [conceptos, edits]);

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
        Período <strong>{recibo.periodo}</strong> · Tipo <strong>{recibo.tipo}</strong> · {pieNota}
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
            <tr className="bg-slate-300 font-bold">
              <td colSpan={8} className="px-2 py-1.5" />
              <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-slate-900 border-l-2 border-l-slate-600">
                Neto a cobrar: ${'\u202f'}
                {fmtArs(totales.neto)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Sección de firmas */}
      <div className="mt-4 grid grid-cols-2 gap-6 border-t pt-4 text-[11px] text-muted-foreground">
        <div className="flex flex-col gap-2">
          {firmaEmpleadorUrl ? (
            <img
              src={firmaEmpleadorUrl}
              alt="Firma del empleador"
              className="h-16 max-w-[200px] object-contain"
            />
          ) : (
            <div className="h-10" />
          )}
          <div className="border-t border-slate-400 pt-1 font-medium text-slate-600">
            Firma y sello del empleador
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="h-10" />
          <div className="border-t border-slate-400 pt-1 font-medium text-slate-600">
            Firma del trabajador / Acuse de recibo
          </div>
        </div>
      </div>
    </div>
  );
}
