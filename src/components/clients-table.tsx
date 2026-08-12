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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { getClientes, scrapBatchJobs } from '@/actions/client';
import { deleteCliente } from '@/actions/afip-profiles';
import { listOrgModules } from '@/actions/admin';
import { EditRepresentativeDialog } from '@/components/edit-client-dialog';
import { useActiveJobs } from '@/hooks/use-active-jobs';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { relativeTime } from '@/components/dashboard/shared';
import { toTitleCase } from '@/lib/format-name';

type ClienteConCredenciales = Awaited<ReturnType<typeof getClientes>>[number];

/**
 * Fila de la tabla: el cliente más el login de AFIP por el que se lo scrapea.
 * La relación es N:M, pero la tabla trabaja con el primero (el scraping y la
 * edición de la clave se hacen sobre un login concreto).
 */
type ClientRow = ClienteConCredenciales & {
  credencialId: string | null;
  credencialNombre: string | null;
  credencialCuit: string | null;
};

type EstadoValue = 'error' | 'active' | 'inactive';

const BULK_JOB_TYPES = [
  { value: 'deuda', label: 'Deuda', description: 'Deudas impositivas en AFIP' },
  {
    value: 'vencimientos',
    label: 'Vencimientos',
    description: 'Próximos vencimientos fiscales',
  },
  {
    value: 'notificaciones',
    label: 'Notificaciones',
    description: 'Notificaciones del domicilio fiscal electrónico',
  },
  {
    value: 'comprobantes',
    label: 'Comprobantes',
    description: 'Facturas emitidas y recibidas recientes',
  },
  {
    value: 'iva',
    label: 'IVA',
    description:
      'DDJJ de IVA recientes. Si marcás Comprobantes también, se actualizan primero (Comprobantes + IVA).',
  },
] as const;

type BulkJobType = (typeof BULK_JOB_TYPES)[number]['value'];

function getEstado(row: ClientRow): EstadoValue {
  if (row.credentialError) return 'error';
  return row.estado === 'activo' ? 'active' : 'inactive';
}

const ESTADO_META: Record<EstadoValue, { label: string; className: string }> = {
  error: {
    label: 'Credenciales inválidas',
    className:
      'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg)] border-[var(--arca-accent-neg)]',
  },
  active: {
    label: 'Activo',
    className:
      'bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos)] border-[var(--arca-accent-pos)]',
  },
  inactive: {
    label: 'Inactivo',
    className:
      'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)] border-[var(--arca-border-strong)]',
  },
};

