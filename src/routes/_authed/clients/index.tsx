import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RepresentativesTable } from '@/components/clients-table';
import { CreateRepresentativeDialog } from '@/components/create-client-dialog';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
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
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { ActiveJobsIndicator } from '@/components/active-jobs-indicator';
import { dispatchAllJobs } from '@/actions/job';

export const Route = createFileRoute('/_authed/clients/')({
  component: RouteComponent,
});

function UpdateAllButton() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const dispatchMutation = useMutation({
    mutationFn: () => dispatchAllJobs({ data: {} }),
    onSuccess: (data) => {
      if (data.dispatched === 0) {
        toast.error(
          `No se encoló ningún job${data.errors ? ` (${data.errors} con error)` : ''}`
        );
      } else if (data.errors > 0) {
        toast.warning(
          `${data.dispatched} jobs encolados, ${data.errors} con error`
        );
      } else {
        toast.success(`${data.dispatched} jobs encolados correctamente`);
      }
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['activeJobsSummary'] });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al disparar los jobs');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
          Actualizar todos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar todos los clientes</DialogTitle>
          <DialogDescription>
            Se encolará una actualización completa (deuda, vencimientos,
            notificaciones, comprobantes e IVA) para todos los clientes. Esta
            acción puede tardar y consumir ancho de banda.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={dispatchMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => dispatchMutation.mutate()}
            disabled={dispatchMutation.isPending}
          >
            {dispatchMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
            )}
            Actualizar todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RouteComponent() {
  return (
    <PageShell>
      <PageHeader
        title="Clientes"
        subtitle="Gestión de clientes y sus perfiles"
        actions={
          <>
            <ActiveJobsIndicator />
            <UpdateAllButton />
            <CreateRepresentativeDialog>
              <Button>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                Nuevo cliente
              </Button>
            </CreateRepresentativeDialog>
          </>
        }
      />
      <RepresentativesTable />
    </PageShell>
  );
}
