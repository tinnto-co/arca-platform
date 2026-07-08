import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  Edit,
  FileText,
  MapPin,
  DollarSign,
  Calendar,
  Bell,
  Receipt,
  BanknoteArrowUp,
  Download,
  ClipboardList,
  Plus,
  Paperclip,
  FileDown,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  getRepresentative,
  getRepresentativeClients,
  getRepresentativeIvaCredit,
  getLastJobByType,
  getRunningJobByType,
} from '@/actions/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EditRepresentativeDialog } from '@/components/edit-client-dialog';
import { FacturasTab } from '@/components/facturas-tab';
import { ConvenioMultilateralTab } from '@/components/convenio-multilateral-tab';
import { VencimientosTab } from '@/components/vencimientos-tab';
import { DeudasTab } from '@/components/deudas-tab';
import { NotificacionesTab } from '@/components/notificaciones-tab';
import { ResumenTab } from '@/components/resumen-tab';
import { getInvoices } from '@/actions/invoice';
import {
  scrapSingleJob,
} from '@/actions/client';
import {
  listClientRequests,
  createClientRequest,
  updateClientRequestStatus,
  getRequestDocument,
  listPortalUsers,
  createPortalUser,
  updatePortalUserPermissions,
  resetPortalUserPassword,
  revokePortalAccess,
} from '@/actions/client-portal';
import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Play,
  UserCheck,
  UserPlus,
  Trash2,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RenderIvaResume,
  getMonthBounds,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  type RenderIvaResumeRef,
} from './render-iva-resume';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { toTitleCase } from '@/lib/format-name';

interface RepresentativeDetailPageProps {
  representativeId: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Empresa (cliente) seleccionada globalmente, desde el search param `empresa`. */
  selectedClientId?: string;
  /** Cambia la empresa seleccionada (actualiza el search param `empresa`). */
  onClientChange: (empresaId: string) => void;
}


/** Período "MM/YYYY" del scrape que alimenta el resumen (mes anterior al elegido). Ej: usuario elige dic/25 → "11/2025". */
function getPeriodUsedForResumen(from: Date | undefined): string | null {
  if (!from) return null;
  const d = new Date(from.getFullYear(), from.getMonth(), 1);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const mm = String(prev.getMonth() + 1).padStart(2, '0');
  const yyyy = prev.getFullYear();
  return `${mm}/${yyyy}`;
}

/** Período "MM/YYYY" del mes que representa la fecha (ej. 1 feb 2026 → "02/2026"). Es el período del resumen que ve el usuario. */
function getResumenPeriodMMYYYY(from: Date | undefined): string | null {
  if (!from) return null;
  const mm = from.getMonth() + 1;
  const yyyy = from.getFullYear();
  return `${String(mm).padStart(2, '0')}/${yyyy}`;
}

/** Mínimo de caracteres del nombre del perfil para considerarlo un match (evita "S", "A", etc.). */
const MIN_PROFILE_NAME_LENGTH = 3;

/**
 * Elige el id del perfil que mejor coincide con el nombre del cliente (case-insensitive, por contiene).
 * Ej: cliente "Smart Solutions SRL" → perfil "Smart Solutions" (el nombre del perfil está contenido en el del cliente).
 */
function findBestMatchingProfileId(
  clientName: string | undefined,
  profiles: { id: string; name?: string }[]
): string | undefined {
  if (!profiles.length) return undefined;
  const normalizedClient = (clientName ?? '').trim().toLowerCase();
  if (normalizedClient.length < 2) return profiles[0].id;

  const withName = profiles.filter(
    (p) => (p.name ?? '').trim().length >= MIN_PROFILE_NAME_LENGTH
  );
  if (withName.length === 0) return profiles[0].id;

  const containedInClient = withName
    .filter((p) =>
      normalizedClient.includes((p.name ?? '').trim().toLowerCase())
    )
    .sort((a, b) => (b.name ?? '').length - (a.name ?? '').length);
  if (containedInClient.length > 0) return containedInClient[0].id;

  const clientInProfile = withName.find((p) =>
    (p.name ?? '').trim().toLowerCase().includes(normalizedClient)
  );
  if (clientInProfile) return clientInProfile.id;

  return profiles[0].id;
}