export function RepresentativesTable() {
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  /**
   * La fila es un cliente, así que "Eliminar" borra el cliente — no el login
   * de AFIP, que puede tener otros clientes colgando. El login se da de baja
   * desde la pestaña Perfiles.
   */
  const [clienteToDelete, setClienteToDelete] = useState<{
    id: string;
    razonSocial: string;
  } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [rowToEdit, setRowToEdit] = useState<{
    clienteId: string;
    credencialId: string;
  } | null>(null);
  const [selectedClients, setSelectedClients] = useState<ClientRow[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [selectedJobTypes, setSelectedJobTypes] = useState<Set<BulkJobType>>(
    () => new Set(BULK_JOB_TYPES.map((t) => t.value))
  );
  const queryClient = useQueryClient();
  const { activeByRepresentative } = useActiveJobs();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClientes(),
    retry: 1,
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const clientsTyped: ClientRow[] = clients.map((c) => {
    const cred = c.credenciales[0];
    return {
      ...c,
      credencialId: cred?.id ?? null,
      credencialNombre: cred?.nombre ?? null,
      credencialCuit: cred?.cuit ?? null,
    };
  });
  const clientesResumen = clientsTyped.slice(0, 30).map((c) => ({
    id: c.id,
    name: c.razonSocial,
    cuit: c.cuit,
    representante: c.credencialNombre,
  }));

  const deleteMutation = useMutation({
    mutationFn: (clienteId: string) => deleteCliente({ data: { clienteId } }),
    onSuccess: ({ deleted }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`${deleted} eliminado exitosamente`);
      setDeleteDialogOpen(false);
      setClienteToDelete(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al eliminar el cliente');
    },
  });

  const columns: ColumnDef<ClientRow>[] = [
    {
      accessorKey: 'razonSocial',
      header: 'Cliente',
      filterFn: (row, _columnId, filterValue) => {
        const term = String(filterValue).toLowerCase().trim();
        if (!term) return true;
        const r = row.original;
        return (
          r.razonSocial.toLowerCase().includes(term) ||
          r.cuit.toLowerCase().includes(term) ||
          (r.credencialNombre?.toLowerCase().includes(term) ?? false) ||
          (r.credencialCuit?.toLowerCase().includes(term) ?? false)
        );
      },
      cell: ({ row }) => (
        <span className="font-medium text-[var(--arca-ink)]">
          {toTitleCase(row.original.razonSocial)}
        </span>
      ),
    },
    {
      accessorKey: 'credencialNombre',
      header: 'Representante',
      cell: ({ row }) => (
        <span
          className="block max-w-[180px] truncate text-[12.5px] text-[var(--arca-ink-3)]"
          title={
            row.original.credencialNombre
              ? toTitleCase(row.original.credencialNombre)
              : undefined
          }
        >
          {row.original.credencialNombre
            ? toTitleCase(row.original.credencialNombre)
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'cuit',
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
      id: 'estado',
      header: 'Estado',
      accessorFn: (row) => getEstado(row),
      filterFn: (row, _columnId, filterValue) =>
        !filterValue || getEstado(row.original) === filterValue,
      cell: ({ row }) => {
        const meta = ESTADO_META[getEstado(row.original)];
        const credencialId = row.original.credencialId;
        const activeJobs = credencialId
          ? activeByRepresentative.get(credencialId)
          : undefined;
        return (
          <span className="inline-flex items-center gap-1.5">
            {activeJobs && activeJobs.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--arca-ink-2)]"
                title={`Actualizando: ${activeJobs.map((j) => j.type).join(', ')}`}
              >
                <Loader2 className="h-3 w-3 animate-spin" />
                Actualizando ({activeJobs.length})
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${meta.className}`}
            >
              {meta.label}
            </span>
          </span>
        );
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => {
        // Sin login de AFIP no hay página de detalle ni scraping que editar.
        const credencialId = row.original.credencialId;
        return (
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
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem
                disabled={!credencialId}
                onSelect={() => {
                  if (!credencialId) return;
                  navigate({
                    to: '/clients/$clientId',
                    params: { clientId: credencialId },
                    search: { empresa: row.original.id },
                  });
                }}
              >
                <Eye className="mr-2 h-3.5 w-3.5" />
                Ver
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!credencialId}
                onSelect={() => {
                  if (!credencialId) return;
                  setRowToEdit({
                    clienteId: row.original.id,
                    credencialId,
                  });
                  setEditDialogOpen(true);
                }}
              >
                <Edit className="mr-2 h-3.5 w-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setClienteToDelete({
                    id: row.original.id,
                    razonSocial: row.original.razonSocial,
                  });
                  setDeleteDialogOpen(true);
                }}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const selectedRepresentativeIds = [
    ...new Set(
      selectedClients
        .map((c) => c.credencialId)
        .filter((id): id is string => !!id)
    ),
  ];
  const runningSelected = selectedRepresentativeIds.filter((id) =>
    activeByRepresentative.has(id)
  );
  const allSelectedRunning =
    selectedRepresentativeIds.length > 0 &&
    runningSelected.length === selectedRepresentativeIds.length;

  const toggleJobType = (jobType: BulkJobType) => {
    setSelectedJobTypes((prev) => {
      const next = new Set(prev);
      if (next.has(jobType)) {
        next.delete(jobType);
      } else {
        next.add(jobType);
      }
      return next;
    });
  };

  const handleBulkUpdate = async () => {
    if (selectedRepresentativeIds.length === 0 || selectedJobTypes.size === 0)
      return;
    setIsScraping(true);
    try {
      const result = await scrapBatchJobs({
        data: {
          credencialIds: selectedRepresentativeIds,
          jobTypes: [...selectedJobTypes],
        },
      });
      const skippedMsg =
        result.skipped > 0 ? `, ${result.skipped} ya en ejecución` : '';
      if (result.errors > 0) {
        toast.warning(
          `${result.created} jobs encolados, ${result.errors} con error${skippedMsg}`
        );
      } else if (result.created === 0 && result.skipped > 0) {
        toast.info(
          `No se encoló nada: ${result.skipped} jobs ya estaban en ejecución`
        );
      } else {
        toast.success(`${result.created} jobs encolados${skippedMsg}`);
      }
      // Refrescar indicadores de jobs activos sin esperar el próximo poll.
      void queryClient.invalidateQueries({ queryKey: ['activeJobsSummary'] });
      setBulkDialogOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al encolar la actualización'
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
        searchKey="razonSocial"
        searchPlaceholder="Buscar por CUIT, cliente o representante..."
        filters={[
          {
            columnId: 'estado',
            label: 'Estado',
            options: [
              { value: 'active', label: 'Activos' },
              { value: 'inactive', label: 'Inactivos' },
              { value: 'error', label: 'Credenciales inválidas' },
            ],
          },
        ]}
        onRowClick={(row) => {
          const cliente = row as ClientRow;
          if (!cliente.credencialId) return;
          navigate({
            to: '/clients/$clientId',
            params: { clientId: cliente.credencialId },
            search: { empresa: cliente.id },
          });
        }}
        onSelectionChange={(rows) => setSelectedClients(rows as ClientRow[])}
        toolbar={
          selectedClients.length > 0 ? (
            <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={isScraping || allSelectedRunning}
                  title={
                    allSelectedRunning
                      ? 'Todos los clientes seleccionados ya se están actualizando'
                      : undefined
                  }
                >
                  {isScraping ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Actualizar todos ({selectedRepresentativeIds.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>Actualizar todos</DialogTitle>
                  <DialogDescription>
                    Se van a encolar los módulos seleccionados para{' '}
                    {selectedRepresentativeIds.length} cliente
                    {selectedRepresentativeIds.length > 1 ? 's' : ''}. El
                    scraping corre en segundo plano.
                  </DialogDescription>
                </DialogHeader>
                {runningSelected.length > 0 && (
                  <p className="rounded-md border border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] px-3 py-2 text-xs text-[var(--arca-ink-2)]">
                    {runningSelected.length} de los clientes seleccionados ya
                    tienen actualizaciones en curso; los módulos duplicados se
                    van a omitir.
                  </p>
                )}
                <div className="space-y-3 py-1">
                  {BULK_JOB_TYPES.map((jobType) => (
                    <div key={jobType.value} className="flex items-start gap-3">
                      <Checkbox
                        id={`bulk-job-${jobType.value}`}
                        checked={selectedJobTypes.has(jobType.value)}
                        onCheckedChange={() => toggleJobType(jobType.value)}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`bulk-job-${jobType.value}`}
                        className="flex flex-col items-start gap-0.5 font-normal cursor-pointer"
                      >
                        <span className="text-sm font-medium">
                          {jobType.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {jobType.description}
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBulkDialogOpen(false)}
                    disabled={isScraping}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkUpdate}
                    disabled={isScraping || selectedJobTypes.size === 0}
                  >
                    {isScraping && (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    )}
                    Actualizar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
        emptyMessage="No hay clientes registrados."
      />

      {rowToEdit && (
        <EditRepresentativeDialog
          clienteId={rowToEdit.clienteId}
          credencialId={rowToEdit.credencialId}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setRowToEdit(null);
          }}
        />
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar {clienteToDelete?.razonSocial}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminan el cliente y todos
              sus datos (comprobantes, deudas, sueldos). El login de AFIP no se
              toca: si tiene otros clientes, siguen funcionando.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                clienteToDelete && deleteMutation.mutate(clienteToDelete.id)
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
