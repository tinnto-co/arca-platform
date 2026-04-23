import {
  getSession,
  getOrganizations,
  setActiveOrganization,
} from '@/actions/user';
import { AppSidebar } from '@/components/app-sidebar';
import { MobileNavbar } from '@/components/mobile-navbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OrgSwitchProvider } from '@/contexts/org-switch-context';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { Suspense } from 'react';

export const Route = createFileRoute('/_authed')({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const activeOrgId = session.session?.activeOrganizationId;
    if (!activeOrgId) {
      const orgs = await getOrganizations();
      if (orgs.length === 0) {
        throw redirect({ to: '/no-organization' });
      }
      await setActiveOrganization({ data: { organizationId: orgs[0].orgId } });
    }

    return session;
  },
});

function RouteComponent() {
  //   const { sidebarOpen } = Route.useLoaderData();
  return (
    <OrgSwitchProvider>
      <div className="grid h-svh grid-rows-[auto_1fr]">
        <SidebarProvider defaultOpen={true}>
          <Suspense fallback={<div>Loading...</div>}>
            <AppSidebar />
          </Suspense>
          <SidebarInset>
            <div className="min-h-[100svh] bg-[var(--arca-bg)] min-w-0 pb-20 md:pb-0">
              <Outlet />
            </div>
          </SidebarInset>
          <MobileNavbar />
        </SidebarProvider>
      </div>
    </OrgSwitchProvider>
  );
}
