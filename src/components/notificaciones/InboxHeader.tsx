'use client';

/**
 * Encabezado de la bandeja. Los filtros que antes ocupaban la mitad superior de
 * la lista viven acá: tabs de estado, chips para lo frecuente y un popover
 * `Más filtros` para lo secundario. La lista arranca al tope.
 */

import { useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { SEVERIDAD_LABEL, haceCuanto } from './utils';
import { cn } from '@/lib/utils';

export interface FiltrosInbox {
  estado: 'sin_leer' | 'todas' | 'resueltas';
  credencial: string;
  categoria: string;
  severidad: string;
  empresa: string;
  desde: string;
  hasta: string;
  soloConAdjunto: boolean;
  q: string;
}

interface Props {
  filtros: FiltrosInbox;
  onFiltro: (p: Partial<FiltrosInbox>) => void;
  onLimpiar: () => void;
  credenciales: { id: string; nombre: string | null }[];
  categorias: string[];
  empresas: { id: string; name: string | null }[];
  resumen: { total: number; sinLeer: number; resultados: number };
  ultimaSync: Date | string | null;
  onMarcarTodasLeidas: () => void;
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-pill)] border px-[10px] py-1 text-[11.5px] transition-colors duration-[120ms] ease-[ease]';
const CHIP_OFF = `${CHIP_BASE} border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]`;
const CHIP_ON = `${CHIP_BASE} border-[var(--arca-accent-info)] bg-[var(--arca-accent-info-bg)] font-medium text-[var(--arca-accent-info-fg)]`;

const BOTON =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-[11px] py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] ease-[ease] hover:bg-[var(--arca-surface-2)]';

const TABS: { valor: FiltrosInbox['estado']; label: string }[] = [
  { valor: 'sin_leer', label: 'Sin leer' },
  { valor: 'todas', label: 'Todas' },
  { valor: 'resueltas', label: 'Resueltas' },
];

/** `x` que limpia su propio filtro sin abrir el popover del chip. */
function Limpiar({ onClick }: { onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Quitar este filtro"
      className="-mr-0.5 grid size-3.5 place-items-center rounded-full hover:bg-[var(--arca-accent-info)]/15"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <X className="size-3" />
    </span>
  );
}

