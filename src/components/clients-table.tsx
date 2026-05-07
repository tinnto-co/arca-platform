import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Eye,
  Edit,
  Trash2,
  MoreHorizontal,
  CircleAlert,
  CheckCircle2,
  Play,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { DataTable } from '@/components/ui/data-table';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getClientsWithProfiles,
  deleteClient,
  scrapBatchClients,
} from '@/actions/client';
import { EditClientDialog } from '@/components/edit-client-dialog';
import { relativeTime } from '@/components/dashboard/shared';

interface Client {
  id: string;
  name: string;
  identityNumber: string;
  phone: string;
  createdAt: string | Date;
  hasErrors?: boolean;
  errorMessage?: string | null;
  status?: string;
  profiles?: { name: string }[];
}

export function ClientsTable() {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [clientToEditId, setClientToEditId] = useState<string | null>(null);
  const [selectedClients, setSelectedClients] = useState<Client[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clientsWithProfiles'],
    queryFn: () => getClientsWithProfiles(),
    retry: 1,
  });

  const deleteMutation = useMutation({
    mutationFn: (data: { id: string }) => deleteClient({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsWithProfiles'] });
      toast.success('Cliente eliminado exitosamente');
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    },
    onError: () => {
      toast.error('Error al eliminar el cliente');
    },
  });

  const columns: ColumnDef<Client>[] = [
    {
      accessorKey: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-[var(--arca-ink)]">
            {row.original.name}
          </div>
          {row.original.profiles?.[0] && (
            <div className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
              {row.original.profiles[0].name}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'hasErrors',
      header: 'Estado',
      enableSorting: false,
      filterFn: (row, _columnId, filterValue) => {
        if (!filterValue) return true;
        if (filterValue === 'error') return row.original.hasErrors === true;
        if (filterValue === 'ok') return row.original.hasErrors !== true;
        return true;
      },
      cell: ({ row }) =>
        row.original.hasErrors ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex text-[var(--arca-accent-warn-fg)]"
                onClick={(e) => e.stopPropagation()}
              >
                <CircleAlert className="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              {row.original.errorMessage?.trim() ||
                'Cliente con errores en jobs de scraping'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex text-[var(--arca-accent-pos-fg)]"
                onClick={(e) => e.stopPropagation()}
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              Cliente sin errores en jobs de scraping
            </TooltipContent>
          </Tooltip>
        ),
    },
    {
      accessorKey: 'identityNumber',
      header: 'CUIT',
      cell: ({ getValue }) => (
        <span className="font-mono text-[12px] text-[var(--arca-ink-2)]">
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Registrado',
      cell: ({ getValue }) => (
        <span className="text-[var(--arca-ink-3)]">
          {relativeTime(new Date(getValue() as string))}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onSelect={() => navigate({ to: `/clients/${row.original.id}` })}
            >
              <Eye className="mr-2 h-3.5 w-3.5" />
              Ver
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setClientToEditId(row.original.id);
                setEditDialogOpen(true);
              }}
            >
              <Edit className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setClientToDelete(row.original.id);
                setDeleteDialogOpen(true);
              }}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const handleScrapSelected = async () => {
    if (selectedClients.length === 0) return;
    setIsScraping(true);
    try {
      const result = await scrapBatchClients({
        data: { clientIds: selectedClients.map((c) => c.id) },
      });
      if (result.errors.length > 0) {
        toast.warning(
          `${result.created.length} jobs creados, ${result.errors.length} errores`
        );
      } else {
        toast.success(
          `${result.created.length} jobs de scraping encolados`
        );
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al encolar scraping'
      );
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <>
      <DataTable
        columns={columns}
        data={clients as Client[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar por nombre, CUIT..."
        filters={[
          {
            columnId: 'hasErrors',
            label: 'Estado',
            options: [
              { label: 'Sin errores', value: 'ok' },
              { label: 'Con errores', value: 'error' },
            ],
          },
        ]}
        onRowClick={(client) => navigate({ to: `/clients/${client.id}` })}
        onSelectionChange={(rows) => setSelectedClients(rows as Client[])}
        toolbar={
          selectedClients.length > 0 ? (
            <Button
              size="sm"
              onClick={handleScrapSelected}
              disabled={isScraping}
            >
              {isScraping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Scrapear {selectedClients.length} cliente{selectedClients.length > 1 ? 's' : ''}
            </Button>
          ) : null
        }
        emptyMessage="No hay clientes registrados."
      />

      {clientToEditId && (
        <EditClientDialog
          clientId={clientToEditId}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setClientToEditId(null);
          }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el
              cliente del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                clientToDelete && deleteMutation.mutate({ id: clientToDelete })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
