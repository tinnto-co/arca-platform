'use client';

/**
 * Modal de detalle de tarea — opción 2a del handoff hi-fi.
 *
 * Todo campo se edita en el lugar: el valor mostrado ES el control. No hay
 * modo "editar" ni formulario aparte. Cada cambio es una mutación por campo.
 *
 * Dos desvíos deliberados respecto del handoff, porque el modelo real no es el
 * que asumía el diseño:
 *
 *  · El handoff da UNA empresa por tarea. Acá una tarea abarca varias y cada
 *    una se completa por separado (`tarea_cliente`), que es la razón de ser del
 *    módulo. Las empresas ocupan entonces la zona de checklist —que es
 *    exactamente el patrón visual que pide: contador, barra de progreso e
 *    ítems tildables— y el lugar libre de la grilla lo toma `Periodo`.
 *  · El handoff toma columna y estado como la misma cosa. Acá son dos: las
 *    columnas del tablero son configurables por estudio y el estado es un enum
 *    fiscal. Van como dos campos distintos.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Activity,
  Calendar as CalendarIcon,
  Check,
  MoreHorizontal,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import {
  listTareaComments,
  listColumnas,
  listOrgMembers,
  toggleTareaCliente,
  moverTarea,
  updateTarea,
  updateEstadoTarea,
  addTareaComment,
  deleteTarea,
  TIPOS_TAREA,
  ESTADOS_TAREA,
} from '@/actions/tareas';
import {
  TIPO_LABELS,
  TIPO_PILL,
  ESTADO_LABELS,
  ESTADO_DOT,
  vencimiento,
} from './utils';
import type { TareaConDetalle } from './utils';
import {
  Avatar,
  AvatarVacio,
  CampoInline,
  Chevron,
  MicroLabel,
  TextoEditable,
  controlBase,
  useGuardado,
} from './campos';
import { authClient } from '@/lib/auth-client';

interface TaskDetailDialogProps {
  tarea: TareaConDetalle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SIN_ASIGNAR = '__sin_asignar__';

/** `28/08/2026`, el formato de fecha del sistema. */
const fmtFecha = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), 'dd/MM/yyyy') : null;

/** `hoy, 09:40` · `ayer, 18:42` · `12/08, 11:30` — todo en minúscula. */
function fmtRelativo(d: Date | string | null | undefined) {
  if (!d) return '';
  const fecha = new Date(d);
  const hoy = new Date();
  const dia = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const delta = Math.round((dia(hoy) - dia(fecha)) / 86_400_000);
  const hora = format(fecha, 'HH:mm');
  if (delta === 0) return `hoy, ${hora}`;
  if (delta === 1) return `ayer, ${hora}`;
  return `${format(fecha, 'dd/MM')}, ${hora}`;
}

