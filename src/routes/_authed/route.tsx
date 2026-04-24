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
      <SidebarProvider defaultOpen={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-y-auto">
          <div
            className={cn(
              'min-w-0',
              isChatRoute ? 'h-full overflow-hidden' : 'bg-[var(--arca-bg)] pb-20 md:pb-0'
            )}
          >
            <Outlet />
          </div>
          {!isChatRoute && <AgentInput />}
        </SidebarInset>
        <MobileNavbar />
      </SidebarProvider>
    </OrgSwitchProvider>
  );
}
