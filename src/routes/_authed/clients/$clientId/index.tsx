import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RepresentativeDetailPage } from '@/components/client-detail-page';

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();

  return (
    <>
      <RepresentativeDetailPage representativeId={clientId} />
      <Outlet />
    </>
  );
}
