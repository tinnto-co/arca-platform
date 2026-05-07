import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ClientDetailPage } from '@/components/client-detail-page';

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();

  return (
    <>
      <ClientDetailPage clientId={clientId} />
      <Outlet />
    </>
  );
}
