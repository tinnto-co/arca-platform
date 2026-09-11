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
import { useAtajo } from '@/lib/tecla-modificador';
import { es } from 'date-fns/locale';
import {
  Archive,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Search,
  Zap,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MesPicker } from '@/components/shared/mes-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { TIPOS_TAREA } from '@/actions/tareas';
import { PageHeader } from '@/components/shared/page-header';
import {
  ChevronChip,
  LimpiarFiltros,
  QuitarFiltro,
  botonHeader,
  chipFiltro,
} from '@/components/shared/filtros';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  /** El tablero muestra las activas; con esto se ve el archivo. */
  viendoArchivadas: boolean;
  onVerArchivadas: (v: boolean) => void;
  /** Genera las tareas del período desde los vencimientos scrapeados. */
  onAutogenerar: () => void;
  autogenerando: boolean;
  onFiltro: (parcial: Partial<FiltrosTablero>) => void;
  onLimpiar: () => void;
  miembros: { id: string; name: string; email: string }[];
  empresas: { id: string; name: string | null }[];
  resumen: { tareas: number; empresas: number; venceSemana: number };
  onBuscar: () => void;
}

export function BoardHeader({
  filtros,
  viendoArchivadas,
  onVerArchivadas,
  onAutogenerar,
  autogenerando,
  onFiltro,
  onLimpiar,
  miembros,
  empresas,
  resumen,
  onBuscar,
}: BoardHeaderProps) {
  const atajoBuscar = useAtajo('K');
  const activos = Object.values(filtros).filter(Boolean).length;

  // El stack muestra cinco y resume el resto; con veinte miembros la fila de
  // avatares desplazaría a los botones.
  const visibles = miembros.slice(0, 5);
  const extra = miembros.length - visibles.length;

  return (
    <PageHeader
      title="Tareas"
      subtitle={
        <>
          {resumen.tareas} {resumen.tareas === 1 ? 'tarea' : 'tareas'} ·{' '}
          {resumen.empresas} {resumen.empresas === 1 ? 'empresa' : 'empresas'} ·{' '}
          {resumen.venceSemana} {resumen.venceSemana === 1 ? 'vence' : 'vencen'}{' '}
          esta semana
        </>
      }
      actions={
        <>
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
                      'ring-2 ring-[var(--arca-accent)]'
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

          <button type="button" onClick={onBuscar} className={botonHeader}>
            <Search className="size-3.5 text-[var(--arca-ink-3)]" />
            Buscar
            <kbd className="rounded-[4px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-1 text-[10px] text-[var(--arca-ink-3)] [font-family:var(--ff-mono)]">
              {atajoBuscar}
            </kbd>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Más acciones"
              className={botonHeader}
            >
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
        </>
      }
      filters={
        <>
          {/* Periodo: el mismo picker de mes que IVA, IIBB, Sueldos y la
            ficha del cliente. Acá además puede no haber período —el tablero
            arranca mostrando todo— así que el picker ofrece volver a "sin
            período". Antes era un <input type="month"> dentro de un chip, o
            sea el calendario nativo del navegador. */}
          <MesPicker
            size="sm"
            ano={filtros.periodo.slice(0, 4)}
            mes={filtros.periodo.slice(5, 7)}
            placeholder="Periodo: todos"
            onChange={(a, m) => onFiltro({ periodo: `${a}-${m}` })}
            onLimpiar={() => onFiltro({ periodo: '' })}
          />

          {/* Tipo, Asignado y Empresa son listas: van con el select del
            sistema —el mismo de Notificaciones y Facturas—, donde "todos" es
            una opción más y sacar el filtro se hace donde se puso. Antes eran
            tres menús distintos: un DropdownMenu, otro DropdownMenu y un
            Command, cada uno con su propia forma de verse. */}
          <SearchableSelect
            size="sm"
            value={filtros.tipo || 'all'}
            onValueChange={(v) =>
              onFiltro({ tipo: v === 'all' ? '' : (v as TipoTarea) })
            }
            placeholder="Tipo"
            searchPlaceholder="Buscar tipo…"
            width={140}
            options={[
              { value: 'all', label: 'Todos los tipos' },
              ...TIPOS_TAREA.map((t) => ({ value: t, label: TIPO_LABELS[t] })),
            ]}
          />

          <SearchableSelect
            size="sm"
            value={filtros.asignado || 'all'}
            onValueChange={(v) => onFiltro({ asignado: v === 'all' ? '' : v })}
            placeholder="Asignado"
            searchPlaceholder="Buscar persona…"
            width={150}
            options={[
              { value: 'all', label: 'Todo el equipo' },
              { value: 'sin_asignar', label: 'Sin asignar' },
              ...miembros.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />

          <SearchableSelect
            size="sm"
            value={filtros.cliente || 'all'}
            onValueChange={(v) => onFiltro({ cliente: v === 'all' ? '' : v })}
            placeholder="Empresa"
            searchPlaceholder="Buscar empresa…"
            width={180}
            options={[
              { value: 'all', label: 'Todas las empresas' },
              ...empresas.map((e) => ({
                value: e.id,
                label: e.name ?? e.id,
              })),
            ]}
          />

          {/* Vence hasta */}
          <Popover>
            <PopoverTrigger className={chipFiltro(filtros.venceHasta !== '')}>
              <CalendarIcon className="size-3" />
              {filtros.venceHasta
                ? `Vence hasta ${format(new Date(filtros.venceHasta), 'dd/MM')}`
                : 'Vence hasta'}
              {filtros.venceHasta ? (
                <QuitarFiltro onQuitar={() => onFiltro({ venceHasta: '' })} />
              ) : (
                <ChevronChip />
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

          {activos > 0 && <LimpiarFiltros onLimpiar={onLimpiar} />}

          {/* Convierte los vencimientos del período en tareas. El cron lo
            hace solo cada mañana en producción; el botón es para no esperar
            hasta mañana — y para el dev server, donde el cron no corre. */}
          <button
            type="button"
            onClick={onAutogenerar}
            disabled={autogenerando}
            className={cn(botonHeader, 'ml-auto')}
          >
            {autogenerando ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Zap className="size-3" />
            )}
            {autogenerando ? 'Generando…' : 'Autogenerar'}
          </button>

          {/* El archivo no es un filtro más: cambia qué lista se está mirando,
            así que va separado y a la derecha. */}
          <button
            type="button"
            aria-pressed={viendoArchivadas}
            onClick={() => onVerArchivadas(!viendoArchivadas)}
            // Es un interruptor, no un filtro: encendido va en el acento
            // tonal del chip activo, igual que los de la izquierda.
            className={chipFiltro(viendoArchivadas)}
          >
            <Archive className="size-3" />
            {/* La etiqueta no cambia al activarse: "Viendo archivadas" es más
              ancho y empujaba la fila a un segundo renglón. El estado ya lo
              dice el chip encendido. */}
            Archivadas
          </button>
        </>
      }
    />
  );
}
