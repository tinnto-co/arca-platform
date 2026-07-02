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
import { getRepresentatives, getRepresentativeClients } from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { cn } from '@/lib/utils';
import { userQuery } from '../lib/user-query';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  medium: 1,
  low: 2,
  informational: 3,
  unclassified: 4,
};

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity || severity === 'unclassified') return null;
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    medium: 'bg-orange-100 text-orange-700',
    low: 'bg-blue-100 text-blue-700',
    informational: 'bg-gray-100 text-gray-600',
  };
  const labels: Record<string, string> = {
    critical: 'Crítica',
    medium: 'Media',
    low: 'Baja',
    informational: 'Info',
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

interface NotificationData {
  id: string;
  externalId: string;
  message: string;
  expirationDate: Date;
  publicationDate: Date;
  opened: boolean;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  profileId?: string | null;
  profileName?: string | null;
  profileIdentityNumber?: string | null;
  severity?: string | null;
  category?: string | null;
  aiSummary?: string | null;
  assignedToUserId?: string | null;
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationsViewProps {
  /** When set, only show notifications for this client and hide client filter */
  clientId?: string;
  /** When set (junto con clientId), fuerza el filtro de empresa/perfil y oculta su selector. */
  profileId?: string;
  /** When set, opens this notification on mount (used via ?notificationId= query param) */
  initialNotificationId?: string;
  /** Optional toolbar (e.g. "Actualizar" button + last update) rendered above the list/detail */
  toolbar?: React.ReactNode;
  /** Optional class for the container (e.g. min-h for embedded tab) */
  className?: string;
}

export function NotificationsView({
  clientId: clientIdProp,
  profileId: profileIdProp,
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
  const [clientFilter, setClientFilter] = useState<string>(
    clientIdProp ?? 'all'
  );
  const [profileFilter, setProfileFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [onlyUnresolved, setOnlyUnresolved] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | null
  >(initialNotificationId ?? null);
  const [notificationDetails, setNotificationDetails] = useState<any>(null);

  // Get representatives for filter dropdown (only when not scoped to a single representative)
  const { data: representatives = [] } = useQuery({
    queryKey: ['representatives'],
    queryFn: () => getRepresentatives(),
    enabled: !clientIdProp,
  });

  // Clients of the representative (only when scoped to a single representative)
  const { data: representativeClients = [], isLoading: loadingRepresentativeClients } = useQuery({
    queryKey: ['representativeClients', clientIdProp],
    queryFn: () =>
      getRepresentativeClients({
        data: { representativeId: clientIdProp! },
      }),
    enabled: !!clientIdProp,
  });

  const effectiveClientFilter = clientIdProp ?? clientFilter;
  const effectiveProfileFilter = profileIdProp
    ? profileIdProp
    : clientIdProp && profileFilter !== 'all'
      ? profileFilter
      : undefined;

  // Reset filtros cuando cambia el cliente (por si se reusa el componente)
  useEffect(() => {
    if (clientIdProp) {
      setProfileFilter('all');
    }
  }, [clientIdProp]);

  // Get notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: clientIdProp
      ? [
          'clientNotifications',
          orgKey,
          clientIdProp,
          effectiveProfileFilter,
          categoryFilter,
          onlyUnresolved,
          searchTerm,
        ]
      : [
          'notifications',
          orgKey,
          1,
          clientFilter,
          '',
          '',
          categoryFilter,
          onlyUnresolved,
          searchTerm,
        ],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 100,
          representativeFilter:
            effectiveClientFilter === 'all' ? undefined : effectiveClientFilter,
          clientId: effectiveProfileFilter,
          search: searchTerm || undefined,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
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
    if (clientIdProp) {
      queryClient.invalidateQueries({
        queryKey: ['clientNotifications', clientIdProp],
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
        setNotificationDetails(null);
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
    onSuccess: (result: any) => {
      invalidateNotificationQueries();
      toast.success(
        `Clasificada: severity=${result?.severity}, category=${result?.category}`
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
    opened?: boolean;
  }) => {
    setSelectedNotificationId(notification.id);
    if (notification.opened === false) {
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

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (date: Date | string) => {
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

  const rawNotifications = notificationsData?.notifications || [];
  const filteredNotifications = clientIdProp
    ? rawNotifications.filter(
        (n: any) => n.profileName || n.profileIdentityNumber
      )
    : rawNotifications.filter((n: any) => n.clientName || n.clientId);
  const notifications = [...filteredNotifications].sort((a: any, b: any) => {
    const sa = SEVERITY_ORDER[a.severity ?? 'unclassified'] ?? 4;
    const sb = SEVERITY_ORDER[b.severity ?? 'unclassified'] ?? 4;
    if (sa !== sb) return sa - sb;
    return (
      new Date(b.publicationDate).getTime() -
      new Date(a.publicationDate).getTime()
    );
  });

  const unreadForCopilot = aiAgentEnabled
    ? notifications
        .filter((n: any) => n.opened === false)
        .slice(0, 20)
        .map((n: any) => ({
          id: n.id,
          message: n.message,
          publicationDate: n.publicationDate,
          clientName: n.clientName ?? null,
        }))
    : [];

  return (
    <div
      className={cn(
        'border rounded-xl bg-white shadow-sm overflow-hidden',
        toolbar ? 'flex flex-col' : 'flex',
        clientIdProp ? 'min-h-[400px] flex-1' : 'h-full',
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                title="Marcar todas como leídas"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => classifyAllMutation.mutate()}
                disabled={classifyAllMutation.isPending}
                title="Clasificar pendientes con IA"
              >
                <Sparkles className="h-4 w-4" />
                {classifyAllMutation.isPending ? '…' : null}
              </Button>
            </div>
            {!clientIdProp ? (
              <SearchableSelect
                options={[
                  { value: 'all', label: 'Todos los clientes' },
                  ...representatives.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={clientFilter}
                onValueChange={setClientFilter}
                placeholder="Filtrar por cliente"
                searchPlaceholder="Buscar cliente..."
                width="100%"
              />
            ) : profileIdProp ? null : (
              <SearchableSelect
                options={[
                  { value: 'all', label: 'Todos los perfiles' },
                  ...representativeClients.map((p: any) => ({
                    value: p.id,
                    label: p.name || p.identityNumber || p.id,
                  })),
                ]}
                value={profileFilter}
                onValueChange={setProfileFilter}
                placeholder="Filtrar por perfil"
                searchPlaceholder="Buscar perfil..."
                width="100%"
                disabled={loadingRepresentativeClients || representativeClients.length === 0}
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
            <button
              onClick={() => setOnlyUnresolved((v) => !v)}
              className={cn(
                'text-xs px-3 py-1.5 rounded border transition-colors w-full text-left',
                onlyUnresolved
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              )}
            >
              Solo sin resolver
            </button>
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
                        notification.opened === false && 'bg-primary/5',
                        (notification as any).resolvedAt && 'opacity-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {notification.opened === false && (
                              <span
                                className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5"
                                aria-hidden
                              />
                            )}
                            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <p
                              className={cn(
                                'text-sm truncate',
                                notification.opened === false
                                  ? 'font-semibold'
                                  : 'font-medium'
                              )}
                            >
                              {clientIdProp
                                ? notification.profileName ||
                                  notification.profileIdentityNumber ||
                                  'Sin perfil'
                                : notification.profileName ||
                                  notification.profileIdentityNumber ||
                                  notification.clientName ||
                                  'Sin cliente'}
                            </p>
                            <SeverityBadge
                              severity={(notification as any).severity ?? null}
                            />
                          </div>
                          {(notification as any).aiSummary ? (
                            <p className="text-xs text-muted-foreground italic line-clamp-1 mb-1">
                              {(notification as any).aiSummary}
                            </p>
                          ) : null}
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {formatDateShort(notification.publicationDate)}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (notification.opened) {
                              markUnreadMutation.mutate(notification.id);
                            } else {
                              markOpenedMutation.mutate(notification.id);
                            }
                          }}
                          className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                          title={
                            notification.opened
                              ? 'Marcar como no leída'
                              : 'Marcar como leída'
                          }
                        >
                          {notification.opened ? (
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </button>
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
                        {(selectedNotification as any).profileName ||
                          (selectedNotification as any).profileIdentityNumber ||
                          selectedNotification.clientName ||
                          'Sin cliente'}
                      </h2>
                      {(selectedNotification as any).profileName &&
                        selectedNotification.clientName && (
                          <p className="text-xs text-muted-foreground">
                            {selectedNotification.clientName}
                          </p>
                        )}
                      <span className="font-light text-muted-foreground text-xs">
                        ID Externo: {selectedNotification.externalId}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <span>{selectedNotification.clientEmail || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatDate(selectedNotification.publicationDate)}
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
                        value={
                          (selectedNotification as any).assignedToUserId ??
                          '__none__'
                        }
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
                    {(!(selectedNotification as any).severity ||
                      (selectedNotification as any).severity ===
                        'unclassified') && (
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
                    {(selectedNotification as any).resolvedAt ? (
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
                        {selectedNotification.message}
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
                        {formatDate(selectedNotification.expirationDate)}
                      </p>
                    </div>
                  </div>

                  {/* Attachments */}
                  {selectedNotification.attachments &&
                    selectedNotification.attachments.length > 0 && (
                      <div className="space-y-4">
                        {selectedNotification.attachments.map(
                          (attachment: any) => {
                            const isPdf = /\.pdf$/i.test(
                              attachment.documentName ?? ''
                            );
                            return (
                              <div key={attachment.id} className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {attachment.documentName}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleDownloadAttachment(
                                        attachment.documentUrl,
                                        attachment.documentName
                                      )
                                    }
                                  >
                                    Descargar
                                  </Button>
                                </div>
                                {isPdf && (
                                  <iframe
                                    src={attachment.documentUrl}
                                    title={attachment.documentName}
                                    className="w-full h-[600px] rounded-lg border border-[var(--arca-border)]"
                                  />
                                )}
                              </div>
                            );
                          }
                        )}
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
