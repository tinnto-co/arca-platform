'use client';

/**
 * Columna izquierda de la bandeja: lista densa agrupada por día.
 *
 * El contenedor es `flex-col` con el cuerpo en `flex-1 min-h-0 overflow-y-auto`
 * y el pie fijo abajo. Sin el `min-h-0` el pie se sale del recorte: un hijo
 * flex no baja de su tamaño de contenido salvo que se le diga.
 */

import { Fragment } from 'react';
import { Paperclip } from 'lucide-react';
import {
  SEVERIDAD_LABEL,
  SEVERIDAD_PILL,
  asuntoYPreview,
  grupoDeFecha,
  horaOFecha,
} from './utils';
import { cn } from '@/lib/utils';

export interface NotificacionListada {
  id: string;
  mensaje: string;
  aiResumen: string | null;
  publicadaAt: Date | string | null;
  createdAt: Date | string;
  leida: boolean;
  resueltaAt: Date | string | null;
  severidad: string;
  categoria: string | null;
  clienteRazonSocial: string | null;
  credencialNombre: string | null;
  adjuntos: number;
  tareas: number;
}

interface Props {
  notificaciones: NotificacionListada[];
  seleccionada: string | null;
  onSeleccionar: (id: string) => void;
  cargando: boolean;
  total: number;
  hayMas: boolean;
  onCargarMas: () => void;
  /** Qué decir cuando no hay nada: depende del tab, no es siempre lo mismo. */
  vacio: string;
  /** Se muestra sobre la lista cuando algún login del scrapeo falló. */
  avisoLogins?: string | null;
}

const PILL =
  'rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium';

export function ListaNotificaciones({
  notificaciones,
  seleccionada,
  onSeleccionar,
  cargando,
  total,
  hayMas,
  onCargarMas,
  vacio,
  avisoLogins,
}: Props) {
  // Agrupa por día conservando el orden que ya trae el servidor (más nuevas
  // primero): no reordena, sólo corta.
  const grupos: { label: string; items: NotificacionListada[] }[] = [];
  for (const n of notificaciones) {
    const label = grupoDeFecha(n.publicadaAt ?? n.createdAt);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.label === label) ultimo.items.push(n);
    else grupos.push({ label, items: [n] });
  }

  return (
    <div className="flex h-full min-h-0 w-[392px] shrink-0 flex-col overflow-hidden border-r border-[var(--arca-border)] bg-[var(--arca-surface)]">
      {avisoLogins && (
        <p className="shrink-0 border-b border-[var(--arca-border)] bg-[var(--arca-accent-neg-bg)] px-[18px] py-2 text-[12px] text-[var(--arca-accent-neg-fg)]">
          {avisoLogins}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cargando ? (
          <div className="flex flex-col">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]"
              />
            ))}
          </div>
        ) : notificaciones.length === 0 ? (
          <p className="px-[18px] py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            {vacio}
          </p>
        ) : (
          <ul role="list">
            {grupos.map((g) => (
              <Fragment key={g.label}>
                <li
                  className="sticky top-0 z-[1] flex items-center gap-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-[18px] py-2"
                  aria-hidden="true"
                >
                  <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                    {g.label}
                  </span>
                  <span className="text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                    {g.items.length}
                  </span>
                </li>

                {g.items.map((n) => {
                  const { asunto, preview } = asuntoYPreview(
                    n.mensaje,
                    n.aiResumen
                  );
                  const activa = n.id === seleccionada;
                  const resuelta = n.resueltaAt !== null;
                  const destacada =
                    n.severidad === 'urgente' ||
                    n.severidad === 'accion_requerida';
                  const hayPills =
                    resuelta ||
                    destacada ||
                    n.categoria !== null ||
                    n.tareas > 0 ||
                    n.adjuntos > 0;

                  return (
                    <li key={n.id} role="listitem">
                      <button
                        type="button"
                        aria-current={activa ? 'true' : undefined}
                        onClick={() => onSeleccionar(n.id)}
                        className={cn(
                          'flex w-full gap-[11px] border-b border-[var(--arca-border)] px-[18px] py-3 text-left',
                          'transition-colors duration-[120ms] ease-[ease]',
                          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--arca-navy-700)]',
                          activa
                            ? 'bg-[var(--arca-surface-2)] shadow-[inset_2px_0_0_var(--arca-navy-900)]'
                            : 'hover:bg-[var(--arca-surface-2)]'
                        )}
                      >
                        {/* Marca de no leída. Un solo significado y un solo
                            color: se reconoce por estar o no estar, no por
                            distinguir un matiz a 7px.

                            Antes el punto también codificaba la severidad, y
                            ese canal está vacío —las notificaciones llegan
                            `sin_clasificar` y nada las clasifica—, así que el
                            marcador quedaba gris sobre crema. La severidad
                            ahora vive sólo en la pill.

                            La leída deja el hueco para no mover la sangría. */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full',
                            n.leida
                              ? 'bg-transparent'
                              : 'bg-[var(--arca-navy-700)]'
                          )}
                        />

                        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-[12.5px]',
                                n.leida
                                  ? 'font-medium text-[var(--arca-ink-2)]'
                                  : 'font-semibold text-[var(--arca-ink)]'
                              )}
                            >
                              {n.clienteRazonSocial ??
                                n.credencialNombre ??
                                'Sin empresa'}
                            </span>
                            <span className="shrink-0 text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                              {horaOFecha(n.publicadaAt ?? n.createdAt)}
                            </span>
                          </div>

                          <p
                            className={cn(
                              'line-clamp-1 text-[12.5px] leading-[1.35]',
                              n.leida
                                ? 'text-[var(--arca-ink-2)]'
                                : 'font-medium text-[var(--arca-ink)]'
                            )}
                          >
                            {asunto}
                          </p>

                          {preview && (
                            <p className="line-clamp-1 text-[11.5px] leading-[1.4] text-[var(--arca-ink-3)]">
                              {preview}
                            </p>
                          )}

                          {hayPills && (
                            <div className="mt-0.5 flex items-center gap-1.5">
                              {resuelta ? (
                                <span
                                  className={`${PILL} bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]`}
                                >
                                  Resuelta
                                </span>
                              ) : (
                                destacada && (
                                  <span
                                    className={`${PILL} ${SEVERIDAD_PILL[n.severidad]}`}
                                  >
                                    {SEVERIDAD_LABEL[n.severidad]}
                                  </span>
                                )
                              )}

                              {n.categoria && (
                                <span
                                  className={`${PILL} border border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)]`}
                                >
                                  {n.categoria}
                                </span>
                              )}

                              {n.tareas > 0 && (
                                <span
                                  className={`${PILL} border border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)]`}
                                >
                                  Con tarea
                                </span>
                              )}

                              {n.adjuntos > 0 && (
                                <Paperclip
                                  aria-label="Tiene adjunto"
                                  className="ml-auto size-3 shrink-0 text-[var(--arca-ink-4)]"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </Fragment>
            ))}
          </ul>
        )}
      </div>

      {/* Pie fijo */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-[18px] py-[11px]">
        <span className="text-[11.5px] text-[var(--arca-ink-3)] tabular-nums">
          {notificaciones.length} de {total}
        </span>
        {hayMas && (
          <button
            type="button"
            onClick={onCargarMas}
            className="text-[12px] font-medium text-[var(--arca-navy-700)] hover:underline"
          >
            Cargar más →
          </button>
        )}
      </div>
    </div>
  );
}
