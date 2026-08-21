'use client';

/**
 * Track del tablero. El header y el `+ Añadir tarea` quedan fijos; sólo
 * scrollea la lista de cards.
 *
 * La paginación es de render, no de fetch: se traen todas las tareas del
 * recorte y se muestran de a 20. El índice fraccional necesita ver a las
 * vecinas para calcular una posición, así que una columna cargada a medias no
 * puede reordenarse bien — y a la escala de un estudio el costo real está en
 * el DOM, no en la query.
 */

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COLORES_COLUMNA } from '@/actions/tareas';
import { COLOR_COLUMNA, COLOR_COLUMNA_LABEL } from './utils';
import type { TareaConDetalle } from './utils';
import { ComposerTarea } from './ComposerTarea';
import type { TipoTarea } from './utils';

/** Cuántas cards se muestran antes de pedir "Cargar más". */
export const POR_TANDA = 20;

interface BoardColumnProps {
  id: string;
  nombre: string;
  color: string;
  tareas: TareaConDetalle[];
  /** `null` en la columna virtual de las tareas sin columna. */
  columnaId: string | null;
  tareaAbierta: string | null;
  composerAbierto: boolean;
  filtrosDefault: { tipo?: TipoTarea; periodo?: string };
  editable: boolean;
  renderCard: (t: TareaConDetalle) => React.ReactNode;
  onAbrirComposer: () => void;
  onCerrarComposer: () => void;
  onRenombrar?: (nombre: string) => void;
  onColor?: (color: (typeof COLORES_COLUMNA)[number]) => void;
  onEliminar?: () => void;
}

export function BoardColumn({
  id,
  nombre,
  color,
  tareas,
  columnaId,
  composerAbierto,
  filtrosDefault,
  editable,
  renderCard,
  onAbrirComposer,
  onCerrarComposer,
  onRenombrar,
  onColor,
  onEliminar,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [visibles, setVisibles] = useState(POR_TANDA);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [borrador, setBorrador] = useState(nombre);

  const mostradas = tareas.slice(0, visibles);
  const restantes = tareas.length - mostradas.length;

  return (
    <section
      aria-label={nombre}
      className="flex w-[264px] min-w-[264px] snap-start flex-col gap-[9px] self-start rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] p-[10px]"
      style={{ maxHeight: '100%' }}
    >
      {/* Header de columna */}
      <div className="flex shrink-0 items-center gap-1.5 px-1 py-[2px]">
        <span
          className="size-[7px] shrink-0 rounded-full"
          style={{ background: COLOR_COLUMNA[color] ?? COLOR_COLUMNA.neutro }}
        />

        {editandoNombre && onRenombrar ? (
          <input
            autoFocus
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            aria-label={`Renombrar ${nombre}`}
            className="min-w-0 flex-1 border-b border-dashed border-[var(--arca-border-strong)] bg-transparent text-[13px] font-semibold text-[var(--arca-ink)] outline-none [font-family:var(--ff-display)]"
            onBlur={() => {
              setEditandoNombre(false);
              const v = borrador.trim();
              if (v && v !== nombre) onRenombrar(v);
              else setBorrador(nombre);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setBorrador(nombre);
                setEditandoNombre(false);
              }
            }}
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            {nombre}
          </h2>
        )}

        <span
          aria-live="polite"
          className="text-[11px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]"
        >
          {tareas.length}
        </span>

        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Opciones de ${nombre}`}
              className="grid size-5 shrink-0 place-items-center rounded-[4px] text-[var(--arca-ink-4)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface)] hover:text-[var(--arca-ink-2)]"
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[170px]">
              <DropdownMenuItem
                className="text-[12.5px]"
                onSelect={() => {
                  setBorrador(nombre);
                  setEditandoNombre(true);
                }}
              >
                <Pencil className="size-3.5" />
                Renombrar
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10.5px] tracking-[0.06em] text-[var(--arca-ink-4)] uppercase">
                Color
              </DropdownMenuLabel>
              {COLORES_COLUMNA.map((c) => (
                <DropdownMenuItem
                  key={c}
                  className="gap-2 text-[12.5px]"
                  onSelect={() => onColor?.(c)}
                >
                  <span
                    className="size-[7px] rounded-full"
                    style={{ background: COLOR_COLUMNA[c] }}
                  />
                  {COLOR_COLUMNA_LABEL[c]}
                  {c === color && (
                    <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                  )}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="text-[12.5px]"
                onSelect={() => onEliminar?.()}
              >
                <Trash2 className="size-3.5" />
                Eliminar columna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex min-h-0 flex-1 flex-col gap-[9px] overflow-y-auto rounded-[var(--arca-r-md)] transition-colors duration-[120ms] ${
          isOver ? 'bg-[rgba(30,52,96,0.03)]' : ''
        }`}
      >
        <SortableContext
          items={mostradas.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {mostradas.map((t) => renderCard(t))}
        </SortableContext>

        {tareas.length === 0 && (
          <p className="grid h-[76px] place-items-center rounded-[var(--arca-r-md)] border border-dashed border-[var(--arca-border-strong)] text-[12px] text-[var(--arca-ink-3)]">
            Sin tareas
          </p>
        )}

        {restantes > 0 && (
          <button
            type="button"
            onClick={() => setVisibles((n) => n + POR_TANDA)}
            className="py-[5px] text-center text-[11.5px] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:text-[var(--arca-ink)]"
          >
            Cargar {Math.min(restantes, POR_TANDA)} más
          </button>
        )}
      </div>

      {/* Pie fijo */}
      <div className="shrink-0">
        <ComposerTarea
          columnaId={columnaId}
          abierto={composerAbierto}
          onAbrir={onAbrirComposer}
          onCerrar={onCerrarComposer}
          defaults={filtrosDefault}
        />
      </div>
    </section>
  );
}