export function RepresentativeDetailPage({
  representativeId,
  activeTab,
  onTabChange,
  selectedClientId: selectedClientIdProp,
  onClientChange,
}: RepresentativeDetailPageProps) {
  const [editRepresentativeDialogOpen, setEditRepresentativeDialogOpen] = useState(false);
  const now = new Date();
  /** Rango de fechas elegido en el resumen IVA (para resaltar el scrape del período usado). */
  const [ivaResumenDateRange, setIvaResumenDateRange] = useState<{
    from: Date;
    to: Date;
  }>(() => getMonthBounds(now.getFullYear(), now.getMonth()));
  const [ivaPeriodPickerOpen, setIvaPeriodPickerOpen] = useState(false);
  /** Sección que está ejecutando un job (iva = comprobantes_full + iva, deudas = deuda, vencimientos = vencimientos, facturas = comprobantes_full, notificaciones = notificaciones). */
  const [scrapingSection, setScrapingSection] = useState<
    'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null
  >(null);
  const [scrapingAll, setScrapingAll] = useState(false);

  const queryClient = useQueryClient();
  // Solicitudes state
  const [solicitudesStatusFilter, setSolicitudesStatusFilter] =
    useState<string>('');
  const [newRequestDialogOpen, setNewRequestDialogOpen] = useState(false);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestDescription, setNewRequestDescription] = useState('');
  const [newRequestType, setNewRequestType] = useState('general');
  const [newRequestDueAt, setNewRequestDueAt] = useState('');

  interface RequestRow {
    id: string;
    organizationId: string;
    representativeId: string;
    profileId: string | null;
    requestedByUserId: string | null;
    title: string;
    description: string | null;
    type: string;
    status: string;
    dueAt: Date | null;
    completedAt: Date | null;
    metadata?: { documentId?: string; documentName?: string } | null;
    createdAt: Date;
  }

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['representative', representativeId],
    queryFn: async () => {
      const result = await getRepresentative({ data: { id: representativeId } });
      return result;
    },
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['representativeClients', representativeId],
    queryFn: () => getRepresentativeClients({ data: { representativeId } }),
  });

  /** Perfil IVA por defecto (según nombre del cliente). Se calcula cuando hay client + profiles. */
  const defaultIvaProfileId = useMemo(() => {
    if (!client || profiles.length === 0) return undefined;
    return findBestMatchingProfileId(client.name, profiles) ?? profiles[0].id;
  }, [client, profiles]);

  /**
   * Empresa (cliente) seleccionada globalmente. Viene del search param `empresa`
   * (prop `selectedClientIdProp`); si no es válida, cae al mejor match por nombre y
   * finalmente a la primera empresa. Siempre hay exactamente una empresa seleccionada.
   */
  const selectedClientId = useMemo(() => {
    if (profiles.length === 0) return undefined;
    if (
      selectedClientIdProp &&
      profiles.some((p) => p.id === selectedClientIdProp)
    ) {
      return selectedClientIdProp;
    }
    return defaultIvaProfileId ?? profiles[0]?.id;
  }, [selectedClientIdProp, profiles, defaultIvaProfileId]);

  const selectedProfile = profiles.find((p) => p.id === selectedClientId);

  /** Aliases: todas las secciones usan la empresa global seleccionada. */
  const effectiveIvaProfileId = selectedClientId;

  const {
    data: clientRequestsData = [] as RequestRow[],
    refetch: refetchRequests,
  } = useQuery({
    queryKey: [
      'clientRequests',
      representativeId,
      solicitudesStatusFilter,
      selectedClientId,
    ],
    queryFn: () =>
      listClientRequests({
        data: {
          clientId: representativeId,
          status: solicitudesStatusFilter || undefined,
          profileId: selectedClientId || undefined,
        },
      }),
    enabled: !!representativeId,
  });

  const createRequestMutation = useMutation({
    mutationFn: () =>
      createClientRequest({
        data: {
          clientId: representativeId,
          title: newRequestTitle,
          description: newRequestDescription || undefined,
          type: newRequestType,
          dueAt: newRequestDueAt || undefined,
        },
      }),
    onSuccess: () => {
      refetchRequests();
      setNewRequestDialogOpen(false);
      setNewRequestTitle('');
      setNewRequestDescription('');
      setNewRequestType('general');
      setNewRequestDueAt('');
      toast.success('Solicitud creada');
    },
    onError: () => toast.error('Error al crear solicitud'),
  });

  const updateRequestStatusMutation = useMutation({
    mutationFn: (vars: { requestId: string; status: string }) =>
      updateClientRequestStatus({ data: vars }),
    onSuccess: () => {
      refetchRequests();
      toast.success('Estado actualizado');
    },
    onError: () => toast.error('Error al actualizar estado'),
  });


  const ivaResumeRef = useRef<RenderIvaResumeRef>(null);
  const ivaSelectedYear = ivaResumenDateRange.from.getFullYear();
  const ivaSelectedMonth = ivaResumenDateRange.from.getMonth();
  const ivaMaxMonthForYear =
    ivaSelectedYear === now.getFullYear() ? now.getMonth() : 11;
  const ivaAvailableMonthIndices = Array.from(
    { length: ivaMaxMonthForYear + 1 },
    (_, i) => i
  );

  /** Período fiscal del scrape que alimenta el resumen (mes anterior al elegido en el calendario). */
  const periodUsedForResumen = useMemo(
    () => getPeriodUsedForResumen(ivaResumenDateRange.from),
    [ivaResumenDateRange.from]
  );

  const periodoFiscalResumen = getResumenPeriodMMYYYY(ivaResumenDateRange.from);

  const {
    data: clientIva,
    isLoading: loadingClientIva,
    error: clientIvaError,
  } = useQuery({
    queryKey: [
      'clientIva',
      representativeId,
      effectiveIvaProfileId,
      periodoFiscalResumen,
    ],
    queryFn: () =>
      getRepresentativeIvaCredit({
        data: {
          representativeId,
          clientId: effectiveIvaProfileId ?? undefined,
          periodoFiscalResumen: periodoFiscalResumen ?? undefined,
        },
      }),
    enabled: !!effectiveIvaProfileId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });


  // Últimos jobs por tipo para mostrar errores en Resumen
  const { data: lastComprobantesJobIncremental } = useQuery({
    queryKey: ['lastComprobantesJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { representativeId, jobType: 'comprobantes' } }),
    enabled: !!representativeId,
  });

  const { data: lastComprobantesFullJob } = useQuery({
    queryKey: ['lastComprobantesFullJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { representativeId, jobType: 'comprobantes_full' } }),
    enabled: !!representativeId,
  });

  // Mostrar el más reciente entre comprobantes y comprobantes_full
  const lastComprobantesJob = (() => {
    const a = lastComprobantesJobIncremental;
    const b = lastComprobantesFullJob;
    if (!a?.createdAt) return b;
    if (!b?.createdAt) return a;
    return new Date(b.createdAt) > new Date(a.createdAt) ? b : a;
  })();

  const { data: lastIvaJob } = useQuery({
    queryKey: ['lastIvaJob', representativeId],
    queryFn: () => getLastJobByType({ data: { representativeId, jobType: 'iva' } }),
    enabled: !!representativeId,
  });

  const { data: lastNotificacionesJob } = useQuery({
    queryKey: ['lastNotificacionesJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { representativeId, jobType: 'notificaciones' } }),
    enabled: !!representativeId,
  });

  const { data: lastDeudaJob } = useQuery({
    queryKey: ['lastDeudaJob', representativeId],
    queryFn: () => getLastJobByType({ data: { representativeId, jobType: 'deuda' } }),
    enabled: !!representativeId,
  });

  const { data: lastVencimientosJob } = useQuery({
    queryKey: ['lastVencimientosJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { representativeId, jobType: 'vencimientos' } }),
    enabled: !!representativeId,
  });

  // Job incremental de comprobantes en curso (para mostrar loader de IVA aunque se haya iniciado en otro lado)
  const { data: runningComprobantesJob } = useQuery({
    queryKey: ['runningComprobantesJob', representativeId],
    queryFn: () =>
      getRunningJobByType({ data: { representativeId, jobType: 'comprobantes' } }),
    enabled: !!representativeId,
    // Refrescar cada 5s para reflejar cambios de estado
    refetchInterval: 5000,
  });

  // Get all invoices for the client to calculate totals
  const { data: allInvoicesData } = useQuery({
    queryKey: ['clientAllInvoices', representativeId],
    queryFn: () =>
      getInvoices({
        data: {
          page: 1,
          limit: 10000, // Get all invoices
          clientFilter: representativeId,
        },
      }),
  });


  if (loadingClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Cargando cliente...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Cliente no encontrado</div>
      </div>
    );
  }

  // Shared tab trigger style (overrides shadcn defaults for this page-level nav)
  const tabTriggerCls = (hasError?: boolean) =>
    cn(
      // shape overrides
      'relative h-auto flex-none px-[18px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
      // inactive
      'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
      // active
      'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px',
      hasError && 'data-[state=inactive]:text-[var(--arca-accent-warn-fg)]'
    );

  return (
    <div>
      {aiAgentEnabled && client && (
        <CopilotReadableEntity
          description="Cliente actualmente visible en pantalla y la sección que está mirando el usuario. Usá tabActiva para entender el foco actual: resumen=overview, deudas=AFIP debts, vencimientos=próximos, notificaciones=AFIP, facturas=invoices, iva=IVA scrape, convenio-multilateral=Multilateral, solicitudes=requests."
          value={{
            modulo: 'cliente-detalle',
            tabActiva: activeTab,
            id: client.id,
            name: client.name,
            cuit: client.cuit,
            fiscalCondition: client.fiscalCondition,
            status: client.status,
          }}
        />
      )}
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-col"
      >
        {/* ── Client header ── */}
        <div className="bg-[#F7F6F2]">
          <div className="px-4 md:px-[28px] pt-[34px]">
            {/* Header row */}
            <div className="flex items-start justify-between gap-6 pb-[22px]">
              {/* Left — identity */}
              <div className="min-w-0">
                <div className="flex items-center gap-[10px]">
                  <a
                    href="/clients"
                    className="w-[30px] h-[30px] shrink-0 rounded-[10px] border border-[#DFDCD3] bg-white text-[#6E7079] inline-flex items-center justify-center hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
                    title="Volver a clientes"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  </a>
                  {profiles.length > 1 ? (
                    <Select
                      value={selectedClientId}
                      onValueChange={(v) => onClientChange(v)}
                      disabled={loadingProfiles}
                    >
                      <SelectTrigger
                        title="Cambiar de cliente"
                        className="group h-auto w-fit max-w-full gap-2 border-0 bg-transparent p-0 shadow-none rounded-md hover:opacity-70 focus-visible:ring-0 transition-opacity [&>svg]:hidden"
                      >
                        <h1 className="font-[family-name:var(--ff-display)] text-[29px] font-bold tracking-[-0.025em] leading-[1.1] text-[#12131A] truncate">
                          {toTitleCase(selectedProfile?.name ?? client.name)}
                        </h1>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {toTitleCase(p.name) || p.identityNumber || p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <h1 className="font-[family-name:var(--ff-display)] text-[29px] font-bold tracking-[-0.025em] leading-[1.1] text-[#12131A] truncate">
                      {toTitleCase(selectedProfile?.name ?? client.name)}
                    </h1>
                  )}
                  {/* Client switcher button */}
                  {profiles.length > 1 && (
                    <button
                      onClick={() => {
                        const trigger = document.querySelector<HTMLButtonElement>('[title="Cambiar de cliente"]');
                        trigger?.click();
                      }}
                      className="w-[26px] h-[26px] shrink-0 rounded-lg border border-[#DFDCD3] bg-white text-[#6E7079] inline-flex items-center justify-center hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
                      title="Cambiar de cliente"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 15 5 5 5-5" /><path d="m7 9 5-5 5 5" /></svg>
                    </button>
                  )}
                </div>
                {/* Meta line */}
                <div className="mt-2 ml-[40px] flex flex-wrap items-center gap-x-[9px] gap-y-[2px] text-[13px] text-[#9B9CA3]">
                  {selectedProfile?.identityNumber && (
                    <>
                      <span>
                        CUIT{' '}
                        <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[#6E7079] tabular-nums">
                          {selectedProfile.identityNumber}
                        </span>
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {client.registeredAt && (
                    <>
                      <span>
                        Alta{' '}
                        {new Date(client.registeredAt).toLocaleDateString(
                          'es-AR',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  <span>
                    Representante{' '}
                    <span className="text-[#6E7079] font-medium">
                      {toTitleCase(client.name)}
                    </span>
                  </span>
                </div>
              </div>
              {/* Right — actions */}
              <div className="flex items-center gap-[10px] pt-1 shrink-0">
                <button
                  disabled={scrapingAll || !!scrapingSection}
                  onClick={async () => {
                    setScrapingAll(true);
                    toast('Iniciando scrapeo');
                    const jobTypes = ['deuda', 'vencimientos', 'iva', 'notificaciones', 'comprobantes_full'] as const;
                    let failed = 0;
                    try {
                      for (const jobType of jobTypes) {
                        try {
                          await scrapSingleJob({ data: { representativeId, jobType } });
                        } catch {
                          failed++;
                        }
                      }
                      if (failed === 0) {
                        toast.success('Scraping completado');
                      } else if (failed < jobTypes.length) {
                        toast.warning(`Scraping parcial: ${failed} job(s) fallaron`);
                      } else {
                        toast.error('Todos los jobs fallaron');
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Error al encolar scraping');
                    } finally {
                      setScrapingAll(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] rounded-[10px] px-[15px] py-[9px] text-[13.5px] font-semibold text-[#12131A] hover:bg-[#FBFAF6] transition-[background] duration-[120ms] disabled:opacity-50"
                  title="Actualizar todo (deuda, vencimientos, IVA, notificaciones)"
                >
                  {scrapingAll ? (
                    <Loader2 className="h-[15px] w-[15px] animate-spin" />
                  ) : (
                    <Play className="h-[15px] w-[15px]" />
                  )}
                  Actualizar todo
                </button>
                <button
                  onClick={() => setEditRepresentativeDialogOpen(true)}
                  className="w-[38px] h-[38px] shrink-0 rounded-[10px] border border-[#DFDCD3] bg-white text-[#6E7079] inline-flex items-center justify-center hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
                  title="Editar cliente"
                >
                  <Edit className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto overflow-y-hidden justify-start [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <TabsTrigger value="resumen" className={tabTriggerCls()}>
                <FileText className="h-[14px] w-[14px]" />
                Resumen
              </TabsTrigger>
              <TabsTrigger
                value="deudas"
                className={tabTriggerCls(
                  lastDeudaJob ? !lastDeudaJob.success : false
                )}
              >
                <DollarSign className="h-[14px] w-[14px]" />
                Deudas
              </TabsTrigger>
              <TabsTrigger
                value="vencimientos"
                className={tabTriggerCls(
                  lastVencimientosJob ? !lastVencimientosJob.success : false
                )}
              >
                <Calendar className="h-[14px] w-[14px]" />
                Vencimientos
              </TabsTrigger>
              <TabsTrigger
                value="notificaciones"
                className={tabTriggerCls(
                  (lastNotificacionesJob && !lastNotificacionesJob.success) ||
                  !!lastNotificacionesJob?.notificationFetchWarning
                )}
              >
                <Bell className="h-[14px] w-[14px]" />
                Notificaciones
              </TabsTrigger>
              <TabsTrigger
                value="facturas"
                className={tabTriggerCls(
                  lastComprobantesJob ? !lastComprobantesJob.success : false
                )}
              >
                <Receipt className="h-[14px] w-[14px]" />
                Facturas
              </TabsTrigger>
              <TabsTrigger
                value="iva"
                className={tabTriggerCls(
                  lastIvaJob ? !lastIvaJob.success : false
                )}
              >
                <BanknoteArrowUp className="h-[14px] w-[14px]" />
                IVA
              </TabsTrigger>
              <TabsTrigger
                value="convenio-multilateral"
                className={tabTriggerCls()}
              >
                <MapPin className="h-[14px] w-[14px]" />
                Convenio Multilateral
              </TabsTrigger>
              <TabsTrigger value="solicitudes" className={tabTriggerCls()}>
                <ClipboardList className="h-[14px] w-[14px]" />
                Solicitudes
              </TabsTrigger>
              <TabsTrigger value="portal" className={tabTriggerCls()}>
                <UserCheck className="h-[14px] w-[14px]" />
                Portal
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="px-4 md:px-[28px] pt-3 pb-[60px]">
          {/* Resumen Tab */}
          <TabsContent value="resumen" className="mt-0 p-0">
            <ResumenTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              allInvoicesData={allInvoicesData}
              profiles={profiles}
            />
          </TabsContent>

          {/* Deudas Tab */}
          <TabsContent value="deudas" className="mt-0 p-0">
            <DeudasTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              scrapingSection={scrapingSection}
              setScrapingSection={setScrapingSection}
              lastDeudaJob={lastDeudaJob}
            />
          </TabsContent>

          <TabsContent value="vencimientos" className="mt-0 p-0">
            <VencimientosTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              scrapingSection={scrapingSection}
              setScrapingSection={setScrapingSection}
              lastVencimientosJob={lastVencimientosJob}
            />
          </TabsContent>

          {/* Notificaciones Tab - mismo formato que la vista del navbar */}
          <TabsContent value="notificaciones" className="mt-0 p-0">
            <NotificacionesTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              scrapingSection={scrapingSection}
              setScrapingSection={setScrapingSection}
              lastNotificacionesJob={lastNotificacionesJob}
            />
          </TabsContent>

          {/* Facturas Tab */}
          <TabsContent value="facturas" className="mt-0 p-0">
            <FacturasTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              lastComprobantesJob={lastComprobantesJob}
              scrapingSection={scrapingSection}
              setScrapingSection={setScrapingSection}
              allInvoicesData={allInvoicesData}
            />
          </TabsContent>

          {/* Convenio Multilateral Tab */}
          <TabsContent value="convenio-multilateral" className="mt-0 p-0">
            <ConvenioMultilateralTab
              representativeId={representativeId}
              selectedClientId={selectedClientId}
              scrapingSection={scrapingSection}
              setScrapingSection={setScrapingSection}
            />
          </TabsContent>

          {/* IVA Tab */}
          <TabsContent value="iva" className="">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Popover
                  open={ivaPeriodPickerOpen}
                  onOpenChange={setIvaPeriodPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 min-w-[200px] w-auto justify-start text-left font-normal px-3"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      <span className="text-sm">
                        {`${MONTH_NAMES[ivaSelectedMonth]} ${ivaSelectedYear}`}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4" align="start">
                    <div className="space-y-3">
                      <Select
                        value={String(ivaSelectedYear)}
                        onValueChange={(v) => {
                          const y = Number(v);
                          const newMax =
                            y === now.getFullYear() ? now.getMonth() : 11;
                          const m = Math.min(ivaSelectedMonth, newMax);
                          setIvaResumenDateRange(getMonthBounds(y, m));
                        }}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Año" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: 8 },
                            (_, i) => now.getFullYear() - i
                          ).map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-3 gap-1.5">
                        {ivaAvailableMonthIndices.map((i) => (
                          <Button
                            key={i}
                            variant={
                              ivaSelectedMonth === i ? 'default' : 'outline'
                            }
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => {
                              setIvaResumenDateRange(
                                getMonthBounds(ivaSelectedYear, i)
                              );
                              setIvaPeriodPickerOpen(false);
                            }}
                          >
                            {MONTH_NAMES_SHORT[i]}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                {lastIvaJob &&
                  !lastIvaJob.success &&
                  lastIvaJob.failedReason && (
                    <p className="max-w-md text-[11px] text-[var(--arca-accent-neg-fg)]">
                      {lastIvaJob.failedReason}
                    </p>
                  )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {runningComprobantesJob && (
                  <span className="text-xs text-muted-foreground">
                    Job de comprobantes en curso desde{' '}
                    {new Date(
                      runningComprobantesJob.createdAt
                    ).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                {scrapingSection === 'iva' || runningComprobantesJob ? (
                  <Button variant="default" size="sm" disabled>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando…
                  </Button>
                ) : (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={!!scrapingSection}
                      >
                        Actualizar IVA
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[360px] p-0 overflow-hidden rounded-[var(--arca-r-lg,14px)] border border-[var(--arca-border)]">
                      <div className="px-5 pt-5 pb-3">
                        <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">Actualizar IVA</h3>
                        <p className="text-[12px] leading-relaxed text-[var(--arca-ink-4)] mt-1">
                          Si las facturas ya están al día, podés scrapear solo IVA para ir más rápido.
                        </p>
                      </div>
                      <div className="px-3 pb-3 space-y-1.5">
                        <DialogClose asChild>
                          <button
                            className="w-full flex items-start gap-3 rounded-[var(--arca-r-md,10px)] px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] border border-transparent hover:border-[var(--arca-border)] cursor-pointer group"
                            onClick={async () => {
                              setScrapingSection('iva');
                              try {
                                await scrapSingleJob({ data: { representativeId, jobType: 'comprobantes' } });
                                await scrapSingleJob({ data: { representativeId, jobType: 'iva' } });
                                await Promise.all([
                                  queryClient.invalidateQueries({ queryKey: ['clientIva', representativeId] }),
                                  queryClient.invalidateQueries({ queryKey: ['clientAllInvoices', representativeId] }),
                                  queryClient.invalidateQueries({ queryKey: ['invoices'] }),
                                  queryClient.invalidateQueries({ queryKey: ['lastComprobantesFullJob', representativeId] }),
                                  queryClient.invalidateQueries({ queryKey: ['lastIvaJob', representativeId] }),
                                ]);
                                toast.success('IVA y comprobantes actualizados');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Error al actualizar');
                                queryClient.invalidateQueries({ queryKey: ['lastIvaJob', representativeId] });
                                queryClient.invalidateQueries({ queryKey: ['lastComprobantesJob', representativeId] });
                              } finally {
                                setScrapingSection(null);
                              }
                            }}
                          >
                            <div className="shrink-0 mt-0.5 w-8 h-8 rounded-[var(--arca-r-sm,6px)] bg-[var(--arca-surface-2)] flex items-center justify-center text-[var(--arca-ink-3)] group-hover:text-[var(--arca-ink)]">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-[var(--arca-ink)]">Comprobantes + IVA</div>
                              <div className="text-[11px] leading-snug text-[var(--arca-ink-4)] mt-0.5">Actualiza facturas primero, después IVA. Más lento pero completo.</div>
                            </div>
                          </button>
                        </DialogClose>
                        <DialogClose asChild>
                          <button
                            className="w-full flex items-start gap-3 rounded-[var(--arca-r-md,10px)] px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] border border-transparent hover:border-[var(--arca-border)] cursor-pointer group"
                            onClick={async () => {
                              setScrapingSection('iva');
                              try {
                                await scrapSingleJob({ data: { representativeId, jobType: 'iva' } });
                                await Promise.all([
                                  queryClient.invalidateQueries({ queryKey: ['clientIva', representativeId] }),
                                  queryClient.invalidateQueries({ queryKey: ['lastIvaJob', representativeId] }),
                                ]);
                                toast.success('IVA actualizado correctamente');
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Error al actualizar IVA');
                                queryClient.invalidateQueries({ queryKey: ['lastIvaJob', representativeId] });
                              } finally {
                                setScrapingSection(null);
                              }
                            }}
                          >
                            <div className="shrink-0 mt-0.5 w-8 h-8 rounded-[var(--arca-r-sm,6px)] bg-[var(--arca-surface-2)] flex items-center justify-center text-[var(--arca-ink-3)] group-hover:text-[var(--arca-ink)]">
                              <RefreshCw className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13px] font-medium text-[var(--arca-ink)]">Solo IVA</div>
                              <div className="text-[11px] leading-snug text-[var(--arca-ink-4)] mt-0.5">Más rápido. Usá esta opción si las facturas ya están al día.</div>
                            </div>
                          </button>
                        </DialogClose>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => ivaResumeRef.current?.downloadExcel()}
                  className="gap-2 font-semibold shrink-0"
                  disabled={!effectiveIvaProfileId}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Descargar Excel</span>
                </Button>
              </div>
            </div>
            <div className="w-full">
              {loadingClientIva ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando resumen de IVA…</span>
                </div>
              ) : (
                <RenderIvaResume
                  ref={ivaResumeRef}
                  representativeId={representativeId}
                  clientName={client?.name}
                  clientIva={clientIva ?? undefined}
                  selectedProfileId={effectiveIvaProfileId ?? undefined}
                  dateRange={ivaResumenDateRange}
                  clientIvaLoading={loadingClientIva}
                  clientIvaError={clientIvaError}
                  periodUsedForResumen={periodUsedForResumen}
                />
              )}
            </div>
          </TabsContent>

          {/* Solicitudes Tab */}
          <TabsContent value="solicitudes" className="">
            <div className="space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Select
                    value={solicitudesStatusFilter || 'all'}
                    onValueChange={(v) =>
                      setSolicitudesStatusFilter(v === 'all' ? '' : v)
                    }
                  >
                    <SelectTrigger className="h-8 gap-1.5 px-3 text-[12px] border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] min-w-[130px]">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                        Estado
                      </span>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="open">Abierta</SelectItem>
                      <SelectItem value="completed">Completada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={() => setNewRequestDialogOpen(true)}
                  className="bg-[var(--arca-ink)] hover:bg-black text-white text-[12.5px] h-8 px-3 rounded-[var(--arca-r-md)] shrink-0 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nueva solicitud
                </Button>
              </div>

              {/* Requests list */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] overflow-hidden">
                <div className="px-[20px] py-[14px] border-b border-[var(--arca-border)] flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Solicitudes al cliente
                  </span>
                  {clientRequestsData.length > 0 && (
                    <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                      {clientRequestsData.length}
                    </span>
                  )}
                </div>
                {clientRequestsData.length === 0 ? (
                  <div className="flex items-center justify-center h-24 text-[13px] text-[var(--arca-ink-4)]">
                    No hay solicitudes registradas
                  </div>
                ) : (
                  <table className="w-full border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-[var(--arca-surface-2)]">
                        {(
                          [
                            'Título',
                            'Tipo',
                            'Estado',
                            'Vencimiento',
                            'Creada',
                            'Acciones',
                          ] as const
                        ).map((h) => (
                          <th
                            key={h}
                            className="px-[14px] py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clientRequestsData.map((req: RequestRow, i: number) => {
                        const statusColors: Record<
                          string,
                          { bg: string; color: string; label: string }
                        > = {
                          open: {
                            bg: 'var(--arca-accent-warn-bg)',
                            color: 'var(--arca-accent-warn)',
                            label: 'Abierta',
                          },
                          completed: {
                            bg: 'var(--arca-accent-pos-bg)',
                            color: 'var(--arca-accent-pos)',
                            label: 'Completada',
                          },
                          cancelled: {
                            bg: 'var(--arca-surface-2)',
                            color: 'var(--arca-ink-3)',
                            label: 'Cancelada',
                          },
                        };
                        const sc =
                          statusColors[req.status] ?? statusColors.open;
                        return (
                          <tr
                            key={req.id}
                            className={`border-b border-[var(--arca-border)] last:border-b-0 ${i % 2 === 1 ? 'bg-[var(--arca-surface-2)]' : ''}`}
                          >
                            <td className="px-[14px] py-[10px]">
                              <p className="font-medium text-[var(--arca-ink)] flex items-center gap-1.5">
                                {req.title}
                                {req.metadata?.documentId && (
                                  <Paperclip className="h-3 w-3 text-[var(--arca-accent-primary)] shrink-0" />
                                )}
                              </p>
                              {req.description && (
                                <p className="text-[11px] text-[var(--arca-ink-3)] mt-0.5 max-w-[280px] truncate">
                                  {req.description}
                                </p>
                              )}
                              {req.metadata?.documentName && (
                                <p className="text-[11px] text-[var(--arca-accent-primary)] mt-0.5">
                                  {req.metadata?.documentName}
                                </p>
                              )}
                            </td>
                            <td className="px-[14px] py-[10px] text-[var(--arca-ink-3)]">
                              {req.type}
                            </td>
                            <td className="px-[14px] py-[10px]">
                              <span
                                className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ background: sc.bg, color: sc.color }}
                              >
                                {sc.label}
                              </span>
                            </td>
                            <td className="px-[14px] py-[10px] text-[var(--arca-ink-3)] whitespace-nowrap">
                              {req.dueAt
                                ? new Date(
                                  req.dueAt as unknown as string
                                ).toLocaleDateString('es-AR')
                                : '—'}
                            </td>
                            <td className="px-[14px] py-[10px] text-[var(--arca-ink-3)] whitespace-nowrap">
                              {new Date(
                                req.createdAt as unknown as string
                              ).toLocaleDateString('es-AR')}
                            </td>
                            <td className="px-[14px] py-[10px]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Document download if metadata has documentId */}
                                {req.metadata?.documentId && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const doc = await getRequestDocument({
                                            data: { requestId: req.id },
                                          });
                                          if (!doc?.url) {
                                            toast.error(
                                              'Documento no encontrado'
                                            );
                                            return;
                                          }
                                          const a = document.createElement('a');
                                          a.href = doc.url;
                                          a.download = doc.name ?? 'documento';
                                          a.click();
                                        } catch {
                                          toast.error(
                                            'Error al descargar el documento'
                                          );
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-accent-primary)] hover:underline font-medium"
                                    >
                                      <FileDown className="h-3 w-3" />
                                      Doc
                                    </button>
                                    <span className="text-[var(--arca-border-strong)]">
                                      ·
                                    </span>
                                  </>
                                )}
                                {req.status === 'open' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        updateRequestStatusMutation.mutate({
                                          requestId: req.id,
                                          status: 'completed',
                                        })
                                      }
                                      className="text-[11px] text-[var(--arca-accent-pos)] hover:underline font-medium"
                                    >
                                      Completar
                                    </button>
                                    <span className="text-[var(--arca-border-strong)]">
                                      ·
                                    </span>
                                    <button
                                      onClick={() =>
                                        updateRequestStatusMutation.mutate({
                                          requestId: req.id,
                                          status: 'cancelled',
                                        })
                                      }
                                      className="text-[11px] text-[var(--arca-ink-3)] hover:underline"
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                )}
                                {req.status !== 'open' && (
                                  <button
                                    onClick={() =>
                                      updateRequestStatusMutation.mutate({
                                        requestId: req.id,
                                        status: 'open',
                                      })
                                    }
                                    className="text-[11px] text-[var(--arca-accent-primary)] hover:underline"
                                  >
                                    Reabrir
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Nueva solicitud dialog */}
            <Dialog
              open={newRequestDialogOpen}
              onOpenChange={setNewRequestDialogOpen}
            >
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Nueva solicitud al cliente</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[12px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-[0.06em]">
                      Título *
                    </label>
                    <Input
                      value={newRequestTitle}
                      onChange={(e) => setNewRequestTitle(e.target.value)}
                      placeholder="Ej. Enviar balance del ejercicio"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-[0.06em]">
                      Descripción
                    </label>
                    <Input
                      value={newRequestDescription}
                      onChange={(e) => setNewRequestDescription(e.target.value)}
                      placeholder="Instrucciones o contexto adicional"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-[0.06em]">
                      Tipo
                    </label>
                    <Select
                      value={newRequestType}
                      onValueChange={setNewRequestType}
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="document">Documento</SelectItem>
                        <SelectItem value="information">Información</SelectItem>
                        <SelectItem value="signature">Firma</SelectItem>
                        <SelectItem value="payment">Pago</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-[0.06em]">
                      Fecha límite
                    </label>
                    <Input
                      type="date"
                      value={newRequestDueAt}
                      onChange={(e) => setNewRequestDueAt(e.target.value)}
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNewRequestDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        !newRequestTitle.trim() ||
                        createRequestMutation.isPending
                      }
                      onClick={() => createRequestMutation.mutate()}
                      className="bg-[var(--arca-ink)] hover:bg-black text-white"
                    >
                      {createRequestMutation.isPending ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Creando…
                        </>
                      ) : (
                        'Crear solicitud'
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* Portal Tab */}
          <TabsContent value="portal" className="mt-4">
            <PortalAccessTab representativeId={representativeId} />
          </TabsContent>
        </div>
        {/* end content area */}
      </Tabs>

      <EditRepresentativeDialog
        representativeId={representativeId}
        open={editRepresentativeDialogOpen}
        onOpenChange={setEditRepresentativeDialogOpen}
      />

    </div>
  );
}

// ── Portal Access Tab ────────────────────────────────────────────────────────

type PortalUser = {
  accessId: string;
  userId: string;
  name: string | null;
  email: string | null;
  canViewDebts: boolean;
  canViewIva: boolean;
  canViewPayroll: boolean;
  canUploadDocuments: boolean;
  canChatAi: boolean;
  createdAt: Date;
};

type PermissionKey = 'canViewDebts' | 'canViewIva' | 'canViewPayroll' | 'canUploadDocuments' | 'canChatAi';

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  canViewDebts: 'Deudas',
  canViewIva: 'IVA',
  canViewPayroll: 'Sueldos',
  canUploadDocuments: 'Documentos',
  canChatAi: 'Chat IA',
};

function PermissionBadge({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--arca-accent-primary-bg)] text-[var(--arca-accent-primary)] border border-[var(--arca-accent-primary)]/20">
      {label}
    </span>
  );
}

function PortalAccessTab({ representativeId }: { representativeId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PortalUser | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PortalUser | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    canViewDebts: true,
    canViewIva: true,
    canViewPayroll: false,
    canUploadDocuments: true,
    canChatAi: true,
  });

  // Edit form state (permissions only)
  const [editPerms, setEditPerms] = useState<Record<PermissionKey, boolean>>({
    canViewDebts: true,
    canViewIva: true,
    canViewPayroll: false,
    canUploadDocuments: true,
    canChatAi: true,
  });

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['portalUsers', representativeId],
    queryFn: () => listPortalUsers({ data: { representativeId } }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: Parameters<typeof createPortalUser>[0]['data']) =>
      createPortalUser({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUsers', representativeId] });
      toast.success('Usuario creado');
      setCreateOpen(false);
      setCreateForm({ name: '', email: '', password: '', canViewDebts: true, canViewIva: true, canViewPayroll: false, canUploadDocuments: true, canChatAi: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (vars: Parameters<typeof updatePortalUserPermissions>[0]['data']) =>
      updatePortalUserPermissions({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUsers', representativeId] });
      toast.success('Permisos actualizados');
      setEditTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (vars: Parameters<typeof resetPortalUserPassword>[0]['data']) =>
      resetPortalUserPassword({ data: vars }),
    onSuccess: () => {
      toast.success('Contraseña actualizada');
      setNewPassword('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: Parameters<typeof revokePortalAccess>[0]['data']) =>
      revokePortalAccess({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portalUsers', representativeId] });
      toast.success('Acceso revocado');
      setRevokeTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(u: PortalUser) {
    setEditPerms({
      canViewDebts: u.canViewDebts,
      canViewIva: u.canViewIva,
      canViewPayroll: u.canViewPayroll,
      canUploadDocuments: u.canUploadDocuments,
      canChatAi: u.canChatAi,
    });
    setNewPassword('');
    setEditTarget(u);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--arca-ink)]">Usuarios con acceso al portal</h3>
          <p className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Los usuarios portal pueden consultar la información fiscal del cliente.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="bg-[var(--arca-ink)] hover:bg-black text-white gap-1.5"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Agregar usuario
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--arca-ink-3)]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Cargando…
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2 rounded-lg border border-dashed border-[var(--arca-border)]">
          <UserCheck className="h-6 w-6 text-[var(--arca-ink-3)]" />
          <p className="text-sm text-[var(--arca-ink-3)]">No hay usuarios con acceso al portal</p>
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--arca-border)] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[var(--arca-surface-2)]">
                <TableHead className="text-xs">Nombre</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Permisos</TableHead>
                <TableHead className="text-xs">Alta</TableHead>
                <TableHead className="text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(users as PortalUser[]).map((u) => (
                <TableRow key={u.accessId} className="hover:bg-[var(--arca-surface-2)]/50">
                  <TableCell className="text-sm font-medium">{u.name ?? '—'}</TableCell>
                  <TableCell className="text-sm text-[var(--arca-ink-3)]">{u.email ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((k) => (
                        <PermissionBadge key={k} active={u[k]} label={PERMISSION_LABELS[k]} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-[var(--arca-ink-3)]">
                    {new Date(u.createdAt).toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Editar permisos"
                        onClick={() => openEdit(u)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-[var(--arca-accent-neg)] hover:text-[var(--arca-accent-neg)]"
                        title="Revocar acceso"
                        onClick={() => setRevokeTarget(u)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar usuario al portal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--arca-ink)]">Nombre completo</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Juan García"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--arca-ink)]">Email</label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="juan@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--arca-ink)]">Contraseña</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--arca-ink)]">Permisos</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createForm[k]}
                      onChange={(e) => setCreateForm((f) => ({ ...f, [k]: e.target.checked }))}
                      className="rounded border-[var(--arca-border)]"
                    />
                    {PERMISSION_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-[var(--arca-ink)] hover:bg-black text-white"
              disabled={!createForm.name || !createForm.email || createForm.password.length < 8 || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({
                  representativeId,
                  name: createForm.name,
                  email: createForm.email,
                  password: createForm.password,
                  permissions: {
                    canViewDebts: createForm.canViewDebts,
                    canViewIva: createForm.canViewIva,
                    canViewPayroll: createForm.canViewPayroll,
                    canUploadDocuments: createForm.canUploadDocuments,
                    canChatAi: createForm.canChatAi,
                  },
                })
              }
            >
              {createMutation.isPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Creando…</>
              ) : (
                'Crear usuario'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar acceso — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Permissions */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--arca-ink)]">Permisos</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPerms[k]}
                      onChange={(e) => setEditPerms((p) => ({ ...p, [k]: e.target.checked }))}
                      className="rounded border-[var(--arca-border)]"
                    />
                    {PERMISSION_LABELS[k]}
                  </label>
                ))}
              </div>
            </div>

            {/* Reset password */}
            <div className="space-y-2 border-t border-[var(--arca-border)] pt-4">
              <label className="text-xs font-medium text-[var(--arca-ink)] flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Cambiar contraseña
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nueva contraseña (mín. 8 caracteres)"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
                  onClick={() => editTarget && resetPasswordMutation.mutate({ userId: editTarget.userId, newPassword })}
                >
                  {resetPasswordMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button
              className="bg-[var(--arca-ink)] hover:bg-black text-white"
              disabled={editMutation.isPending}
              onClick={() =>
                editTarget &&
                editMutation.mutate({ accessId: editTarget.accessId, permissions: editPerms })
              }
            >
              {editMutation.isPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Guardando…</>
              ) : (
                'Guardar permisos'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revocar acceso</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--arca-ink-3)] py-2">
            ¿Confirmar revocar el acceso al portal de{' '}
            <span className="font-medium text-[var(--arca-ink)]">{revokeTarget?.name}</span>?
            El usuario no podrá ingresar más al portal.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate({ accessId: revokeTarget.accessId })}
            >
              {revokeMutation.isPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Revocando…</>
              ) : (
                'Revocar acceso'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
