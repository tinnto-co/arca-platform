/** Card "Conceptos": banner de escala, resumen read-only del cálculo en vivo y accesos al drawer. */
import { Copy, ListPlus, RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConceptoImportado } from '@/components/sueldos/TablaReciboSos';
import { getSeccionSos } from '@/components/sueldos/sos-concepto-map';
import { AutosaveChip, type AutosaveEstado } from './AutosaveChip';
import { fmtMonto, type BasicoInfo } from './types';

const SECCIONES_IZQ = new Set([
  'haberes',
  'liquidacion_final',
  'decretos',
  'no_remunerativo',
]);

export interface ConceptosResumenCardProps {
  basicoInfo: BasicoInfo | null;
  conceptos: ConceptoImportado[];
  activeCodigos: Set<string>;
  montoByCodigo: Record<string, number>;
  autosaveEstado: AutosaveEstado;
  savedAt: Date | null;
  hayUltimoRecibo: boolean;
  copiaActiva: boolean;
  onCopiarUltimo: () => void;
  onRecalcularConvenio: () => void;
  onAbrirDrawer: () => void;
  deshabilitada: boolean;
}

function botonSecundario(disabled?: boolean) {
  return cn(
    'h-[30px] px-3 rounded-[10px] text-[12.5px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5 whitespace-nowrap transition-colors duration-120 motion-reduce:transition-none',
    disabled
      ? 'opacity-50 cursor-not-allowed'
      : 'hover:bg-[var(--arca-surface-2)] cursor-pointer'
  );
}

export function ConceptosResumenCard({
  basicoInfo,
  conceptos,
  activeCodigos,
  montoByCodigo,
  autosaveEstado,
  savedAt,
  hayUltimoRecibo,
  copiaActiva,
  onCopiarUltimo,
  onRecalcularConvenio,
  onAbrirDrawer,
  deshabilitada,
}: ConceptosResumenCardProps) {
  const activos = conceptos.filter((c) => activeCodigos.has(c.codigo));
  const seccionDe = (c: ConceptoImportado) =>
    getSeccionSos(parseInt(c.codigo, 10)) ?? 'haberes';
  const izquierda = activos.filter((c) => SECCIONES_IZQ.has(seccionDe(c)));
  const derecha = activos.filter((c) => !SECCIONES_IZQ.has(seccionDe(c)));

  const fila = (c: ConceptoImportado) => {
    const monto = montoByCodigo[c.codigo] ?? 0;
    return (
      <div
        key={c.codigo}
        className="flex items-baseline gap-2 py-[5px] border-b border-[var(--arca-border)] last:border-b-0"
      >
        <span className="font-mono text-[10.5px] text-[var(--arca-ink-4)] flex-none w-[30px]">
          {c.codigo}
        </span>
        <span className="text-[12.5px] text-[var(--arca-ink-2)] min-w-0 truncate flex-1">
          {c.nombre}
        </span>
        <span className="text-[12.5px] tabular-nums text-[var(--arca-ink)] whitespace-nowrap">
          {fmtMonto(monto)}
        </span>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px]',
        deshabilitada && 'opacity-60 pointer-events-none'
      )}
    >
      {/* Head */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--arca-ink-2)]" />
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
            Conceptos
          </h3>
        </div>
        <span className="ml-auto">
          <AutosaveChip estado={autosaveEstado} savedAt={savedAt} />
        </span>
      </div>

      <div className="px-5 pb-5 flex flex-col gap-3.5">
        {/* Banner escala */}
        {basicoInfo && (
          <div
            className="rounded-[10px] px-3.5 py-2.5 text-[12px] leading-snug"
            style={
              basicoInfo.sinEscalaParaPeriodo
                ? {
                    color: 'var(--arca-accent-warn-fg)',
                    background: 'var(--arca-accent-warn-bg)',
                  }
                : {
                    color: 'var(--arca-accent-info-fg)',
                    background: 'var(--arca-accent-info-bg)',
                  }
            }
          >
            {basicoInfo.basico > 0 ? (
              <>
                Básico de escala{' '}
                <strong className="tabular-nums">
                  {fmtMonto(basicoInfo.basico)}
                </strong>
                {basicoInfo.categoriaNombre
                  ? ` — ${basicoInfo.categoriaNombre}`
                  : ''}
                {basicoInfo.sinEscalaParaPeriodo &&
                basicoInfo.fallbackPeriodoLabel
                  ? ` (sin escala para el período, se usa ${basicoInfo.fallbackPeriodoLabel})`
                  : basicoInfo.periodoEscalaLabel
                    ? ` · escala ${basicoInfo.periodoEscalaLabel}`
                    : ''}
              </>
            ) : (
              <>Sin básico de escala para el período — cargalo en Convenios.</>
            )}
          </div>
        )}

        {/* Resumen dos columnas */}
        {activos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <div>{izquierda.map(fila)}</div>
            <div>{derecha.map(fila)}</div>
          </div>
        ) : (
          <div className="text-[12.5px] text-[var(--arca-ink-4)] py-2">
            Sin conceptos activos todavía.
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <button
            type="button"
            className={botonSecundario(!hayUltimoRecibo || copiaActiva)}
            disabled={!hayUltimoRecibo || copiaActiva}
            onClick={onCopiarUltimo}
          >
            <Copy className="h-3.5 w-3.5" />
            {copiaActiva ? 'Último recibo copiado' : 'Copiar último recibo'}
          </button>
          <button
            type="button"
            className={botonSecundario(false)}
            onClick={onRecalcularConvenio}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Recalcular desde convenio
          </button>
          <button
            type="button"
            onClick={onAbrirDrawer}
            className="ml-auto h-[32px] px-3.5 rounded-[10px] text-[12.5px] font-semibold bg-[var(--arca-ink)] text-white inline-flex items-center gap-1.5 whitespace-nowrap hover:bg-[var(--arca-navy-800)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
          >
            <ListPlus className="h-3.5 w-3.5" />
            Carga manual
          </button>
        </div>
      </div>
    </div>
  );
}
