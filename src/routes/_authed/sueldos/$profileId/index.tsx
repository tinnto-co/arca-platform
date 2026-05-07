import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  LayoutDashboard,
  Users,
  Building2,
  Calculator,
  Sliders,
  FileText,
  PenLine,
  ChevronLeft,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { SueldosDashboard } from '@/components/sueldos/SueldosDashboard';
import { SueldosEmpleados } from '@/components/sueldos/SueldosEmpleados';
import { SueldosConvenios } from '@/components/sueldos/SueldosConvenios';
import { SueldosConceptos } from '@/components/sueldos/SueldosConceptos';
import { SueldosSimulador } from '@/components/sueldos/SueldosSimulador';
import { SueldosRecibo } from '@/components/sueldos/SueldosRecibo';
import { SueldosFirmaDigital } from '@/components/sueldos/SueldosFirmaDigital';
import { getClientsForSueldos } from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { PageHeader } from '@/components/shared/page-header';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import {
  getPeriodoMesActual,
  getPeriodoMesAnterior,
} from '@/lib/payroll-period-rules';

const SUELDOS_TABS = [
  'dashboard',
  'empleados',
  'convenios',
  'conceptos',
  'simulador',
  'recibo',
  'firma-digital',
] as const;
type SueldosTab = (typeof SUELDOS_TABS)[number];

const TAB_DESCRIPTIONS: Record<SueldosTab, string> = {
  dashboard: 'Listado de liquidaciones del período seleccionado',
  empleados: 'Listado y CRUD de empleados del cliente',
  convenios: 'Convenios colectivos (CCT), categorías y escalas salariales',
  conceptos: 'Conceptos salariales del cliente con fórmulas configurables',
  simulador: 'Generación de un nuevo recibo individual',
  recibo: 'Visor e impresor de recibos confirmados',
  'firma-digital': 'Carga y gestión de la firma digital del empleador',
};

export const Route = createFileRoute('/_authed/sueldos/$profileId/')({
  validateSearch: z.object({
    tab: z.enum(SUELDOS_TABS).optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { profileId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeTab: SueldosTab = search.tab ?? 'dashboard';

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientsForSueldos(),
  });

  const { data: orgModules } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled = orgModules?.ai_agent ?? false;

  const selectedOption = clients.find((c) => c.profileId === profileId);
  const clientId = selectedOption?.clientId ?? '';

  const setTab = (next: SueldosTab) => {
    void navigate({
      to: '/sueldos/$profileId',
      params: { profileId },
      search: { tab: next === 'dashboard' ? undefined : next },
      replace: true,
    });
  };

  if (!isLoading && !selectedOption) {
    return (
      <div className="space-y-4 overflow-x-hidden p-4 md:space-y-6 md:px-[3rem] md:pt-[3rem] md:pb-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <h2 className="text-lg font-semibold mb-2">Perfil no encontrado</h2>
            <p className="text-muted-foreground max-w-md">
              No encontramos un perfil con ese identificador habilitado para
              sueldos.
            </p>
            <Link
              to="/sueldos"
              className="mt-4 text-sm font-medium text-[#139ed9] hover:underline"
            >
              Volver al listado
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden p-4 md:space-y-6 md:px-[3rem] md:pt-[3rem] md:pb-6">
      {aiAgentEnabled && selectedOption && (
        <CopilotReadableEntity
          description="Estado actual del módulo Sueldos visible en pantalla. Usá clientId/profileId al invocar acciones de payroll. mesLiquidable es el único período sobre el que se pueden calcular liquidaciones."
          value={{
            modulo: 'sueldos',
            tabActiva: activeTab,
            tabDescripcion: TAB_DESCRIPTIONS[activeTab] ?? null,
            cliente: {
              optionId: selectedOption.id,
              clientId,
              profileId,
              label: selectedOption.label,
            },
            mesActual: getPeriodoMesActual(),
            mesLiquidable: getPeriodoMesAnterior(),
          }}
        />
      )}
      <PageHeader
        title={selectedOption?.label ?? 'Cargando…'}
        subtitle="Sueldos del cliente"
        actions={
          <Link
            to="/sueldos"
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al listado
          </Link>
        }
      />

      {clientId && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setTab(v as SueldosTab)}
          className="w-full min-w-0 max-w-full"
        >
          <div className="-mx-4 md:-mx-[3rem] border-b border-[var(--arca-border)] px-4 md:px-[3rem]">
            <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto justify-start">
              {(
                [
                  {
                    value: 'dashboard',
                    icon: <LayoutDashboard className="h-[14px] w-[14px]" />,
                    label: 'Dashboard',
                  },
                  {
                    value: 'empleados',
                    icon: <Users className="h-[14px] w-[14px]" />,
                    label: 'Empleados',
                  },
                  {
                    value: 'convenios',
                    icon: <Building2 className="h-[14px] w-[14px]" />,
                    label: 'Convenios',
                  },
                  {
                    value: 'conceptos',
                    icon: <Calculator className="h-[14px] w-[14px]" />,
                    label: 'Conceptos',
                  },
                  {
                    value: 'simulador',
                    icon: <Sliders className="h-[14px] w-[14px]" />,
                    label: 'Nuevo recibo',
                  },
                  {
                    value: 'recibo',
                    icon: <FileText className="h-[14px] w-[14px]" />,
                    label: 'Recibo',
                  },
                  {
                    value: 'firma-digital',
                    icon: <PenLine className="h-[14px] w-[14px]" />,
                    label: 'Firma Digital',
                  },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    'relative h-auto flex-none px-[14px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
                    'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
                    'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="mt-4 min-w-0 max-w-full">
            <TabsContent value="dashboard">
              <SueldosDashboard clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="empleados">
              <SueldosEmpleados clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="convenios">
              <SueldosConvenios clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="conceptos">
              <SueldosConceptos clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="simulador">
              <SueldosSimulador
                clientId={clientId}
                profileId={profileId}
                onConfirmRecibo={() => setTab('recibo')}
              />
            </TabsContent>
            <TabsContent value="recibo">
              <SueldosRecibo clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="firma-digital">
              <SueldosFirmaDigital clientId={clientId} profileId={profileId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
