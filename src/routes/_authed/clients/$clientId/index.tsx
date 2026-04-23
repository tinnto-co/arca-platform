import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ClientDetailPage } from '@/components/client-detail-page';
import { useRouterState } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/clients/$clientId/')({
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();
  const routerState = useRouterState();

  // Check if we're on a profile route by checking the pathname
  // The route structure is /clients/$clientId/$profileId (no "profiles" in path)
  const pathname = routerState.location.pathname;
  const pathParts = pathname.split('/').filter(Boolean);
  // Check if we have a profileId: path should be /clients/[clientId]/[profileId]
  // pathParts[0] = 'clients', pathParts[1] = clientId, pathParts[2] = profileId (if exists)
  const isProfileRoute =
    pathParts.length >= 3 &&
    pathParts[0] === 'clients' &&
    pathParts[2] !== undefined &&
    pathParts[2] !== '';

  console.log(
    '[ClientRoute] pathname:',
    pathname,
    'pathParts:',
    pathParts,
    'isProfileRoute:',
    isProfileRoute,
    'clientId:',
    clientId
  );

  // If we're on a profile route, only render the Outlet (which will show ProfileDetailPage)
  // If we're on the exact client route, render ClientDetailPage and empty Outlet
  if (isProfileRoute) {
    return <Outlet />;
  }

  return (
    <>
      <ClientDetailPage clientId={clientId} />
      <Outlet />
    </>
  );
}
