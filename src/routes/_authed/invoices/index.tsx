import { createFileRoute } from "@tanstack/react-router";
import { InvoicesTable } from "@/components/invoices-table";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authed/invoices/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col h-full w-full max-w-full min-w-0 p-4 md:p-6">
      <div className="flex items-center justify-between min-w-0 mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Receipt className="h-6 w-6 flex-shrink-0 text-[#139ed9]" />
          <h1 className="text-2xl font-bold truncate text-[#232c50]">Facturas</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <InvoicesTable />
      </div>
    </div>
  );
}
