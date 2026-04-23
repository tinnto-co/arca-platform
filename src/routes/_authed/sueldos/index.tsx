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
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent } from '@/components/ui/card';
import { SueldosDashboard } from '@/components/sueldos/SueldosDashboard';
import { SueldosEmpleados } from '@/components/sueldos/SueldosEmpleados';
import { SueldosConvenios } from '@/components/sueldos/SueldosConvenios';
import { SueldosConceptos } from '@/components/sueldos/SueldosConceptos';
import { SueldosSimulador } from '@/components/sueldos/SueldosSimulador';
import { SueldosRecibo } from '@/components/sueldos/SueldosRecibo';
import { SueldosFirmaDigital } from '@/components/sueldos/SueldosFirmaDigital';
import { getClientsForSueldos } from '@/actions/client';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/sueldos/')({
  component: RouteComponent,
});

function RouteComponent() {
  const [selectedOptionId, setSelectedOptionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('dashboard');

  const { data: clients = [] } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientsForSueldos(),
  });

  const selectedOption = clients.find((c) => c.id === selectedOptionId);
  const clientId = selectedOption?.clientId ?? '';
  const profileId = selectedOption?.profileId ?? '';

  useEffect(() => {
    if (
      selectedOptionId &&
      clients.length > 0 &&
      !clients.some((c) => c.id === selectedOptionId)
    ) {
      setSelectedOptionId('');
    }
  }, [clients, selectedOptionId]);

  return (
    <div className="space-y-4 overflow-x-hidden p-4 md:space-y-6 md:px-[3rem] md:pt-[3rem] md:pb-6">
      <PageHeader
        title="Liquidación"
        subtitle="Gestione los sueldos de sus clientes"
        actions={
          <SearchableSelect
            options={clients.map((c) => ({ value: c.id, label: c.label }))}
            value={selectedOptionId}
            onValueChange={setSelectedOptionId}
            placeholder="Seleccione un cliente"
            searchPlaceholder="Buscar cliente..."
            align="end"
          />
        }
      />

      {!clientId ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">
              Seleccione un cliente
            </h2>
            <p className="text-muted-foreground max-w-md">
              Elija un cliente en el selector superior para gestionar convenios,
              empleados, conceptos y liquidaciones de sueldos de ese cliente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full min-w-0 max-w-full"
        >
          {/* Tab bar — same Arca style as client-detail-page */}
          <div className="-mx-4 md:-mx-[3rem] border-b border-[var(--arca-border)] px-4 md:px-[3rem]">
            <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto justify-start">
              {(
                [
                  { value: 'dashboard', icon: <LayoutDashboard className="h-[14px] w-[14px]" />, label: 'Dashboard' },
                  { value: 'empleados', icon: <Users className="h-[14px] w-[14px]" />, label: 'Empleados' },
                  { value: 'convenios', icon: <Building2 className="h-[14px] w-[14px]" />, label: 'Convenios' },
                  { value: 'conceptos', icon: <Calculator className="h-[14px] w-[14px]" />, label: 'Conceptos' },
                  { value: 'simulador', icon: <Sliders className="h-[14px] w-[14px]" />, label: 'Nuevo recibo' },
                  { value: 'recibo', icon: <FileText className="h-[14px] w-[14px]" />, label: 'Recibo' },
                  { value: 'firma-digital', icon: <PenLine className="h-[14px] w-[14px]" />, label: 'Firma Digital' },
                ] as const
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    'relative h-auto flex-none px-[14px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
                    'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
                    'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px',
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
                onConfirmRecibo={() => setActiveTab('recibo')}
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
