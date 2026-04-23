import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  Trash2,
  MoreHorizontal,
  Search,
  Download,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  getNotifications,
  deleteNotification,
  getNotification,
} from '@/actions/notification';
import { getClients } from '@/actions/client';
import { userQuery } from '../lib/user-query';

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

export function NotificationsTable() {
  const queryClient = useQueryClient();
  const { data: user } = useQuery(userQuery);
  const orgKey =
    (user as { activeOrganizationId?: string | null } | null | undefined)
      ?.activeOrganizationId ?? '__pending__';
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationToDelete, setNotificationToDelete] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] =
    useState<NotificationData | null>(null);
  const [notificationDetails, setNotificationDetails] = useState<any>(null);

  const pageSize = 10;

  // Get clients for filter dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

  // Get notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: [
      'notifications',
      orgKey,
      currentPage,
      clientFilter,
      dateFrom,
      dateTo,
      searchTerm,
    ],
    queryFn: () =>
      getNotifications({
        data: {
          page: currentPage,
          limit: pageSize,
          clientFilter: clientFilter === 'all' ? undefined : clientFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          search: searchTerm || undefined,
        },
      }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: () => {
      toast.success('Notificaci?n eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setDeleteDialogOpen(false);
      setNotificationToDelete(null);
    },
    onError: (error) => {
      toast.error('Error al eliminar la notificaci?n');
      console.error(error);
    },
  });

  // View notification details
  const handleViewNotification = async (notification: NotificationData) => {
    setSelectedNotification(notification);
    setViewDialogOpen(true);

    try {
      const details = await getNotification({ data: { id: notification.id } });
      setNotificationDetails(details);
    } catch (error) {
      toast.error('Error al cargar los detalles de la notificaci?n');
      console.error(error);
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

  const totalPages = notificationsData?.totalPages || 1;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between flex-shrink-0">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar notificaciones..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full md:w-64"
            />
          </div>

          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full md:w-48">
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

          <div className="flex gap-2">
            <Input
              type="date"
              placeholder="Fecha desde"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full md:w-40"
            />
            <Input
              type="date"
              placeholder="Fecha hasta"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full md:w-40"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#efeeef] bg-white shadow-sm overflow-auto flex-1 min-h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Mensaje</TableHead>
              <TableHead>Fecha Publicaci?n</TableHead>
              <TableHead>Fecha Expiraci?n</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Cargando notificaciones...
                </TableCell>
              </TableRow>
            ) : notificationsData?.notifications.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No se encontraron notificaciones.
                </TableCell>
              </TableRow>
            ) : (
              notificationsData?.notifications.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell>
                    {notification.clientName ? (
                      <div>
                        <div className="font-medium">
                          {notification.clientName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {notification.clientEmail}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin cliente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate">
                      {notification.message}
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDate(notification.publicationDate)}
                  </TableCell>
                  <TableCell>
                    {formatDate(notification.expirationDate)}
                  </TableCell>

                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleViewNotification(notification)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalles
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(notification.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={
                    currentPage === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  className={
                    currentPage === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* View Notification Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Detalles de la Notificaci?n</DialogTitle>
          </DialogHeader>

          {selectedNotification && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">ID Externo</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedNotification.externalId}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Cliente</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedNotification.clientName || 'Sin cliente'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Fecha de Publicaci?n
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedNotification.publicationDate)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Fecha de Expiraci?n
                  </label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedNotification.expirationDate)}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Mensaje</label>
                <p className="text-sm text-muted-foreground mt-1 p-3 bg-muted rounded-md">
                  {selectedNotification.message}
                </p>
              </div>

              {/* Attachments */}
              {notificationDetails?.attachments &&
                notificationDetails.attachments.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">
                      Archivos Adjuntos
                    </label>
                    <div className="space-y-2 mt-2">
                      {notificationDetails.attachments.map(
                        (attachment: any) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 border rounded-md"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
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
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>?Est?s seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acci?n no se puede deshacer. Se eliminar? permanentemente la
              notificaci?n.
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
