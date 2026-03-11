import { createFileRoute } from "@tanstack/react-router";
import { JobsTable } from "@/components/jobs-table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authed/jobs/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex flex-col h-full space-y-6 m-[3rem]">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Jobs</h1>
        </div>
        <p className="text-muted-foreground">
          Historial de jobs de scraping, con filtros por cliente, tipo y estado.
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <JobsTable />
      </div>
    </div>
  );
}

