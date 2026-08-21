'use client';

/**
 * Panel derecho: la notificación abierta y lo que se puede hacer con ella.
 *
 * `Crear tarea` va primero y como botón primario. Es el cambio de fondo del
 * rediseño: la notificación deja de ser sólo lectura y pasa a ser el disparador
 * del trabajo.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Mail,
  MoreHorizontal,
  Plus,
  Users,
  Zap,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getNotification,
  listTareasDeNotificacion,
  listOrgMembersForAssignment,
  assignNotification,
  resolveNotification,
  unresolveNotification,
  markNotificationUnread,
} from '@/actions/notification';
import {
  SEVERIDAD_LABEL,
  SEVERIDAD_PILL,
  asuntoYPreview,
  fechaHoraLarga,
  iniciales,
} from './utils';

interface Props {
  notificacionId: string | null;
  onCrearTarea: () => void;
  onIrATarea: (tareaId: string) => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  hayAnterior: boolean;
  haySiguiente: boolean;
}

const BOTON =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] ease-[ease] hover:bg-[var(--arca-surface-2)] disabled:opacity-50';

/** `1,2 MB` — el peso del adjunto, en el formato del sistema. */
function peso(bytes: number | null) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function PanelLectura({
  notificacionId,
  onCrearTarea,
  onIrATarea,
  onAnterior,
  onSiguiente,
  hayAnterior,
  haySiguiente,
}: Props) {
  const queryClient = useQueryClient();

  const { data: n, isLoading } = useQuery({
    queryKey: ['notificacion', notificacionId],
    queryFn: () => getNotification({ data: { id: notificacionId! } }),
    enabled: notificacionId !== null,
  });

  const { data: tareas = [] } = useQuery({
    queryKey: ['notificacion-tareas', notificacionId],
    queryFn: () =>
      listTareasDeNotificacion({ data: { notificacionId: notificacionId! } }),
    enabled: notificacionId !== null,
  });

  const { data: miembros = [] } = useQuery({
    queryKey: ['miembros-asignacion'],
    queryFn: () => listOrgMembersForAssignment(),
  });

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({
      queryKey: ['notificacion', notificacionId],
    });
  };

  const resolver = useMutation({
    mutationFn: (resuelta: boolean) =>
      resuelta
        ? resolveNotification({ data: { id: notificacionId! } })
        : unresolveNotification({ data: { id: notificacionId! } }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo cambiar el estado'),
  });

  const asignar = useMutation({
    mutationFn: (userId: string | null) =>
      assignNotification({ data: { id: notificacionId!, userId } }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo asignar'),
  });

  const noLeida = useMutation({
    mutationFn: () => markNotificationUnread({ data: { id: notificacionId! } }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo marcar como no leída'),
  });

  if (!notificacionId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--arca-bg)]">
        <Mail className="size-7 text-[var(--arca-ink-4)]" />
        <p className="text-[13px] text-[var(--arca-ink-3)]">
          Seleccioná una notificación para ver su contenido
        </p>
      </div>
    );
  }

  if (isLoading || !n) {
    return (
      <div className="flex flex-1 flex-col gap-4 bg-[var(--arca-bg)] p-7">
        <div className="h-6 w-2/3 animate-pulse rounded bg-[var(--arca-surface-2)]" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-4 w-full animate-pulse rounded bg-[var(--arca-surface-2)]"
          />
        ))}
      </div>
    );
  }

  const { asunto, preview } = asuntoYPreview(n.mensaje, n.aiResumen);

  // Muchas notificaciones de AFIP son una sola línea: ahí el asunto ES el
  // mensaje entero y la card del cuerpo repetiría el título. En ese caso sólo
  // queda el resumen de la IA, si lo hay.
  const cuerpo = n.mensaje.split('\n').slice(1).join('\n').trim();
  const hayCuerpo = cuerpo !== '';
  const resuelta = n.resueltaAt !== null;
  const empresa = n.clienteRazonSocial ?? n.credencialNombre ?? 'Sin empresa';
  const asignado = miembros.find((m) => m.userId === n.asignadaA);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--arca-bg)]">
      {/* Encabezado */}
      <div className="shrink-0 border-b border-[var(--arca-border)] px-7 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-[var(--arca-chart-1)] text-[12px] font-semibold text-white"
            aria-hidden="true"
          >
            {iniciales(empresa)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                {empresa}
              </span>
              {n.clienteCuit && (
                <span className="text-[11px] text-[var(--arca-ink-3)] tabular-nums [font-family:var(--ff-mono)]">
                  {n.clienteCuit}
                </span>
              )}
              <span
                className={`rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium ${
                  resuelta
                    ? 'bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]'
                    : SEVERIDAD_PILL[n.severidad]
                }`}
              >
                {resuelta ? 'Resuelta' : SEVERIDAD_LABEL[n.severidad]}
              </span>
            </div>

            <h2 className="mt-1 text-[21px] leading-[1.25] font-semibold tracking-[-0.02em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
              {asunto}
            </h2>

            <p className="mt-1 text-[11.5px] text-[var(--arca-ink-3)]">
              {n.categoria ?? 'AFIP'} · Domicilio fiscal electrónico · login{' '}
              <span className="[font-family:var(--ff-mono)]">
                {n.credencialNombre}
              </span>{' '}
              ·{' '}
              <span className="tabular-nums [font-family:var(--ff-mono)]">
                {fechaHoraLarga(n.publicadaAt ?? n.createdAt)}
              </span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onAnterior}
              disabled={!hayAnterior}
              aria-label="Notificación anterior"
              title="Anterior (K)"
              className="grid size-[30px] place-items-center rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] disabled:opacity-40"
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={onSiguiente}
              disabled={!haySiguiente}
              aria-label="Notificación siguiente"
              title="Siguiente (J)"
              className="grid size-[30px] place-items-center rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] disabled:opacity-40"
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--arca-border)] px-7 py-3">
        <button
          type="button"
          onClick={onCrearTarea}
          className="inline-flex items-center gap-1.5 rounded-[var(--arca-r-md)] bg-[var(--arca-ink)] px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors duration-[120ms] hover:bg-black"
        >
          <Plus className="size-3.5" />
          Crear tarea
        </button>

        <button
          type="button"
          onClick={() => resolver.mutate(!resuelta)}
          disabled={resolver.isPending}
          className={BOTON}
        >
          <Check className="size-3.5" />
          {resuelta ? 'Reabrir' : 'Marcar resuelta'}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className={BOTON}>
            <Users className="size-3.5" />
            {asignado ? asignado.name : 'Asignar'}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[190px]">
            <DropdownMenuItem
              className="text-[12.5px]"
              onSelect={() => asignar.mutate(null)}
            >
              Sin asignar
            </DropdownMenuItem>
            {miembros.map((m) => (
              <DropdownMenuItem
                key={m.userId}
                className="text-[12.5px]"
                onSelect={() => asignar.mutate(m.userId)}
              >
                {m.name}
                {m.userId === n.asignadaA && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Más acciones" className={BOTON}>
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-[12.5px]"
              onSelect={() => noLeida.mutate()}
            >
              Marcar como no leída
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[12.5px]"
              onSelect={() => {
                void navigator.clipboard.writeText(window.location.href);
                toast.success('Enlace copiado');
              }}
            >
              Copiar enlace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cuerpo */}
      <div className="flex flex-col gap-3.5 px-7 py-5">
        {/* Tareas ya creadas desde esta notificación */}
        {tareas.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-[var(--arca-r-md)] bg-[var(--arca-accent-pos-bg)] px-3 py-2 text-[12.5px] text-[var(--arca-accent-pos-fg)]"
          >
            {t.fuente !== 'manual' && (
              <span className="inline-flex items-center gap-1 rounded-[var(--arca-r-pill)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-[2px] text-[10.5px] text-[var(--arca-ink-2)]">
                <Zap className="size-3" />
                Automática · regla «{t.fuente}»
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">
              Tarea creada · {t.titulo}
            </span>
            <button
              type="button"
              onClick={() => onIrATarea(t.id)}
              className="shrink-0 font-medium text-[var(--arca-navy-700)] hover:underline"
            >
              Ver tarea
            </button>
          </div>
        ))}

        {(hayCuerpo || n.aiResumen) && (
          <article className="max-w-[72ch] rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-6 py-[22px]">
            {n.aiResumen && (
              <p
                className={`text-[12.5px] leading-[1.6] text-[var(--arca-ink-3)] ${
                  hayCuerpo
                    ? 'mb-3 border-b border-[var(--arca-border)] pb-3'
                    : ''
                }`}
              >
                {preview}
              </p>
            )}
            {hayCuerpo && (
              <p className="text-[13px] leading-[1.65] whitespace-pre-wrap text-[var(--arca-ink-2)]">
                {cuerpo}
              </p>
            )}
          </article>
        )}

        {/* Vencimiento detectado. `vence_at` lo completa el scrapeo cuando
            encuentra una fecha en el cuerpo; si no hay, la tira no aparece. */}
        {n.venceAt && (
          <div className="flex max-w-[72ch] items-center gap-3 rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-5 py-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]">
              <Calendar className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-[var(--arca-ink)]">
                Vencimiento detectado:{' '}
                <span className="tabular-nums">
                  {fechaHoraLarga(n.venceAt).split(',')[0]}
                </span>
              </p>
              <p className="text-[11.5px] text-[var(--arca-ink-3)]">
                Se usa como fecha de la tarea si la creás desde acá.
              </p>
            </div>
            <button
              type="button"
              onClick={onCrearTarea}
              className={`${BOTON} shrink-0`}
            >
              Crear tarea con esta fecha
            </button>
          </div>
        )}

        {/* Adjuntos */}
        {n.adjuntos.length > 0 && (
          <div className="flex max-w-[72ch] flex-col">
            {n.adjuntos.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 border-t border-[var(--arca-border)] py-2.5 first:border-t-0"
              >
                <span className="grid size-[30px] shrink-0 place-items-center rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                  <FileText className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--arca-ink-2)]">
                  {a.nombre}
                </span>
                {peso(a.tamanoBytes) && (
                  <span className="shrink-0 text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
                    {peso(a.tamanoBytes)}
                  </span>
                )}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--arca-navy-700)] hover:underline"
                >
                  <Download className="size-3" />
                  Descargar
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
