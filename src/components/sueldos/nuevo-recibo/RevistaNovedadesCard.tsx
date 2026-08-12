/** Card colapsable "Situación de revista y novedades": situaciones LSD, días/horas, maternidad, observaciones. */
import { Clock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Quincena, SituacionRow } from './types';

export interface SituacionSel {
  situacionId: string | null;
  diaInicio: string; // texto libre numérico
}

export interface RevistaNovedadesCardProps {
  abierta: boolean;
  onToggle: () => void;
  situaciones: SituacionRow[];
  seleccion: [SituacionSel, SituacionSel, SituacionSel];
  onSeleccionChange: (idx: 0 | 1 | 2, next: SituacionSel) => void;
  quincena: Quincena;
  dias: string;
  onDiasChange: (v: string) => void;
  horas: string;
  onHorasChange: (v: string) => void;
  maternidad: boolean;
  onMaternidadChange: (v: boolean) => void;
  obsInterna: string;
  onObsInternaChange: (v: string) => void;
  obsRecibo: string;
  onObsReciboChange: (v: string) => void;
}

function microLabel(text: string) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)] mb-1.5">
      {text}
    </div>
  );
}

const inputCls =
  'h-[34px] w-full px-[11px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] tabular-nums text-[var(--arca-ink)] outline-none focus:border-[var(--arca-navy-600)] placeholder:text-[var(--arca-ink-4)]';

export function RevistaNovedadesCard({
  abierta,
  onToggle,
  situaciones,
  seleccion,
  onSeleccionChange,
  quincena,
  dias,
  onDiasChange,
  horas,
  onHorasChange,
  maternidad,
  onMaternidadChange,
  obsInterna,
  onObsInternaChange,
  obsRecibo,
  onObsReciboChange,
}: RevistaNovedadesCardProps) {
  const baseDias = quincena === '0' ? 30 : 15;
  const sitNombre = (id: string | null) =>
    situaciones.find((s) => s.id === id)?.nombre ?? null;

  const resumenPartes: string[] = [];
  const s1 = seleccion[0];
  if (s1.situacionId) {
    resumenPartes.push(
      `${sitNombre(s1.situacionId)}${s1.diaInicio ? ` desde el día ${s1.diaInicio}` : ''}`
    );
  }
  resumenPartes.push(`${dias || baseDias} días`);
  if (horas) resumenPartes.push(`${horas} hs`);
  if (maternidad) resumenPartes.push('maternidad art. 13');

  return (
    <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px]">
      {/* Head */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center flex-wrap gap-x-3 gap-y-1.5 px-5 pt-4 pb-3.5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[var(--arca-ink-2)]" />
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
            Situación de revista y novedades
          </h3>
        </div>
        {!abierta && (
          <span className="text-[11.5px] text-[var(--arca-ink-4)] truncate">
            · {resumenPartes.join(' · ')}
          </span>
        )}
        <span className="ml-auto text-[12px] font-medium text-[var(--arca-navy-700)] whitespace-nowrap">
          {abierta ? 'Ocultar' : 'Ver y editar'}
        </span>
      </button>

      {abierta && (
        <div className="px-5 pb-5 flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
          {/* Situaciones (hasta 3) */}
          <div>
            {microLabel('Situaciones de revista (hasta 3)')}
            <div className="flex flex-col gap-2">
              {([0, 1, 2] as const).map((idx) => {
                const sel = seleccion[idx];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_92px] gap-2"
                  >
                    <Select
                      value={sel.situacionId ?? 'none'}
                      onValueChange={(v) =>
                        onSeleccionChange(idx, {
                          ...sel,
                          situacionId: v === 'none' ? null : v,
                        })
                      }
                    >
                      <SelectTrigger className="h-[34px] rounded-[10px] border-[var(--arca-border-strong)] text-[12.5px]">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {situaciones.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.codigo} — {s.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <input
                      value={sel.diaInicio}
                      onChange={(e) =>
                        onSeleccionChange(idx, {
                          ...sel,
                          diaInicio: e.target.value.replace(/\D/g, ''),
                        })
                      }
                      placeholder="Día"
                      inputMode="numeric"
                      disabled={!sel.situacionId}
                      className={cn(inputCls, !sel.situacionId && 'opacity-50')}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Días / horas / maternidad */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
            <div>
              {microLabel('Días trabajados')}
              <div className="h-[34px] px-[11px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center gap-2 focus-within:border-[var(--arca-navy-600)]">
                <input
                  value={dias}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '');
                    if (raw === '') {
                      onDiasChange('');
                      return;
                    }
                    const n = Math.min(
                      baseDias,
                      Math.max(0, parseInt(raw, 10))
                    );
                    onDiasChange(String(n));
                  }}
                  placeholder={String(baseDias)}
                  inputMode="numeric"
                  className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] tabular-nums text-[var(--arca-ink)] placeholder:text-[var(--arca-ink-4)]"
                />
                <span className="flex-none text-[11.5px] text-[var(--arca-ink-4)] tabular-nums">
                  / {baseDias}
                </span>
              </div>
            </div>
            <div>
              {microLabel('Horas trabajadas')}
              <input
                value={horas}
                onChange={(e) =>
                  onHorasChange(e.target.value.replace(/[^\d.,]/g, ''))
                }
                placeholder="—"
                inputMode="decimal"
                className={inputCls}
              />
            </div>
            <div>
              {microLabel('Maternidad art. 13')}
              <label className="h-[34px] px-[11px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={maternidad}
                  onChange={(e) => onMaternidadChange(e.target.checked)}
                  className="h-3.5 w-3.5 accent-[var(--arca-navy-700)]"
                />
                <span className="text-[12.5px] text-[var(--arca-ink-2)]">
                  Corresponde
                </span>
              </label>
            </div>
          </div>

          {/* Observaciones */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
            <div>
              {microLabel('Observación interna')}
              <textarea
                value={obsInterna}
                onChange={(e) => onObsInternaChange(e.target.value)}
                rows={2}
                placeholder="No sale en el recibo…"
                className="w-full px-[11px] py-2 rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] text-[var(--arca-ink)] outline-none focus:border-[var(--arca-navy-600)] placeholder:text-[var(--arca-ink-4)] resize-y"
              />
            </div>
            <div>
              {microLabel('Observación en el recibo')}
              <textarea
                value={obsRecibo}
                onChange={(e) => onObsReciboChange(e.target.value)}
                rows={2}
                placeholder="Se imprime en el recibo…"
                className="w-full px-[11px] py-2 rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[12.5px] text-[var(--arca-ink)] outline-none focus:border-[var(--arca-navy-600)] placeholder:text-[var(--arca-ink-4)] resize-y"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
