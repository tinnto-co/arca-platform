import { createFileRoute } from "@tanstack/react-router";
import { InvoicesTable } from "@/components/invoices-table";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authed/invoices/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="space-y-6 m-[3rem]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Facturas</h1>
        </div>
      </div>

      <InvoicesTable />
    </div>
  );
}
