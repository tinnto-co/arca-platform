/**
 * Drawer de carga manual de conceptos (overlay propio, fiel al handoff).
 * Header y pie fijos; cuerpo scrolleable con cards por sección SOS:
 * filas horizontales compactas, "+ Agregar concepto" y total por sección.
 */
import { useEffect, useMemo, useState } from 'react';
import { PenLine, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type {
  ConceptoImportado,
  EditsMap,
} from '@/components/sueldos/TablaReciboSos';
import {
  getSeccionSos,
  ORDEN_SECCIONES,
  SECCIONES_SOS,
  type SeccionSos,
} from '@/components/sueldos/sos-concepto-map';
import { AutosaveChip, type AutosaveEstado } from './AutosaveChip';
import { fmtMonto, type BasicoInfo } from './types';

export interface ConceptosDrawerProps {
  open: boolean;
  onClose: () => void;
  empleadoNombre: string | null;
  periodoLabel: string;
  basicoInfo: BasicoInfo | null;
  /** Filas activas (plantilla + agregados) ya con defaults. */
  conceptos: ConceptoImportado[];
  activeCodigos: Set<string>;
  /** Catálogo completo para "+ Agregar concepto". */
  catalogo: ConceptoImportado[];
  /** Edits calculados (post-cascade) para mostrar montos; los inputs muestran el edit crudo si existe. */
  editsCalculados: EditsMap;
  edits: EditsMap;
  montoByCodigo: Record<string, number>;
  totales: {
    haberes: number;
    noRemunerativo: number;
    descuentos: number;
    retenciones: number;
    neto: number;
  };
  onEditField: (
    codigo: string,
    field: keyof EditsMap[string],
    value: string
  ) => void;
  onToggleConcepto: (codigo: string, activo: boolean) => void;
  autosaveEstado: AutosaveEstado;
  savedAt: Date | null;
}

/** Secciones que suman (haberes); el resto descuenta. */
const SECCIONES_HABER = new Set<SeccionSos>([
  'haberes',
  'liquidacion_final',
  'decretos',
  'no_remunerativo',
] as SeccionSos[]);

const inputCls =
  'h-[30px] px-2 rounded-[8px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-right text-[12.5px] tabular-nums text-[var(--arca-ink)] outline-none focus:border-[var(--arca-navy-600)] placeholder:text-[var(--arca-ink-4)] disabled:opacity-50';

function microLabel(text: string) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
      {text}
    </span>
  );
}

function numDe(codigo: string): number {
  return parseInt(codigo, 10);
}

