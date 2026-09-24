'use client';

/**
 * Encabezado de la bandeja. Los filtros que antes ocupaban la mitad superior de
 * la lista viven acá: tabs de estado, chips para lo frecuente y un popover
 * `Más filtros` para lo secundario. La lista arranca al tope.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  ArrowDownWideNarrow,
  CheckCheck,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/shared/page-header';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import {
  ConteoResultados,
  LimpiarFiltros,
  chipFiltro,
  chipMasFiltros,
} from '@/components/shared/filtros';
import { PrioridadesCategoria } from './PrioridadesCategoria';
import { SelectorFecha } from '@/components/shared/selector-fecha';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SEVERIDAD_LABEL, haceCuanto, nombreCategoria } from './utils';
import { cn } from '@/lib/utils';

export interface FiltrosInbox {
  estado: 'sin_leer' | 'todas' | 'leidas';
  categoria: string;
  severidad: string;
  empresa: string;
  desde: string;
  hasta: string;
  soloConAdjunto: boolean;
  q: string;
  /** Cómo se lee la lista: por fecha (defecto) o por importancia. */
  orden: 'fecha' | 'prioridad';
}

interface Props {
  filtros: FiltrosInbox;
  onFiltro: (p: Partial<FiltrosInbox>) => void;
  onLimpiar: () => void;
  categorias: string[];
  resumen: { total: number; sinLeer: number; resultados: number };
  ultimaSync: Date | string | null;
  onMarcarTodasLeidas: () => void;
}

const TABS: { valor: FiltrosInbox['estado']; label: string }[] = [
  { valor: 'sin_leer', label: 'Sin leer' },
  { valor: 'todas', label: 'Todas' },
  { valor: 'leidas', label: 'Leídas' },
];

export function InboxHeader({
  filtros,
  onFiltro,
  onLimpiar,
  categorias,
  resumen,
  ultimaSync,
  onMarcarTodasLeidas,
}: Props) {
  const [masFiltros, setMasFiltros] = useState(false);

  // Los del popover se cuentan aparte: el chip `Más filtros` lleva su número.
  // La empresa no cuenta: se ve en el selector global del header.
  const secundarios = [
    filtros.desde,
    filtros.hasta,
    filtros.soloConAdjunto ? '1' : '',
  ].filter(Boolean).length;

  const activos =
    secundarios + [filtros.categoria, filtros.severidad].filter(Boolean).length;

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

          <Button size="sm" onClick={onMarcarTodasLeidas}>
            <CheckCheck className="size-3.5" />
            Marcar todas leídas
          </Button>
        </>
      }
      filters={
        <>
          {/* Tabs de estado */}
          <div
            role="tablist"
            className="flex items-center gap-0.5 rounded-lg bg-[var(--arca-surface-2)] p-[3px]"
          >
            {TABS.map((t) => (
              <button
                key={t.valor}
                role="tab"
                type="button"
                aria-selected={filtros.estado === t.valor}
                onClick={() => onFiltro({ estado: t.valor })}
                className={cn(
                  'flex h-[26px] items-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors duration-[120ms]',
                  filtros.estado === t.valor
                    ? 'bg-[var(--arca-surface)] text-[var(--arca-ink)] shadow-[0_1px_2px_rgba(16,23,32,0.08)]'
                    : 'text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]'
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

          {/* Mismo control que los filtros de Facturas: el valor "todas"
              es una opción de la lista, así que sacar el filtro se hace donde
              se puso. La X que había antes vivía dentro del trigger y no lo
              sacaba: Radix abre en pointerdown, así que el menú se desplegaba
              antes de que el click llegara a cortarse. */}
          <SearchableSelect
            size="sm"
            value={filtros.categoria || 'all'}
            onValueChange={(v) => onFiltro({ categoria: v === 'all' ? '' : v })}
            placeholder="Categoría"
            searchPlaceholder="Buscar categoría..."
            width={210}
            options={[
              { value: 'all', label: 'Todas las categorías' },
              ...categorias.map((c) => ({
                value: c,
                label: nombreCategoria(c),
              })),
            ]}
          />

          <SearchableSelect
            size="sm"
            value={filtros.severidad || 'all'}
            onValueChange={(v) => onFiltro({ severidad: v === 'all' ? '' : v })}
            placeholder="Importancia"
            searchPlaceholder="Buscar importancia..."
            width={200}
            options={[
              { value: 'all', label: 'Toda importancia' },
              ...[
                'urgente',
                'accion_requerida',
                'informativa',
                'sin_clasificar',
              ].map((sv) => ({ value: sv, label: SEVERIDAD_LABEL[sv] })),
            ]}
          />

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
                <div className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                    Desde
                  </span>
                  <SelectorFecha
                    value={filtros.desde}
                    onChange={(v) => onFiltro({ desde: v })}
                    placeholder="Cualquiera"
                    aria-label="Publicadas desde"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                    Hasta
                  </span>
                  <SelectorFecha
                    value={filtros.hasta}
                    onChange={(v) => onFiltro({ hasta: v })}
                    placeholder="Cualquiera"
                    aria-label="Publicadas hasta"
                  />
                </div>
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
                  className="rounded-[var(--arca-r-md)] bg-[var(--arca-accent)] px-3 py-1 text-[12px] font-medium text-white hover:bg-[var(--arca-accent-hover)]"
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

          {/* El orden es preferencia de lectura, no un filtro: no entra en
              `activos` ni lo toca "Limpiar". */}
          <button
            type="button"
            onClick={() =>
              onFiltro({
                orden: filtros.orden === 'prioridad' ? 'fecha' : 'prioridad',
              })
            }
            className={chipFiltro(filtros.orden === 'prioridad')}
            title={
              filtros.orden === 'prioridad'
                ? 'Ordenar por fecha'
                : 'Ordenar por importancia'
            }
          >
            <ArrowDownWideNarrow className="size-3" />
            {filtros.orden === 'prioridad' ? 'Por prioridad' : 'Por fecha'}
          </button>

          <PrioridadesCategoria />

          <ConteoResultados>
            {resumen.resultados.toLocaleString('es-AR')}{' '}
            {resumen.resultados === 1 ? 'resultado' : 'resultados'}
          </ConteoResultados>
        </>
      }
    />
  );
}