export function InboxHeader({
  filtros,
  onFiltro,
  onLimpiar,
  credenciales,
  categorias,
  empresas,
  resumen,
  ultimaSync,
  onMarcarTodasLeidas,
}: Props) {
  const [masFiltros, setMasFiltros] = useState(false);

  const credencialTxt =
    credenciales.find((c) => c.id === filtros.credencial)?.nombre ?? null;
  const empresaTxt =
    empresas.find((e) => e.id === filtros.empresa)?.name ?? null;

  // Los del popover se cuentan aparte: el chip `Más filtros` lleva su número.
  const secundarios = [
    filtros.empresa,
    filtros.desde,
    filtros.hasta,
    filtros.soloConAdjunto ? '1' : '',
  ].filter(Boolean).length;

  const activos =
    secundarios +
    [
      filtros.credencial,
      filtros.categoria,
      filtros.severidad,
      filtros.q,
    ].filter(Boolean).length;

  return (
    <header className="z-[5] flex shrink-0 flex-col gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-6 pt-[18px] pb-3">
      {/* Fila 1 */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            Notificaciones
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--arca-ink-3)] tabular-nums">
            {resumen.total.toLocaleString('es-AR')} en total ·{' '}
            <span className="font-medium text-[var(--arca-accent-neg-fg)]">
              {resumen.sinLeer} sin leer
            </span>
            {ultimaSync && (
              <>
                {' '}
                · última sincronización{' '}
                <span className="[font-family:var(--ff-mono)]">
                  {haceCuanto(ultimaSync)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-[11px] size-3.5 -translate-y-1/2 text-[var(--arca-ink-3)]" />
            <input
              value={filtros.q}
              onChange={(e) => onFiltro({ q: e.target.value })}
              placeholder="Buscar por empresa o asunto"
              aria-label="Buscar notificaciones"
              className="w-[260px] rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] py-1.5 pr-3 pl-[32px] text-[12.5px] text-[var(--arca-ink)] outline-none placeholder:text-[var(--arca-ink-4)] focus:border-[var(--arca-navy-600)]"
            />
          </div>

          <button type="button" onClick={onMarcarTodasLeidas} className={BOTON}>
            <CheckCheck className="size-3.5" />
            Marcar todas leídas
          </button>
        </div>
      </div>

      {/* Fila 2 */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Tabs de estado */}
        <div
          role="tablist"
          className="flex items-center gap-0.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] p-[2px]"
        >
          {TABS.map((t) => (
            <button
              key={t.valor}
              role="tab"
              type="button"
              aria-selected={filtros.estado === t.valor}
              onClick={() => onFiltro({ estado: t.valor })}
              className={cn(
                'flex items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[12px] transition-colors duration-[120ms]',
                filtros.estado === t.valor
                  ? 'bg-[var(--arca-ink)] font-medium text-white'
                  : 'text-[var(--arca-ink-3)] hover:text-[var(--arca-ink-2)]'
              )}
            >
              {t.label}
              {t.valor === 'sin_leer' && resumen.sinLeer > 0 && (
                <span className="text-[10.5px] opacity-70 tabular-nums [font-family:var(--ff-mono)]">
                  {resumen.sinLeer}
                </span>
              )}
            </button>
          ))}
        </div>

        <span className="h-5 w-px bg-[var(--arca-border)]" aria-hidden="true" />

        {/* Login */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={filtros.credencial ? CHIP_ON : CHIP_OFF}
          >
            Login: {credencialTxt ?? 'todos'}
            {filtros.credencial ? (
              <Limpiar onClick={() => onFiltro({ credencial: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[320px] min-w-[200px] overflow-y-auto"
          >
            {credenciales.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="text-[12.5px]"
                onSelect={() => onFiltro({ credencial: c.id })}
              >
                <span className="truncate">{c.nombre}</span>
                {c.id === filtros.credencial && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Categoría */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={filtros.categoria ? CHIP_ON : CHIP_OFF}
          >
            Categoría: {filtros.categoria || 'todas'}
            {filtros.categoria ? (
              <Limpiar onClick={() => onFiltro({ categoria: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[320px] min-w-[180px] overflow-y-auto"
          >
            {categorias.length === 0 && (
              <DropdownMenuItem disabled className="text-[12.5px]">
                Sin categorías todavía
              </DropdownMenuItem>
            )}
            {categorias.map((c) => (
              <DropdownMenuItem
                key={c}
                className="text-[12.5px]"
                onSelect={() => onFiltro({ categoria: c })}
              >
                {c}
                {c === filtros.categoria && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Importancia */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={filtros.severidad ? CHIP_ON : CHIP_OFF}
          >
            Importancia:{' '}
            {filtros.severidad ? SEVERIDAD_LABEL[filtros.severidad] : 'toda'}
            {filtros.severidad ? (
              <Limpiar onClick={() => onFiltro({ severidad: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {[
              'urgente',
              'accion_requerida',
              'informativa',
              'sin_clasificar',
            ].map((sv) => (
              <DropdownMenuItem
                key={sv}
                className="text-[12.5px]"
                onSelect={() => onFiltro({ severidad: sv })}
              >
                {SEVERIDAD_LABEL[sv]}
                {sv === filtros.severidad && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Más filtros */}
        <Popover open={masFiltros} onOpenChange={setMasFiltros}>
          <PopoverTrigger
            className={cn(
              CHIP_BASE,
              'border-dashed',
              secundarios > 0
                ? 'border-[var(--arca-accent-info)] bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]'
                : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
            )}
          >
            <SlidersHorizontal className="size-3" />
            Más filtros
            {secundarios > 0 && (
              <span className="text-[10.5px] tabular-nums [font-family:var(--ff-mono)]">
                {secundarios}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="flex w-[320px] flex-col gap-3 p-3"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                Empresa
              </span>
              <Command className="rounded-[var(--arca-r-md)] border border-[var(--arca-border)]">
                <CommandInput
                  placeholder="Buscar empresa…"
                  className="text-[12.5px]"
                />
                <CommandList className="max-h-[160px]">
                  <CommandEmpty className="py-3 text-center text-[12px] text-[var(--arca-ink-3)]">
                    Sin resultados
                  </CommandEmpty>
                  <CommandGroup>
                    {empresas.map((e) => (
                      <CommandItem
                        key={e.id}
                        value={e.name ?? e.id}
                        className="text-[12.5px]"
                        onSelect={() => onFiltro({ empresa: e.id })}
                      >
                        <span className="truncate">{e.name}</span>
                        {e.id === filtros.empresa && (
                          <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
              {empresaTxt && (
                <button
                  type="button"
                  onClick={() => onFiltro({ empresa: '' })}
                  className="self-start text-[11.5px] text-[var(--arca-navy-700)] hover:underline"
                >
                  Quitar {empresaTxt}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  Desde
                </span>
                <input
                  type="date"
                  value={filtros.desde}
                  onChange={(e) => onFiltro({ desde: e.target.value })}
                  className="rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-1 text-[12px] tabular-nums outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                  Hasta
                </span>
                <input
                  type="date"
                  value={filtros.hasta}
                  onChange={(e) => onFiltro({ hasta: e.target.value })}
                  className="rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-1 text-[12px] tabular-nums outline-none"
                />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={filtros.soloConAdjunto}
                onCheckedChange={(v) =>
                  onFiltro({ soloConAdjunto: v === true })
                }
              />
              <span className="text-[12.5px] text-[var(--arca-ink-2)]">
                Sólo con adjunto
              </span>
            </label>

            <div className="flex items-center gap-2 border-t border-[var(--arca-border)] pt-2">
              <button
                type="button"
                onClick={() => setMasFiltros(false)}
                className="rounded-[var(--arca-r-md)] bg-[var(--arca-ink)] px-3 py-1 text-[12px] font-medium text-white hover:bg-black"
              >
                Aplicar
              </button>
              <button
                type="button"
                onClick={() =>
                  onFiltro({
                    empresa: '',
                    desde: '',
                    hasta: '',
                    soloConAdjunto: false,
                  })
                }
                className="rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] px-3 py-1 text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]"
              >
                Limpiar
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {activos > 0 && (
          <button
            type="button"
            onClick={onLimpiar}
            className="text-[11.5px] font-medium text-[var(--arca-navy-700)] hover:underline"
          >
            Limpiar
          </button>
        )}

        <span className="ml-auto text-[11.5px] text-[var(--arca-ink-3)] tabular-nums">
          {resumen.resultados.toLocaleString('es-AR')}{' '}
          {resumen.resultados === 1 ? 'resultado' : 'resultados'}
        </span>
      </div>
    </header>
  );
}
