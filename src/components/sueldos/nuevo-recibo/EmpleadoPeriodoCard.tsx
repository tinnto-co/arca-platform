/** Tarjeta "Empleado y período": buscador de legajo, ficha read-only, tipo, mes y quincena. */
import { useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { legajoParaMostrar } from '@/lib/legajo';
import { puedeLiquidarPeriodo } from '@/lib/payroll-period-rules';
import {
  antiguedadAnios,
  fechaDepositoCargasDe,
  fechaPagoDe,
  fmtFechaCorta,
  FORMA_PAGO_LABELS,
  iniciales,
  MES_LABELS,
  periodoDe,
  TIPOS_CHIP,
  type EmpleadoConfigRow,
  type Quincena,
  type TipoReciboNuevo,
} from './types';

function chipCls(active: boolean): string {
  return cn(
    'h-[30px] px-3 rounded-[10px] text-[12.5px] font-medium whitespace-nowrap border transition-colors duration-120 motion-reduce:transition-none cursor-pointer',
    active
      ? 'border-[var(--arca-ink)] bg-[var(--arca-ink)] text-white'
      : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
  );
}

function microLabel(text: string) {
  return (
    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)] mb-1.5">
      {text}
    </div>
  );
}

export interface EmpleadoPeriodoCardProps {
  empleados: EmpleadoConfigRow[];
  empleadoSel: EmpleadoConfigRow | null;
  onSelectEmpleado: (row: EmpleadoConfigRow) => void;
  tipo: TipoReciboNuevo;
  onTipoChange: (t: TipoReciboNuevo) => void;
  anio: number;
  onAnioChange: (a: number) => void;
  mes: number; // 1-12
  onMesChange: (m: number) => void;
  quincena: Quincena;
  onQuincenaChange: (q: Quincena) => void;
  convenioNombre: string | null;
  categoriaNombre: string | null;
}

