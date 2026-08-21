'use client';

/**
 * Card del tablero: etiquetas, título, empresa, progreso y footer de métricas.
 *
 * El estado de vencimiento va como pill de color y no como ícono suelto: en
 * una columna de doce tarjetas el color se lee de un vistazo y el ícono no.
 *
 * Una tarea ya cerrada baja de intensidad —sin sombra, título en `--ink-2`, la
 * hora en lugar de las métricas—: sigue estando, deja de pedir atención.
 *
 * No monta el modal: antes cada card tenía el suyo, así que una columna de
 * cuarenta tarjetas construía cuarenta diálogos. Lo abre la página.
 */

import { MessageSquare, CheckSquare } from 'lucide-react';
import {
  TIPO_LABELS,
  TIPO_PILL,
  TONO_PILL,
  colorAvatar,
  empresaDeLaCard,
  fechaCorta,
  iniciales,
  vencimiento,
} from './utils';
import type { TareaConDetalle } from './utils';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  tarea: TareaConDetalle;
  /** Marca la card mientras su modal está abierto. */
  seleccionada?: boolean;
  onAbrir?: () => void;
}

/** `hoy, 11:30` — sólo para las cerradas, donde importa cuándo se cerró. */
function horaCorta(d: Date | string) {
  const f = new Date(d);
  const hoy = new Date();
  const dia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const delta = Math.round((dia(hoy) - dia(f)) / 86_400_000);
  const hora = `${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`;
  if (delta === 0) return `hoy, ${hora}`;
  if (delta === 1) return `ayer, ${hora}`;
  return `${fechaCorta(f)}, ${hora}`;
}

export function TaskCard({ tarea, seleccionada, onAbrir }: TaskCardProps) {
  // La barra sigue al checklist, que es el avance de la tarea. Si no tiene
  // pasos cargados cae a las empresas alcanzadas, que es lo único que mide una
  // tarea auto-generada desde vencimientos.
  const avance =
    tarea.pasos.length > 0
      ? {
          hechos: tarea.pasos.filter((p) => p.completado).length,
          total: tarea.pasos.length,
          unidad: 'pasos',
        }
      : tarea.clientes.length > 0
        ? {
            hechos: tarea.clientes.filter((c) => c.completado).length,
            total: tarea.clientes.length,
            unidad: 'empresas',
          }
        : null;

  const vence = vencimiento(tarea.venceAt);
  const empresa = empresaDeLaCard(tarea.clientes);
  const cerrada = tarea.estado !== 'pendiente';

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'flex w-full flex-col gap-2 rounded-[var(--arca-r-md)] border p-[11px] text-left',
        'bg-[var(--arca-surface)] transition-colors duration-[120ms] ease-[ease]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--arca-navy-700)]',
        cerrada ? 'shadow-none' : 'shadow-[var(--arca-shadow-sm)]',
        seleccionada
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

        {vence && !cerrada && (
          <span
            className={cn(
              'rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium tabular-nums',
              TONO_PILL[vence.tono]
            )}
          >
            {vence.dias < 0
              ? `Vencido ${vence.etiqueta}`
              : vence.tono === 'warn'
                ? vence.etiqueta
                : fechaCorta(tarea.venceAt!)}
          </span>
        )}

        {tarea.fuente !== 'manual' && (
          <span className="ml-auto text-[10.5px] text-[var(--arca-ink-4)]">
            auto
          </span>
        )}
      </div>

      {/* Título */}
      <p
        className={cn(
          'line-clamp-2 text-[12.5px] leading-[1.35] font-semibold',
          cerrada ? 'text-[var(--arca-ink-2)]' : 'text-[var(--arca-ink)]'
        )}
      >
        {tarea.titulo}
      </p>

      {empresa && (
        <p className="truncate text-[11px] text-[var(--arca-ink-3)]">
          {empresa}
        </p>
      )}

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

      {/* Footer */}
      <div className="flex items-center gap-3 pt-[2px] text-[10.5px] text-[var(--arca-ink-3)]">
        {cerrada && tarea.estadoCambiadoAt ? (
          <span className="text-[10px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
            {horaCorta(tarea.estadoCambiadoAt)}
          </span>
        ) : (
          <>
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
            {!avance && tarea.comentariosCount === 0 && !tarea.asignadoA && (
              <span>Sin asignar</span>
            )}
          </>
        )}

        <span className="ml-auto">
          {tarea.asignadoNombre ? (
            <span
              title={tarea.asignadoNombre}
              style={{ background: colorAvatar(tarea.asignadoA) }}
              className="grid size-5 place-items-center rounded-full text-[9px] font-semibold text-white"
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
  );
}
