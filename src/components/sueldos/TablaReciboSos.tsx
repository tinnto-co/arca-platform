'use client';

import {
  Fragment,
  useMemo,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  SECCIONES_SOS,
  ORDEN_SECCIONES,
  SUBTOTALES_SOS,
  getSeccionSos,
  type SeccionSos,
  type SubtotalSosConfig,
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

type EditAction = {
  type: 'SET_FIELD';
  codigo: string;
  field: keyof EditsMap[string];
  value: string;
};

const EMPTY_EDIT_ROW: EditsMap[string] = {
  monto: '',
  cantidad: '',
  porcentaje: '',
  importeConceptoNumero: '',
  importe: '',
  importeMinimo: '',
  importeMaximo: '',
};

function editsReducer(state: EditsMap, action: EditAction): EditsMap {
  if (action.type !== 'SET_FIELD') return state;
  const prev = state[action.codigo] ?? EMPTY_EDIT_ROW;
  const updated = { ...prev, [action.field]: action.value };
  const finalRow =
    action.field === 'monto'
      ? updated
      : {
          ...updated,
          monto: montoLiquidadoDesdeEditsSos(updated, {
            forceFormula: true,
          }).toFixed(2),
        };
  return { ...state, [action.codigo]: finalRow };
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
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent border-0 outline-none focus:bg-yellow-50 focus:ring-1 focus:ring-yellow-300 rounded px-1 py-0.5 text-xs text-right min-w-[64px]"
    />
  );
}

// ---------------------------------------------------------------------------
// Subtotal row
// ---------------------------------------------------------------------------

