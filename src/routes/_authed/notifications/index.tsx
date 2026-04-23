import { createFileRoute } from '@tanstack/react-router';
import { NotificationsView } from '@/components/notifications-view';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/actions/notification';
import { userQuery } from '../../../lib/user-query';
import { PageHeader } from '@/components/shared/page-header';
import z from 'zod';

export const Route = createFileRoute('/_authed/notifications/')({
  validateSearch: z.object({
    notificationId: z.string().optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { notificationId } = Route.useSearch();

  const { data: user } = useQuery(userQuery);
  const orgKey =
    (user as { activeOrganizationId?: string | null } | null | undefined)
      ?.activeOrganizationId ?? '__pending__';

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', orgKey, 1, 'all', '', '', ''],
    queryFn: () =>
      getNotifications({
        data: {
          page: 1,
          limit: 1,
        },
      }),
  });

  const totalCount = notificationsData?.totalCount ?? 0;

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        title="Notificaciones"
        subtitle={`${totalCount} notificaciones en total`}
      />
      <NotificationsView initialNotificationId={notificationId} />
    </div>
  );
}
