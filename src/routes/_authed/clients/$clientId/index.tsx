import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { RepresentativeDetailPage } from '@/components/client-detail-page';

const CLIENT_DETAIL_TABS = [
  'resumen',
  'deudas',
  'vencimientos',
  'notificaciones',
  'facturas',
  'iva',
  'convenio-multilateral',
  'solicitudes',
] as const;

const searchSchema = z.object({
  tab: z.enum(CLIENT_DETAIL_TABS).optional(),
  client: z.string().optional(),
});

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  validateSearch: searchSchema,
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = search.tab ?? 'resumen';

  const onTabChange = (next: string) => {
    void navigate({
      to: '/clients/$clientId',
      params: { clientId },
      search: {
        tab: next === 'resumen' ? undefined : (next as never),
        client: search.client,
      },
      replace: true,
    });
  };

  // Perfil (client) elegido en el header → query param ?client= de la URL.
  const onProfileChange = (profileId: string | undefined) => {
    void navigate({
      to: '/clients/$clientId',
      params: { clientId },
      search: {
        tab: activeTab === 'resumen' ? undefined : (activeTab as never),
        client: profileId,
      },
      replace: true,
    });
  };

  return (
    <>
      <RepresentativeDetailPage
        representativeId={clientId}
        initialClientId={search.client}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onProfileChange={onProfileChange}
      />
      <Outlet />
    </>
  );
}
