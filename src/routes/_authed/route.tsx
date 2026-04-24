import {
  getSession,
  getOrganizations,
  setActiveOrganization,
} from '@/actions/user';
import { AppSidebar } from '@/components/app-sidebar';
import { AgentInput } from '@/components/agent/AgentInput';
import { MobileNavbar } from '@/components/mobile-navbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OrgSwitchProvider } from '@/contexts/org-switch-context';
import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { Suspense } from 'react';
import { cn } from '@/lib/utils';

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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChatRoute = pathname.startsWith('/chat/');

  return (
    <OrgSwitchProvider>
      <div className="grid h-svh grid-rows-[auto_1fr]">
        <SidebarProvider defaultOpen={true}>
          <Suspense fallback={<div>Loading...</div>}>
            <AppSidebar />
          </Suspense>
          <SidebarInset>
            <div className="relative flex h-svh flex-col overflow-hidden">
              <div
                className={cn(
                  'min-h-0 flex-1',
                  isChatRoute ? 'overflow-hidden' : 'overflow-y-auto bg-[#efeeef]',
                )}
              >
                <div className={cn(isChatRoute ? 'h-full' : 'w-full min-w-0 overflow-x-hidden pb-20')}>
                  <Outlet />
                </div>
              </div>
              {!isChatRoute && <AgentInput />}
            </div>
          </SidebarInset>
          <MobileNavbar />
        </SidebarProvider>
      </div>
    </OrgSwitchProvider>
  );
}
