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
import { lazy, Suspense } from 'react';
import { CopilotAttachmentProvider } from '@/components/copilot/AttachmentContext';
import { cn } from '@/lib/utils';

// Carga diferida a propósito: CopilotProvider es la única puerta a
// `@copilotkit/*`, que arrastra streamdown → mermaid + shiki (~2 MB de JS).
// Importado en forma estática, ese árbol entra al grafo de entrada del build
// aunque la organización no tenga el módulo `ai_agent` habilitado.
const CopilotProvider = lazy(
  () => import('@/components/copilot/CopilotProvider')
);

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

  const { data: orgModules = [], isLoading: isModulesLoading } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });

  // Wait for the org-modules query before deciding whether to mount <CopilotKit>.
  // Otherwise aiAgentEnabled flips false→true mid-render which unmounts/remounts
  // the entire CopilotKit tree and triggers internal "subscribe on null" race
  // conditions inside the library (see useCopilotChatInternal).
  if (isModulesLoading) return null;

  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;
  const hideAgentInput = isChatRoute || !aiAgentEnabled;

  const shell = (agentInputSlot: React.ReactNode) => (
    <OrgSwitchProvider>
      <SidebarProvider defaultOpen={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="relative flex min-h-0 min-w-0 flex-col">
          <div
            data-arca-content
            className={cn(
              'min-w-0 flex-1 min-h-0 overflow-y-auto',
              isChatDetail
                ? 'h-full overflow-hidden'
                : 'bg-[var(--arca-bg)] pb-28 md:pb-24 min-h-full'
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
    const shellNode = shell(!hideAgentInput ? <AgentInput /> : null);
    return (
      <CopilotAttachmentProvider>
        {/* fallback null y no `shellNode`: montar el shell fuera del provider
            y después moverlo adentro lo remontaría entero. Además esta rama ya
            devuelve null arriba mientras carga `orgModules`, así que no cambia
            lo que se ve. */}
        <Suspense fallback={null}>
          <CopilotProvider showBottomPanel={!isChatRoute}>
            {shellNode}
          </CopilotProvider>
        </Suspense>
      </CopilotAttachmentProvider>
    );
  }

  return shell(null);
}
