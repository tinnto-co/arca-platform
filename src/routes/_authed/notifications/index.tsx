import { createFileRoute } from "@tanstack/react-router";
import { NotificationsView } from "@/components/notifications-view";
import { Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getNotifications } from "@/actions/notification";

export const Route = createFileRoute("/_authed/notifications/")({
  component: RouteComponent,
});

function RouteComponent() {
  // Get notifications count
  const { data: notificationsData } = useQuery({
    queryKey: ["notifications", 1, "all", "", "", ""],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 1,
        },
      }),
  });

  const totalCount = notificationsData?.totalCount || 0;

  return (
    <div className="flex flex-col h-full space-y-6 m-[3rem]">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Mail className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Notificaciones</h1>
        </div>
        <p className="text-muted-foreground">
          Todas las notificaciones ({totalCount})
        </p>
      </div>

      {/* Notifications View */}
      <div className="flex-1 min-h-0">
        <NotificationsView />
      </div>
    </div>
  );
}
