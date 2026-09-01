import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  Building2,
  Calculator,
  Sliders,
  FileText,
  PenLine,
  Upload,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { SueldosDashboard } from '@/components/sueldos/SueldosDashboard';
import { SueldosEmpleados } from '@/components/sueldos/SueldosEmpleados';
import { SueldosConvenios } from '@/components/sueldos/SueldosConvenios';
import { SueldosConceptos } from '@/components/sueldos/SueldosConceptos';
import { SueldosSimulador } from '@/components/sueldos/SueldosSimulador';
import { NuevoReciboView } from '@/components/sueldos/nuevo-recibo/NuevoReciboView';
import { useLocalStorageState } from '@/lib/use-local-storage-state';
import { SueldosRecibo } from '@/components/sueldos/SueldosRecibo';
import { SueldosFirmaDigital } from '@/components/sueldos/SueldosFirmaDigital';
import { SueldosCargas } from '@/components/sueldos/SueldosCargas';
import { getClientesForSueldos } from '@/actions/client';
import { EmpresasSueldosTable } from '@/components/sueldos/EmpresasSueldosTable';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { cn } from '@/lib/utils';
import {
  getPeriodoMesActual,
  getPeriodoMesAnterior,
} from '@/lib/payroll-period-rules';

export const Route = createFileRoute('/_authed/sueldos/')({
  component: RouteComponent,
});

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

const tabTriggerCls = () =>
  cn(
    'relative h-auto flex-none px-[14px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
    'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
    'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px'
  );

function RouteComponent() {
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editReciboData, setEditReciboData] = useState<
    EditReciboData | undefined
  >(undefined);
  const [reciboFiltroEmpleadoId, setReciboFiltroEmpleadoId] = useState('');
  const [vistaNuevoRecibo, setVistaNuevoRecibo] = useLocalStorageState<
    'nueva' | 'clasica'
  >('arca:sueldos:vista-nuevo-recibo', 'nueva');
  // Editar desde la tab Recibo abre siempre la vista clásica.
  const usaVistaNueva = vistaNuevoRecibo === 'nueva' && !editReciboData;

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const selectedOption = clients.find((c) => c.id === selectedOptionId);
  const clientId = selectedOption?.id ?? '';

  const setTab = (next: string) => {
    if (next !== 'simulador') setEditReciboData(undefined);
    if (next !== 'recibo') setReciboFiltroEmpleadoId('');
    setActiveTab(next);
  };

  return (
    <div className="space-y-0 overflow-x-clip">
      {/* Header */}
      <div className="px-9 pt-7 pb-0">
        {aiAgentEnabled && selectedOption && (
          <CopilotReadableEntity
            description="Estado actual del módulo Sueldos visible en pantalla. Usá clientId al invocar acciones de payroll. mesLiquidable es el único período sobre el que se pueden calcular liquidaciones."
            value={{
              modulo: 'sueldos',
              tabActiva: activeTab,
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
        {/* El selector de empresa se fue: la portada es la tabla. Adentro de una
            empresa el encabezado muestra cuál es y ofrece la vuelta al listado
            — patrón maestro-detalle, en vez de un combo que no dice dónde estás. */}
        <PageHeader
          title={
            selectedOption ? selectedOption.name : 'Liquidación de sueldos'
          }
          subtitle={
            selectedOption
              ? 'Convenios, empleados, conceptos y liquidaciones'
              : 'Elegí una empresa para gestionar sus sueldos'
          }
          actions={
            selectedOption ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setSelectedOptionId('');
                  setActiveTab('dashboard');
                  setEditReciboData(undefined);
                  setReciboFiltroEmpleadoId('');
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Todas las empresas
              </Button>
            ) : undefined
          }
        />
      </div>

      {!clientId ? (
        <div className="px-9 pt-6 pb-8">
          <EmpresasSueldosTable onSelect={(id) => setSelectedOptionId(id)} />
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setTab}
          className="flex flex-col"
        >
          {/* Tab bar */}
          <div className="sticky top-0 z-10 bg-[var(--arca-bg)] border-b border-[var(--arca-border)]">
            <div className="px-9">
              <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto overflow-y-hidden justify-start">
                <TabsTrigger value="dashboard" className={tabTriggerCls()}>
                  <LayoutDashboard className="h-[14px] w-[14px]" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="empleados" className={tabTriggerCls()}>
                  <Users className="h-[14px] w-[14px]" />
                  Empleados
                </TabsTrigger>
                <TabsTrigger value="convenios" className={tabTriggerCls()}>
                  <Building2 className="h-[14px] w-[14px]" />
                  Convenios
                </TabsTrigger>
                <TabsTrigger value="conceptos" className={tabTriggerCls()}>
                  <Calculator className="h-[14px] w-[14px]" />
                  Conceptos
                </TabsTrigger>
                <TabsTrigger value="simulador" className={tabTriggerCls()}>
                  <Sliders className="h-[14px] w-[14px]" />
                  Nuevo recibo
                </TabsTrigger>
                <TabsTrigger value="recibo" className={tabTriggerCls()}>
                  <FileText className="h-[14px] w-[14px]" />
                  Recibo
                </TabsTrigger>
                <TabsTrigger value="firma-digital" className={tabTriggerCls()}>
                  <PenLine className="h-[14px] w-[14px]" />
                  Firma Digital
                </TabsTrigger>
                <TabsTrigger value="cargas" className={tabTriggerCls()}>
                  <Upload className="h-[14px] w-[14px]" />
                  Cargas Sociales
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Content */}
          <div className="px-9 pt-5 pb-6">
            <TabsContent value="dashboard" className="mt-0">
              <SueldosDashboard clientId={clientId} />
            </TabsContent>
            <TabsContent value="empleados" className="mt-0">
              <SueldosEmpleados
                clientId={clientId}
                onVerRecibos={(empleadoId) => {
                  setReciboFiltroEmpleadoId(empleadoId);
                  setTab('recibo');
                }}
              />
            </TabsContent>
            <TabsContent value="convenios" className="mt-0">
              <SueldosConvenios clientId={clientId} />
            </TabsContent>
            <TabsContent value="conceptos" className="mt-0">
              <SueldosConceptos clientId={clientId} />
            </TabsContent>
            <TabsContent value="simulador" className="mt-0">
              {!editReciboData && (
                <div className="flex justify-end mb-3">
                  <button
                    type="button"
                    onClick={() =>
                      setVistaNuevoRecibo(usaVistaNueva ? 'clasica' : 'nueva')
                    }
                    className="h-[28px] px-3 rounded-[9px] text-[12px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] cursor-pointer"
                  >
                    {usaVistaNueva ? 'Vista clásica' : 'Vista nueva'}
                  </button>
                </div>
              )}
              {usaVistaNueva ? (
                <NuevoReciboView
                  clientId={clientId}
                  onConfirmRecibo={() => setTab('recibo')}
                />
              ) : (
                <SueldosSimulador
                  clientId={clientId}
                  onConfirmRecibo={() => setTab('recibo')}
                  initialData={editReciboData}
                  onReset={() => setEditReciboData(undefined)}
                />
              )}
            </TabsContent>
            <TabsContent value="recibo" className="mt-0">
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
            <TabsContent value="firma-digital" className="mt-0">
              <SueldosFirmaDigital clientId={clientId} />
            </TabsContent>
            <TabsContent value="cargas" className="mt-0">
              <SueldosCargas clientId={clientId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
