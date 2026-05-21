import { createFileRoute } from '@tanstack/react-router';
import { RepresentativesTable } from '@/components/clients-table';
import { CreateRepresentativeDialog } from '@/components/create-client-dialog';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/clients/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        title="Clientes"
        subtitle="Gestión de clientes y sus perfiles"
        actions={
          <CreateRepresentativeDialog>
            <Button>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
              Nuevo cliente
            </Button>
          </CreateRepresentativeDialog>
        }
      />
      <RepresentativesTable />
    </div>
  );
}
