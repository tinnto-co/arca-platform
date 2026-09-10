'use client';

/**
 * Panel derecho: la notificación abierta y lo que se puede hacer con ella.
 *
 * `Crear tarea` va primero y como botón primario. Es el cambio de fondo del
 * rediseño: la notificación deja de ser sólo lectura y pasa a ser el disparador
 * del trabajo.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Landmark,
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
  markNotificationOpened,
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
  /** Se marcó como no leída a mano: la bandeja no debe volver a marcarla. */
  onNoLeidaManual: (id: string) => void;
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

/**
 * Adjunto con vista previa desplegable.
 *
 * El endpoint `/api/documents/:id` sirve el archivo inline y con `?download=1`
 * fuerza la descarga, así que el mismo id da preview y bajada; sólo cambia el
 * parámetro. Antes "Descargar" abría el PDF en otra pestaña en vez de bajarlo.
 *
 * El preview se monta recién al abrirlo: un iframe por adjunto pediría todos
 * los PDF de la notificación aunque no se mire ninguno.
 */
function Adjunto({
  nombre,
  url,
  mimeType,
  tamanoBytes,
}: {
  nombre: string;
  url: string;
  mimeType: string | null;
  tamanoBytes: number | null;
}) {
  const esPdf =
    mimeType === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf');
  const esImagen = mimeType?.startsWith('image/') ?? false;
  const previsualizable = esPdf || esImagen;

  // Abierto de entrada: en una notificación de AFIP el adjunto suele SER el
  // contenido, y el mensaje apenas lo anuncia.
  const [abierto, setAbierto] = useState(previsualizable);

  return (
    <div className="border-t border-[var(--arca-border)] py-2.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[var(--arca-r-sm)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
          {esImagen ? (
            <ImageIcon className="size-3.5" />
          ) : (
            <FileText className="size-3.5" />
          )}
        </span>

        {previsualizable ? (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] hover:underline"
          >
            {nombre}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[var(--arca-ink-2)]">
            {nombre}
          </span>
        )}

        {peso(tamanoBytes) && (
          <span className="shrink-0 text-[10.5px] text-[var(--arca-ink-4)] tabular-nums [font-family:var(--ff-mono)]">
            {peso(tamanoBytes)}
          </span>
        )}

        {previsualizable && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--arca-navy-700)] hover:underline"
          >
            {abierto ? (
              <>
                <ChevronUp className="size-3" />
                Ocultar
              </>
            ) : (
              <>
                <Eye className="size-3" />
                Ver
              </>
            )}
          </button>
        )}

        <a
          href={`${url}?download=1`}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--arca-navy-700)] hover:underline"
        >
          <Download className="size-3" />
          Descargar
        </a>
      </div>

      {abierto && (
        <div className="mt-2.5 overflow-hidden rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
          {esImagen ? (
            <img
              src={url}
              alt={nombre}
              className="max-h-[560px] w-full object-contain"
            />
          ) : (
            // Sin `sandbox`: el visor de PDF del navegador no arranca dentro
            // de un iframe restringido y queda un recuadro gris. El archivo es
            // del mismo origen y lo sirve nuestro endpoint autenticado.
            <iframe src={url} title={nombre} className="h-[560px] w-full" />
          )}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block border-t border-[var(--arca-border)] px-3 py-2 text-[11.5px] text-[var(--arca-navy-700)] hover:underline"
          >
            Abrir en una pestaña nueva
          </a>
        </div>
      )}
    </div>
  );
}

