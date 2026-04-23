import { createFileRoute } from '@tanstack/react-router';
import { NotificationsView } from '@/components/notifications-view';
import { Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/actions/notification';
import { userQuery } from '../../../lib/user-query';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/notifications/')({
  component: RouteComponent,
});

function RouteComponent() {
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
        icon={Bell}
        title="Notificaciones"
        subtitle={`${totalCount} notificaciones en total`}
      />
      <NotificationsView />
    </div>
  );
}
