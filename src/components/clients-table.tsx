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
  getClients,
  deleteRepresentative,
  scrapSingleJob,
} from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { EditRepresentativeDialog } from '@/components/edit-client-dialog';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { relativeTime } from '@/components/dashboard/shared';

interface ClientRow {
  id: string;
  name: string;
  identityNumber: string;
  status?: string;
  createdAt: string | Date;
  representativeId: string;
  representativeName: string | null;
  representativeCuit: string | null;
}

export function RepresentativesTable() {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [representativeToDelete, setRepresentativeToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [representativeToEditId, setRepresentativeToEditId] = useState<string | null>(null);
  const [selectedClients, setSelectedClients] = useState<ClientRow[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
    retry: 1,
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const clientsTyped = clients as ClientRow[];
  const clientesResumen = clientsTyped.slice(0, 30).map((c) => ({
    id: c.id,
    name: c.name,
    cuit: c.identityNumber,
    representante: c.representativeName,
  }));

  const deleteMutation = useMutation({
    mutationFn: (data: { id: string }) => deleteRepresentative({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente eliminado exitosamente');
      setDeleteDialogOpen(false);
      setRepresentativeToDelete(null);
    },
    onError: () => {
      toast.error('Error al eliminar el cliente');
    },
  });

  const columns: ColumnDef<ClientRow>[] = [
    {
      accessorKey: 'name',
      header: 'Cliente',
      filterFn: (row, _columnId, filterValue) => {
        const term = String(filterValue).toLowerCase().trim();
        if (!term) return true;
        const r = row.original;
        return (
          r.name.toLowerCase().includes(term) ||
          r.identityNumber.toLowerCase().includes(term) ||
          (r.representativeName?.toLowerCase().includes(term) ?? false) ||
          (r.representativeCuit?.toLowerCase().includes(term) ?? false)
        );
      },
      cell: ({ row }) => (
        <span className="font-medium text-[var(--arca-ink)]">
          {row.original.name}
        </span>
      ),
    },
    {
      accessorKey: 'representativeName',
      header: 'Representante',
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate text-[12.5px] text-[var(--arca-ink-3)]"
          title={row.original.representativeName ?? undefined}
        >
          {row.original.representativeName ?? '—'}
        </span>
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
              onSelect={() =>
                navigate({ to: `/clients/${row.original.representativeId}` })
              }
            >
              <Eye className="mr-2 h-3.5 w-3.5" />
              Ver
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRepresentativeToEditId(row.original.representativeId);
                setEditDialogOpen(true);
              }}
            >
              <Edit className="mr-2 h-3.5 w-3.5" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setRepresentativeToDelete(row.original.representativeId);
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
      const modules = ['deuda', 'vencimientos', 'iva', 'notificaciones', 'comprobantes'] as const;
      const representativeIds = [
        ...new Set(selectedClients.map((c) => c.representativeId)),
      ];
      let created = 0;
      let errors = 0;
      for (const representativeId of representativeIds) {
        for (const jobType of modules) {
          try {
            await scrapSingleJob({ data: { representativeId, jobType } });
            created++;
          } catch {
            errors++;
          }
        }
      }
      if (errors > 0) {
        toast.warning(`${created} módulos completados, ${errors} errores`);
      } else {
        toast.success(`${created} módulos de scraping completados`);
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
      {aiAgentEnabled && (
        <CopilotReadableEntity
          description="Listado de empresas (clientes) visible en pantalla. clientesResumen incluye los primeros 30 con id/CUIT/representante — usá el id para referenciar una empresa al invocar acciones."
          value={{
            modulo: 'clientes',
            vista: 'lista',
            totalClientes: clientsTyped.length,
            clientesResumen,
          }}
        />
      )}
      <DataTable
        columns={columns}
        data={clientsTyped}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Buscar por CUIT, cliente o representante..."
        filters={[]}
        onRowClick={(row) =>
          navigate({ to: `/clients/${(row as ClientRow).representativeId}` })
        }
        onSelectionChange={(rows) => setSelectedClients(rows as ClientRow[])}
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
