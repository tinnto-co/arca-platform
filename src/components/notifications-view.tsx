import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Search,
  Calendar,
  User,
  Trash2,
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
} from '@/actions/notification';
import { getClients, getClientProfiles } from '@/actions/client';
import { cn } from '@/lib/utils';
import { userQuery } from '../lib/user-query';

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
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationsViewProps {
  /** When set, only show notifications for this client and hide client filter */
  clientId?: string;
  /** When set, opens this notification on mount (used via ?notificationId= query param) */
  initialNotificationId?: string;
  /** Optional toolbar (e.g. "Actualizar" button + last update) rendered above the list/detail */
  toolbar?: React.ReactNode;
  /** Optional class for the container (e.g. min-h for embedded tab) */
  className?: string;
}

export function NotificationsView({
  clientId: clientIdProp,
  initialNotificationId,
  toolbar,
  className,
}: NotificationsViewProps = {}) {
  const queryClient = useQueryClient();
  const { data: user } = useQuery(userQuery);
  const orgKey = user?.activeOrganizationId ?? '__pending__';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<string>(
    clientIdProp ?? 'all'
  );
  const [profileFilter, setProfileFilter] = useState<string>('all');
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | null
  >(initialNotificationId ?? null);
  const [notificationDetails, setNotificationDetails] = useState<any>(null);

  // Get clients for filter dropdown (only when not scoped to a single client)
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
    enabled: !clientIdProp,
  });

  // Perfiles del cliente (solo cuando estamos en el detalle de un cliente)
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['clientProfiles', clientIdProp],
    queryFn: () =>
      getClientProfiles({
        data: { clientId: clientIdProp! },
      }),
    enabled: !!clientIdProp,
  });

  const effectiveClientFilter = clientIdProp ?? clientFilter;
  const effectiveProfileFilter =
    clientIdProp && profileFilter !== 'all' ? profileFilter : undefined;

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
        searchTerm,
      ]
      : ['notifications', orgKey, 1, clientFilter, '', '', searchTerm],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 100,
          clientFilter:
            effectiveClientFilter === 'all' ? undefined : effectiveClientFilter,
          profileId: effectiveProfileFilter,
          search: searchTerm || undefined,
        },
      }),
  });

  // Get selected notification details
  const { data: selectedNotification } = useQuery({
    queryKey: ['notification', orgKey, selectedNotificationId],
    queryFn: () => getNotification({ data: { id: selectedNotificationId! } }),
    enabled: !!selectedNotificationId,
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
    },
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
  const notifications = clientIdProp
    ? // En el detalle de cliente: solo mostrar notificaciones con perfil asociado
    rawNotifications.filter(
      (n: any) => n.profileName || n.profileIdentityNumber
    )
    : // En la vista global: solo mostrar notificaciones con cliente asociado
    rawNotifications.filter((n: any) => n.clientName || n.clientId);

  return (
    <div
      className={cn(
        'border rounded-xl bg-white shadow-sm overflow-hidden',
        toolbar ? 'flex flex-col' : 'flex',
        clientIdProp ? 'min-h-[400px] flex-1' : 'h-full',
        className
      )}
    >
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar notificaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {!clientIdProp ? (
              <SearchableSelect
                options={[
                  { value: 'all', label: 'Todos los clientes' },
                  ...clients.map((c) => ({ value: c.id, label: c.name })),
                ]}
                value={clientFilter}
                onValueChange={setClientFilter}
                placeholder="Filtrar por cliente"
                searchPlaceholder="Buscar cliente..."
                width="100%"
              />
            ) : (
              <SearchableSelect
                options={[
                  { value: 'all', label: 'Todos los perfiles' },
                  ...profiles.map((p: any) => ({
                    value: p.id,
                    label: p.name || p.identityNumber || p.id,
                  })),
                ]}
                value={profileFilter}
                onValueChange={setProfileFilter}
                placeholder="Filtrar por perfil"
                searchPlaceholder="Buscar perfil..."
                width="100%"
                disabled={loadingProfiles || profiles.length === 0}
              />
            )}
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
                        notification.opened === false && 'bg-primary/5'
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
                                : notification.clientName || 'Sin cliente'}
                            </p>
                          </div>
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
                        {selectedNotification.clientName || 'Sin cliente'}
                      </h2>
                      <span className="font-light text-muted-foreground text-xs">ID Externo: {selectedNotification.externalId}</span>
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
                          (attachment: any) => (
                            <div key={attachment.id}>
                              <iframe
                                src={attachment.documentUrl}
                                title={attachment.documentName}
                                className="w-full h-[600px] rounded-lg border border-[var(--arca-border)]"
                              />
                            </div>
                          )
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