export function ConceptosDrawer({
  open,
  onClose,
  empleadoNombre,
  periodoLabel,
  basicoInfo,
  conceptos,
  activeCodigos,
  catalogo,
  editsCalculados,
  edits,
  montoByCodigo,
  totales,
  onEditField,
  onToggleConcepto,
  autosaveEstado,
  savedAt,
}: ConceptosDrawerProps) {
  /** Montado mientras dura la animación de salida. */
  const [render, setRender] = useState(open);
  // Ajuste de estado durante el render (patrón React): abrir monta al instante.
  if (open && !render) setRender(true);
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => setRender(false), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  /** Filas con el editor de descripción desplegado. */
  const [memoAbiertos, setMemoAbiertos] = useState<Set<string>>(new Set());
  const toggleMemo = (codigo: string) => {
    setMemoAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const porSeccion = useMemo(() => {
    const map = new Map<SeccionSos, ConceptoImportado[]>();
    for (const s of ORDEN_SECCIONES) map.set(s, []);
    for (const c of conceptos) {
      if (!activeCodigos.has(c.codigo)) continue;
      const s = getSeccionSos(numDe(c.codigo));
      if (s) map.get(s)!.push(c);
    }
    for (const s of ORDEN_SECCIONES) {
      map.get(s)!.sort((a, b) => numDe(a.codigo) - numDe(b.codigo));
    }
    return map;
  }, [conceptos, activeCodigos]);

  const catalogoPorSeccion = useMemo(() => {
    const map = new Map<SeccionSos, ConceptoImportado[]>();
    for (const s of ORDEN_SECCIONES) map.set(s, []);
    for (const c of catalogo) {
      if (activeCodigos.has(c.codigo)) continue;
      const s = getSeccionSos(numDe(c.codigo));
      if (s) map.get(s)!.push(c);
    }
    for (const s of ORDEN_SECCIONES) {
      map.get(s)!.sort((a, b) => numDe(a.codigo) - numDe(b.codigo));
    }
    return map;
  }, [catalogo, activeCodigos]);

  if (!render) return null;

  const valorCampo = (
    codigo: string,
    field: 'cantidad' | 'porcentaje' | 'importe' | 'monto' | 'memo'
  ): string => {
    const e = edits[codigo];
    if (e && e[field] !== '') return e[field];
    return editsCalculados[codigo]?.[field] ?? '';
  };

  const totalRet = totales.descuentos + totales.retenciones;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Conceptos — carga manual"
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-[rgba(18,19,26,0.28)] motion-safe:duration-200',
          open
            ? 'motion-safe:animate-in motion-safe:fade-in'
            : 'motion-safe:animate-out motion-safe:fade-out motion-safe:fill-mode-forwards'
        )}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={cn(
          'relative h-full w-[min(880px,100%)] bg-[var(--arca-bg)] border-l border-[var(--arca-border-strong)] shadow-[-8px_0_28px_rgba(18,19,26,.10)] flex flex-col motion-safe:duration-200 motion-safe:ease-out',
          open
            ? 'motion-safe:animate-in motion-safe:slide-in-from-right'
            : 'motion-safe:animate-out motion-safe:slide-out-to-right motion-safe:fill-mode-forwards'
        )}
      >
        {/* Header fijo */}
        <div className="flex-none flex items-start gap-3 px-5 py-4 bg-[var(--arca-surface)] border-b border-[var(--arca-border)]">
          <div className="min-w-0">
            <div className="font-display text-[17px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)] truncate">
              Conceptos — carga manual
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--arca-ink-3)] truncate">
              {empleadoNombre ?? '—'} · {periodoLabel}
            </div>
          </div>
          <span className="ml-auto flex-none">
            <AutosaveChip estado={autosaveEstado} savedAt={savedAt} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex-none h-[30px] w-[30px] rounded-[9px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4 pb-6 flex flex-col gap-3.5">
          {/* Banner escala */}
          {basicoInfo && (
            <div
              className="flex-none flex items-center gap-x-2.5 gap-y-1 flex-wrap px-3.5 py-2.5 rounded-[12px] text-[12.5px] leading-snug"
              style={
                basicoInfo.sinEscalaParaPeriodo || basicoInfo.basico <= 0
                  ? {
                      color: 'var(--arca-accent-warn-fg)',
                      background: 'var(--arca-accent-warn-bg)',
                    }
                  : {
                      color: 'var(--arca-accent-pos-fg)',
                      background: 'var(--arca-accent-pos-bg)',
                    }
              }
            >
              {basicoInfo.basico > 0 ? (
                <>
                  <span>Escala vigente</span>
                  <span className="font-mono text-[12px] font-medium tabular-nums">
                    {fmtMonto(basicoInfo.basico)}
                  </span>
                  {basicoInfo.categoriaNombre && (
                    <>
                      <span className="opacity-70">· Categoría</span>
                      <span className="font-semibold">
                        {basicoInfo.categoriaNombre}
                      </span>
                    </>
                  )}
                  {basicoInfo.sinEscalaParaPeriodo &&
                  basicoInfo.fallbackPeriodoLabel ? (
                    <span className="opacity-80">
                      (sin escala para el período, se usa{' '}
                      {basicoInfo.fallbackPeriodoLabel})
                    </span>
                  ) : basicoInfo.periodoEscalaLabel ? (
                    <span className="opacity-70">
                      · escala {basicoInfo.periodoEscalaLabel}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  Sin básico de escala para el período — cargalo en Convenios.
                </>
              )}
            </div>
          )}

          {ORDEN_SECCIONES.map((s) => {
            const filas = porSeccion.get(s)!;
            const disponibles = catalogoPorSeccion.get(s)!;
            if (filas.length === 0 && disponibles.length === 0) return null;
            const esHaber = SECCIONES_HABER.has(s);
            const totalSeccion = filas.reduce(
              (acc, c) => acc + (montoByCodigo[c.codigo] ?? 0),
              0
            );
            return (
              <section
                key={s}
                className="flex-none bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden"
              >
                {/* Header de sección */}
                <div className="px-4 py-2.5 bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)] flex items-center justify-between gap-2.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-2)]">
                    {SECCIONES_SOS[s].label}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--arca-ink-4)]">
                    {SECCIONES_SOS[s].rangoMin}–{SECCIONES_SOS[s].rangoMax}
                  </span>
                </div>

                {/* Filas */}
                {filas.map((c) => {
                  const memoValor = valorCampo(c.codigo, 'memo');
                  const memoEditando = memoAbiertos.has(c.codigo);
                  return (
                    <div
                      key={c.codigo}
                      className="flex flex-wrap items-end gap-x-3.5 gap-y-2.5 px-4 py-3 border-b border-[var(--arca-border)]"
                    >
                      {/* Identidad */}
                      <div className="flex-1 basis-[200px] min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap gap-y-0.5">
                          <span className="font-mono text-[11px] text-[var(--arca-ink-4)]">
                            {c.codigo}
                          </span>
                          <span className="text-[13.5px] text-[var(--arca-ink)]">
                            {c.nombre ?? '—'}
                          </span>
                          {c.codigoAfip && (
                            <span className="font-mono text-[11px] text-[var(--arca-ink-4)]">
                              [{c.codigoAfip}]
                            </span>
                          )}
                          {c.tieneMemo === true && (
                            <button
                              type="button"
                              onClick={() => toggleMemo(c.codigo)}
                              aria-label={
                                memoEditando
                                  ? 'Cerrar descripción'
                                  : 'Agregar descripción'
                              }
                              title="Descripción (se imprime en el recibo)"
                              className={cn(
                                'flex-none self-center h-[20px] w-[20px] rounded-[6px] flex items-center justify-center transition-colors duration-120 motion-reduce:transition-none cursor-pointer',
                                memoEditando || memoValor
                                  ? 'text-[var(--arca-navy-700)] bg-[var(--arca-surface-2)]'
                                  : 'text-[var(--arca-ink-4)] hover:text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
                              )}
                            >
                              <PenLine className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {memoValor && !memoEditando && (
                          <div className="mt-0.5 text-[11px] text-[var(--arca-ink-4)] truncate">
                            {memoValor}
                          </div>
                        )}
                      </div>

                      {/* Inputs compactos */}
                      <div className="flex flex-wrap gap-2 flex-none">
                        {c.tieneCantidad !== false && (
                          <label className="flex flex-col gap-[3px]">
                            {microLabel('Cantidad')}
                            <input
                              value={valorCampo(c.codigo, 'cantidad')}
                              onChange={(e) =>
                                onEditField(
                                  c.codigo,
                                  'cantidad',
                                  e.target.value
                                )
                              }
                              inputMode="decimal"
                              className={cn(inputCls, 'w-[88px]')}
                            />
                          </label>
                        )}
                        {c.tienePct !== false && (
                          <label className="flex flex-col gap-[3px]">
                            {microLabel('%')}
                            <input
                              value={valorCampo(c.codigo, 'porcentaje')}
                              onChange={(e) =>
                                onEditField(
                                  c.codigo,
                                  'porcentaje',
                                  e.target.value
                                )
                              }
                              disabled={c.pctFijo != null}
                              inputMode="decimal"
                              className={cn(inputCls, 'w-[74px]')}
                            />
                          </label>
                        )}
                        {c.tieneImporte !== false && (
                          <label className="flex flex-col gap-[3px]">
                            {microLabel('Importe')}
                            <input
                              value={valorCampo(c.codigo, 'importe')}
                              onChange={(e) =>
                                onEditField(c.codigo, 'importe', e.target.value)
                              }
                              inputMode="decimal"
                              className={cn(inputCls, 'w-[120px]')}
                            />
                          </label>
                        )}
                        {c.tieneCantidad === false &&
                          c.tienePct === false &&
                          c.tieneImporte === false && (
                            <label className="flex flex-col gap-[3px]">
                              {microLabel('Monto')}
                              <input
                                value={valorCampo(c.codigo, 'monto')}
                                onChange={(e) =>
                                  onEditField(c.codigo, 'monto', e.target.value)
                                }
                                inputMode="decimal"
                                className={cn(inputCls, 'w-[120px]')}
                              />
                            </label>
                          )}
                      </div>

                      {/* Monto calculado */}
                      <div className="flex-none ml-auto text-right min-w-[120px]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                          {esHaber ? 'Haber' : 'Retención'}
                        </div>
                        <div
                          className={cn(
                            'text-[13.5px] font-medium tabular-nums',
                            esHaber
                              ? 'text-[var(--arca-ink)]'
                              : 'text-[var(--arca-accent-neg-fg)]'
                          )}
                        >
                          {fmtMonto(montoByCodigo[c.codigo] ?? 0)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleConcepto(c.codigo, false)}
                        aria-label={`Quitar ${c.nombre ?? c.codigo}`}
                        className="flex-none h-[28px] w-[28px] rounded-[8px] border border-[var(--arca-border)] bg-[var(--arca-surface)] flex items-center justify-center text-[var(--arca-ink-4)] hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>

                      {/* Editor de descripción (a demanda) */}
                      {memoEditando && (
                        <input
                          value={memoValor}
                          onChange={(e) =>
                            onEditField(c.codigo, 'memo', e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') toggleMemo(c.codigo);
                          }}
                          autoFocus
                          placeholder="Descripción — se imprime en el recibo…"
                          className={cn(
                            inputCls,
                            'basis-full text-left motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150'
                          )}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Agregar concepto */}
                {disponibles.length > 0 && (
                  <AgregarConceptoPopover
                    disponibles={disponibles}
                    onAdd={(codigos) => {
                      for (const codigo of codigos)
                        onToggleConcepto(codigo, true);
                    }}
                  />
                )}

                {/* Total de sección */}
                {filas.length > 0 && (
                  <div className="px-4 py-2.5 bg-[var(--arca-surface-2)] flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-[var(--arca-ink-2)]">
                      Total {SECCIONES_SOS[s].label.toLowerCase()}
                    </span>
                    <span
                      className={cn(
                        'text-[13px] font-semibold tabular-nums',
                        esHaber
                          ? 'text-[var(--arca-ink)]'
                          : 'text-[var(--arca-accent-neg-fg)]'
                      )}
                    >
                      {fmtMonto(esHaber ? totalSeccion : -totalSeccion)}
                    </span>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Pie fijo */}
        <div className="flex-none flex items-center flex-wrap gap-x-3.5 gap-y-2.5 px-5 py-3.5 bg-[var(--arca-surface)] border-t border-[var(--arca-border)]">
          <div className="flex gap-[22px] flex-wrap gap-y-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                Haberes
              </div>
              <div className="text-[14px] font-semibold tabular-nums text-[var(--arca-ink)]">
                {fmtMonto(totales.haberes + totales.noRemunerativo)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                Retenciones
              </div>
              <div className="text-[14px] font-semibold tabular-nums text-[var(--arca-accent-neg-fg)]">
                {fmtMonto(-totalRet)}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                Neto a cobrar
              </div>
              <div className="font-display text-[20px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--arca-ink)]">
                {fmtMonto(totales.neto)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-[36px] px-4 rounded-[10px] text-[13px] font-semibold bg-[var(--arca-ink)] text-white hover:bg-[var(--arca-navy-800)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

/** Popover con buscador y checklist para agregar conceptos (mismo patrón que la tabla clásica). */
function AgregarConceptoPopover({
  disponibles,
  onAdd,
}: {
  disponibles: ConceptoImportado[];
  onAdd: (codigos: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const filtrados = disponibles.filter((c) => {
    if (!busqueda) return true;
    const q = busqueda.toLowerCase();
    return c.codigo.includes(q) || (c.nombre ?? '').toLowerCase().includes(q);
  });

  const toggle = (codigo: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  };

  const confirmar = () => {
    if (seleccionados.size > 0) onAdd([...seleccionados]);
    setOpen(false);
    setBusqueda('');
    setSeleccionados(new Set());
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setBusqueda('');
          setSeleccionados(new Set());
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full text-left px-4 py-2.5 border-b border-[var(--arca-border)] text-[12.5px] font-medium text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
        >
          + Agregar concepto
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-2 z-50" align="start">
        <input
          type="text"
          placeholder="Buscar por nombre o número…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoFocus
          className="mb-2 h-[30px] w-full px-2 rounded-[8px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12px] text-[var(--arca-ink)] outline-none focus:border-[var(--arca-navy-600)] placeholder:text-[var(--arca-ink-4)]"
        />
        <div className="max-h-[220px] overflow-y-auto">
          {filtrados.length === 0 ? (
            <p className="px-2 py-1 text-[12px] text-[var(--arca-ink-4)]">
              {busqueda
                ? 'Sin resultados.'
                : 'Todos los conceptos de esta sección ya están agregados.'}
            </p>
          ) : (
            filtrados.map((c) => (
              <label
                key={c.codigo}
                className="flex w-full items-start gap-2 rounded-[7px] px-2 py-1 text-left text-[12px] cursor-pointer hover:bg-[var(--arca-surface-2)]"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 accent-[var(--arca-navy-700)]"
                  checked={seleccionados.has(c.codigo)}
                  onChange={() => toggle(c.codigo)}
                />
                <span className="w-7 shrink-0 font-mono text-[11px] tabular-nums text-[var(--arca-ink-4)]">
                  {c.codigo}
                </span>
                <span className="flex-1 text-[var(--arca-ink-2)]">
                  {c.nombre ?? `Concepto ${c.codigo}`}
                </span>
              </label>
            ))
          )}
        </div>
        {filtrados.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--arca-border)] pt-2">
            <span className="text-[11px] text-[var(--arca-ink-4)]">
              {seleccionados.size > 0
                ? `${seleccionados.size} seleccionado${seleccionados.size > 1 ? 's' : ''}`
                : 'Seleccioná uno o más'}
            </span>
            <button
              type="button"
              disabled={seleccionados.size === 0}
              onClick={confirmar}
              className="h-[28px] px-3 rounded-[8px] text-[11.5px] font-semibold bg-[var(--arca-ink)] text-white hover:bg-[var(--arca-navy-800)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
            >
              Agregar ({seleccionados.size})
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
