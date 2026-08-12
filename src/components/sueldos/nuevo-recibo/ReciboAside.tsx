/** Aside sticky: recibo en vivo, métrica de legajos, controles previos y Emitir. */
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtMonto } from './types';

export type ControlNivel = 'ok' | 'info' | 'warn';

export interface ControlPrevio {
  nivel: ControlNivel;
  texto: string;
}

export interface ReciboAsideProps {
  empleadoNombre: string | null;
  periodoLabel: string;
  tipoLabel: string;
  totales: {
    haberes: number;
    descuentos: number;
    retenciones: number;
    noRemunerativo: number;
    neto: number;
  };
  legajosLiquidados: number;
  legajosTotal: number;
  controles: ControlPrevio[];
  puedeEmitir: boolean;
  emitiendo: boolean;
  emitido: boolean;
  onEmitir: () => void;
  onLiquidarOtro: () => void;
  onDescargarPdf: () => void;
}

const DOT: Record<ControlNivel, string> = {
  ok: 'var(--arca-accent-pos-fg)',
  info: 'var(--arca-accent-info-fg)',
  warn: 'var(--arca-accent-warn-fg)',
};

export function ReciboAside({
  empleadoNombre,
  periodoLabel,
  tipoLabel,
  totales,
  legajosLiquidados,
  legajosTotal,
  controles,
  puedeEmitir,
  emitiendo,
  emitido,
  onEmitir,
  onLiquidarOtro,
  onDescargarPdf,
}: ReciboAsideProps) {
  const filas: [string, number, boolean][] = [
    ['Haberes', totales.haberes, false],
    ['No remunerativo', totales.noRemunerativo, false],
    ['Descuentos', -totales.descuentos, true],
    ['Retenciones', -totales.retenciones, true],
  ];

  return (
    <aside className="sticky top-[60px] self-start flex flex-col gap-3.5">
      {/* Recibo en vivo */}
      <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px]">
        <div className="flex items-center gap-2 px-5 pt-4 pb-3">
          <FileText className="h-3.5 w-3.5 text-[var(--arca-ink-2)]" />
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
            Recibo en vivo
          </h3>
        </div>
        <div className="px-5 pb-4">
          <div className="text-[12px] text-[var(--arca-ink-4)] pb-2.5 border-b border-[var(--arca-border)]">
            {empleadoNombre ?? 'Elegí un empleado'} · {periodoLabel} ·{' '}
            {tipoLabel}
          </div>
          <div className="pt-1.5">
            {filas.map(([label, monto, esResta]) => (
              <div
                key={label}
                className="flex items-baseline justify-between py-[5px]"
              >
                <span className="text-[12.5px] text-[var(--arca-ink-2)]">
                  {label}
                </span>
                <span
                  className={cn(
                    'text-[13px] tabular-nums',
                    esResta && monto !== 0
                      ? 'text-[var(--arca-accent-neg-fg)]'
                      : 'text-[var(--arca-ink)]'
                  )}
                >
                  {fmtMonto(monto)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2.5 border-t border-[var(--arca-border-strong)] flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Neto a cobrar
            </span>
            <span className="font-display text-[19px] font-semibold tabular-nums text-[var(--arca-ink)]">
              {fmtMonto(totales.neto)}
            </span>
          </div>
          <div className="mt-3 text-[11px] text-[var(--arca-ink-4)] tabular-nums">
            {legajosLiquidados} de {legajosTotal} legajos liquidados este
            período
          </div>
        </div>
      </div>

      {/* Controles previos */}
      <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] px-5 py-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)] mb-2.5">
          Controles previos
        </h4>
        <div className="flex flex-col gap-1.5">
          {controles.length === 0 && (
            <span className="text-[12px] text-[var(--arca-ink-4)]">
              Elegí un empleado para ver los controles.
            </span>
          )}
          {controles.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="flex-none h-[7px] w-[7px] rounded-full mt-[5px]"
                style={{ background: DOT[c.nivel] }}
              />
              <span className="text-[12px] leading-snug text-[var(--arca-ink-2)]">
                {c.texto}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Acciones */}
      {emitido ? (
        <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] px-5 py-4 flex flex-col gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className="h-4 w-4"
              style={{ color: 'var(--arca-accent-pos-fg)' }}
            />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Recibo emitido
            </span>
          </div>
          <button
            type="button"
            onClick={onDescargarPdf}
            className="h-[36px] rounded-[10px] text-[13px] font-semibold bg-[var(--arca-ink)] text-white inline-flex items-center justify-center gap-2 hover:bg-[var(--arca-navy-800)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Descargar PDF
          </button>
          <button
            type="button"
            onClick={onLiquidarOtro}
            className="h-[34px] rounded-[10px] text-[12.5px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] inline-flex items-center justify-center gap-2 hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Liquidar otro empleado
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!puedeEmitir || emitiendo}
          onClick={onEmitir}
          className={cn(
            'h-[42px] rounded-[12px] text-[13.5px] font-semibold inline-flex items-center justify-center gap-2 transition-colors duration-120 motion-reduce:transition-none',
            puedeEmitir && !emitiendo
              ? 'bg-[var(--arca-navy-700)] text-white hover:bg-[var(--arca-navy-800)] cursor-pointer'
              : 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-4)] cursor-not-allowed border border-[var(--arca-border)]'
          )}
        >
          {emitiendo && <Loader2 className="h-4 w-4 animate-spin" />}
          {emitiendo ? 'Emitiendo…' : 'Emitir recibo'}
        </button>
      )}
    </aside>
  );
}
