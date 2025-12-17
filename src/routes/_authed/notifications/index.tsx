import { createFileRoute } from "@tanstack/react-router";
import { NotificationsTable } from "@/components/notifications-table";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authed/notifications/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Notificaciones</h1>
        </div>
      </div>

      <NotificationsTable />
    </div>
  );
}
