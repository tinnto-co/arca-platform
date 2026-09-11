/**
 * Detalle de Sueldos de una empresa — subruta real, como /clients/$clientId.
 *
 * La tab activa vive en la URL (?tab=): «atrás» del navegador, el scroll y
 * compartir un link funcionan como en cualquier página. El estado efímero
 * (recibo en edición, filtro de empleado) sigue siendo local: no tiene
 * sentido en un link compartido.
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
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
  List,
  LayoutGrid,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import { Button } from '@/components/ui/button';
import { botonHeader } from '@/components/shared/filtros';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { cn } from '@/lib/utils';
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

export const Route = createFileRoute('/_authed/sueldos/$clienteId/')({
  validateSearch: z.object({
    tab: z.enum(SUELDOS_TABS).optional(),
  }),
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
    'relative h-auto flex-none whitespace-nowrap rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 pb-2.5 text-[13px] gap-[7px] cursor-pointer',
    'font-medium text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink-2)]',
    'data-[state=active]:border-[var(--arca-accent)] data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-[var(--arca-ink)] data-[state=active]:shadow-none'
  );

function RouteComponent() {
  const { clienteId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const activeTab: SueldosTab = search.tab ?? 'dashboard';

  const [clienteGlobal, setClienteGlobal] = useClienteSeleccionado();

  // La URL manda: entrar acá adopta la empresa como selección global, así
  // pasar a contabilidad o notificaciones te deja parado en la misma. El ref
  // evita la carrera del arranque: hasta que el store no refleje la
  // adopción, un valor global viejo NO debe disparar la navegación inversa.
  const sincronizado = React.useRef(false);
  useEffect(() => {
    sincronizado.current = false;
    // String(): el tipo del param depende del routeTree generado, que en dev
    // se regenera a destiempo del linter — así queda estable para ambos.
    setClienteGlobal(String(clienteId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setClienteGlobal es estable
  }, [clienteId]);

  // Y al revés: elegir otra empresa en el selector del header navega a SU
  // detalle («Todas las empresas» vuelve a la portada).
  useEffect(() => {
    if (clienteGlobal === clienteId) {
      sincronizado.current = true;
      return;
    }
    if (!sincronizado.current) return;
    if (clienteGlobal === null) {
      void navigate({ to: '/sueldos' });
    } else {
      void navigate({
        to: '/sueldos/$clienteId',
        params: { clienteId: clienteGlobal },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al store
  }, [clienteGlobal, clienteId]);

  const [editReciboData, setEditReciboData] = useState<
    EditReciboData | undefined
  >(undefined);
  const [reciboFiltroEmpleadoId, setReciboFiltroEmpleadoId] = useState('');

  // Cambiar de empresa (el param) resetea el trabajo en curso: seguir
  // editando un recibo con la empresa nueva sería peor que empezar de cero.
  // Ajuste durante el render, no en un efecto.
  const [prevCliente, setPrevCliente] = useState(clienteId);
  if (prevCliente !== clienteId) {
    setPrevCliente(clienteId);
    setEditReciboData(undefined);
    setReciboFiltroEmpleadoId('');
  }

  const [vistaNuevoRecibo, setVistaNuevoRecibo] = useLocalStorageState<
    'nueva' | 'clasica'
  >('arca:sueldos:vista-nuevo-recibo', 'nueva');
  // Editar desde la tab Recibo abre siempre la vista clásica.
  const usaVistaNueva = vistaNuevoRecibo === 'nueva' && !editReciboData;

  const { data: clients = [], isLoading: clientsQueryLoading } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const selectedOption = clients.find((c) => c.id === clienteId);

  const setTab = (next: string) => {
    if (next !== 'simulador') setEditReciboData(undefined);
    if (next !== 'recibo') setReciboFiltroEmpleadoId('');
    void navigate({
      to: '/sueldos/$clienteId',
      params: { clienteId },
      search: {
        tab: next === 'dashboard' ? undefined : (next as SueldosTab),
      },
      replace: true,
    });
  };

  // URL de una empresa que no liquida sueldos (link viejo, o la quitaron):
  // aviso con la vuelta a la portada, sin pantalla rota.
  if (!clientsQueryLoading && !selectedOption) {
    return (
      <div className="px-9 pt-7 pb-8">
        <PageHeader
          title="Liquidación de sueldos"
          subtitle="Esta empresa no liquida sueldos"
          actions={<SelectorClienteGlobal />}
        />
        <div className="mt-6 flex items-center gap-3 rounded-[10px] border border-[oklch(0.88_0.08_75)] bg-[oklch(0.97_0.03_75)] px-[14px] py-[10px] text-[13px] text-[var(--arca-accent-warn-fg)]">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-[var(--arca-accent-warn)]"
          />
          La empresa de este link no liquida sueldos (o ya no existe). Volvé al
          listado y agregala con «Agregar empresa» si corresponde.
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-1.5"
          onClick={() => {
            setClienteGlobal(null);
            void navigate({ to: '/sueldos' });
          }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Todas las empresas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-0 overflow-x-clip">
      {/* Header */}
      <div className="px-9 pt-7 pb-0">
        {aiAgentEnabled && selectedOption && (
          <CopilotReadableEntity
            description="Módulo Sueldos abierto en pantalla. `empresa.nombre` es la empresa liquidándose: cuando el usuario no nombre otra, es ésta, y a las tools se les pasa ese nombre, nunca un id. `mesLiquidable` es el único período sobre el que se pueden calcular liquidaciones."
            value={{
              modulo: 'sueldos',
              tabActiva: activeTab,
              empresa: { nombre: selectedOption.name },
              mesActual: getPeriodoMesActual(),
              mesLiquidable: getPeriodoMesAnterior(),
            }}
          />
        )}
        {/* Como la ficha de clientes: flecha de vuelta al listado a la
            izquierda del nombre, sin selector — la empresa se cambia desde
            la portada. */}
        <div className="mb-5 flex items-start gap-[14px]">
          <button
            type="button"
            onClick={() => void navigate({ to: '/sueldos' })}
            title="Volver al listado"
            aria-label="Volver al listado"
            className="mt-[2px] w-[30px] h-[30px] shrink-0 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] transition-colors"
          >
            <ArrowLeft className="h-[14px] w-[14px]" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)] truncate">
              {selectedOption?.name ?? '…'}
            </h1>
            <p className="mt-1.5 text-[12px] text-[var(--arca-ink-3)]">
              Convenios, empleados, conceptos y liquidaciones
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setTab} className="flex flex-col">
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
            <SueldosDashboard clientId={clienteId} />
          </TabsContent>
          <TabsContent value="empleados" className="mt-0">
            <SueldosEmpleados
              clientId={clienteId}
              onVerRecibos={(empleadoId) => {
                setReciboFiltroEmpleadoId(empleadoId);
                setTab('recibo');
              }}
            />
          </TabsContent>
          <TabsContent value="convenios" className="mt-0">
            <SueldosConvenios clientId={clienteId} />
          </TabsContent>
          <TabsContent value="conceptos" className="mt-0">
            <SueldosConceptos clientId={clienteId} />
          </TabsContent>
          <TabsContent value="simulador" className="mt-0">
            {!editReciboData && (
              // Alineado a la izquierda con el resto de la pantalla, con el
              // botón del sistema y un tooltip: "Vista clásica" solo no dice
              // si es lo que estás viendo o a lo que vas.
              <div className="mb-2 flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() =>
                        setVistaNuevoRecibo(usaVistaNueva ? 'clasica' : 'nueva')
                      }
                      className={botonHeader}
                    >
                      {usaVistaNueva ? (
                        <List className="size-3.5" />
                      ) : (
                        <LayoutGrid className="size-3.5" />
                      )}
                      {usaVistaNueva ? 'Vista clásica' : 'Vista nueva'}
                    </button>
                  </TooltipTrigger>
                  {/* Hacia la derecha: centrado se metía sobre el sidebar
                    oscuro y el tooltip oscuro encima se leía mal. */}
                  <TooltipContent side="right">
                    {usaVistaNueva
                      ? 'Volver al formulario de siempre para cargar el recibo'
                      : 'Pasar al armado nuevo, por bloques'}
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
            {usaVistaNueva ? (
              <NuevoReciboView
                clientId={clienteId}
                onConfirmRecibo={() => setTab('recibo')}
              />
            ) : (
              <SueldosSimulador
                clientId={clienteId}
                onConfirmRecibo={() => setTab('recibo')}
                initialData={editReciboData}
                onReset={() => setEditReciboData(undefined)}
              />
            )}
          </TabsContent>
          <TabsContent value="recibo" className="mt-0">
            <SueldosRecibo
              key={reciboFiltroEmpleadoId}
              clientId={clienteId}
              initialEmpleadoId={reciboFiltroEmpleadoId || undefined}
              onEditRecibo={(data) => {
                setEditReciboData(data);
                setTab('simulador');
              }}
            />
          </TabsContent>
          <TabsContent value="firma-digital" className="mt-0">
            <SueldosFirmaDigital clientId={clienteId} />
          </TabsContent>
          <TabsContent value="cargas" className="mt-0">
            <SueldosCargas clientId={clienteId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