export function TaskDetailDialog({
  tarea,
  open,
  onOpenChange,
}: TaskDetailDialogProps) {
  const queryClient = useQueryClient();
  const [comentario, setComentario] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [calendarioAbierto, setCalendarioAbierto] = useState(false);
  const [asignadoAbierto, setAsignadoAbierto] = useState(false);
  const guardado = useGuardado();
  const { data: sesion } = authClient.useSession();

  const { data: comments = [] } = useQuery({
    queryKey: ['tarea-comments', tarea.id],
    queryFn: () => listTareaComments({ data: { tareaId: tarea.id } }),
    enabled: open,
  });

  const { data: columnas = [] } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
    enabled: open,
  });

  const { data: miembros = [] } = useQuery({
    queryKey: ['tareas-miembros'],
    queryFn: () => listOrgMembers(),
    enabled: open,
  });

  /** Toda edición de campo pasa por acá: refresca el tablero y deja la marca. */
  const trasGuardar = () => {
    void queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false });
    guardado.marcar();
  };

  const patch = useMutation({
    mutationFn: (data: Parameters<typeof updateTarea>[0]['data']) =>
      updateTarea({ data }),
    onSuccess: trasGuardar,
    onError: () => toast.error('No se pudo guardar el cambio'),
  });

  /** Un campo suelto de la tarea; el id lo pone el modal. */
  type PatchTarea = Omit<Parameters<typeof updateTarea>[0]['data'], 'id'>;
  const patchCampo = (campo: PatchTarea) =>
    patch.mutate({ id: tarea.id, ...campo });

  const colMutation = useMutation({
    mutationFn: (columnaId: string | null) =>
      moverTarea({ data: { id: tarea.id, columnaId } }),
    onSuccess: trasGuardar,
    onError: () => toast.error('No se pudo cambiar la columna'),
  });

  const estadoMutation = useMutation({
    mutationFn: (estado: (typeof ESTADOS_TAREA)[number]) =>
      updateEstadoTarea({ data: { id: tarea.id, estado } }),
    onSuccess: trasGuardar,
    onError: () => toast.error('No se pudo cambiar el estado'),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { tareaClienteId: string; completado: boolean }) =>
      toggleTareaCliente({ data: vars }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      }),
    onError: () => toast.error('No se pudo actualizar la empresa'),
  });

  const commentMutation = useMutation({
    mutationFn: (contenido: string) =>
      addTareaComment({ data: { tareaId: tarea.id, contenido } }),
    onSuccess: () => {
      setComentario('');
      void queryClient.invalidateQueries({
        queryKey: ['tarea-comments', tarea.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      });
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTarea({ data: { id: tarea.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      });
      onOpenChange(false);
      toast.success('Tarea eliminada');
    },
    onError: () => toast.error('No se pudo eliminar la tarea'),
  });

  const completados = tarea.clientes.filter((c) => c.completado).length;
  const total = tarea.clientes.length;
  const progreso = total > 0 ? (completados / total) * 100 : 0;

  const columnaActual = columnas.find((c) => c.id === tarea.columnaId);
  const vence = vencimiento(tarea.venceAt);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-[rgba(18,19,26,0.38)]"
          className={[
            // El handoff pide 660px, sin escala al entrar: sólo opacidad y un
            // desplazamiento de 4px.
            'flex w-full max-w-[660px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[660px]',
            'max-h-[min(800px,90vh)] rounded-[var(--arca-r-lg)]',
            'border-[var(--arca-border-strong)] bg-[var(--arca-surface)]',
            'shadow-[0_20px_50px_rgba(18,19,26,0.18)]',
            'data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100',
            'data-[state=open]:slide-in-from-top-1',
          ].join(' ')}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-[var(--arca-border)] px-[22px] pt-[18px] pb-[14px]">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {/* Fila meta: tipo · columna · id */}
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={`inline-flex items-center gap-1 rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium transition-colors duration-[120ms] ${TIPO_PILL[tarea.tipo] ?? TIPO_PILL.otro}`}
                      aria-label="Cambiar tipo de obligación"
                    >
                      {TIPO_LABELS[tarea.tipo] ?? tarea.tipo}
                      <Chevron />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[150px]"
                    >
                      {TIPOS_TAREA.map((t) => (
                        <DropdownMenuItem
                          key={t}
                          onSelect={() =>
                            t !== tarea.tipo && patchCampo({ tipo: t })
                          }
                          className="text-[12.5px]"
                        >
                          {TIPO_LABELS[t]}
                          {t === tarea.tipo && (
                            <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                    en columna{' '}
                    <span className="font-medium text-[var(--arca-ink-2)]">
                      {columnaActual?.nombre ?? 'sin asignar'}
                    </span>
                  </span>

                  <span className="ml-auto text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                    {tarea.id.slice(0, 8)}
                  </span>
                </div>

                {/* Título editable */}
                <DialogTitle asChild>
                  <h2 className="text-[20px] leading-tight font-semibold tracking-[-0.02em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
                    <TextoEditable
                      ariaLabel="Título de la tarea"
                      valor={tarea.titulo}
                      onGuardar={(v) => patchCampo({ titulo: v })}
                      placeholder="Sin título"
                      className="border-b border-dashed border-[var(--arca-border-strong)] pb-[2px]"
                    />
                  </h2>
                </DialogTitle>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="grid size-7 place-items-center rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
                    aria-label="Más acciones"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmDelete(true)}
                      className="text-[12.5px]"
                    >
                      <Trash2 className="size-3.5" />
                      Eliminar tarea
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Cerrar"
                  className="grid size-7 place-items-center rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)]"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* ── Cuerpo (scrollea) ──────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Grilla de campos */}
            <div className="grid grid-cols-1 gap-x-[22px] gap-y-[10px] border-b border-[var(--arca-border)] px-[22px] py-4 sm:grid-cols-2">
              <CampoInline label="Columna">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={controlBase}
                    disabled={colMutation.isPending}
                  >
                    <span className="truncate">
                      {columnaActual?.nombre ?? 'Sin columna'}
                    </span>
                    <Chevron />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <DropdownMenuItem
                      onSelect={() => colMutation.mutate(null)}
                      className="text-[12.5px]"
                    >
                      Sin columna
                      {!tarea.columnaId && (
                        <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                      )}
                    </DropdownMenuItem>
                    {columnas.map((col) => (
                      <DropdownMenuItem
                        key={col.id}
                        onSelect={() => colMutation.mutate(col.id)}
                        className="text-[12.5px]"
                      >
                        {col.nombre}
                        {col.id === tarea.columnaId && (
                          <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CampoInline>

              <CampoInline label="Estado">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={controlBase}
                    disabled={estadoMutation.isPending}
                  >
                    <span
                      className="size-[7px] shrink-0 rounded-full"
                      style={{ background: ESTADO_DOT[tarea.estado] }}
                    />
                    <span className="truncate">
                      {ESTADO_LABELS[tarea.estado] ?? tarea.estado}
                    </span>
                    <Chevron />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[160px]">
                    {ESTADOS_TAREA.map((e) => (
                      <DropdownMenuItem
                        key={e}
                        onSelect={() =>
                          e !== tarea.estado && estadoMutation.mutate(e)
                        }
                        className="gap-2 text-[12.5px]"
                      >
                        <span
                          className="size-[7px] shrink-0 rounded-full"
                          style={{ background: ESTADO_DOT[e] }}
                        />
                        {ESTADO_LABELS[e]}
                        {e === tarea.estado && (
                          <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CampoInline>

              <CampoInline label="Asignado">
                <Popover
                  open={asignadoAbierto}
                  onOpenChange={setAsignadoAbierto}
                >
                  <PopoverTrigger className={controlBase}>
                    {tarea.asignadoNombre ? (
                      <Avatar nombre={tarea.asignadoNombre} />
                    ) : (
                      <AvatarVacio />
                    )}
                    <span className="truncate">
                      {tarea.asignadoNombre ?? (
                        <span className="text-[var(--arca-ink-4)]">
                          Sin asignar
                        </span>
                      )}
                    </span>
                    <Chevron />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[240px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Buscar persona…"
                        className="text-[12.5px]"
                      />
                      <CommandList>
                        <CommandEmpty className="py-4 text-center text-[12px] text-[var(--arca-ink-3)]">
                          Sin resultados
                        </CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value={SIN_ASIGNAR}
                            onSelect={() => {
                              setAsignadoAbierto(false);
                              patchCampo({ asignadoA: null });
                            }}
                            className="gap-2 text-[12.5px]"
                          >
                            <AvatarVacio />
                            Sin asignar
                            {!tarea.asignadoA && (
                              <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                            )}
                          </CommandItem>
                          {miembros.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={`${m.name} ${m.email}`}
                              onSelect={() => {
                                setAsignadoAbierto(false);
                                patchCampo({ asignadoA: m.id });
                              }}
                              className="gap-2 text-[12.5px]"
                            >
                              <Avatar nombre={m.name} />
                              <span className="truncate">{m.name}</span>
                              {m.id === tarea.asignadoA && (
                                <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </CampoInline>

              <CampoInline label="Vence">
                <Popover
                  open={calendarioAbierto}
                  onOpenChange={setCalendarioAbierto}
                >
                  <PopoverTrigger className={controlBase}>
                    <CalendarIcon className="size-3 shrink-0 text-[var(--arca-ink-4)]" />
                    <span className="tabular-nums">
                      {fmtFecha(tarea.venceAt) ?? (
                        <span className="text-[var(--arca-ink-4)]">
                          Sin vencimiento
                        </span>
                      )}
                    </span>
                    {vence && (
                      <span
                        className="text-[10.5px]"
                        style={{
                          color:
                            vence.tono === 'neg'
                              ? 'var(--arca-accent-neg-fg)'
                              : 'var(--arca-ink-4)',
                        }}
                      >
                        {vence.sufijo}
                      </span>
                    )}
                    <Chevron />
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="single"
                      locale={es}
                      defaultMonth={
                        tarea.venceAt ? new Date(tarea.venceAt) : undefined
                      }
                      selected={
                        tarea.venceAt ? new Date(tarea.venceAt) : undefined
                      }
                      onSelect={(d) => {
                        setCalendarioAbierto(false);
                        patchCampo({ venceAt: d ? d.toISOString() : null });
                      }}
                    />
                    {tarea.venceAt && (
                      <button
                        type="button"
                        onClick={() => {
                          setCalendarioAbierto(false);
                          patchCampo({ venceAt: null });
                        }}
                        className="w-full border-t border-[var(--arca-border)] px-3 py-2 text-left text-[12px] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)]"
                      >
                        Quitar vencimiento
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              </CampoInline>

              <CampoInline label="Periodo">
                <div className={controlBase}>
                  <TextoEditable
                    ariaLabel="Periodo de la tarea"
                    valor={tarea.periodo ?? ''}
                    placeholder="AAAA-MM"
                    onGuardar={(v) => patchCampo({ periodo: v })}
                    className="tabular-nums"
                  />
                </div>
              </CampoInline>
            </div>

            {/* Descripción */}
            <div className="flex flex-col gap-2 border-b border-[var(--arca-border)] px-[22px] py-4">
              <MicroLabel>Descripción</MicroLabel>
              <div className="rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-[11px] text-[12.5px] leading-[1.55] text-[var(--arca-ink-2)] transition-colors duration-[120ms] focus-within:border-[var(--arca-border-strong)] focus-within:bg-[var(--arca-surface)]">
                <TextoEditable
                  multilinea
                  ariaLabel="Descripción de la tarea"
                  valor={tarea.descripcion ?? ''}
                  placeholder="Sin descripción"
                  onGuardar={(v) => patchCampo({ descripcion: v })}
                  className="whitespace-pre-wrap"
                />
              </div>
              <span className="text-[11px] text-[var(--arca-ink-4)]">
                Se guarda al salir del campo
              </span>
            </div>

            {/* Empresas — la zona de checklist del handoff */}
            <div className="flex flex-col gap-3 border-b border-[var(--arca-border)] px-[22px] py-4">
              <div className="flex items-center gap-3">
                <MicroLabel>Empresas</MicroLabel>
                <span className="text-[11px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                  {completados}/{total}
                </span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-[var(--arca-border)]">
                  <div
                    className="h-full rounded-[3px] bg-[var(--arca-chart-1)] transition-[width] duration-[150ms] ease-[ease]"
                    style={{ width: `${progreso}%` }}
                  />
                </div>
              </div>

              {total === 0 ? (
                <p className="rounded-[var(--arca-r-md)] border border-dashed border-[var(--arca-border-strong)] px-3 py-4 text-center text-[12px] text-[var(--arca-ink-3)]">
                  Sin empresas asociadas
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {tarea.clientes.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({
                            tareaClienteId: c.id,
                            completado: !c.completado,
                          })
                        }
                        className="group flex w-full items-center gap-2.5 rounded-[var(--arca-r-sm)] px-1 py-[5px] text-left transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] disabled:opacity-60"
                      >
                        <span
                          className={
                            c.completado
                              ? 'grid size-[15px] shrink-0 place-items-center rounded-[4px] bg-[var(--arca-accent-pos)]'
                              : 'grid size-[15px] shrink-0 place-items-center rounded-[4px] border-[1.5px] border-[var(--arca-border-strong)]'
                          }
                        >
                          {c.completado && (
                            <Check
                              className="size-2.5 text-white"
                              strokeWidth={3}
                            />
                          )}
                        </span>
                        <span
                          className={`flex-1 truncate text-[12.5px] ${
                            c.completado
                              ? 'text-[var(--arca-ink-3)] line-through'
                              : 'text-[var(--arca-ink-2)]'
                          }`}
                        >
                          {c.clienteNombre ?? c.clienteId}
                        </span>
                        {c.completado && c.completadoAt && (
                          <span className="shrink-0 text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                            {fmtRelativo(c.completadoAt)}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Comentarios y actividad */}
            <div className="flex flex-col gap-3 px-[22px] pt-4 pb-[18px]">
              <MicroLabel>Comentarios y actividad</MicroLabel>

              <div className="flex items-start gap-2.5">
                <Avatar
                  nombre={sesion?.user.name}
                  variante="propio"
                  size={26}
                />
                <div className="flex flex-1 gap-2">
                  <textarea
                    rows={1}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Escribí un comentario…"
                    aria-label="Nuevo comentario"
                    className="min-h-[34px] flex-1 resize-none rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-[11px] py-2 text-[12.5px] text-[var(--arca-ink)] outline-none placeholder:text-[var(--arca-ink-4)] focus:border-[var(--arca-navy-600)]"
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        comentario.trim()
                      ) {
                        e.preventDefault();
                        commentMutation.mutate(comentario);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!comentario.trim() || commentMutation.isPending}
                    onClick={() => commentMutation.mutate(comentario)}
                    aria-label="Enviar comentario"
                    className="grid size-[34px] shrink-0 place-items-center rounded-[var(--arca-r-md)] bg-[var(--arca-ink)] text-white transition-colors duration-[120ms] hover:bg-black disabled:opacity-40"
                  >
                    <Send className="size-3.5" />
                  </button>
                </div>
              </div>

              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-2.5">
                    <Avatar nombre={c.autorNombre} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-[1.5] text-[var(--arca-ink-2)]">
                        <span className="font-semibold text-[var(--arca-ink)]">
                          {c.autorNombre ?? 'Usuario'}
                        </span>{' '}
                        <span className="text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                          {fmtRelativo(c.createdAt)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-[1.55] whitespace-pre-wrap text-[var(--arca-ink-2)]">
                        {c.contenido}
                      </p>
                    </div>
                  </li>
                ))}

                {/* Evento de sistema. Es el único que el modelo registra hoy:
                    `estado_cambiado_at` / `estado_cambiado_por`. */}
                {tarea.estadoCambiadoAt && (
                  <li className="flex gap-2.5">
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-[7px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                      <Activity className="size-3" />
                    </span>
                    <p className="pt-[3px] text-[12.5px] leading-[1.5] text-[var(--arca-ink-3)]">
                      Pasó a{' '}
                      <span className="font-medium text-[var(--arca-ink-2)]">
                        {ESTADO_LABELS[tarea.estado] ?? tarea.estado}
                      </span>{' '}
                      <span className="text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                        {fmtRelativo(tarea.estadoCambiadoAt)}
                      </span>
                    </p>
                  </li>
                )}

                {comments.length === 0 && !tarea.estadoCambiadoAt && (
                  <li className="text-[12px] text-[var(--arca-ink-4)]">
                    Sin actividad todavía
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Marca de guardado — discreta, sobre el borde inferior. */}
          {guardado.texto && (
            <div className="pointer-events-none absolute right-[22px] bottom-3 flex items-center gap-1 rounded-[var(--arca-r-pill)] bg-[var(--arca-surface)] px-2 py-[2px] text-[11px] text-[var(--arca-ink-3)] shadow-[var(--arca-shadow-sm)]">
              <Check className="size-3 text-[var(--arca-accent-pos)]" />
              {guardado.texto}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la tarea?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina «{tarea.titulo}» junto con sus comentarios y las
              {total > 0
                ? ` ${total} empresas asociadas`
                : ' empresas asociadas'}
              . No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
