import { createFileRoute } from "@tanstack/react-router";
import { NotificationsView } from "@/components/notifications-view";
import { Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getNotifications } from "@/actions/notification";
import { userQuery } from "../../../lib/user-query";

export const Route = createFileRoute("/_authed/notifications/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data: user } = useQuery(userQuery);
  const orgKey =
    (user as { activeOrganizationId?: string | null } | null | undefined)
      ?.activeOrganizationId ?? "__pending__";

  const { data: notificationsData } = useQuery({
    queryKey: ["notifications", orgKey, 1, "all", "", "", ""],
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
    <div className="flex flex-col h-[calc(100svh-5rem)] md:h-svh p-4 md:p-6">
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="h-6 w-6 text-[#139ed9]" />
          <h1 className="text-2xl font-bold text-[#232c50]">Notificaciones</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Todas las notificaciones ({totalCount})
        </p>
      </div>

      <div className="flex-1 min-h-0">
        <NotificationsView />
      </div>
    </div>
  );
}
