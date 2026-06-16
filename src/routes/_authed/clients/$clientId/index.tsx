import { createFileRoute, Outlet } from '@tanstack/react-router';
import { z } from 'zod';
import { RepresentativeDetailPage } from '@/components/client-detail-page';

const searchSchema = z.object({
  client: z.string().optional(),
});

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();
  const { client } = Route.useSearch();

  return (
    <>
      <RepresentativeDetailPage representativeId={clientId} initialClientId={client} />
      <Outlet />
    </>
  );
}
