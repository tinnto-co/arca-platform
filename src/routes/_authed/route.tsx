import {
  getSession,
  getOrganizations,
  setActiveOrganization,
} from '@/actions/user';
import { listOrgModules } from '@/actions/admin';
import { AppSidebar } from '@/components/app-sidebar';
import { AgentInput } from '@/components/agent/AgentInput';
import { MobileNavbar } from '@/components/mobile-navbar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { OrgSwitchProvider } from '@/contexts/org-switch-context';
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { CopilotKit } from '@copilotkit/react-core';
import '@copilotkit/react-ui/styles.css';
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
  const isChatDetail = pathname.startsWith('/chat/');
  const hideAgentInput = isChatDetail || pathname === '/chat';

  const { data: orgModules } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled = orgModules?.ai_agent ?? false;

  const shell = (
    <OrgSwitchProvider>
      <SidebarProvider defaultOpen={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="min-h-0 overflow-y-auto">
          <div
            className={cn(
              'min-w-0',
              isChatDetail
                ? 'h-full overflow-hidden'
                : 'bg-[var(--arca-bg)] pb-20 md:pb-0'
            )}
          >
            <Outlet />
          </div>
          {!hideAgentInput && <AgentInput />}
        </SidebarInset>
        <MobileNavbar />
      </SidebarProvider>
    </OrgSwitchProvider>
  );

  if (aiAgentEnabled) {
    return (
      <CopilotKit runtimeUrl="/api/copilotkit" agent="default">
        {shell}
      </CopilotKit>
    );
  }

  return shell;
}
