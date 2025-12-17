import { createFileRoute } from "@tanstack/react-router";
import { ClientsTable } from "@/components/clients-table";
import { CreateClientDialog } from "@/components/create-client-dialog";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/clients/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Clientes</h1>
        </div>
        <CreateClientDialog>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Cliente
          </Button>
        </CreateClientDialog>
      </div>

      <ClientsTable />
    </div>
  );
}
