import { createFileRoute } from "@tanstack/react-router";
import { JobsTable } from "@/components/jobs-table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authed/jobs/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col h-full p-4 md:p-6">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Loader2 className="h-6 w-6 text-[#139ed9]" />
          <h1 className="text-2xl font-bold text-[#232c50]">Jobs</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Historial de jobs de scraping, con filtros por cliente, tipo y estado.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <JobsTable />
      </div>
    </div>
  );
}

