import {
  getSession,
  getOrganizations,
  setActiveOrganization,
} from '@/actions/user';
import { listOrgModules } from '@/actions/admin';
import { getPortalSession } from '@/actions/client-portal';
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
import { CopilotAttachmentProvider } from '@/components/copilot/AttachmentContext';
import { CopilotBottomPanel } from '@/components/copilot/CopilotBottomPanel';
import { BuscadorGlobal } from '@/components/shared/buscador-global';
import { FrontendTools } from '@/components/copilot/FrontendTools';
import { GlobalCopilotReadables } from '@/components/copilot/GlobalCopilotReadables';
import { VisiblePageReadable } from '@/components/copilot/VisiblePageReadable';
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
        // Un usuario del portal tampoco pertenece a ninguna organización, pero
        // su lugar es el portal, no la pantalla de "sin organización" (sin esto
        // cualquier deep link o refresh lo deja en un callejón sin salida).
        const portal = await getPortalSession().catch(() => null);
        throw redirect({ to: portal ? '/portal' : '/no-organization' });
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

  /**
   * Pantallas que manejan su propio scroll y ocupan el alto completo: la
   * bandeja, el tablero de tareas y el calendario de vencimientos tienen
   * columnas que scrollean por dentro, así que no pueden convivir con el
   * padding que deja lugar al input del asistente.
   */
  const altoCompleto =
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/tareas') ||
    pathname.startsWith('/vencimientos');

  /**
   * De las de alto completo, las que además se comen el lugar del input del
   * asistente. Vencimientos no: ahí el input sigue flotando abajo y la
   * pantalla deja el hueco justo para que no lo tape.
   */
  const sinInputAgente =
    pathname.startsWith('/notifications') || pathname.startsWith('/tareas');

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });

  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;
  const hideAgentInput = isChatRoute || sinInputAgente || !aiAgentEnabled;

  const shell = (agentInputSlot: React.ReactNode) => (
    <OrgSwitchProvider>
      <SidebarProvider defaultOpen={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="relative flex min-h-0 min-w-0 flex-col">
          <div
            data-arca-content
            className={cn(
              'min-w-0 flex-1 min-h-0 overflow-y-auto',
              isChatDetail || altoCompleto
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
    return (
      <CopilotKit
        runtimeUrl="/api/copilotkit"
        showDevConsole={false}
        enableInspector={false}
      >
        <CopilotAttachmentProvider>
          <CopilotActions />
          <FrontendTools />
          <GlobalCopilotReadables />
          <VisiblePageReadable />
          {shell(!hideAgentInput ? <AgentInput /> : null)}
          {!isChatRoute && !altoCompleto && <CopilotBottomPanel />}
          <BuscadorGlobal />
        </CopilotAttachmentProvider>
      </CopilotKit>
    );
  }

  return shell(null);
}
