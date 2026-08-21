import { useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { InboxHeader } from '@/components/notificaciones/InboxHeader';
import type { FiltrosInbox } from '@/components/notificaciones/InboxHeader';
import { ListaNotificaciones } from '@/components/notificaciones/ListaNotificaciones';
import { PanelLectura } from '@/components/notificaciones/PanelLectura';
import { CrearTareaDesdeNotificacion } from '@/components/notificaciones/CrearTareaDesdeNotificacion';
import {
  getNotifications,
  getInboxResumen,
  markNotificationOpened,
  markAllNotificationsRead,
  resolveNotification,
} from '@/actions/notification';
import { getCredenciales } from '@/actions/client';
import { listOrgRepresentatives } from '@/actions/tareas';

interface Busqueda {
  estado?: 'sin_leer' | 'todas' | 'resueltas';
  login?: string;
  categoria?: string;
  importancia?: string;
  empresa?: string;
  desde?: string;
  hasta?: string;
  adjunto?: boolean;
  q?: string;
  n?: string;
}

// Cada campo con su `.catch`: un parámetro raro en la URL no puede tumbar la
// bandeja, simplemente no filtra.
const esquema = z.object({
  estado: z
    .enum(['sin_leer', 'todas', 'resueltas'])
    .optional()
    .catch(undefined),
  login: z.string().optional().catch(undefined),
  categoria: z.string().optional().catch(undefined),
  importancia: z.string().optional().catch(undefined),
  empresa: z.string().optional().catch(undefined),
  desde: z.string().optional().catch(undefined),
  hasta: z.string().optional().catch(undefined),
  adjunto: z.boolean().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  n: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute('/_authed/notifications/')({
  // Tipo de retorno explícito, como el resto de las rutas: pasar el schema de
  // zod pelado deja el `useSearch()` en `any`.
  validateSearch: (s: Record<string, unknown>): Busqueda => esquema.parse(s),
  component: RouteComponent,
});

/** Cuántas trae cada tanda. */
const POR_PAGINA = 50;

/** Un filtro vacío no viaja en la URL. */
const oQuitar = (v: string) => (v === '' ? undefined : v);

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const search: Busqueda = Route.useSearch();
  const queryClient = useQueryClient();

  const [paginas, setPaginas] = useState(1);
  const [creandoTarea, setCreandoTarea] = useState(false);

  const filtros: FiltrosInbox = {
    estado: search.estado ?? 'todas',
    credencial: search.login ?? '',
    categoria: search.categoria ?? '',
    severidad: search.importancia ?? '',
    empresa: search.empresa ?? '',
    desde: search.desde ?? '',
    hasta: search.hasta ?? '',
    soloConAdjunto: search.adjunto ?? false,
    q: search.q ?? '',
  };

  const setFiltros = (p: Partial<FiltrosInbox>) => {
    setPaginas(1);
    void navigate({
      search: (prev: Busqueda) => ({
        ...prev,
        ...(p.estado !== undefined && { estado: p.estado }),
        ...(p.credencial !== undefined && { login: oQuitar(p.credencial) }),
        ...(p.categoria !== undefined && { categoria: oQuitar(p.categoria) }),
        ...(p.severidad !== undefined && { importancia: oQuitar(p.severidad) }),
        ...(p.empresa !== undefined && { empresa: oQuitar(p.empresa) }),
        ...(p.desde !== undefined && { desde: oQuitar(p.desde) }),
        ...(p.hasta !== undefined && { hasta: oQuitar(p.hasta) }),
        ...(p.soloConAdjunto !== undefined && {
          adjunto: p.soloConAdjunto || undefined,
        }),
        ...(p.q !== undefined && { q: oQuitar(p.q) }),
      }),
      replace: true,
    });
  };

  const seleccionar = (id: string | undefined) =>
    void navigate({
      search: (prev: Busqueda) => ({ ...prev, n: id }),
      replace: true,
    });

  // ─── Datos ────────────────────────────────────────────────────────────────

  const { data: resumen } = useQuery({
    queryKey: ['inbox-resumen'],
    queryFn: () => getInboxResumen(),
  });

  const { data: credenciales = [] } = useQuery({
    queryKey: ['credenciales'],
    queryFn: () => getCredenciales(),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['tareas-empresas'],
    queryFn: () => listOrgRepresentatives(),
  });

  const parametros = {
    limit: POR_PAGINA * paginas,
    page: 1,
    credencialFilter: oQuitar(filtros.credencial),
    clienteId: oQuitar(filtros.empresa),
    dateFrom: oQuitar(filtros.desde),
    dateTo: oQuitar(filtros.hasta),
    categoria: oQuitar(filtros.categoria),
    severidad: oQuitar(filtros.severidad),
    search: oQuitar(filtros.q),
    // Los tabs se traducen a filtros del servidor. Recortar en el cliente
    // haría mentir al contador y a la paginación.
    leida: filtros.estado === 'sin_leer' ? false : undefined,
    onlyUnresolved: filtros.estado === 'sin_leer' ? true : undefined,
    soloResueltas: filtros.estado === 'resueltas' ? true : undefined,
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      'notifications',
      parametros,
      filtros.estado,
      filtros.soloConAdjunto,
    ],
    queryFn: () =>
      getNotifications({
        data: { ...parametros, soloConAdjunto: filtros.soloConAdjunto },
      }),
  });

  const notificaciones = useMemo(() => data?.notifications ?? [], [data]);

  const seleccionada = search.n ?? null;
  const idx = notificaciones.findIndex((n) => n.id === seleccionada);
  const abierta = idx >= 0 ? notificaciones[idx] : null;

  // ─── Mutaciones ───────────────────────────────────────────────────────────

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-resumen'] });
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

  const resolver = useMutation({
    mutationFn: (id: string) => resolveNotification({ data: { id } }),
    onSuccess: () => {
      refrescar();
      void queryClient.invalidateQueries({ queryKey: ['notificacion'] });
    },
    onError: () => toast.error('No se pudo marcar como resuelta'),
  });

  // Se marca leída tras 1,5 s de lectura: abrir de paso mientras se navega con
  // el teclado no debería contar como leída.
  useEffect(() => {
    if (!abierta || abierta.leida) return;
    const id = abierta.id;
    const t = setTimeout(() => marcarLeida.mutate(id), 1500);
    return () => clearTimeout(t);
    // `marcarLeida` es estable entre renders; incluirla reinicia el timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta?.id, abierta?.leida]);

  // ─── Teclado ──────────────────────────────────────────────────────────────

  const irA = (delta: number) => {
    if (notificaciones.length === 0) return;
    const siguiente = Math.min(
      Math.max(idx + delta, 0),
      notificaciones.length - 1
    );
    seleccionar(notificaciones[siguiente]?.id);
  };

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      const foco = document.activeElement;
      // Sin esto, escribir "e" en el buscador marca la notificación resuelta.
      if (
        foco instanceof HTMLInputElement ||
        foco instanceof HTMLTextAreaElement
      )
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        irA(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        irA(-1);
      } else if (e.key === 'e' && abierta) {
        e.preventDefault();
        resolver.mutate(abierta.id);
      } else if (e.key === 't' && abierta) {
        e.preventDefault();
        setCreandoTarea(true);
      }
    };
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  const total = data?.totalCount ?? 0;
  const hayMas = notificaciones.length < total;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--arca-bg)]">
      <InboxHeader
        filtros={filtros}
        onFiltro={setFiltros}
        onLimpiar={() =>
          setFiltros({
            estado: 'todas',
            credencial: '',
            categoria: '',
            severidad: '',
            empresa: '',
            desde: '',
            hasta: '',
            soloConAdjunto: false,
            q: '',
          })
        }
        credenciales={credenciales}
        categorias={resumen?.categorias ?? []}
        empresas={empresas}
        resumen={{
          total: resumen?.total ?? 0,
          sinLeer: resumen?.sinLeer ?? 0,
          resultados: total,
        }}
        ultimaSync={resumen?.ultimaSync ?? null}
        onMarcarTodasLeidas={() => {
          const ids = notificaciones.filter((n) => !n.leida).map((n) => n.id);
          if (ids.length === 0) {
            toast.info('No hay notificaciones sin leer en este recorte');
            return;
          }
          marcarTodas.mutate(ids);
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ListaNotificaciones
          notificaciones={notificaciones}
          seleccionada={seleccionada}
          onSeleccionar={(id) => seleccionar(id)}
          cargando={isLoading}
          total={total}
          vacio={
            filtros.estado === 'sin_leer'
              ? 'Estás al día'
              : filtros.estado === 'resueltas'
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
