/**
 * La bandeja de notificaciones embebida en la ficha del cliente: las mismas
 * piezas que /notifications (lista agrupada + panel de lectura + crear tarea),
 * acotadas a la credencial (y empresa) de la ficha, con estado local en vez de
 * URL — la ficha ya tiene su propia URL con tab y empresa.
 *
 * Reemplaza al NotificationsView viejo (filtros apilados en columna y lista
 * plana), que había quedado de otra época visual.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  ChevronChip,
  QuitarFiltro,
  botonHeader,
  chipFiltro,
} from '@/components/shared/filtros';
import { SEVERIDAD_LABEL, categoriaLabel } from './utils';
import { ListaNotificaciones } from './ListaNotificaciones';
import { PanelLectura } from './PanelLectura';
import { CrearTareaDesdeNotificacion } from './CrearTareaDesdeNotificacion';
import {
  getNotifications,
  getInboxResumen,
  markNotificationOpened,
  markAllNotificationsRead,
} from '@/actions/notification';
import { cn } from '@/lib/utils';

const POR_PAGINA = 50;

const TABS = [
  { valor: 'sin_leer', label: 'Sin leer' },
  { valor: 'todas', label: 'Todas' },
  { valor: 'resueltas', label: 'Resueltas' },
] as const;
type Estado = (typeof TABS)[number]['valor'];

export function InboxEmbebido({
  credencialId,
  clienteId,
  seleccionInicial,
  className,
}: {
  /** Login de AFIP de la ficha: acota todo a sus notificaciones. */
  credencialId: string;
  /** Empresa seleccionada en la ficha (opcional: acota más). */
  clienteId?: string;
  /** Notificación a abrir de entrada (click en la card del Resumen). */
  seleccionInicial?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [estado, setEstado] = useState<Estado>('todas');
  const [categoria, setCategoria] = useState('');
  const [severidad, setSeveridad] = useState('');
  const [q, setQ] = useState('');
  const [paginas, setPaginas] = useState(1);
  const [seleccionada, setSeleccionada] = useState<string | null>(
    seleccionInicial ?? null
  );
  const [creandoTarea, setCreandoTarea] = useState(false);

  // Un nuevo click en la card del Resumen (con la solapa ya montada) cambia
  // la selección. Ajuste durante el render, no en un efecto.
  const [prevInicial, setPrevInicial] = useState(seleccionInicial);
  if (prevInicial !== seleccionInicial) {
    setPrevInicial(seleccionInicial);
    if (seleccionInicial) setSeleccionada(seleccionInicial);
  }

  // Cambiar de empresa en la ficha resetea el recorte (ajuste en render).
  const [prevCliente, setPrevCliente] = useState(clienteId);
  if (prevCliente !== clienteId) {
    setPrevCliente(clienteId);
    setSeleccionada(null);
    setPaginas(1);
  }

  // Solo por las categorías disponibles; los contadores del resumen son de
  // toda la organización y acá no se muestran.
  const { data: resumen } = useQuery({
    queryKey: ['inbox-resumen'],
    queryFn: () => getInboxResumen(),
  });

  const parametros = {
    limit: POR_PAGINA * paginas,
    page: 1,
    credencialFilter: credencialId,
    clienteId: clienteId ?? undefined,
    categoria: categoria || undefined,
    severidad: severidad || undefined,
    search: q || undefined,
    leida: estado === 'sin_leer' ? false : undefined,
    onlyUnresolved: estado === 'sin_leer' ? true : undefined,
    soloResueltas: estado === 'resueltas' ? true : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'embebido', parametros],
    queryFn: () => getNotifications({ data: parametros }),
  });
  const notificaciones = useMemo(() => data?.notifications ?? [], [data]);
  const total = data?.totalCount ?? 0;
  const hayMas = notificaciones.length < total;

  const idx = notificaciones.findIndex((n) => n.id === seleccionada);
  const abierta = idx >= 0 ? notificaciones[idx] : null;

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-resumen'] });
    // La card del Resumen de la ficha tiene su propia query de sin-leer.
    void queryClient.invalidateQueries({ queryKey: ['unreadNotifications'] });
  };

  const marcarLeida = useMutation({
    mutationFn: (id: string) => markNotificationOpened({ data: { id } }),
    onSuccess: refrescar,
  });

  const marcarTodas = useMutation({
    mutationFn: (ids: string[]) => markAllNotificationsRead({ data: { ids } }),
    onSuccess: (r) => {
      refrescar();
      toast.success(
        `${r.count} ${r.count === 1 ? 'notificación marcada' : 'notificaciones marcadas'} como leídas`
      );
    },
    onError: () => toast.error('No se pudieron marcar como leídas'),
  });

  // Igual que la bandeja grande: leída tras 1,5 s de lectura real.
  useEffect(() => {
    if (!abierta || abierta.leida) return;
    const id = abierta.id;
    const t = setTimeout(() => marcarLeida.mutate(id), 1500);
    return () => clearTimeout(t);
    // `marcarLeida` es estable entre renders; incluirla reinicia el timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta?.id, abierta?.leida]);

  const irA = (delta: number) => {
    if (notificaciones.length === 0) return;
    const siguiente = Math.min(
      Math.max(idx + delta, 0),
      notificaciones.length - 1
    );
    const id = notificaciones[siguiente]?.id;
    if (id) setSeleccionada(id);
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* Filtros: mismos chips que la bandeja, sin selector de empresa (la
          ficha ya lo tiene) ni fechas (para eso está la bandeja grande). */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <div
          role="tablist"
          className="flex items-center gap-0.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] p-[2px]"
        >
          {TABS.map((t) => (
            <button
              key={t.valor}
              role="tab"
              type="button"
              aria-selected={estado === t.valor}
              onClick={() => {
                setEstado(t.valor);
                setPaginas(1);
              }}
              className={cn(
                'rounded-[8px] px-2.5 py-1 text-[12px] transition-colors duration-[120ms]',
                estado === t.valor
                  ? 'bg-[var(--arca-ink)] font-medium text-white'
                  : 'text-[var(--arca-ink-3)] hover:text-[var(--arca-ink-2)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className={chipFiltro(categoria !== '')}>
            Categoría: {categoria ? categoriaLabel(categoria) : 'todas'}
            {categoria ? (
              <QuitarFiltro onQuitar={() => setCategoria('')} />
            ) : (
              <ChevronChip />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[320px] min-w-[180px] overflow-y-auto"
          >
            {(resumen?.categorias ?? []).map((c) => (
              <DropdownMenuItem
                key={c}
                className="text-[12.5px]"
                onSelect={() => setCategoria(c)}
              >
                {categoriaLabel(c)}
                {c === categoria && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={chipFiltro(severidad !== '')}>
            Importancia: {severidad ? SEVERIDAD_LABEL[severidad] : 'toda'}
            {severidad ? (
              <QuitarFiltro onQuitar={() => setSeveridad('')} />
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
                onSelect={() => setSeveridad(sv)}
              >
                {SEVERIDAD_LABEL[sv]}
                {sv === severidad && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative min-w-[200px] flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--arca-ink-4)]" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPaginas(1);
            }}
            placeholder="Buscar notificaciones…"
            className="h-8 pl-8 text-[12.5px]"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            const ids = notificaciones.filter((n) => !n.leida).map((n) => n.id);
            if (ids.length === 0) {
              toast.info('No hay notificaciones sin leer en este recorte');
              return;
            }
            marcarTodas.mutate(ids);
          }}
          className={cn(botonHeader, 'ml-auto')}
        >
          <CheckCheck className="size-3.5" />
          Marcar todas leídas
        </button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-[12px] border border-[var(--arca-border)]">
        <ListaNotificaciones
          notificaciones={notificaciones}
          seleccionada={seleccionada}
          onSeleccionar={setSeleccionada}
          cargando={isLoading}
          total={total}
          vacio={
            estado === 'sin_leer'
              ? 'Estás al día'
              : estado === 'resueltas'
                ? 'Todavía no hay notificaciones resueltas'
                : 'No hay notificaciones con estos filtros'
          }
          hayMas={hayMas}
          onCargarMas={() => setPaginas((p) => p + 1)}
        />
        <PanelLectura
          notificacionId={seleccionada}
          onCrearTarea={() => setCreandoTarea(true)}
          onIrATarea={(tareaId) =>
            void navigate({ to: '/tareas', search: { tarea: tareaId } })
          }
          onAnterior={() => irA(-1)}
          onSiguiente={() => irA(1)}
          hayAnterior={idx > 0}
          haySiguiente={idx >= 0 && idx < notificaciones.length - 1}
        />
      </div>

      <CrearTareaDesdeNotificacion
        abierto={creandoTarea}
        onAbrirChange={setCreandoTarea}
        notificacion={abierta}
        onCreada={(tareaId) =>
          void navigate({ to: '/tareas', search: { tarea: tareaId } })
        }
      />
    </div>
  );
}