function SubtotalRow({
  label,
  value,
  columna,
}: {
  label: string;
  value: number;
  columna: 'haberes' | 'descuentos' | 'retenciones' | 'no_remunerativo';
}) {
  return (
    <tr className="border-b bg-amber-50">
      <td className="px-2 py-0.5" />
      <td className="px-2 py-0.5 text-right italic text-slate-500 text-[11px]" colSpan={7}>
        {label}
      </td>
      <td className="px-2 py-0.5 text-right font-medium text-slate-700">
        {columna === 'haberes' ? fmtArsSign(value) : DASH}
      </td>
      <td className="px-2 py-0.5 text-right font-medium text-slate-700">
        {columna === 'descuentos' ? fmtArsSign(value) : DASH}
      </td>
      <td className="px-2 py-0.5 text-right font-medium text-slate-700">
        {columna === 'retenciones' ? fmtArsSign(value) : DASH}
      </td>
      <td className="px-2 py-0.5 text-right font-medium text-slate-700">
        {columna === 'no_remunerativo' ? fmtArsSign(value) : DASH}
      </td>
    </tr>
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
  subtotalesTrasConcepto: Record<string, SubtotalSosConfig[]>;
  subtotalesCalculados: Record<string, number>;
  sectionTotal: (s: SeccionSos) => number;
}

function TableSection({
  seccion,
  cfg,
  filas,
  edits,
  setField,
  subtotalesTrasConcepto,
  subtotalesCalculados,
  sectionTotal,
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
        const subtotalesAqui = subtotalesTrasConcepto[c.codigo] ?? [];

        return (
          <Fragment key={c.codigo}>
            <tr className="border-b hover:bg-slate-50">
              <td className="px-2 py-0.5 text-center text-slate-400 tabular-nums">{c.codigo}</td>
              <td className="px-2 py-0.5 font-medium">
                {c.nombre ?? `Concepto ${c.codigo}`}
                {c.codigoAfip && c.codigoAfip !== '0' && (
                  <span className="ml-1 text-slate-400 font-normal">[{c.codigoAfip}]</span>
                )}
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.cantidad ?? ''}
                  onChange={(v) => setField(c.codigo, 'cantidad', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.porcentaje ?? ''}
                  onChange={(v) => setField(c.codigo, 'porcentaje', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.importeConceptoNumero ?? ''}
                  onChange={(v) => setField(c.codigo, 'importeConceptoNumero', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.importe ?? ''}
                  onChange={(v) => setField(c.codigo, 'importe', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.importeMinimo ?? ''}
                  onChange={(v) => setField(c.codigo, 'importeMinimo', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                <EditableCell
                  value={edit?.importeMaximo ?? ''}
                  onChange={(v) => setField(c.codigo, 'importeMaximo', v)}
                />
              </td>
              <td className="px-1 py-0.5">
                {isHaberes ? (
                  <EditableCell
                    value={edit?.monto ?? ''}
                    onChange={(v) => setField(c.codigo, 'monto', v)}
                  />
                ) : (
                  DASH
                )}
              </td>
              <td className="px-1 py-0.5 text-right">
                {isDesc ? (
                  <EditableCell
                    value={edit?.monto ?? ''}
                    onChange={(v) => setField(c.codigo, 'monto', v)}
                  />
                ) : (
                  DASH
                )}
              </td>
              <td className="px-1 py-0.5 text-right">
                {isReten ? (
                  <EditableCell
                    value={edit?.monto ?? ''}
                    onChange={(v) => setField(c.codigo, 'monto', v)}
                  />
                ) : (
                  DASH
                )}
              </td>
              <td className="px-1 py-0.5 text-right">
                {isNoRem ? (
                  <EditableCell
                    value={edit?.monto ?? ''}
                    onChange={(v) => setField(c.codigo, 'monto', v)}
                  />
                ) : (
                  DASH
                )}
              </td>
            </tr>

            {/* Subtotal rows immediately after this concept */}
            {subtotalesAqui.map((st) => {
              const val = subtotalesCalculados[st.key] ?? 0;
              if (val === 0) return null;
              return (
                <SubtotalRow
                  key={st.key}
                  label={st.label}
                  value={val}
                  columna={cfg.columna}
                />
              );
            })}
          </Fragment>
        );
      })}

      {/* Section total row */}
      <tr className="border-b bg-slate-100">
        <td className="px-2 py-1" />
        <td
          className="px-2 py-1 text-right font-semibold text-slate-600 text-[11px] italic"
          colSpan={7}
        >
          Total {cfg.label}
        </td>
        <td
          className={`px-2 py-1 text-right font-semibold text-sm ${
            isHaberes ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
          {isHaberes ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td
          className={`px-2 py-1 text-right font-semibold text-sm ${
            isDesc ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
          {isDesc ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td
          className={`px-2 py-1 text-right font-semibold text-sm ${
            isReten ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
          {isReten ? fmtArsSign(sectionTotal(seccion)) : '—'}
        </td>
        <td
          className={`px-2 py-1 text-right font-semibold text-sm ${
            isNoRem ? 'text-slate-800' : 'text-slate-300'
          }`}
        >
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
}

export function TablaReciboSos({
  recibo,
  conceptos,
  onChange,
  variant = 'importado',
}: TablaReciboSosProps) {
  const initialEdits = useMemo<EditsMap>(() => {
    const map: EditsMap = {};
    for (const c of conceptos) {
      map[c.codigo] = {
        monto: c.monto ?? '',
        cantidad: c.cantidad ?? '',
        porcentaje: c.porcentaje ?? '',
        importeConceptoNumero: c.importeConceptoNumero ?? '',
        importe: c.importe ?? '',
        importeMinimo: c.importeMinimo ?? '',
        importeMaximo: c.importeMaximo ?? '',
      };
    }
    return map;
  }, [conceptos]);

  const [edits, dispatch] = useReducer(editsReducer, initialEdits);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current?.(edits);
  }, [edits]);

  const setField = useCallback(
    (codigo: string, field: keyof EditsMap[string], value: string) => {
      dispatch({ type: 'SET_FIELD', codigo, field, value });
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
    const descuentos = sectionTotal('descuentos') + sectionTotal('retenciones_no_rem');
    const retenciones = sectionTotal('retenciones');
    const noRemunerativo = sectionTotal('no_remunerativo');
    const neto = haberes - descuentos - retenciones + noRemunerativo;
    return { haberes, descuentos, retenciones, noRemunerativo, neto };
  }, [sectionTotal]);

  const subtotalesCalculados = useMemo(() => {
    const m: Record<string, number> = {};
    for (const st of SUBTOTALES_SOS) {
      m[st.key] = sumaRango(st.rangoMin, st.rangoMax);
    }
    return m;
  }, [sumaRango]);

  // Map: concept code → subtotals that appear right after it
  const subtotalesTrasConcepto = useMemo(() => {
    const result: Record<string, SubtotalSosConfig[]> = {};
    for (const st of SUBTOTALES_SOS) {
      let lastCode: string | null = null;
      let lastNum = -1;
      for (const c of conceptos) {
        const n = parseInt(c.codigo, 10);
        if (!isNaN(n) && n <= st.despuesDeCodigo && n > lastNum) {
          lastNum = n;
          lastCode = c.codigo;
        }
      }
      if (lastCode !== null) {
        if (!result[lastCode]) result[lastCode] = [];
        result[lastCode].push(st);
      }
    }
    return result;
  }, [conceptos]);

  const seccionesConDatos = ORDEN_SECCIONES.filter(
    (s) => (conceptosPorSeccion[s]?.length ?? 0) > 0
  );

  if (seccionesConDatos.length === 0) {
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
      ? 'Plantilla según conceptos SOS del perfil (mismos códigos de fila que en el import). Completá montos en la columna que corresponda; al Calcular reemplazan la fórmula si el concepto salarial tiene el mismo número SOS.'
      : 'Datos del último recibo importado de SOS Contador — los campos son editables';

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Período <strong>{recibo.periodo}</strong> · Tipo <strong>{recibo.tipo}</strong> · {pieNota}
      </p>

      <div className="overflow-x-auto rounded-md border text-xs">
        <table className="w-full border-collapse min-w-[1020px]">
          <thead>
            <tr className="bg-slate-100 text-slate-600 border-b text-[11px]">
              <th className="px-2 py-1.5 text-center w-10">#</th>
              <th className="px-2 py-1.5 text-left min-w-[200px]">Concepto</th>
              <th className="px-2 py-1.5 text-right w-20">Cantidad</th>
              <th className="px-2 py-1.5 text-right w-16">%</th>
              <th className="px-2 py-1.5 text-right w-24">Imp.&nbsp;Conc.&nbsp;N</th>
              <th className="px-2 py-1.5 text-right w-28">Importe</th>
              <th className="px-2 py-1.5 text-right w-24">Imp.&nbsp;mín.</th>
              <th className="px-2 py-1.5 text-right w-24">Imp.&nbsp;máx.</th>
              <th className="px-2 py-1.5 text-right w-28">Haberes</th>
              <th className="px-2 py-1.5 text-right w-28">Desc.</th>
              <th className="px-2 py-1.5 text-right w-28">Reten.</th>
              <th className="px-2 py-1.5 text-right w-28">No&nbsp;Rem.</th>
            </tr>
          </thead>
          <tbody>
            {seccionesConDatos.map((seccion) => (
              <TableSection
                key={seccion}
                seccion={seccion}
                cfg={SECCIONES_SOS[seccion]}
                filas={conceptosPorSeccion[seccion] ?? []}
                edits={edits}
                setField={setField}
                subtotalesTrasConcepto={subtotalesTrasConcepto}
                subtotalesCalculados={subtotalesCalculados}
                sectionTotal={sectionTotal}
              />
            ))}
          </tbody>

          <tfoot>
            <tr className="bg-slate-200 border-t-2 border-slate-400 font-bold text-[11px]">
              <td className="px-2 py-1.5" />
              <td
                className="px-2 py-1.5 text-right text-slate-700 uppercase tracking-wide"
                colSpan={7}
              >
                Totales
              </td>
              <td className="px-2 py-1.5 text-right text-slate-900">
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
              <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-slate-900">
                Neto a cobrar: ${'\u202f'}
                {fmtArs(totales.neto)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
