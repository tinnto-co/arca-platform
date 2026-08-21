'use client';

/**
 * Encabezado del tablero: título con el resumen del recorte, accesos del
 * equipo y la barra de filtros.
 *
 * Los filtros son la única forma de recortar el tablero —no hay tableros ni
 * proyectos— así que viven en la URL: un recorte se comparte pegando el link y
 * sobrevive al refresh.
 */

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  MoreHorizontal,
  Search,
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
import { Calendar } from '@/components/ui/calendar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { TIPOS_TAREA } from '@/actions/tareas';
import { TIPO_LABELS, colorAvatar, iniciales } from './utils';
import type { TipoTarea } from './utils';
import { cn } from '@/lib/utils';

export interface FiltrosTablero {
  periodo: string;
  tipo: TipoTarea | '';
  asignado: string;
  cliente: string;
  venceHasta: string;
}

interface BoardHeaderProps {
  filtros: FiltrosTablero;
  onFiltro: (parcial: Partial<FiltrosTablero>) => void;
  onLimpiar: () => void;
  miembros: { id: string; name: string; email: string }[];
  empresas: { id: string; name: string | null }[];
  resumen: { tareas: number; empresas: number; venceSemana: number };
  onBuscar: () => void;
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-pill)] border px-[10px] py-1 text-[11.5px] transition-colors duration-[120ms] ease-[ease]';
const CHIP_OFF = `${CHIP_BASE} border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]`;
const CHIP_ON = `${CHIP_BASE} border-[var(--arca-accent-neg)] bg-[var(--arca-accent-neg-bg)] font-medium text-[var(--arca-accent-neg-fg)]`;

const BOTON =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-[11px] py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] ease-[ease] hover:bg-[var(--arca-surface-2)]';

/** `ago 2026` a partir de `2026-08`. */
function etiquetaPeriodo(p: string) {
  if (!/^\d{4}-\d{2}$/.test(p)) return null;
  const [a, m] = p.split('-');
  return `${format(new Date(Number(a), Number(m) - 1, 1), 'MMM', { locale: es })} ${a}`;
}

