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
  getClientsWithRepresentative,
  deleteRepresentative,
  scrapSingleJob,
} from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { EditRepresentativeDialog } from '@/components/edit-client-dialog';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { relativeTime } from '@/components/dashboard/shared';
import { toTitleCase } from '@/lib/format-name';

interface ClientRow {
  id: string;
  name: string;
  identityNumber: string;
  status: string;
  representativeId: string | null;
  representativeName: string | null;
  createdAt: string | Date;
  hasErrors?: boolean;
  errorMessage?: string | null;
}

export function RepresentativesTable() {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [representativeToDelete, setRepresentativeToDelete] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [representativeToEditId, setRepresentativeToEditId] = useState<string | null>(null);
  const [selectedRepresentatives, setSelectedRepresentatives] = useState<ClientRow[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: allClients = [], isLoading } = useQuery({
    queryKey: ['clientsWithRepresentative'],
    queryFn: () => getClientsWithRepresentative(),
    retry: 1,
  });

  const clients = search
    ? allClients.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.representativeName?.toLowerCase().includes(q) ||
          c.identityNumber?.includes(q)
        );
      })
    : allClients;

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const clientsTyped = clients as ClientRow[];
  const clientsConErrores = clientsTyped.filter((c) => c.hasErrors === true);
  const clientesResumen = clientsTyped.slice(0, 30).map((c) => ({
    id: c.id,
    name: c.name,
    cuit: c.identityNumber,
    hasErrors: c.hasErrors === true,
    errorMessage: c.errorMessage ?? null,
  }));


  const deleteMutation = useMutation({
    mutationFn: (data: { id: string }) => deleteRepresentative({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clientsWithRepresentative'] });
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
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-[var(--arca-ink)]">
            {toTitleCase(row.original.name)}
          </div>
          {row.original.representativeName && (
            <div className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
              Repr: {toTitleCase(row.original.representativeName)}
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
      const modules = ['deuda', 'vencimientos', 'iva', 'notificaciones', 'comprobantes'] as const;
      let created = 0;
      let errors = 0;
      for (const rep of selectedRepresentatives) {
        for (const jobType of modules) {
          try {
            await scrapSingleJob({ data: { representativeId: rep.id, jobType } });
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
          description="Listado de clientes visible en pantalla. clientesResumen incluye los primeros 30 con id/CUIT — usá el id para referenciar un cliente al invocar acciones."
          value={{
            modulo: 'clientes',
            vista: 'lista',
            totalClientes: clientsTyped.length,
            clientesConErrores: clientsConErrores.length,
            clientesSinErrores:
              clientsTyped.length - clientsConErrores.length,
            clientesResumen,
          }}
        />
      )}
      <DataTable
        columns={columns}
        data={clients as ClientRow[]}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por nombre, CUIT, representante..."
        filters={[]}
        onRowClick={(row) => navigate({ to: `/clients/${row.representativeId}`, search: { client: row.id } })}
        onSelectionChange={(rows) => setSelectedRepresentatives(rows as ClientRow[])}
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
