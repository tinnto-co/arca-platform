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
import { CopilotSidePanel } from '@/components/copilot/CopilotSidePanel';
import { BuscadorGlobal } from '@/components/shared/buscador-global';
import { FrontendTools } from '@/components/copilot/FrontendTools';
import { GlobalCopilotReadables } from '@/components/copilot/GlobalCopilotReadables';
import { VisiblePageReadable } from '@/components/copilot/VisiblePageReadable';
import { cn } from '@/lib/utils';
import { userQuery } from '@/lib/user-query';
import { ROL_SOPORTE } from '@/lib/permissions';
import { ShieldAlert } from 'lucide-react';

export const Route = createFileRoute('/_authed')({
  component: RouteComponent,
  beforeLoad: async ({ location }) => {
    const session = await getSession();
    if (!session) {
      throw redirect({ to: '/login' });
    }

    const activeOrgId = session.session?.activeOrganizationId;
    if (!activeOrgId) {
      const orgs = await getOrganizations();
      if (orgs.length === 0) {
        // El superadmin no pertenece a ningún estudio: su trabajo es darlos de
        // alta. Mandarlo a /no-organization lo deja encerrado —esa pantalla no
        // lleva a ningún lado— justo cuando todavía no existe la primera
        // organización y es el único que puede crearla.
        //
        // El módulo cuelga de este mismo layout, así que no se puede redirigir
        // a ciegas: estando ya ahí, el redirect se dispararía contra sí mismo.
        const esSuperadmin =
          (session.user as { role?: string | null } | undefined)?.role ===
          'admin';
        if (esSuperadmin) {
          if (location.pathname.startsWith('/organizaciones')) return session;
          throw redirect({ to: '/organizaciones' });
        }

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

/**
 * Franja de aviso mientras el superadmin trabaja dentro de un estudio ajeno.
 *
 * El acceso de soporte es invisible para el estudio —no aparece entre sus
 * miembros— así que tiene que ser bien visible para quien lo está usando: sin
 * esto es fácil olvidarse de que lo que se está tocando son los datos fiscales
 * de otro, y dejar el acceso abierto por semanas.
 */
function AvisoSoporte() {
  const { data: user } = useQuery(userQuery);
  const enSoporte =
    (user as { organizationRole?: string | null } | undefined)
      ?.organizationRole === ROL_SOPORTE;
  if (!enSoporte) return null;

  const estudio =
    (user as { organizationName?: string | null } | undefined)
      ?.organizationName ?? 'este estudio';

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--arca-accent-warn)] bg-[var(--arca-accent-warn-bg)] px-4 py-1.5 text-[12px] text-[var(--arca-accent-warn-fg)]">
      <ShieldAlert className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        Estás dentro de <strong className="font-semibold">{estudio}</strong> con
        un acceso de soporte. No sos miembro del estudio y todo lo que hagas
        queda registrado.
      </span>
      <a
        href="/organizaciones"
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        Salir
      </a>
    </div>
  );
}

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

  const shell = (
    agentInputSlot: React.ReactNode,
    asistenteSlot: React.ReactNode
  ) => (
    <OrgSwitchProvider>
      <SidebarProvider defaultOpen={true} className="h-svh">
        <AppSidebar />
        <SidebarInset className="relative flex min-h-0 min-w-0 flex-col">
          <AvisoSoporte />
          <div
            data-arca-content
            className={cn(
              'min-w-0 flex-1 min-h-0 overflow-y-auto',
              // `/chat` maneja su propio alto y su propio scroll. Si entra por
              // la rama de abajo se le suma el scroll del shell y la pantalla
              // queda con dos barras, una dentro de la otra.
              isChatRoute || altoCompleto
                ? 'h-full overflow-hidden'
                : 'bg-[var(--arca-bg)] pb-28 md:pb-24 min-h-full'
            )}
          >
            <Outlet />
          </div>
          {agentInputSlot}
        </SidebarInset>
        {/* Hermano flex del contenido: al abrirse lo empuja, no lo tapa. Vive
            dentro del provider porque necesita colapsar el menú lateral. */}
        {asistenteSlot}
        <MobileNavbar />
      </SidebarProvider>
    </OrgSwitchProvider>
  );

  /**
   * El provider va siempre, y lo que se gatea es la funcionalidad.
   *
   * Antes el árbol entero dependía de `aiAgentEnabled`: mientras
   * `listOrgModules` no resolvía, el layout devolvía el shell sin provider y
   * las pantallas que montan un `CopilotReadableEntity` —la ficha del
   * cliente, la tabla de clientes, sueldos por cliente— reventaban con
   * "useCopilotKit must be used within CopilotKitProvider". Las dos partes
   * leen la misma query, pero no re-renderizan en el mismo instante, y esa
   * ventana alcanzaba para romper la página.
   *
   * Montar el provider no habla con el runtime: eso pasa cuando alguien usa
   * el chat. Lo que sí se sigue gateando es lo que pesa —acciones, tools,
   * readables globales, la barra y el panel—.
   */
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      showDevConsole={false}
      enableInspector={false}
    >
      <CopilotAttachmentProvider>
        {aiAgentEnabled && (
          <>
            <CopilotActions />
            <FrontendTools />
            <GlobalCopilotReadables />
            <VisiblePageReadable />
          </>
        )}
        {shell(
          aiAgentEnabled && !hideAgentInput ? <AgentInput /> : null,
          aiAgentEnabled && !isChatRoute && !altoCompleto ? (
            <CopilotSidePanel />
          ) : null
        )}
        <BuscadorGlobal />
      </CopilotAttachmentProvider>
    </CopilotKit>
  );
}
