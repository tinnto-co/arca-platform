import { createFileRoute } from '@tanstack/react-router';
import { ClientsTable } from '@/components/clients-table';
import { CreateClientDialog } from '@/components/create-client-dialog';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_authed/clients/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col h-[calc(100svh-5rem)] md:h-svh p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-[#139ed9]" />
          <h1 className="text-2xl font-bold text-[#232c50]">Clientes</h1>
        </div>
        <CreateClientDialog>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cliente
          </Button>
        </CreateClientDialog>
      </div>

      <div className="flex-1 min-h-0">
        <ClientsTable />
      </div>
    </div>
  );
}
