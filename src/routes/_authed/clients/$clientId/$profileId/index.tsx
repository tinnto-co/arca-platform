import { createFileRoute } from '@tanstack/react-router';
import { ClientDetailView } from '@/components/profile-detail-page';

export const Route = createFileRoute('/_authed/clients/$clientId/$profileId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { profileId, clientId } = Route.useParams();
  return <ClientDetailView clientId={profileId} representativeId={clientId} />;
}
