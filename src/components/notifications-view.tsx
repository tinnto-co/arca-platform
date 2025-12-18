import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Search,
  Download,
  FileText,
  Calendar,
  User,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getNotifications,
  deleteNotification,
  getNotification,
} from "@/actions/notification";
import { getClients } from "@/actions/client";
import { cn } from "@/lib/utils";

interface NotificationData {
  id: string;
  externalId: string;
  message: string;
  expirationDate: Date;
  publicationDate: Date;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function NotificationsView() {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [selectedNotificationId, setSelectedNotificationId] = useState<
    string | null
  >(null);
  const [notificationDetails, setNotificationDetails] = useState<any>(null);

  // Get clients for filter dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => getClients(),
  });

  // Get notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: [
      "notifications",
      1,
      clientFilter,
      "",
      "",
      searchTerm,
    ],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 100, // Get more notifications for the list
          clientFilter: clientFilter === "all" ? undefined : clientFilter,
          search: searchTerm || undefined,
        },
      }),
  });

  // Get selected notification details
  const { data: selectedNotification } = useQuery({
    queryKey: ["notification", selectedNotificationId],
    queryFn: () =>
      getNotification({ data: { id: selectedNotificationId! } }),
    enabled: !!selectedNotificationId,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      toast.success("Notificación eliminada correctamente");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setDeleteDialogOpen(false);
      setNotificationToDelete(null);
      if (selectedNotificationId === notificationToDelete) {
        setSelectedNotificationId(null);
        setNotificationDetails(null);
      }
    },
    onError: (error) => {
      toast.error("Error al eliminar la notificación");
      console.error(error);
    },
  });

  const handleNotificationClick = (notificationId: string) => {
    setSelectedNotificationId(notificationId);
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
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateShort = (date: Date | string) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const today = new Date();
    const notificationDate = new Date(dateObj);
    const diffTime = today.getTime() - notificationDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return notificationDate.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "Ayer";
    } else if (diffDays < 7) {
      return notificationDate.toLocaleDateString("es-ES", {
        weekday: "short",
      });
    } else {
      return notificationDate.toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "2-digit",
      });
    }
  };

  const notifications = notificationsData?.notifications || [];

  return (
    <div className="flex h-[calc(100vh-8rem)] border rounded-lg overflow-hidden">
      {/* Left Panel - Notifications List */}
      <div className="w-1/3 border-r flex flex-col bg-muted/30">
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
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto">
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
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification.id)}
                  className={cn(
                    "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedNotificationId === notification.id &&
                      "bg-muted border-l-4 border-l-primary"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <p className="font-semibold text-sm truncate">
                          {notification.clientName || "Sin cliente"}
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
                  <h2 className="text-xl font-semibold mb-2">
                    {selectedNotification.clientName || "Sin cliente"}
                  </h2>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{selectedNotification.clientEmail || "N/A"}</span>
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
                    <h3 className="text-sm font-semibold mb-2">ID Externo</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedNotification.externalId}
                    </p>
                  </div>
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
                    <div>
                      <h3 className="text-sm font-semibold mb-3">
                        Archivos Adjuntos
                      </h3>
                      <div className="space-y-2">
                        {selectedNotification.attachments.map(
                          (attachment: any) => (
                            <div
                              key={attachment.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <div>
                                  <p className="text-sm font-medium">
                                    {attachment.documentName}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {attachment.documentType}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleDownloadAttachment(
                                    attachment.documentUrl,
                                    attachment.documentName
                                  )
                                }
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Descargar
                              </Button>
                            </div>
                          )
                        )}
                      </div>
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

