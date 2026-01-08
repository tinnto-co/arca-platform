import { createFileRoute } from "@tanstack/react-router";
import { InvoicesTable } from "@/components/invoices-table";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authed/invoices/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto space-y-6 m-[3rem]">
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="h-6 w-6 flex-shrink-0" />
          <h1 className="text-2xl font-bold truncate">Facturas</h1>
        </div>
      </div>

      <InvoicesTable />
    </div>
  );
}
