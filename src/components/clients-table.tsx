import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Eye,
  Edit,
  Trash2,
  MoreHorizontal,
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
  getRepresentativesWithClients,
  deleteRepresentative,
  scrapBatchRepresentatives,
} from '@/actions/client';
import { EditRepresentativeDialog } from '@/components/edit-client-dialog';
import { relativeTime } from '@/components/dashboard/shared';

interface Representative {
  id: string;
  name: string;
  identityNumber: string;
  phone: string;
  createdAt: string | Date;
  status?: string;
  clients?: { name: string }[];
}

export function RepresentativesTable() {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [representativeToDelete, setRepresentativeToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [representativeToEditId, setRepresentativeToEditId] = useState<string | null>(null);
  const [selectedRepresentatives, setSelectedRepresentatives] = useState<Representative[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const queryClient = useQueryClient();

  const { data: representatives = [], isLoading } = useQuery({
    queryKey: ['representativesWithClients'],
    queryFn: () => getRepresentativesWithClients(),
    retry: 1,
  });

  const deleteMutation = useMutation({
    mutationFn: (data: { id: string }) => deleteRepresentative({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representativesWithClients'] });
      toast.success('Cliente eliminado exitosamente');
      setDeleteDialogOpen(false);
      setRepresentativeToDelete(null);
    },
    onError: () => {
      toast.error('Error al eliminar el cliente');
    },
  });

  const columns: ColumnDef<Representative>[] = [
    {
      accessorKey: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-[var(--arca-ink)]">
            {row.original.name}
          </div>
          {row.original.clients?.[0] && (
            <div className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
              {row.original.clients[0].name}
            </div>
          )}
        </div>
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
                setRepresentativeToEditId(row.original.id);
                setEditDialogOpen(true);
              }}
            >
              <Edit className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRepresentativeToDelete(row.original.id);
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
    if (selectedRepresentatives.length === 0) return;
    setIsScraping(true);
    try {
      const result = await scrapBatchRepresentatives({
        data: { representativeIds: selectedRepresentatives.map((c) => c.id) },
      });
      if (result.errors.length > 0) {
        toast.warning(
          `${result.created.length} jobs creados, ${result.errors.length} errores`
        );
      } else {
        toast.success(`${result.created.length} jobs de scraping encolados`);
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
        data={representatives as Representative[]}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar por nombre, CUIT..."
        filters={[]}
        onRowClick={(representative) => navigate({ to: `/clients/${representative.id}` })}
        onSelectionChange={(rows) => setSelectedRepresentatives(rows as Representative[])}
        toolbar={
          selectedRepresentatives.length > 0 ? (
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
              Scrapear {selectedRepresentatives.length} cliente{selectedRepresentatives.length > 1 ? 's' : ''}
            </Button>
          ) : null
        }
        emptyMessage="No hay clientes registrados."
      />

      {representativeToEditId && (
        <EditRepresentativeDialog
          representativeId={representativeToEditId}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setRepresentativeToEditId(null);
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
                representativeToDelete && deleteMutation.mutate({ id: representativeToDelete })
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
