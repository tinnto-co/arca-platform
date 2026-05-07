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
import { CopilotActions } from '@/components/copilot/CopilotActions';
import { AdditionalInstructions } from '@/components/copilot/AdditionalInstructions';
import { CopilotAttachmentProvider } from '@/components/copilot/AttachmentContext';
import { CopilotBottomPanel } from '@/components/copilot/CopilotBottomPanel';
import { CopilotSuggestions } from '@/components/copilot/CopilotSuggestions';
import { FrontendTools } from '@/components/copilot/FrontendTools';
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
  const isChatRoute = isChatDetail || pathname === '/chat';

  const { data: orgModules, isLoading: isModulesLoading } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });

  // Wait for the org-modules query before deciding whether to mount <CopilotKit>.
  // Otherwise aiAgentEnabled flips false→true mid-render which unmounts/remounts
  // the entire CopilotKit tree and triggers internal "subscribe on null" race
  // conditions inside the library (see useCopilotChatInternal).
  if (isModulesLoading) return null;

  const aiAgentEnabled = orgModules?.ai_agent ?? false;
  const hideAgentInput = isChatRoute || !aiAgentEnabled;

  const shell = (agentInputSlot: React.ReactNode) => (
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
          {agentInputSlot}
        </SidebarInset>
        <MobileNavbar />
      </SidebarProvider>
    </OrgSwitchProvider>
  );

  if (aiAgentEnabled) {
    return (
      <CopilotKit runtimeUrl="/api/copilotkit" agent="default">
        <CopilotAttachmentProvider>
          <CopilotActions />
          <CopilotSuggestions />
          <AdditionalInstructions />
          <FrontendTools />
          {shell(!hideAgentInput ? <AgentInput /> : null)}
          {!isChatRoute && <CopilotBottomPanel />}
        </CopilotAttachmentProvider>
      </CopilotKit>
    );
  }

  return shell(null);
}
