'use client';

/**
 * Encabezado de la bandeja. Los filtros que antes ocupaban la mitad superior de
 * la lista viven acá: tabs de estado, chips para lo frecuente y un popover
 * `Más filtros` para lo secundario. La lista arranca al tope.
 */

import { useState } from 'react';
import { Check, CheckCheck, SlidersHorizontal } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/page-header';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import {
  ChevronChip,
  ConteoResultados,
  LimpiarFiltros,
  QuitarFiltro,
  botonHeader,
  chipFiltro,
  chipMasFiltros,
} from '@/components/shared/filtros';
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
  resumen: { total: number; sinLeer: number; resultados: number };
  ultimaSync: Date | string | null;
  onMarcarTodasLeidas: () => void;
}

const TABS: { valor: FiltrosInbox['estado']; label: string }[] = [
  { valor: 'sin_leer', label: 'Sin leer' },
  { valor: 'todas', label: 'Todas' },
  { valor: 'resueltas', label: 'Resueltas' },
];

export function InboxHeader({
  filtros,
  onFiltro,
  onLimpiar,
  credenciales,
  categorias,
  resumen,
  ultimaSync,
  onMarcarTodasLeidas,
}: Props) {
  const [masFiltros, setMasFiltros] = useState(false);

  const credencialTxt =
    credenciales.find((c) => c.id === filtros.credencial)?.nombre ?? null;

  // Los del popover se cuentan aparte: el chip `Más filtros` lleva su número.
  // La empresa no cuenta: se ve en el selector global del header.
  const secundarios = [
    filtros.desde,
    filtros.hasta,
    filtros.soloConAdjunto ? '1' : '',
  ].filter(Boolean).length;

  const activos =
    secundarios +
    [filtros.credencial, filtros.categoria, filtros.severidad].filter(Boolean)
      .length;

  return (
    <PageHeader
      title="Notificaciones"
      subtitle={
        <>
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
        </>
      }
      actions={
        <>
          {/* El buscador de empresa ES el selector global: reemplaza al input
              de texto viejo, escribe el query param «empresa» (link
              compartible, como antes) y la elección viaja a las demás
              vistas. */}
          <SelectorClienteGlobal />

          <button
            type="button"
            onClick={onMarcarTodasLeidas}
            className={botonHeader}
          >
            <CheckCheck className="size-3.5" />
            Marcar todas leídas
          </button>
        </>
      }
      filters={
        <>
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

          <span
            className="h-5 w-px bg-[var(--arca-border)]"
            aria-hidden="true"
          />

          {/* Login */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={chipFiltro(filtros.credencial !== '')}
            >
              Login: {credencialTxt ?? 'todos'}
              {filtros.credencial ? (
                <QuitarFiltro onQuitar={() => onFiltro({ credencial: '' })} />
              ) : (
                <ChevronChip />
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
              className={chipFiltro(filtros.categoria !== '')}
            >
              Categoría: {filtros.categoria || 'todas'}
              {filtros.categoria ? (
                <QuitarFiltro onQuitar={() => onFiltro({ categoria: '' })} />
              ) : (
                <ChevronChip />
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
              className={chipFiltro(filtros.severidad !== '')}
            >
              Importancia:{' '}
              {filtros.severidad ? SEVERIDAD_LABEL[filtros.severidad] : 'toda'}
              {filtros.severidad ? (
                <QuitarFiltro onQuitar={() => onFiltro({ severidad: '' })} />
              ) : (
                <ChevronChip />
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
            <PopoverTrigger className={chipMasFiltros(secundarios)}>
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

          {activos > 0 && <LimpiarFiltros onLimpiar={onLimpiar} />}

          <ConteoResultados>
            {resumen.resultados.toLocaleString('es-AR')}{' '}
            {resumen.resultados === 1 ? 'resultado' : 'resultados'}
          </ConteoResultados>
        </>
      }
    />
  );
}
