import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  Building2,
  Calculator,
  Sliders,
  FileText,
  UserCircle,
  PenLine,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SueldosDashboard } from '@/components/sueldos/SueldosDashboard';
import { SueldosEmpleados } from '@/components/sueldos/SueldosEmpleados';
import { SueldosConvenios } from '@/components/sueldos/SueldosConvenios';
import { SueldosConceptos } from '@/components/sueldos/SueldosConceptos';
import { SueldosSimulador } from '@/components/sueldos/SueldosSimulador';
import { SueldosRecibo } from '@/components/sueldos/SueldosRecibo';
import { SueldosFirmaDigital } from '@/components/sueldos/SueldosFirmaDigital';
import { getRepresentativesForSueldos } from '@/actions/client';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/sueldos/')({
  component: RouteComponent,
});

const tabTriggerCls = () =>
  cn(
    'relative h-auto flex-none px-[14px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
    'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
    'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px'
  );

function RouteComponent() {
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [editReciboData, setEditReciboData] = useState<{
    importEmpleadoId: string;
    empleadoNombre: string;
    periodo: string;
    tipoRecibo: string;
  } | undefined>(undefined);

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getRepresentativesForSueldos(),
  });

  const selectedOption = clients.find((c) => c.id === selectedOptionId);
  // Contrato API legacy: prop `clientId` = representante; prop `profileId` = empresa (client).
  const clientId = selectedOption?.representativeId ?? '';
  const profileId = selectedOption?.clientId ?? '';

  useEffect(() => {
    if (
      selectedOptionId &&
      clients.length > 0 &&
      !clients.some((c) => c.id === selectedOptionId)
    ) {
      setSelectedOptionId('');
    }
  }, [clients, selectedOptionId]);

  const clientOptions = clients.map((c) => ({
    value: c.id,
    label: c.label,
  }));

  return (
    <div className="space-y-0 overflow-x-hidden">
      {/* Header */}
      <div className="px-4 md:px-[3rem] pt-4 md:pt-[3rem] pb-0">
        <PageHeader
          title="Liquidación de sueldos"
          subtitle="Gestión de convenios, empleados, conceptos y liquidaciones"
          actions={
            <SearchableSelect
              options={clientOptions}
              value={selectedOptionId}
              onValueChange={setSelectedOptionId}
              placeholder="Seleccione un cliente"
              searchPlaceholder="Buscar cliente..."
              emptyMessage="Sin clientes con sueldos habilitados"
              width={320}
            />
          }
        />
      </div>

      {!clientId ? (
        <div className="px-4 md:px-[3rem] pt-6">
          <div
            className="flex flex-col items-center justify-center py-16 text-center rounded-[var(--arca-r-lg)]"
            style={{
              background: 'var(--arca-surface)',
              border: '1px solid var(--arca-border)',
            }}
          >
            <div
              className="w-14 h-14 rounded-[12px] flex items-center justify-center mb-4"
              style={{
                background: 'var(--arca-surface-2)',
                border: '1px solid var(--arca-border)',
              }}
            >
              <UserCircle
                className="h-7 w-7 text-[var(--arca-ink-3)]"
                strokeWidth={1.5}
              />
            </div>
            <h2 className="font-display text-[17px] font-semibold text-[var(--arca-ink)] mb-1.5">
              Seleccione un cliente
            </h2>
            <p className="text-[13px] text-[var(--arca-ink-3)] max-w-md leading-relaxed">
              Elija un cliente en el selector superior para gestionar convenios,
              empleados, conceptos y liquidaciones de sueldos.
            </p>
          </div>
        </div>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-col"
        >
          {/* Tab bar — sticky under the header */}
          <div className="sticky top-0 z-10 bg-[var(--arca-bg)] border-b border-[var(--arca-border)]">
            <div className="px-4 md:px-[3rem]">
              <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto justify-start">
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
              </TabsList>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 md:px-[3rem] pt-5 pb-6">
            <TabsContent value="dashboard" className="mt-0">
              <SueldosDashboard clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="empleados" className="mt-0">
              <SueldosEmpleados clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="convenios" className="mt-0">
              <SueldosConvenios clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="conceptos" className="mt-0">
              <SueldosConceptos clientId={clientId} profileId={profileId} />
            </TabsContent>
            <TabsContent value="simulador" className="mt-0">
              <SueldosSimulador
                clientId={clientId}
                profileId={profileId}
                onConfirmRecibo={() => setActiveTab('recibo')}
                initialData={editReciboData}
              />
            </TabsContent>
            <TabsContent value="recibo" className="mt-0">
              <SueldosRecibo
                clientId={clientId}
                profileId={profileId}
                onEditRecibo={(data) => {
                  setEditReciboData(data);
                  setActiveTab('simulador');
                }}
              />
            </TabsContent>
            <TabsContent value="firma-digital" className="mt-0">
              <SueldosFirmaDigital clientId={clientId} profileId={profileId} />
            </TabsContent>
          </div>
        </Tabs>
      )}
    </div>
  );
}
