import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  MailOpen,
  Search,
  Calendar,
  User,
  Trash2,
  CheckCheck,
  CheckCircle,
  XCircle,
  UserCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  getNotifications,
  deleteNotification,
  getNotification,
  markNotificationOpened,
  markNotificationUnread,
  markAllNotificationsRead,
  assignNotification,
  resolveNotification,
  unresolveNotification,
  listOrgMembersForAssignment,
  classifyNotification,
  classifyUnclassifiedNotifications,
} from '@/actions/notification';
import { getCredenciales } from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { cn } from '@/lib/utils';
import { userQuery } from '../lib/user-query';

/** Valores del enum `notificacion_severidad` en BD. */
const SEVERITY_ORDER: Record<string, number> = {
  urgente: 0,
  accion_requerida: 1,
  informativa: 2,
  sin_clasificar: 3,
};

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity || severity === 'sin_clasificar') return null;
  const styles: Record<string, string> = {
    urgente: 'bg-red-100 text-red-700',
    accion_requerida: 'bg-orange-100 text-orange-700',
    informativa: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    urgente: 'Urgente',
    accion_requerida: 'Acción requerida',
    informativa: 'Info',
  };
  const cls = styles[severity] ?? 'bg-gray-100 text-gray-500';
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${cls}`}
    >
      {labels[severity] ?? severity}
    </span>
  );
}

/** Fila de la lista, tal cual la devuelve `getNotifications`. */
type NotificationRow = Awaited<
  ReturnType<typeof getNotifications>
>['notifications'][number];

interface NotificationsViewProps {
  /**
   * Login de AFIP (`credencial_afip`) al que se acotan las notificaciones.
   * @deprecated El nombre viene del modelo viejo (`representative`); el valor
   * que se pasa es el id de la credencial.
   */
  clientId?: string;
  /**
   * Cliente (entidad fiscal) al que se acotan las notificaciones.
   * @deprecated El nombre viene del modelo viejo (`profile`); el valor que se
   * pasa es el id del `cliente`.
   */
  profileId?: string;
  /** When set, opens this notification on mount (used via ?notificationId= query param) */
  initialNotificationId?: string;
  /** Optional toolbar (e.g. "Actualizar" button + last update) rendered above the list/detail */
  toolbar?: React.ReactNode;
  /** Optional class for the container (e.g. min-h for embedded tab) */
  className?: string;
}

export function NotificationsView({
  clientId: credencialIdProp,
  profileId: clienteIdProp,
  initialNotificationId,
  toolbar,
  className,
}: NotificationsViewProps = {}) {
  const queryClient = useQueryClient();
  const { data: user } = useQuery(userQuery);
  const orgKey = user?.activeOrganizationId ?? '__pending__';
  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [credencialFilter, setCredencialFilter] = useState<string>(
    credencialIdProp ?? 'all'
  );
  const [clienteFilter, setClienteFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severidadFilter, setSeveridadFilter] = useState<string>('all');
  /** 'all' | 'si' | 'no'. Distinto de `onlyUnresolved`: leída ≠ resuelta. */
  const [leidaFilter, setLeidaFilter] = useState<string>('all');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | null
  >(initialNotificationId ?? null);

  // Las notificaciones cuelgan del login de AFIP (credencial); el select sólo
  // aparece cuando la vista no está ya acotada a uno.
  const { data: credenciales = [] } = useQuery({
    queryKey: ['credenciales'],
    queryFn: () => getCredenciales(),
    enabled: !credencialIdProp,
  });

  const effectiveCredencialFilter = credencialIdProp ?? credencialFilter;
  const effectiveClienteFilter = clienteIdProp
    ? clienteIdProp
    : credencialIdProp && clienteFilter !== 'all'
      ? clienteFilter
      : undefined;

  // Pre-filtrar por el cliente elegido en el header. Si no hay cliente del header,
  // volver a "todos". El usuario puede sobreescribir el filtro con el select
  // interno hasta que el header vuelva a cambiar.
  useEffect(() => {
    if (credencialIdProp) {
      setClienteFilter(clienteIdProp ?? 'all');
    }
  }, [credencialIdProp, clienteIdProp]);

  // Get notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: credencialIdProp
      ? [
          'clientNotifications',
          orgKey,
          credencialIdProp,
          effectiveClienteFilter,
          categoryFilter,
          severidadFilter,
          leidaFilter,
          desde,
          hasta,
          onlyUnresolved,
          searchTerm,
        ]
      : [
          'notifications',
          orgKey,
          1,
          credencialFilter,
          desde,
          hasta,
          categoryFilter,
          severidadFilter,
          leidaFilter,
          onlyUnresolved,
          searchTerm,
        ],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 100,
          credencialFilter:
            effectiveCredencialFilter === 'all'
              ? undefined
              : effectiveCredencialFilter,
          clienteId: effectiveClienteFilter,
          search: searchTerm || undefined,
          categoria: categoryFilter === 'all' ? undefined : categoryFilter,
          severidad: severidadFilter === 'all' ? undefined : severidadFilter,
          leida: leidaFilter === 'all' ? undefined : leidaFilter === 'si',
          dateFrom: desde || undefined,
          // El input date da el día a las 00:00; sin esto el "hasta" excluiría
          // todo lo publicado ese mismo día.
          dateTo: hasta ? `${hasta}T23:59:59` : undefined,
          onlyUnresolved: onlyUnresolved || undefined,
        },
      }),
  });

  // Get selected notification details
  const { data: selectedNotification } = useQuery({
    queryKey: ['notification', orgKey, selectedNotificationId],
    queryFn: () => getNotification({ data: { id: selectedNotificationId! } }),
    enabled: !!selectedNotificationId,
  });

  // Get org members for assignment dropdown
  const { data: orgMembers = [] } = useQuery({
    queryKey: ['orgMembersForAssignment', orgKey],
    queryFn: () => listOrgMembersForAssignment(),
  });

  const invalidateNotificationQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    if (credencialIdProp) {
      // La key real es ['clientNotifications', orgKey, credencialIdProp, ...]:
      // invalidamos por el prefijo correcto para que la lista se refresque.
      queryClient.invalidateQueries({
        queryKey: ['clientNotifications', orgKey, credencialIdProp],
      });
    }
    if (selectedNotificationId) {
      queryClient.invalidateQueries({
        queryKey: ['notification', orgKey, selectedNotificationId],
      });
    }
  };

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      toast.success('Notificación eliminada correctamente');
      invalidateNotificationQueries();
      setDeleteDialogOpen(false);
      setNotificationToDelete(null);
      if (selectedNotificationId === notificationToDelete) {
        setSelectedNotificationId(null);
      }
    },
    onError: (error) => {
      toast.error('Error al eliminar la notificación');
      console.error(error);
    },
  });

  const markOpenedMutation = useMutation({
    mutationFn: (id: string) => markNotificationOpened({ data: { id } }),
    onSuccess: () => {
      invalidateNotificationQueries();
      queryClient.invalidateQueries({
        queryKey: ['pendingNotificationsCount'],
      });
    },
  });

  const markUnreadMutation = useMutation({
    mutationFn: (id: string) => markNotificationUnread({ data: { id } }),
    onSuccess: () => {
      invalidateNotificationQueries();
      queryClient.invalidateQueries({
        queryKey: ['pendingNotificationsCount'],
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (result) => {
      invalidateNotificationQueries();
      queryClient.invalidateQueries({
        queryKey: ['pendingNotificationsCount'],
      });
      toast.success(
        result.count > 0
          ? `${result.count} notificación(es) marcadas como leídas`
          : 'No hay notificaciones sin leer'
      );
    },
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { id: string; userId: string | null }) =>
      assignNotification({ data: vars }),
    onSuccess: () => {
      invalidateNotificationQueries();
      toast.success('Notificación asignada');
    },
    onError: () => toast.error('Error al asignar la notificación'),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveNotification({ data: { id } }),
    onSuccess: () => {
      invalidateNotificationQueries();
      toast.success('Notificación resuelta');
    },
    onError: () => toast.error('Error al resolver la notificación'),
  });

  const unresolveMutation = useMutation({
    mutationFn: (id: string) => unresolveNotification({ data: { id } }),
    onSuccess: () => {
      invalidateNotificationQueries();
      toast.success('Notificación reabierta');
    },
    onError: () => toast.error('Error al reabrir la notificación'),
  });

  const classifyMutation = useMutation({
    mutationFn: (id: string) => classifyNotification({ data: { id } }),
    onSuccess: (result) => {
      invalidateNotificationQueries();
      toast.success(
        `Clasificada: severidad=${result.severidad}, categoría=${result.categoria}`
      );
    },
    onError: (err: unknown) => {
      toast.error(
        `Error al clasificar: ${err instanceof Error ? err.message : 'desconocido'}`
      );
    },
  });

  const classifyAllMutation = useMutation({
    mutationFn: () => classifyUnclassifiedNotifications(),
    onSuccess: (result: { classified: number; errors: number }) => {
      invalidateNotificationQueries();
      toast.success(
        `Clasificación batch: ${result.classified} ok, ${result.errors} errores`
      );
    },
    onError: () => toast.error('Error en la clasificación batch'),
  });

  const handleNotificationClick = (notification: {
    id: string;
    leida: boolean;
  }) => {
    setSelectedNotificationId(notification.id);
    if (!notification.leida) {
      markOpenedMutation.mutate(notification.id);
    }
  };

  const handleDeleteClick = (id: string) => {
    setNotificationToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (notificationToDelete) {
      deleteMutation.mutate({ data: { id: notificationToDelete } });
    }
  };

  const handleDownloadAttachment = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (date: Date | string | null) => {
    if (!date) return '-';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    const notificationDate = new Date(dateObj);
    const diffTime = today.getTime() - notificationDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return notificationDate.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return notificationDate.toLocaleDateString('es-ES', {
        weekday: 'short',
      });
    } else {
      return notificationDate.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  };

  const rawNotifications: NotificationRow[] =
    notificationsData?.notifications ?? [];
  // Embebida en un cliente: sólo las que AFIP pudo atribuir a una empresa.
  // Vista global: las que tienen cliente o al menos un login identificable.
  const filteredNotifications = credencialIdProp
    ? rawNotifications.filter((n) => n.clienteRazonSocial || n.clienteCuit)
    : rawNotifications.filter(
        (n) => n.clienteRazonSocial || n.clienteId || n.credencialNombre
      );
  const notifications = [...filteredNotifications].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severidad ?? 'sin_clasificar'] ?? 3;
    const sb = SEVERITY_ORDER[b.severidad ?? 'sin_clasificar'] ?? 3;
    if (sa !== sb) return sa - sb;
    return (
      new Date(b.publicadaAt ?? 0).getTime() -
      new Date(a.publicadaAt ?? 0).getTime()
    );
  });

  const unreadForCopilot = aiAgentEnabled
    ? notifications
        .filter((n) => !n.leida)
        .slice(0, 20)
        .map((n) => ({
          id: n.id,
          mensaje: n.mensaje,
          publicadaAt: n.publicadaAt,
          cliente: n.clienteRazonSocial ?? n.credencialNombre ?? null,
        }))
    : [];

  return (
    <div
      className={cn(
        'border rounded-xl bg-white shadow-sm overflow-hidden',
        toolbar ? 'flex flex-col' : 'flex',
        credencialIdProp ? 'min-h-[400px] flex-1' : 'h-full',
        className
      )}
    >
      {aiAgentEnabled && (
        <CopilotReadableEntity
          description="Notificaciones AFIP no leídas visibles en pantalla (máx. 20). Usá el id para invocar la acción marcarNotificacionLeida."
          value={unreadForCopilot}
        />
      )}
      {toolbar ? (
        <div className="w-full border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-2 flex-wrap shrink-0">
          {toolbar}
        </div>
      ) : null}
      <div className={cn('flex flex-1 min-w-0', toolbar && 'min-h-0')}>
        {/* Left Panel - Notifications List */}
        <div className="w-1/3 border-r flex flex-col bg-muted/30 min-w-0">
          {/* Search and Filters */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar notificaciones..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAllReadMutation.mutate()}
                    disabled={markAllReadMutation.isPending}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Marcar todas como leídas</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => classifyAllMutation.mutate()}
                    disabled={classifyAllMutation.isPending}
                  >
                    <Sparkles className="h-4 w-4" />
                    {classifyAllMutation.isPending ? '…' : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clasificar pendientes con IA</TooltipContent>
              </Tooltip>
            </div>
            {!credencialIdProp && (
              <SearchableSelect
                options={[
                  { value: 'all', label: 'Todos los logins' },
                  ...credenciales.map((c) => ({
                    value: c.id,
                    label: c.nombre ?? c.cuit,
                  })),
                ]}
                value={credencialFilter}
                onValueChange={setCredencialFilter}
                placeholder="Filtrar por login AFIP"
                searchPlaceholder="Buscar login..."
                width="100%"
              />
            )}
            <SearchableSelect
              options={[
                { value: 'all', label: 'Todas las categorías' },
                { value: 'requerimiento', label: 'Requerimiento' },
                { value: 'intimacion', label: 'Intimación' },
                { value: 'deuda', label: 'Deuda' },
                { value: 'vencimiento', label: 'Vencimiento' },
                { value: 'comunicacion_general', label: 'Comunicación' },
                { value: 'inspeccion', label: 'Inspección' },
                { value: 'otro', label: 'Otro' },
              ]}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              placeholder="Filtrar por categoría"
              searchPlaceholder="Buscar categoría..."
              width="100%"
            />
            <SearchableSelect
              options={[
                { value: 'all', label: 'Toda importancia' },
                { value: 'urgente', label: 'Urgente' },
                { value: 'accion_requerida', label: 'Acción requerida' },
                { value: 'informativa', label: 'Informativa' },
                { value: 'sin_clasificar', label: 'Sin clasificar' },
              ]}
              value={severidadFilter}
              onValueChange={setSeveridadFilter}
              placeholder="Filtrar por importancia"
              searchPlaceholder="Buscar importancia..."
              width="100%"
            />
            <SearchableSelect
              options={[
                { value: 'all', label: 'Leídas y no leídas' },
                { value: 'no', label: 'Sólo no leídas' },
                { value: 'si', label: 'Sólo leídas' },
              ]}
              value={leidaFilter}
              onValueChange={setLeidaFilter}
              placeholder="Estado de lectura"
              searchPlaceholder="Buscar..."
              width="100%"
            />
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-9 text-[12.5px]"
                aria-label="Publicadas desde"
              />
              <span className="text-[12.5px] text-[var(--arca-ink-4)]">a</span>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="h-9 text-[12.5px]"
                aria-label="Publicadas hasta"
              />
            </div>
            <label className="flex items-center justify-between gap-2 px-3 py-[7px] rounded-[var(--arca-r-md)] text-[13px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] cursor-pointer">
              <span>Ocultar notificaciones resueltas</span>
              <Switch
                checked={onlyUnresolved}
                onCheckedChange={setOnlyUnresolved}
              />
            </label>
          </div>

          {/* Notifications List */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground">Cargando...</div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-muted-foreground text-center px-4">
                  No hay notificaciones
                </div>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        'p-4 cursor-pointer hover:bg-muted/50 transition-colors',
                        selectedNotificationId === notification.id &&
                          'bg-muted border-l-4 border-l-primary',
                        !notification.leida && 'bg-primary/5',
                        notification.resueltaAt && 'opacity-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {!notification.leida && (
                              <span
                                className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5"
                                aria-hidden
                              />
                            )}
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <p
                              className={cn(
                                'text-sm truncate',
                                !notification.leida
                                  ? 'font-semibold'
                                  : 'font-medium'
                              )}
                            >
                              {credencialIdProp
                                ? notification.clienteRazonSocial ||
                                  notification.clienteCuit ||
                                  'Sin cliente'
                                : notification.clienteRazonSocial ||
                                  notification.clienteCuit ||
                                  notification.credencialNombre ||
                                  'Sin cliente'}
                            </p>
                            <SeverityBadge
                              severity={notification.severidad ?? null}
                            />
                          </div>
                          {notification.aiResumen ? (
                            <p className="text-xs text-muted-foreground italic line-clamp-1 mb-1">
                              {notification.aiResumen}
                            </p>
                          ) : null}
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {notification.mensaje}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {formatDateShort(notification.publicadaAt)}
                            </span>
                          </div>
                        </div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (notification.leida) {
                                  markUnreadMutation.mutate(notification.id);
                                } else {
                                  markOpenedMutation.mutate(notification.id);
                                }
                              }}
                              className="shrink-0 cursor-pointer p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              {notification.leida ? (
                                <MailOpen className="h-3.5 w-3.5" />
                              ) : (
                                <Mail className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {notification.leida
                              ? 'Marcar como no leída'
                              : 'Marcar como leída'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Notification Details */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedNotification ? (
            <>
              {/* Header */}
              <div className="p-6 border-b">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="items-center gap-2 mb-2">
                      <h2 className="text-xl font-semibold">
                        {selectedNotification.clienteRazonSocial ||
                          selectedNotification.clienteCuit ||
                          selectedNotification.credencialNombre ||
                          'Sin cliente'}
                      </h2>
                      {selectedNotification.clienteRazonSocial &&
                        selectedNotification.credencialNombre && (
                          <p className="text-xs text-muted-foreground">
                            Login: {selectedNotification.credencialNombre}
                          </p>
                        )}
                      <span className="font-light text-muted-foreground text-xs">
                        ID Externo: {selectedNotification.externalId}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>
                          {selectedNotification.credencialEmail || 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatDate(selectedNotification.publicadaAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteClick(selectedNotification.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Assignment & Resolution actions */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                      <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                      <SearchableSelect
                        options={[
                          { value: '__none__', label: 'Sin asignar' },
                          ...orgMembers.map((m) => ({
                            value: m.userId,
                            label: m.name || m.email,
                          })),
                        ]}
                        value={selectedNotification.asignadaA ?? '__none__'}
                        onValueChange={(val) =>
                          assignMutation.mutate({
                            id: selectedNotification.id,
                            userId: val === '__none__' ? null : val,
                          })
                        }
                        placeholder="Asignar a..."
                        searchPlaceholder="Buscar miembro..."
                        width="100%"
                      />
                    </div>
                    {(!selectedNotification.severidad ||
                      selectedNotification.severidad === 'sin_clasificar') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          classifyMutation.mutate(selectedNotification.id)
                        }
                        disabled={classifyMutation.isPending}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        {classifyMutation.isPending
                          ? 'Clasificando…'
                          : 'Clasificar con IA'}
                      </Button>
                    )}
                    {selectedNotification.resueltaAt ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          unresolveMutation.mutate(selectedNotification.id)
                        }
                        disabled={unresolveMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reabrir
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() =>
                          resolveMutation.mutate(selectedNotification.id)
                        }
                        disabled={resolveMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Resolver
                      </Button>
                    )}
                  </div>

                  {/* Message */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Mensaje</h3>
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {selectedNotification.mensaje}
                      </p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-2">
                        Fecha de Expiración
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(selectedNotification.venceAt)}
                      </p>
                    </div>
                  </div>

                  {/* Adjuntos — los archivos viven en R2 y se sirven vía
                      /api/documents/{documentoId} (endpoint autenticado). */}
                  {selectedNotification.adjuntos &&
                    selectedNotification.adjuntos.length > 0 && (
                      <div className="space-y-4">
                        {selectedNotification.adjuntos.map((adjunto) => {
                          const nombre = adjunto.nombre ?? 'adjunto';
                          const isPdf =
                            adjunto.mimeType === 'application/pdf' ||
                            /\.pdf$/i.test(nombre);
                          return (
                            <div key={adjunto.id} className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">
                                  {nombre}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!adjunto.url}
                                  onClick={() =>
                                    adjunto.url &&
                                    handleDownloadAttachment(
                                      adjunto.url,
                                      nombre
                                    )
                                  }
                                >
                                  Descargar
                                </Button>
                              </div>
                              {isPdf && adjunto.url && (
                                <iframe
                                  src={adjunto.url}
                                  title={nombre}
                                  className="w-full h-[600px] rounded-lg border border-[var(--arca-border)]"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Mail className="h-16 w-16 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">
                  Selecciona una notificación para ver su contenido
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la
              notificación.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