export function EmpleadoPeriodoCard({
  empleados,
  empleadoSel,
  onSelectEmpleado,
  tipo,
  onTipoChange,
  anio,
  onAnioChange,
  mes,
  onMesChange,
  quincena,
  onQuincenaChange,
  convenioNombre,
  categoriaNombre,
}: EmpleadoPeriodoCardProps) {
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resultados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = empleados;
    if (!q) return base.slice(0, 8);
    return base
      .filter((r) => {
        const nombre = (r.empleado.nombre ?? '').toLowerCase();
        const cuil = (r.empleado.cuil ?? '').replace(/\D/g, '');
        const legajo = legajoParaMostrar(r.empleado.legajo);
        return (
          nombre.includes(q) ||
          cuil.includes(q.replace(/\D/g, '')) ||
          legajo === q
        );
      })
      .slice(0, 8);
  }, [empleados, query]);

  const sinConvenio = empleados.filter((r) => !r.empleado.convenioId).length;

  const emp = empleadoSel?.empleado ?? null;
  const antiguedad = antiguedadAnios(emp?.fechaAlta, anio, mes);

  const fechaPago = fechaPagoDe(anio, mes, quincena);
  const fechaDeposito = fechaDepositoCargasDe(anio, mes);

  return (
    <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px]">
      {/* Head */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 px-5 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-[var(--arca-ink-2)]" />
          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
            Empleado y período
          </h3>
        </div>
        <span className="ml-auto text-[11px] text-[var(--arca-ink-4)]">
          {empleados.length} legajos activos
          {sinConvenio > 0 ? ` · ${sinConvenio} sin convenio` : ''}
        </span>
      </div>

      <div className="px-5 pb-5 flex flex-col gap-4">
        {/* Buscador */}
        <div className="relative">
          <div className="h-[42px] px-3 rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center gap-2">
            <Search className="h-[15px] w-[15px] text-[var(--arca-ink-4)] flex-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setListOpen(true);
              }}
              onFocus={() => setListOpen(true)}
              onBlur={() => {
                blurTimer.current = setTimeout(() => setListOpen(false), 150);
              }}
              placeholder={
                emp
                  ? `${emp.nombre} — buscar otro legajo…`
                  : 'Buscar por legajo, nombre o CUIL…'
              }
              className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] text-[var(--arca-ink)] placeholder:text-[var(--arca-ink-4)]"
            />
          </div>
          {listOpen && resultados.length > 0 && (
            <div className="absolute left-0 right-0 top-[52px] z-20 bg-[var(--arca-surface)] border border-[var(--arca-border-strong)] rounded-[12px] shadow-[0_1px_3px_rgba(18,19,26,.04),0_12px_28px_rgba(18,19,26,.10)] overflow-hidden motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-120">
              {resultados.map((r) => (
                <button
                  key={r.empleado.id}
                  type="button"
                  disabled={!r.empleado.convenioId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    onSelectEmpleado(r);
                    setQuery('');
                    setListOpen(false);
                  }}
                  className={cn(
                    'w-full grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 border-b border-[var(--arca-border)] last:border-b-0 text-left transition-colors duration-120 motion-reduce:transition-none',
                    r.empleado.convenioId
                      ? 'hover:bg-[var(--arca-surface-2)] cursor-pointer'
                      : 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="h-[34px] w-[34px] rounded-[9px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] flex items-center justify-center font-display text-[12px] font-semibold text-[var(--arca-ink-2)]">
                    {iniciales(r.empleado.nombre)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[var(--arca-ink)] truncate">
                      {r.empleado.nombre}
                    </span>
                    <span className="block font-mono text-[11px] text-[var(--arca-ink-4)]">
                      Legajo {legajoParaMostrar(r.empleado.legajo)}
                      {r.empleado.cuil ? ` · ${r.empleado.cuil}` : ''}
                    </span>
                  </span>
                  {!r.empleado.convenioId && (
                    <span className="text-[11px] px-2.5 py-[3px] rounded-[20px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] text-[var(--arca-ink-3)] whitespace-nowrap">
                      Sin convenio
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Ficha del empleado */}
        {emp && (
          <div className="border border-[var(--arca-border)] rounded-[12px] bg-[var(--arca-surface-2)] px-4 py-3.5">
            <div className="flex items-center flex-wrap gap-x-3 gap-y-2 border-b border-[var(--arca-border)] pb-3">
              <span className="h-[38px] w-[38px] rounded-[10px] bg-[var(--arca-surface)] border border-[var(--arca-border)] flex items-center justify-center font-display text-[13px] font-semibold text-[var(--arca-navy-700)]">
                {iniciales(emp.nombre)}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-[16px] font-semibold tracking-[-0.015em] text-[var(--arca-ink)]">
                  {emp.nombre}
                </span>
                <span className="block font-mono text-[11.5px] text-[var(--arca-ink-4)]">
                  {emp.cuil ? `CUIL ${emp.cuil} · ` : ''}Legajo{' '}
                  {legajoParaMostrar(emp.legajo)}
                </span>
              </span>
              <span
                className="ml-auto text-[11px] px-2.5 py-[3px] rounded-[20px] whitespace-nowrap"
                style={
                  emp.convenioId
                    ? {
                        color: 'var(--arca-accent-pos-fg)',
                        background: 'var(--arca-accent-pos-bg)',
                      }
                    : {
                        color: 'var(--arca-accent-warn-fg)',
                        background: 'var(--arca-accent-warn-bg)',
                      }
                }
              >
                {emp.convenioId ? 'Convenio configurado' : 'Sin convenio'}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-x-[18px] gap-y-3.5 pt-3">
              {(
                [
                  ['Convenio', convenioNombre ?? '—'],
                  ['Categoría', categoriaNombre ?? '—'],
                  ['Ingreso', fmtFechaCorta(emp.fechaAlta)],
                  [
                    'Antigüedad',
                    antiguedad !== null
                      ? `${antiguedad} ${antiguedad === 1 ? 'año' : 'años'}`
                      : '—',
                  ],
                  ['Obra social', empleadoSel?.obraSocialNombre ?? '—'],
                  [
                    'Forma de pago',
                    emp.formaPago
                      ? (FORMA_PAGO_LABELS[emp.formaPago] ?? emp.formaPago)
                      : '—',
                  ],
                  ['Banco', emp.banco ?? '—'],
                  ['CBU', emp.cbu ?? '—'],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                    {label}
                  </div>
                  <div className="text-[12.5px] text-[var(--arca-ink)] tabular-nums truncate">
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tipo de liquidación */}
        <div>
          {microLabel('Tipo de liquidación')}
          <div className="flex gap-1.5 flex-wrap">
            {TIPOS_CHIP.map((t) => (
              <button
                key={t.value}
                type="button"
                className={chipCls(tipo === t.value)}
                onClick={() => onTipoChange(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mes liquidado */}
        <div>
          <div className="flex items-center mb-1.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)]">
              Mes liquidado
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAnioChange(anio - 1)}
                className="h-6 w-6 rounded-[7px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
                aria-label="Año anterior"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="font-display text-[13.5px] font-semibold tabular-nums min-w-[38px] text-center text-[var(--arca-ink)]">
                {anio}
              </span>
              <button
                type="button"
                onClick={() => onAnioChange(anio + 1)}
                className="h-6 w-6 rounded-[7px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-120 motion-reduce:transition-none cursor-pointer"
                aria-label="Año siguiente"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(46px,1fr))] gap-1">
            {MES_LABELS.map((label, idx) => {
              const m = idx + 1;
              const activo = m === mes;
              const liquidable = puedeLiquidarPeriodo(periodoDe(anio, m));
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => onMesChange(m)}
                  className={cn(
                    'h-[30px] rounded-[9px] text-[12px] capitalize border transition-colors duration-120 motion-reduce:transition-none cursor-pointer',
                    activo
                      ? 'border-[var(--arca-navy-700)] bg-[var(--arca-navy-700)] text-white font-semibold'
                      : liquidable
                        ? 'border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)]'
                        : 'border-[var(--arca-border)] bg-[var(--arca-surface)] text-[var(--arca-ink-4)] opacity-50'
                  )}
                  title={
                    liquidable ? undefined : 'Período no liquidable todavía'
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Período / fechas */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
          <div>
            {microLabel('Período')}
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  ['0', 'Mes completo'],
                  ['1', '1ra quinc.'],
                  ['2', '2da quinc.'],
                ] as [Quincena, string][]
              ).map(([q, label]) => (
                <button
                  key={q}
                  type="button"
                  className={chipCls(quincena === q)}
                  onClick={() => onQuincenaChange(q)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            {microLabel('Fecha de pago')}
            <div className="h-[34px] px-[11px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center gap-2">
              <span className="text-[12.5px] tabular-nums text-[var(--arca-ink)] flex-1">
                {fmtFechaCorta(fechaPago)}
              </span>
              <Calendar className="h-3.5 w-3.5 text-[var(--arca-ink-4)] flex-none" />
            </div>
          </div>
          <div>
            {microLabel('Depósito cargas')}
            <div className="h-[34px] px-[11px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] flex items-center gap-2">
              <span className="text-[12.5px] tabular-nums text-[var(--arca-ink)] flex-1">
                {fmtFechaCorta(fechaDeposito)}
              </span>
              <Calendar className="h-3.5 w-3.5 text-[var(--arca-ink-4)] flex-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
