'use client';

/**
 * Card del tablero. Fila de etiquetas, título, progreso de empresas y footer
 * de métricas, según el handoff hi-fi.
 *
 * El estado de vencimiento va como pill de color y no como ícono suelto: en
 * una columna de doce tarjetas el color se lee de un vistazo y el ícono no.
 */

import { useState } from 'react';
import { MessageSquare, CheckSquare } from 'lucide-react';
import { TaskDetailDialog } from './TaskDetailDialog';
import {
  TIPO_LABELS,
  TIPO_PILL,
  TONO_PILL,
  vencimiento,
  iniciales,
} from './utils';
import type { TareaConDetalle } from './utils';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  tarea: TareaConDetalle;
}

export function TaskCard({ tarea }: TaskCardProps) {
  const [open, setOpen] = useState(false);

  // La barra sigue al checklist, que es el avance de la tarea. Si no tiene
  // pasos cargados cae a las empresas alcanzadas, que es lo único que mide una
  // tarea auto-generada desde vencimientos.
  const pasosHechos = tarea.pasos.filter((p) => p.completado).length;
  const empresasHechas = tarea.clientes.filter((c) => c.completado).length;

  const avance =
    tarea.pasos.length > 0
      ? { hechos: pasosHechos, total: tarea.pasos.length, unidad: 'pasos' }
      : tarea.clientes.length > 0
        ? {
            hechos: empresasHechas,
            total: tarea.clientes.length,
            unidad: 'empresas',
          }
        : null;

  const vence = vencimiento(tarea.venceAt);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full flex-col gap-2 rounded-[var(--arca-r-md)] border p-[11px] text-left',
          'bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)]',
          'transition-colors duration-[120ms] ease-[ease]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-navy-600)]',
          open
            ? 'border-[var(--arca-navy-700)] shadow-[var(--arca-shadow-md)]'
            : 'border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)]'
        )}
      >
        {/* Etiquetas */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium',
              TIPO_PILL[tarea.tipo] ?? TIPO_PILL.otro
            )}
          >
            {TIPO_LABELS[tarea.tipo] ?? tarea.tipo}
          </span>

          {vence && (
            <span
              className={cn(
                'rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium tabular-nums',
                TONO_PILL[vence.tono]
              )}
            >
              {vence.dias < 0 ? `Vencido ${vence.etiqueta}` : vence.etiqueta}
            </span>
          )}

          {tarea.fuente !== 'manual' && (
            <span className="ml-auto text-[10.5px] text-[var(--arca-ink-4)]">
              auto
            </span>
          )}
        </div>

        {/* Título */}
        <p className="line-clamp-2 text-[12.5px] leading-[1.35] font-semibold text-[var(--arca-ink)]">
          {tarea.titulo}
        </p>

        {/* Avance */}
        {avance && (
          <div className="flex flex-col gap-1">
            <div className="h-[5px] overflow-hidden rounded-[3px] bg-[var(--arca-border)]">
              <div
                className="h-full rounded-[3px] bg-[var(--arca-chart-1)]"
                style={{ width: `${(avance.hechos / avance.total) * 100}%` }}
              />
            </div>
            <span className="text-[10.5px] text-[var(--arca-ink-3)] tabular-nums">
              {avance.hechos} de {avance.total} {avance.unidad}
            </span>
          </div>
        )}

        {/* Footer: métricas + asignado */}
        <div className="flex items-center gap-3 text-[10.5px] text-[var(--arca-ink-3)]">
          {avance && (
            <span className="flex items-center gap-1 tabular-nums">
              <CheckSquare className="size-3" />
              {avance.hechos}/{avance.total}
            </span>
          )}
          {tarea.comentariosCount > 0 && (
            <span className="flex items-center gap-1 tabular-nums">
              <MessageSquare className="size-3" />
              {tarea.comentariosCount}
            </span>
          )}

          <span className="ml-auto">
            {tarea.asignadoNombre ? (
              <span
                title={tarea.asignadoNombre}
                className="grid size-5 place-items-center rounded-full bg-[var(--arca-navy-700)] text-[9px] font-semibold text-white"
              >
                {iniciales(tarea.asignadoNombre)}
              </span>
            ) : (
              <span
                title="Sin asignar"
                className="grid size-5 place-items-center rounded-full border border-dashed border-[var(--arca-border-strong)] text-[11px] leading-none text-[var(--arca-ink-4)]"
              >
                +
              </span>
            )}
          </span>
        </div>
      </button>

      <TaskDetailDialog tarea={tarea} open={open} onOpenChange={setOpen} />
    </>
  );
}
