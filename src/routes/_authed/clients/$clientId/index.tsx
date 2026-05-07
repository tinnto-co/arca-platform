import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ClientDetailPage } from '@/components/client-detail-page';

const CLIENT_DETAIL_TABS = [
  'resumen',
  'deudas',
  'vencimientos',
  'notificaciones',
  'facturas',
  'iva',
  'convenio-multilateral',
] as const;

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  validateSearch: z.object({
    tab: z.enum(CLIENT_DETAIL_TABS).optional(),
  }),
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
      search: { tab: next === 'resumen' ? undefined : (next as never) },
      replace: true,
    });
  };

  return (
    <>
      <ClientDetailPage
        clientId={clientId}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
      <Outlet />
    </>
  );
}
