import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import {
  LayoutDashboard,
  Users,
  Building2,
  Calculator,
  Sliders,
  FileText,
  PenLine,
  Upload,
  ChevronLeft,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { SueldosDashboard } from '@/components/sueldos/SueldosDashboard';
import { SueldosEmpleados } from '@/components/sueldos/SueldosEmpleados';
import { SueldosConvenios } from '@/components/sueldos/SueldosConvenios';
import { SueldosConceptos } from '@/components/sueldos/SueldosConceptos';
import { SueldosSimulador } from '@/components/sueldos/SueldosSimulador';
import { SueldosRecibo } from '@/components/sueldos/SueldosRecibo';
import { SueldosFirmaDigital } from '@/components/sueldos/SueldosFirmaDigital';
import { SueldosCargas } from '@/components/sueldos/SueldosCargas';
import { getClientesForSueldos } from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
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
  'cargas',
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
  cargas: 'Cargas sociales y generación del archivo LSD para AFIP',
};

/** Datos para precargar el simulador al editar un recibo existente. */
interface EditReciboData {
  importEmpleadoId: string;
  empleadoNombre: string;
  periodo: string;
  tipoRecibo: string;
  quincena?: string | null;
  fechaLiquidacion?: string | null;
  fechaPago?: string | null;
  obraSocialId?: string | null;
  periodoCargas?: string | null;
  fechaDepositoCargas?: string | null;
  observacionInterna?: string | null;
  observacionRecibo?: string | null;
  situacionRevista1Id?: string | null;
  situacionRevista1DiaInicio?: number | null;
  situacionRevista2Id?: string | null;
  situacionRevista2DiaInicio?: number | null;
  situacionRevista3Id?: string | null;
  situacionRevista3DiaInicio?: number | null;
  diasTrabajados?: number | null;
  horasTrabajadas?: number | null;
  importeMaternidadArt13?: string | null;
}

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

  const [editReciboData, setEditReciboData] = useState<
    EditReciboData | undefined
  >(undefined);
  const [reciboFiltroEmpleadoId, setReciboFiltroEmpleadoId] = useState('');

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  // El par (clientId, profileId) colapsó en un solo `cliente`: el param
  // `profileId` de la URL lleva directamente el id del cliente.
  const selectedOption = clients.find((c) => c.id === profileId);
  const clientId = selectedOption?.id ?? '';

  const setTab = (next: SueldosTab) => {
    if (next !== 'simulador') setEditReciboData(undefined);
    if (next !== 'recibo') setReciboFiltroEmpleadoId('');
    void navigate({
      to: '/sueldos/$profileId',
      params: { profileId },
      search: { tab: next === 'dashboard' ? undefined : next },
      replace: true,
    });
  };

  if (!isLoading && !selectedOption) {
    return (
      <div className="overflow-x-hidden bg-[#F7F6F2] min-h-screen max-w-[1380px] mx-auto px-[44px] pt-[34px] pb-[72px]">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <h2 className="text-lg font-semibold mb-2 text-[#12131A]">
            Perfil no encontrado
          </h2>
          <p className="text-[#9B9CA3] max-w-md">
            No encontramos un perfil con ese identificador habilitado para
            sueldos.
          </p>
          <Link
            to="/sueldos"
            className="mt-4 text-[13.5px] font-medium text-[#2A4680] hover:underline"
          >
            Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return (
    // overflow-x-clip (no -hidden): clip no crea scroll container y deja funcionar los sticky headers internos
    <div className="overflow-x-clip bg-[#F7F6F2] min-h-screen max-w-[1380px] mx-auto px-[44px] pt-[34px] pb-[72px] space-y-6">
      {aiAgentEnabled && selectedOption && (
        <CopilotReadableEntity
          description="Estado actual del módulo Sueldos visible en pantalla. Usá clientId al invocar acciones de payroll. mesLiquidable es el único período sobre el que se pueden calcular liquidaciones."
          value={{
            modulo: 'sueldos',
            tabActiva: activeTab,
            tabDescripcion: TAB_DESCRIPTIONS[activeTab] ?? null,
            cliente: {
              optionId: selectedOption.id,
              clientId,
              label: selectedOption.label,
            },
            mesActual: getPeriodoMesActual(),
            mesLiquidable: getPeriodoMesAnterior(),
          }}
        />
      )}
      <div className="flex items-start gap-6">
        {/* Left — identity */}
        <div className="min-w-0">
          <div className="flex items-center gap-[10px]">
            <Link
              to="/sueldos"
              className="w-[30px] h-[30px] shrink-0 rounded-[10px] border border-[#DFDCD3] bg-white text-[#6E7079] inline-flex items-center justify-center hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
              title="Volver al listado"
            >
              <ChevronLeft className="h-[15px] w-[15px]" />
            </Link>
            <h1 className="font-[family-name:var(--ff-display)] text-[29px] font-bold tracking-[-0.025em] leading-[1.1] text-[#12131A] truncate">
              {selectedOption?.name ?? 'Cargando…'}
            </h1>
          </div>
          {/* Meta line */}
          <div className="mt-2 ml-[40px] flex flex-wrap items-center gap-x-[9px] gap-y-[2px] text-[13px] text-[#9B9CA3]">
            {selectedOption?.label && (
              <>
                <span>
                  CUIT{' '}
                  <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[#6E7079] tabular-nums">
                    {selectedOption.label.match(/\((\d+)\)/)?.[1] ?? ''}
                  </span>
                </span>
                <span>·</span>
              </>
            )}
            <span className="text-[#9B9CA3]">Sueldos del cliente</span>
          </div>
        </div>
      </div>

      {clientId && (
        <Tabs
          value={activeTab}
          onValueChange={(v) => setTab(v as SueldosTab)}
          className="w-full min-w-0 max-w-full"
        >
          <div className="border-b border-[#ECEAE3] mb-[30px]">
            <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto justify-start [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
                  {
                    value: 'cargas',
                    icon: <Upload className="h-[14px] w-[14px]" />,
                    label: 'Cargas Sociales',
                  },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    'relative h-auto flex-none px-[14px] py-[10px] text-[13.5px] font-medium rounded-[10px_10px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
                    'border-transparent text-[#6E7079] font-medium hover:bg-transparent hover:text-[#12131A]',
                    'data-[state=active]:bg-white data-[state=active]:border-[#ECEAE3] data-[state=active]:[border-bottom-color:#F7F6F2] data-[state=active]:text-[#12131A] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px'
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="min-w-0 max-w-full">
            <TabsContent value="dashboard">
              <SueldosDashboard clientId={clientId} />
            </TabsContent>
            <TabsContent value="empleados">
              <SueldosEmpleados
                clientId={clientId}
                onVerRecibos={(empleadoId) => {
                  setReciboFiltroEmpleadoId(empleadoId);
                  setTab('recibo');
                }}
              />
            </TabsContent>
            <TabsContent value="convenios">
              <SueldosConvenios clientId={clientId} />
            </TabsContent>
            <TabsContent value="conceptos">
              <SueldosConceptos clientId={clientId} />
            </TabsContent>
            <TabsContent value="simulador">
              <SueldosSimulador
                clientId={clientId}
                onConfirmRecibo={() => setTab('recibo')}
                initialData={editReciboData}
                onReset={() => setEditReciboData(undefined)}
              />
            </TabsContent>
            <TabsContent value="recibo">
              <SueldosRecibo
                key={reciboFiltroEmpleadoId}
                clientId={clientId}
                initialEmpleadoId={reciboFiltroEmpleadoId || undefined}
                onEditRecibo={(data) => {
                  setEditReciboData(data);
                  setTab('simulador');
                }}
              />
            </TabsContent>
            <TabsContent value="firma-digital">
              <SueldosFirmaDigital clientId={clientId} />
            </TabsContent>
            <TabsContent value="cargas">
              <SueldosCargas clientId={clientId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