/** Botón que limpia su propio filtro sin abrir el popover. */
function Limpiar({ onClick }: { onClick: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Quitar este filtro"
      className="-mr-0.5 grid size-3.5 place-items-center rounded-full hover:bg-[var(--arca-accent-neg)]/15"
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

export function BoardHeader({
  filtros,
  onFiltro,
  onLimpiar,
  miembros,
  empresas,
  resumen,
  onBuscar,
}: BoardHeaderProps) {
  const activos = Object.values(filtros).filter(Boolean).length;
  const periodoTxt = etiquetaPeriodo(filtros.periodo);
  const asignadoTxt =
    filtros.asignado === 'sin_asignar'
      ? 'sin asignar'
      : (miembros.find((m) => m.id === filtros.asignado)?.name ?? null);
  const empresaTxt =
    empresas.find((e) => e.id === filtros.cliente)?.name ?? null;

  // El stack muestra cinco y resume el resto; con veinte miembros la fila de
  // avatares desplazaría a los botones.
  const visibles = miembros.slice(0, 5);
  const extra = miembros.length - visibles.length;

  return (
    <header className="sticky top-0 z-[5] flex flex-col gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-7 pt-[18px] pb-3">
      {/* Fila 1 */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            Tareas
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--arca-ink-3)] tabular-nums">
            {resumen.tareas} {resumen.tareas === 1 ? 'tarea' : 'tareas'} ·{' '}
            {resumen.empresas} {resumen.empresas === 1 ? 'empresa' : 'empresas'}{' '}
            · {resumen.venceSemana}{' '}
            {resumen.venceSemana === 1 ? 'vence' : 'vencen'} esta semana
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Equipo: click filtra por esa persona */}
          {visibles.length > 0 && (
            <div className="mr-1 flex items-center">
              {visibles.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  title={m.name}
                  aria-label={`Filtrar por ${m.name}`}
                  onClick={() =>
                    onFiltro({
                      asignado: filtros.asignado === m.id ? '' : m.id,
                    })
                  }
                  style={{
                    background: colorAvatar(m.id),
                    marginLeft: i === 0 ? 0 : -7,
                  }}
                  className={cn(
                    'grid size-6 place-items-center rounded-full border-2 border-[var(--arca-bg)] text-[9.5px] font-semibold text-white transition-transform duration-[120ms]',
                    filtros.asignado === m.id &&
                      'ring-2 ring-[var(--arca-navy-700)]'
                  )}
                >
                  {iniciales(m.name)}
                </button>
              ))}
              {extra > 0 && (
                <span
                  style={{ marginLeft: -7 }}
                  className="grid size-6 place-items-center rounded-full border-2 border-[var(--arca-bg)] bg-[var(--arca-surface-2)] text-[9.5px] font-semibold text-[var(--arca-ink-3)] ring-1 ring-[var(--arca-border-strong)]"
                >
                  +{extra}
                </span>
              )}
            </div>
          )}

          <button type="button" onClick={onBuscar} className={BOTON}>
            <Search className="size-3.5 text-[var(--arca-ink-3)]" />
            Buscar
            <kbd className="rounded-[4px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-1 text-[10px] text-[var(--arca-ink-3)] [font-family:var(--ff-mono)]">
              ⌘K
            </kbd>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Más acciones" className={BOTON}>
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-[12.5px]"
                disabled={activos === 0}
                onSelect={onLimpiar}
              >
                Limpiar filtros
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Fila 2: filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Periodo */}
        <Popover>
          <PopoverTrigger className={periodoTxt ? CHIP_ON : CHIP_OFF}>
            Periodo{periodoTxt ? `: ${periodoTxt}` : ': todos'}
            {periodoTxt ? (
              <Limpiar onClick={() => onFiltro({ periodo: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[190px] p-2">
            <input
              type="month"
              value={filtros.periodo}
              aria-label="Periodo fiscal"
              onChange={(e) => onFiltro({ periodo: e.target.value })}
              className="w-full rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-1.5 text-[12.5px] tabular-nums outline-none"
            />
          </PopoverContent>
        </Popover>

        {/* Tipo */}
        <DropdownMenu>
          <DropdownMenuTrigger className={filtros.tipo ? CHIP_ON : CHIP_OFF}>
            Tipo: {filtros.tipo ? TIPO_LABELS[filtros.tipo] : 'todos'}
            {filtros.tipo ? (
              <Limpiar onClick={() => onFiltro({ tipo: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[150px]">
            {TIPOS_TAREA.map((t) => (
              <DropdownMenuItem
                key={t}
                className="text-[12.5px]"
                onSelect={() => onFiltro({ tipo: t })}
              >
                {TIPO_LABELS[t]}
                {t === filtros.tipo && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Asignado */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={filtros.asignado ? CHIP_ON : CHIP_OFF}
          >
            Asignado: {asignadoTxt ?? 'todos'}
            {filtros.asignado ? (
              <Limpiar onClick={() => onFiltro({ asignado: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[190px]">
            <DropdownMenuItem
              className="text-[12.5px]"
              onSelect={() => onFiltro({ asignado: 'sin_asignar' })}
            >
              Sin asignar
              {filtros.asignado === 'sin_asignar' && (
                <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
              )}
            </DropdownMenuItem>
            {miembros.map((m) => (
              <DropdownMenuItem
                key={m.id}
                className="gap-2 text-[12.5px]"
                onSelect={() => onFiltro({ asignado: m.id })}
              >
                <span
                  style={{ background: colorAvatar(m.id) }}
                  className="grid size-[18px] place-items-center rounded-full text-[8.5px] font-semibold text-white"
                >
                  {iniciales(m.name)}
                </span>
                <span className="truncate">{m.name}</span>
                {m.id === filtros.asignado && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Empresa */}
        <Popover>
          <PopoverTrigger className={filtros.cliente ? CHIP_ON : CHIP_OFF}>
            Empresa: {empresaTxt ?? 'todas'}
            {filtros.cliente ? (
              <Limpiar onClick={() => onFiltro({ cliente: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[260px] p-0">
            <Command>
              <CommandInput
                placeholder="Buscar empresa…"
                className="text-[12.5px]"
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-[12px] text-[var(--arca-ink-3)]">
                  Sin resultados
                </CommandEmpty>
                <CommandGroup>
                  {empresas.map((e) => (
                    <CommandItem
                      key={e.id}
                      value={e.name ?? e.id}
                      className="text-[12.5px]"
                      onSelect={() => onFiltro({ cliente: e.id })}
                    >
                      <span className="truncate">{e.name}</span>
                      {e.id === filtros.cliente && (
                        <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Vence hasta */}
        <Popover>
          <PopoverTrigger className={filtros.venceHasta ? CHIP_ON : CHIP_OFF}>
            <CalendarIcon className="size-3" />
            {filtros.venceHasta
              ? `Vence hasta ${format(new Date(filtros.venceHasta), 'dd/MM')}`
              : 'Vence hasta'}
            {filtros.venceHasta ? (
              <Limpiar onClick={() => onFiltro({ venceHasta: '' })} />
            ) : (
              <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={es}
              selected={
                filtros.venceHasta ? new Date(filtros.venceHasta) : undefined
              }
              onSelect={(d) =>
                onFiltro({ venceHasta: d ? format(d, 'yyyy-MM-dd') : '' })
              }
            />
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
      </div>
    </header>
  );
}