export function PanelLectura({
  notificacionId,
  onCrearTarea,
  onIrATarea,
  onAnterior,
  onSiguiente,
  hayAnterior,
  haySiguiente,
  onNoLeidaManual,
}: Props) {
  const queryClient = useQueryClient();

  // Un asunto de ARCA puede ocupar varios renglones y empujar todo hacia
  // abajo: se recorta a dos líneas con opción de abrirlo. El botón aparece
  // sólo si de verdad se corta —se mide el desborde en vez de suponer un
  // largo, porque depende del ancho del panel—, y estos hooks van acá arriba
  // porque más abajo hay returns tempranos.
  const asuntoRef = useRef<HTMLHeadingElement>(null);
  const [asuntoExpandido, setAsuntoExpandido] = useState(false);
  const [asuntoLargo, setAsuntoLargo] = useState(false);

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

  const marcarLeida = useMutation<{ leida: boolean }, Error, boolean>({
    mutationFn: (leida: boolean) =>
      leida
        ? markNotificationOpened({ data: { id: notificacionId! } })
        : markNotificationUnread({ data: { id: notificacionId! } }),
    onSuccess: () => {
      refrescar();
      void queryClient.invalidateQueries({ queryKey: ['inbox-resumen'] });
      void queryClient.invalidateQueries({
        queryKey: ['pendingNotificationsCount'],
      });
    },
    onError: () => toast.error('No se pudo cambiar el estado'),
  });

  const asignar = useMutation({
    mutationFn: (userId: string | null) =>
      assignNotification({ data: { id: notificacionId!, userId } }),
    onSuccess: refrescar,
    onError: () => toast.error('No se pudo asignar'),
  });

  useLayoutEffect(() => {
    // Se mide sólo con el recorte puesto: expandido no desborda, y volver a
    // medir ahí apagaba el botón y dejaba el asunto abierto sin forma de
    // cerrarlo.
    const el = asuntoRef.current;
    if (!el || asuntoExpandido) return;
    setAsuntoLargo(el.scrollHeight > el.clientHeight + 1);
  }, [n?.mensaje, asuntoExpandido]);

  // Cambiar de notificación arranca de nuevo con el asunto recortado.
  useLayoutEffect(() => setAsuntoExpandido(false), [notificacionId]);

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
  const leida = n.leida;
  const empresa = n.clienteRazonSocial ?? n.credencialNombre ?? 'Sin empresa';
  const asignado = miembros.find((m) => m.userId === n.asignadaA);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--arca-bg)]">
      {/* Encabezado */}
      <div className="shrink-0 px-6 pt-4 pb-2">
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
                className={`rounded-[var(--arca-r-pill)] px-2 py-[2px] text-[10.5px] font-medium ${SEVERIDAD_PILL[n.severidad]}`}
              >
                {SEVERIDAD_LABEL[n.severidad]}
              </span>
            </div>

            <h2
              ref={asuntoRef}
              className={`mt-0.5 text-[19px] leading-[1.22] font-semibold tracking-[-0.02em] text-[var(--arca-ink)] [font-family:var(--ff-display)] ${
                asuntoExpandido ? '' : 'line-clamp-2'
              }`}
              title={asunto}
            >
              {asunto}
            </h2>
            {asuntoLargo && (
              <button
                type="button"
                onClick={() => setAsuntoExpandido((v) => !v)}
                className="mt-0.5 text-[11.5px] font-medium text-[var(--arca-navy-700)] hover:underline"
              >
                {asuntoExpandido ? 'Ver menos' : 'Ver asunto completo'}
              </button>
            )}

            <p className="mt-1 text-[11.5px] text-[var(--arca-ink-3)]">
              {n.categoria ?? 'ARCA'} · Domicilio fiscal electrónico · login{' '}
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--arca-border)] px-6 py-2.5">
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
          onClick={() => {
            if (leida && notificacionId) onNoLeidaManual(notificacionId);
            marcarLeida.mutate(!leida);
          }}
          disabled={marcarLeida.isPending}
          className={BOTON}
        >
          <Check className="size-3.5" />
          {leida ? 'Marcar como no leída' : 'Marcar como leída'}
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
              onSelect={() => {
                if (notificacionId) onNoLeidaManual(notificacionId);
                noLeida.mutate();
              }}
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

      {/* Lo que puso la plataforma: tareas creadas y la fecha que detectó el
          scrapeo. Queda sobre el fondo de la pantalla, sin tarjeta. */}
      {(tareas.length > 0 || n.venceAt) && (
        <div className="flex shrink-0 flex-col gap-2 px-6 pt-3">
          {tareas.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded-[var(--arca-r-md)] bg-[var(--arca-accent-pos-bg)] px-3 py-2 text-[12.5px] text-[var(--arca-accent-pos-fg)]"
            >
              {t.fuente !== 'manual' && (
                <span className="inline-flex items-center gap-1 rounded-[var(--arca-r-pill)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2 py-[2px] text-[10.5px] text-[var(--arca-ink-2)]">
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

          {/* La fecha la completa el scrapeo cuando la encuentra en el cuerpo.
              Con una tarea ya creada la tira sobra: ofrecía crear una segunda
              para el mismo vencimiento. */}
          {n.venceAt && tareas.length === 0 && (
            <div className="flex items-center gap-3 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-4 py-3">
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
        </div>
      )}

      {/* Lo que llegó de ARCA: una tarjeta con su propia cabecera, como un
          mensaje. Es blanca contra el beige de la pantalla, así se ve de una
          dónde termina lo que hace la plataforma y empieza lo recibido. */}
      <div className="m-6 mt-3 shrink-0 overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)]">
        <div className="flex items-center gap-2 bg-[var(--arca-surface-2)] px-5 py-2">
          <Landmark className="size-3.5 text-[var(--arca-ink-4)]" />
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-3)]">
            Recibido de ARCA
          </span>
        </div>

        {(hayCuerpo || n.aiResumen) && (
          <div className="px-5 py-3.5">
            {n.aiResumen && (
              <p
                className={`max-w-[72ch] text-[12.5px] leading-[1.6] text-[var(--arca-ink-3)] ${
                  hayCuerpo
                    ? 'mb-3 border-b border-[var(--arca-border)] pb-3'
                    : ''
                }`}
              >
                {preview}
              </p>
            )}
            {hayCuerpo && (
              <p className="max-w-[72ch] text-[13px] leading-[1.65] whitespace-pre-wrap text-[var(--arca-ink-2)]">
                {cuerpo}
              </p>
            )}
          </div>
        )}

        {n.adjuntos.length > 0 && (
          <div className="flex flex-col border-t border-[var(--arca-border)] px-5 py-3">
            {n.adjuntos.map((a) => (
              <Adjunto
                key={a.id}
                nombre={a.nombre}
                url={a.url}
                mimeType={a.mimeType}
                tamanoBytes={a.tamanoBytes}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
