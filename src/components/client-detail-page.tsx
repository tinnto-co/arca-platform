import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CalendarIcon,
  Edit,
  FileText,
  MapPin,
  Check,
  DollarSign,
  Calendar,
  Bell,
  Receipt,
  BanknoteArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  X,
  Search,
  ClipboardList,
  Plus,
  Paperclip,
  FileDown,
  RefreshCw,
  ListFilter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  getCredenciales,
  getCredencialClientes,
  getCredencialDeudas,
  getCredencialVencimientos,
  getClienteIvaCredit,
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
import { NotificationsView } from '@/components/notifications-view';
import {
  InvoicesTable,
  INVOICE_TYPE_LABELS,
  type InvoicesTableRef,
} from '@/components/invoices-table';
import {
  getComprobantes,
  getClienteMultilateralResumen,
  getClienteMultilateralComprobantes,
} from '@/actions/comprobante';
import {
  getNotifications,
  markNotificationOpened,
} from '@/actions/notification';
import { scrapSingleJob, updateDeudaEstado } from '@/actions/client';
import {
  listSolicitudes,
  createSolicitud,
  updateSolicitudEstado,
  getDocumentoSolicitud,
  listPortalUsers,
  createPortalUser,
  updatePortalUserPermissions,
  resetPortalUserPassword,
  revokePortalAccess,
} from '@/actions/client-portal';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  CalendarCheck,
  CalendarX,
  Loader2,
  Play,
  Activity,
  UserCheck,
  Building2,
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
  type ClientIvaCreditData,
} from './render-iva-resume';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar';
import { type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
} from 'recharts';
import { userQuery } from '@/lib/user-query';
import { ProvinceSourceCell } from '@/components/province-source-cell';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { PerfilesTab } from '@/components/perfiles-tab';
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

/** Fecha y hora para el texto "Ult. actualización" en pestañas de scrape (Deudas, Vencimientos, etc.). */
const formatLastUpdateAt = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const facturasChartConfig = {
  ventas: { label: 'Ventas', color: '#1E3460' },
  compras: { label: 'Compras', color: '#7AA2C8' },
} satisfies ChartConfig;

/** Convenio Multilateral: comparativa período actual vs anterior */
const convenioChartConfig = {
  actual: { label: 'Período actual', color: '#1E3460' },
  anterior: { label: 'Período anterior', color: '#7AA2C8' },
} satisfies ChartConfig;

const formatIvaCurrency = (
  value: string | number | null | undefined
): string => {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
};

interface MetricDeltaProps {
  current: number;
  previous: number;
  label?: string;
}

const MetricDelta = ({
  current,
  previous,
  label = 'vs. mes anterior',
}: MetricDeltaProps) => {
  if (previous === 0 && current === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-1">{label}: sin cambios</p>
    );
  }

  if (previous === 0 && current !== 0) {
    return (
      <p className="text-xs text-[var(--arca-accent-pos-fg)] mt-1">
        {label}: nuevo período con actividad
      </p>
    );
  }

  const diff = current - previous;
  const diffPct = (diff / Math.abs(previous)) * 100;
  const sign = diff > 0 ? '+' : '';
  const formattedPct = `${sign}${diffPct.toFixed(1)}%`;

  return (
    <p
      className={`text-xs mt-1 ${
        diff > 0
          ? 'text-[var(--arca-accent-pos-fg)]'
          : diff < 0
            ? 'text-[var(--arca-accent-neg-fg)]'
            : 'text-muted-foreground'
      }`}
    >
      {label}: {formattedPct}
    </p>
  );
};

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

/** Comprobante tal como lo devuelve `getComprobantes`. */
type ComprobanteRow = Awaited<
  ReturnType<typeof getComprobantes>
>['comprobantes'][number];

/** Notificación de AFIP tal como la devuelve `getNotifications`. */
type NotificacionRow = Awaited<
  ReturnType<typeof getNotifications>
>['notifications'][number];

/** Fila del resumen por provincia (Convenio Multilateral). */
type MultilateralResumenRow = Awaited<
  ReturnType<typeof getClienteMultilateralResumen>
>[number];

/** Solicitud al cliente tal como la devuelve el server fn. */
type SolicitudRow = Awaited<ReturnType<typeof listSolicitudes>>[number];
type SolicitudEstado = SolicitudRow['estado'];
type SolicitudTipo = SolicitudRow['tipo'];

/**
 * Elige el id del perfil que mejor coincide con el nombre del cliente (case-insensitive, por contiene).
 * Ej: cliente "Smart Solutions SRL" → perfil "Smart Solutions" (el nombre del perfil está contenido en el del cliente).
 */
function findBestMatchingProfileId(
  clientName: string | undefined,
  profiles: { id: string; razonSocial?: string | null }[]
): string | undefined {
  if (!profiles.length) return undefined;
  const normalizedClient = (clientName ?? '').trim().toLowerCase();
  if (normalizedClient.length < 2) return profiles[0].id;

  const withName = profiles.filter(
    (p) => (p.razonSocial ?? '').trim().length >= MIN_PROFILE_NAME_LENGTH
  );
  if (withName.length === 0) return profiles[0].id;

  const containedInClient = withName
    .filter((p) =>
      normalizedClient.includes((p.razonSocial ?? '').trim().toLowerCase())
    )
    .sort((a, b) => (b.razonSocial ?? '').length - (a.razonSocial ?? '').length);
  if (containedInClient.length > 0) return containedInClient[0].id;

  const clientInProfile = withName.find((p) =>
    (p.razonSocial ?? '').trim().toLowerCase().includes(normalizedClient)
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
  const navigate = useNavigate();
  const [editRepresentativeDialogOpen, setEditRepresentativeDialogOpen] =
    useState(false);
  const now = new Date();
  const initialMultilateralRange = getMonthBounds(
    now.getFullYear(),
    now.getMonth()
  );
  const [resumenNotifSelected, setResumenNotifSelected] =
    useState<NotificacionRow | null>(null);
  const [multilateralDateFrom, setMultilateralDateFrom] = useState<string>(
    initialMultilateralRange.from.toISOString().slice(0, 10)
  );
  const [multilateralDateTo, setMultilateralDateTo] = useState<string>(
    initialMultilateralRange.to.toISOString().slice(0, 10)
  );
  const [multilateralPeriod, setMultilateralPeriod] = useState<{
    from: Date;
    to: Date;
  } | null>(initialMultilateralRange);
  const [multilateralDetailOpen, setMultilateralDetailOpen] = useState(false);
  const [selectedMultilateralProvince, setSelectedMultilateralProvince] =
    useState<string | null>(null);
  const [
    selectedMultilateralProvinceLabel,
    setSelectedMultilateralProvinceLabel,
  ] = useState<string | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [multilateralSortKey, setMultilateralSortKey] = useState<
    'count' | 'iva' | 'base' | null
  >(null);
  const [multilateralSortDir, setMultilateralSortDir] = useState<
    'asc' | 'desc'
  >('desc');
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
  /** Filtros del módulo de deudas (vacío = todos). */
  const [debtFilterImpuesto, setDebtFilterImpuesto] = useState<string>('');
  const [debtFilterConcepto, setDebtFilterConcepto] = useState<string>('');
  const [debtPage, setDebtPage] = useState(1);
  const [debtSortKey, setDebtSortKey] = useState<
    'impuesto' | 'concepto' | 'periodo' | 'venceAt' | 'detectadaAt'
  >('detectadaAt');
  const [debtSortDir, setDebtSortDir] = useState<'asc' | 'desc'>('desc');
  const [dueDatePage, setDueDatePage] = useState(1);

  /** Período para el módulo Facturas: sin período, por año, por mes o rango de días. */
  const [facturasPeriodType, setFacturasPeriodType] = useState<
    'none' | 'year' | 'month' | 'range'
  >('none');
  const [facturasYear, setFacturasYear] = useState(() => now.getFullYear());
  const [facturasMonth, setFacturasMonth] = useState(now.getMonth());
  const [facturasDateRange, setFacturasDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [facturasPeriodPickerOpen, setFacturasPeriodPickerOpen] =
    useState(false);
  /** Filtros de la tabla de facturas (tipo, dirección) para que los totales Ventas/Compras los respeten.
   *  El filtro de empresa lo maneja el selector global (`selectedClientId`). */
  const [facturasTypeFilter, setFacturasTypeFilter] = useState<string>('all');
  const [facturasDirectionFilter, setFacturasDirectionFilter] =
    useState<string>('all');
  const facturasOnFiltersChange = useCallback(
    ({
      typeFilter,
      directionFilter,
    }: {
      profileFilter: string;
      typeFilter: string;
      directionFilter: string;
    }) => {
      setFacturasTypeFilter(typeFilter);
      setFacturasDirectionFilter(directionFilter);
    },
    []
  );
  const [facturasSearchTerm, setFacturasSearchTerm] = useState('');
  const [facturasDebouncedSearchTerm, setFacturasDebouncedSearchTerm] =
    useState('');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFacturasDebouncedSearchTerm(facturasSearchTerm),
      500
    );
    return () => clearTimeout(timer);
  }, [facturasSearchTerm]);
  const invoicesTableRef = useRef<InvoicesTableRef>(null);
  const queryClient = useQueryClient();
  const { data: sessionUser } = useQuery(userQuery);
  const orgKey = sessionUser?.activeOrganizationId ?? '__pending__';

  const markOpenedMutation = useMutation({
    mutationFn: (id: string) => markNotificationOpened({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['unreadNotifications', orgKey, representativeId],
      });
    },
  });

  const updateDebtStatusMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      estado: 'abierta' | 'pagada' | 'plan_pago' | 'prescripta';
      intimada: boolean;
    }) => updateDeudaEstado({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['representativeDebts', representativeId],
      });
      toast.success('Deuda actualizada');
    },
    onError: () => {
      toast.error('Error al actualizar la deuda');
    },
  });

  // Solicitudes state
  const [solicitudesStatusFilter, setSolicitudesStatusFilter] =
    useState<SolicitudEstado | ''>('');
  const [newRequestDialogOpen, setNewRequestDialogOpen] = useState(false);
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestDescription, setNewRequestDescription] = useState('');
  const [newRequestType, setNewRequestType] =
    useState<SolicitudTipo>('documentacion');
  const [newRequestDueAt, setNewRequestDueAt] = useState('');

  // No existe un getter de una sola credencial: se trae la lista de la org y se
  // filtra por id.
  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['representative', representativeId],
    queryFn: async () => {
      const credenciales = await getCredenciales();
      return credenciales.find((c) => c.id === representativeId) ?? null;
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
    queryFn: () =>
      getCredencialClientes({ data: { credencialId: representativeId } }),
  });

  /** Perfil IVA por defecto (según nombre del cliente). Se calcula cuando hay client + profiles. */
  const defaultIvaProfileId = useMemo(() => {
    if (!client || profiles.length === 0) return undefined;
    return (
      findBestMatchingProfileId(client.nombre ?? '', profiles) ?? profiles[0].id
    );
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
  const effectiveMultilateralProfileId = selectedClientId;
  const effectiveResumenProfileId = selectedClientId;
  const selectedResumenProfile = selectedProfile;

  // Las solicitudes cuelgan del cliente (empresa), no del login de AFIP.
  const {
    data: clientRequestsData = [] as SolicitudRow[],
    refetch: refetchRequests,
  } = useQuery({
    queryKey: [
      'clientRequests',
      representativeId,
      solicitudesStatusFilter,
      selectedClientId,
    ],
    queryFn: () =>
      listSolicitudes({
        data: {
          clienteId: selectedClientId!,
          estado: solicitudesStatusFilter || undefined,
        },
      }),
    enabled: !!selectedClientId,
  });

  const createRequestMutation = useMutation({
    mutationFn: () =>
      createSolicitud({
        data: {
          clienteId: selectedClientId!,
          titulo: newRequestTitle,
          descripcion: newRequestDescription || undefined,
          tipo: newRequestType,
          venceAt: newRequestDueAt || undefined,
        },
      }),
    onSuccess: () => {
      refetchRequests();
      setNewRequestDialogOpen(false);
      setNewRequestTitle('');
      setNewRequestDescription('');
      setNewRequestType('documentacion');
      setNewRequestDueAt('');
      toast.success('Solicitud creada');
    },
    onError: () => toast.error('Error al crear solicitud'),
  });

  const updateRequestStatusMutation = useMutation({
    mutationFn: (vars: { solicitudId: string; estado: SolicitudEstado }) =>
      updateSolicitudEstado({ data: vars }),
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

  // Periodo para Convenio Multilateral (mismo patrón: año + meses)
  const multilateralSelectedYear =
    multilateralPeriod?.from.getFullYear() ?? now.getFullYear();
  const multilateralSelectedMonth =
    multilateralPeriod?.from.getMonth() ?? now.getMonth();
  const multilateralMaxMonthForYear =
    multilateralSelectedYear === now.getFullYear() ? now.getMonth() : 11;
  const multilateralAvailableMonthIndices = Array.from(
    { length: multilateralMaxMonthForYear + 1 },
    (_, i) => i
  );

  // Período anterior al seleccionado para Convenio Multilateral (para comparativos)
  const multilateralPrevPeriod = useMemo(() => {
    if (!multilateralPeriod) return null;
    let y = multilateralSelectedYear;
    let m = multilateralSelectedMonth - 1;
    if (m < 0) {
      m = 11;
      y = y - 1;
    }
    // Por simplicidad, permitimos ir un año atrás aunque no haya datos
    return getMonthBounds(y, m);
  }, [multilateralPeriod, multilateralSelectedYear, multilateralSelectedMonth]);

  /** Período fiscal del scrape que alimenta el resumen (mes anterior al elegido en el calendario). */
  const periodUsedForResumen = useMemo(
    () => getPeriodUsedForResumen(ivaResumenDateRange.from),
    [ivaResumenDateRange.from]
  );

  const periodoFiscalResumen = getResumenPeriodMMYYYY(ivaResumenDateRange.from);
  /** Mismo período, en el formato "YYYY-MM-DD" que espera `getClienteIvaCredit`. */
  const periodoResumenISO = `${ivaResumenDateRange.from.getFullYear()}-${String(
    ivaResumenDateRange.from.getMonth() + 1
  ).padStart(2, '0')}-01`;

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
      getClienteIvaCredit({
        data: {
          clienteId: effectiveIvaProfileId!,
          periodoResumen: periodoResumenISO,
        },
      }),
    enabled: !!effectiveIvaProfileId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  /**
   * `getClienteIvaCredit` devuelve la fila cruda de `iva_declaracion`;
   * `RenderIvaResume` espera el view model `ClientIvaCreditData` (nombres del
   * F2051). El mapeo es el mismo que hace `CopilotIvaResume`.
   */
  const clientIvaResume: ClientIvaCreditData | undefined = useMemo(() => {
    if (!clientIva) return undefined;
    const d = clientIva.data;
    return {
      cuit: clientIva.cuit,
      data: d
        ? {
            // `periodo` es un date 'YYYY-MM-DD'; la vista habla "MM/YYYY".
            periodoFiscal: `${d.periodo.slice(5, 7)}/${d.periodo.slice(0, 4)}`,
            fechaPresentacion: d.presentadaAt ?? undefined,
            debitoFiscal: d.debitoFiscal,
            creditoFiscal: d.creditoFiscal,
            saldoMesPasado: d.saldoMesAnterior,
            saldoArcaMes: d.saldoAfipMes,
            saldoTecnicoFavorContribuyente: d.saldoTecnicoFavor,
            saldoTecnicoFavorContribuyentePosicionMensual:
              d.saldoTecnicoFavorMensual,
            saldoLibreDisponibilidadPeriodoAnteriorNeto:
              d.saldoLibreDisponibilidadAnteriorNeto,
            totalRetencionesPercepcionesPeriodo:
              d.retencionesPercepcionesPeriodo,
            saldoLibreDisponibilidadFavorContribuyentePeriodo:
              d.saldoLibreDisponibilidadFavor,
            ok: true,
          }
        : null,
      message: clientIva.message,
    };
  }, [clientIva]);

  /** IVA para el cuadro del Resumen: usa el perfil seleccionado en "Perfiles Asociados". */
  const { data: resumenClientIva, isLoading: loadingResumenClientIva } =
    useQuery({
      queryKey: [
        'clientIva',
        representativeId,
        effectiveResumenProfileId,
        periodoFiscalResumen,
      ],
      queryFn: () =>
        getClienteIvaCredit({
          data: {
            clienteId: effectiveResumenProfileId!,
            periodoResumen: periodoResumenISO,
          },
        }),
      enabled: !!effectiveResumenProfileId,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

  useEffect(() => {
    const range = getMonthBounds(now.getFullYear(), now.getMonth());
    setMultilateralPeriod(range);
    setMultilateralDateFrom(range.from.toISOString().slice(0, 10));
    setMultilateralDateTo(range.to.toISOString().slice(0, 10));
  }, [representativeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktopViewport(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update);
      return () => mediaQuery.removeEventListener('change', update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  const { data: debts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ['representativeDebts', representativeId, selectedClientId],
    // `getCredencialDeudas` devuelve `{ deuda, clienteRazonSocial }` y no filtra
    // por cliente: se aplana y se filtra acá (mismo criterio que deudas-tab).
    queryFn: async () => {
      const rows = await getCredencialDeudas({
        data: { credencialId: representativeId },
      });
      return rows
        .filter(
          (row) => !selectedClientId || row.deuda.clienteId === selectedClientId
        )
        .map((row) => row.deuda);
    },
  });

  const { data: dueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ['representativeDueDates', representativeId, selectedClientId],
    queryFn: () =>
      getCredencialVencimientos({
        data: {
          credencialId: representativeId,
          clienteId: selectedClientId || undefined,
        },
      }),
  });

  // Últimos jobs por tipo para mostrar errores en Resumen
  const { data: lastComprobantesJobIncremental } = useQuery({
    queryKey: ['lastComprobantesJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { credencialId: representativeId, jobType: 'comprobantes' } }),
    enabled: !!representativeId,
  });

  const { data: lastComprobantesFullJob } = useQuery({
    queryKey: ['lastComprobantesFullJob', representativeId],
    queryFn: () =>
      getLastJobByType({
        data: { credencialId: representativeId, jobType: 'comprobantes_full' },
      }),
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
    queryFn: () =>
      getLastJobByType({ data: { credencialId: representativeId, jobType: 'iva' } }),
    enabled: !!representativeId,
  });

  const { data: lastNotificacionesJob } = useQuery({
    queryKey: ['lastNotificacionesJob', representativeId],
    queryFn: () =>
      getLastJobByType({
        data: { credencialId: representativeId, jobType: 'notificaciones' },
      }),
    enabled: !!representativeId,
  });

  const { data: lastDeudaJob } = useQuery({
    queryKey: ['lastDeudaJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { credencialId: representativeId, jobType: 'deuda' } }),
    enabled: !!representativeId,
  });

  const { data: unreadNotifications, isLoading: loadingUnreadNotifications } =
    useQuery({
      queryKey: [
        'unreadNotifications',
        orgKey,
        representativeId,
        selectedClientId,
      ],
      queryFn: () =>
        getNotifications({
          data: {
            credencialFilter: representativeId,
            clienteId: selectedClientId || undefined,
            leida: false,
            limit: 50,
            page: 1,
          },
        }),
      enabled: !!representativeId,
    });

  const { data: lastVencimientosJob } = useQuery({
    queryKey: ['lastVencimientosJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { credencialId: representativeId, jobType: 'vencimientos' } }),
    enabled: !!representativeId,
  });

  // Job incremental de comprobantes en curso (para mostrar loader de IVA aunque se haya iniciado en otro lado)
  const { data: runningComprobantesJob } = useQuery({
    queryKey: ['runningComprobantesJob', representativeId],
    queryFn: () =>
      getRunningJobByType({
        data: { credencialId: representativeId, jobType: 'comprobantes' },
      }),
    enabled: !!representativeId,
    // Refrescar cada 5s para reflejar cambios de estado
    refetchInterval: 5000,
  });

  // Get all invoices for the client to calculate totals
  const { data: allInvoicesData } = useQuery({
    queryKey: ['clientAllInvoices', representativeId, selectedClientId],
    queryFn: () =>
      getComprobantes({
        data: {
          page: 1,
          limit: 10000, // Get all invoices
          clienteId: selectedClientId,
        },
      }),
    enabled: !!selectedClientId,
  });

  const {
    data: multilateralSummary = [],
    isLoading: loadingMultilateralSummary,
  } = useQuery({
    queryKey: [
      'clientMultilateralSummary',
      representativeId,
      effectiveMultilateralProfileId,
      multilateralDateFrom,
      multilateralDateTo,
    ],
    queryFn: () =>
      getClienteMultilateralResumen({
        data: {
          clienteId: effectiveMultilateralProfileId!,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!effectiveMultilateralProfileId,
  });

  const multilateralPrevDateFrom = multilateralPrevPeriod
    ? multilateralPrevPeriod.from.toISOString().slice(0, 10)
    : undefined;
  const multilateralPrevDateTo = multilateralPrevPeriod
    ? multilateralPrevPeriod.to.toISOString().slice(0, 10)
    : undefined;

  const { data: multilateralSummaryPrev = [] } = useQuery({
    queryKey: [
      'clientMultilateralSummaryPrev',
      representativeId,
      effectiveMultilateralProfileId,
      multilateralPrevDateFrom,
      multilateralPrevDateTo,
    ],
    queryFn: () =>
      getClienteMultilateralResumen({
        data: {
          clienteId: effectiveMultilateralProfileId!,
          dateFrom: multilateralPrevDateFrom,
          dateTo: multilateralPrevDateTo,
        },
      }),
    enabled:
      !!effectiveMultilateralProfileId &&
      !!multilateralPrevDateFrom &&
      !!multilateralPrevDateTo,
  });

  const aggregateMultilateral = (rows: MultilateralResumenRow[]) => {
    if (!rows?.length) {
      return { provinces: 0, invoices: 0, totalIVA: 0, totalBase: 0 };
    }
    const provinces = rows.length;
    let invoices = 0;
    let totalIVA = 0;
    let totalBase = 0;
    for (const row of rows) {
      invoices += Number(row.cantidad ?? 0);
      totalIVA += Number(row.totalIva ?? 0);
      totalBase += Number(row.totalBase ?? 0);
    }
    return { provinces, invoices, totalIVA, totalBase };
  };

  const multilateralAggCurrent = useMemo(
    () => aggregateMultilateral(multilateralSummary),
    [multilateralSummary]
  );
  const multilateralAggPrev = useMemo(
    () => aggregateMultilateral(multilateralSummaryPrev),
    [multilateralSummaryPrev]
  );

  /** Datos para gráficos Convenio: actividad (provincias, comprobantes) actual vs anterior */
  const convenioActividadChartData = useMemo(() => {
    if (!multilateralPeriod || !multilateralPrevPeriod) return [];
    return [
      {
        metrica: 'Provincias',
        actual: multilateralAggCurrent.provinces,
        anterior: multilateralAggPrev.provinces,
      },
      {
        metrica: 'Comprobantes',
        actual: multilateralAggCurrent.invoices,
        anterior: multilateralAggPrev.invoices,
      },
    ];
  }, [
    multilateralPeriod,
    multilateralPrevPeriod,
    multilateralAggCurrent.provinces,
    multilateralAggCurrent.invoices,
    multilateralAggPrev.provinces,
    multilateralAggPrev.invoices,
  ]);

  /** Datos para gráficos Convenio: montos (IVA, base) actual vs anterior */
  const convenioMontosChartData = useMemo(() => {
    if (!multilateralPeriod || !multilateralPrevPeriod) return [];
    return [
      {
        metrica: 'Total IVA',
        actual: Number(multilateralAggCurrent.totalIVA) || 0,
        anterior: Number(multilateralAggPrev.totalIVA) || 0,
      },
      {
        metrica: 'Base imponible',
        actual: Number(multilateralAggCurrent.totalBase) || 0,
        anterior: Number(multilateralAggPrev.totalBase) || 0,
      },
    ];
  }, [
    multilateralPeriod,
    multilateralPrevPeriod,
    multilateralAggCurrent.totalIVA,
    multilateralAggCurrent.totalBase,
    multilateralAggPrev.totalIVA,
    multilateralAggPrev.totalBase,
  ]);

  const sortedMultilateralSummary = useMemo(() => {
    if (!multilateralSortKey) return multilateralSummary;
    const copy = [...multilateralSummary];
    copy.sort((a, b) => {
      const dir = multilateralSortDir === 'asc' ? 1 : -1;
      let av = 0;
      let bv = 0;
      if (multilateralSortKey === 'count') {
        av = Number(a.cantidad ?? 0);
        bv = Number(b.cantidad ?? 0);
      } else if (multilateralSortKey === 'iva') {
        av = Number(a.totalIva ?? 0);
        bv = Number(b.totalIva ?? 0);
      } else if (multilateralSortKey === 'base') {
        av = Number(a.totalBase ?? 0);
        bv = Number(b.totalBase ?? 0);
      }
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return copy;
  }, [multilateralSummary, multilateralSortKey, multilateralSortDir]);

  const toggleMultilateralSort = (key: 'count' | 'iva' | 'base') => {
    setMultilateralSortKey((prevKey) => {
      // Caso 1: nuevo campo → ordenar ASC
      if (prevKey !== key) {
        setMultilateralSortDir('asc');
        return key;
      }

      // Caso 2: mismo campo y estaba ASC → pasar a DESC
      if (multilateralSortDir === 'asc') {
        setMultilateralSortDir('desc');
        return key;
      }

      // Caso 3: mismo campo y estaba DESC → limpiar orden (sin ordenar)
      setMultilateralSortDir('asc');
      return null;
    });
  };

  const {
    data: multilateralDetailInvoices = [],
    isLoading: loadingMultilateralDetail,
  } = useQuery({
    queryKey: [
      'clientMultilateralInvoices',
      representativeId,
      effectiveMultilateralProfileId,
      multilateralDateFrom,
      multilateralDateTo,
      selectedMultilateralProvince,
    ],
    queryFn: () =>
      getClienteMultilateralComprobantes({
        data: {
          clienteId: effectiveMultilateralProfileId!,
          provincia: selectedMultilateralProvince,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!effectiveMultilateralProfileId && multilateralDetailOpen,
  });

  const multilateralDetailTotals = useMemo(() => {
    if (!multilateralDetailInvoices?.length) {
      return { base: 0, iva: 0, total: 0 };
    }
    return multilateralDetailInvoices.reduce(
      (acc: { base: number; iva: number; total: number }, inv) => {
        acc.base += Number(inv.baseImponible ?? inv.netoGravado ?? 0);
        acc.iva += Number(inv.ivaTotal ?? 0);
        acc.total += Number(inv.total ?? 0);
        return acc;
      },
      { base: 0, iva: 0, total: 0 }
    );
  }, [multilateralDetailInvoices]);

  // Calculate debt statistics
  const debtStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalBalance = debts.reduce(
      (sum, debt) => sum + Number(debt.saldo || 0),
      0
    );
    const totalCompensatoryInterest = debts.reduce(
      (sum, debt) => sum + Number(debt.interesResarcitorio || 0),
      0
    );
    const totalPunitiveInterest = debts.reduce(
      (sum, debt) => sum + Number(debt.interesPunitorio || 0),
      0
    );
    const totalDebt =
      totalBalance + totalCompensatoryInterest + totalPunitiveInterest;

    // `venceAt` es nullable en el modelo nuevo: sin fecha no se puede saber si
    // está vencida, así que queda fuera de ambos grupos.
    const overdueDebts = debts.filter((debt) => {
      if (!debt.venceAt) return false;
      const dueDate = new Date(debt.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const upcomingDebts = debts.filter((debt) => {
      if (!debt.venceAt) return false;
      const dueDate = new Date(debt.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today;
    });

    const totalOverdueBalance = overdueDebts.reduce(
      (sum, debt) => sum + Number(debt.saldo || 0),
      0
    );
    const totalUpcomingBalance = upcomingDebts.reduce(
      (sum, debt) => sum + Number(debt.saldo || 0),
      0
    );

    return {
      totalDebts: debts.length,
      totalBalance,
      totalCompensatoryInterest,
      totalPunitiveInterest,
      totalDebt,
      overdueCount: overdueDebts.length,
      upcomingCount: upcomingDebts.length,
      totalOverdueBalance,
      totalUpcomingBalance,
    };
  }, [debts]);

  // Opciones únicas para filtros de deudas (impuesto, concepto)
  const debtFilterOptions = useMemo(() => {
    const impuestos = Array.from(
      new Set(debts.map((d) => (d.impuesto ?? '').trim()).filter(Boolean))
    ).sort();
    const conceptos = Array.from(
      new Set(debts.map((d) => (d.concepto ?? '').trim()).filter(Boolean))
    ).sort();
    return { impuestos, conceptos };
  }, [debts]);

  // Deudas filtradas por impuesto y concepto
  const filteredDebts = useMemo(() => {
    return debts.filter((debt) => {
      if (debtFilterImpuesto && (debt.impuesto ?? '').trim() !== debtFilterImpuesto)
        return false;
      if (
        debtFilterConcepto &&
        (debt.concepto ?? '').trim() !== debtFilterConcepto
      )
        return false;
      return true;
    });
  }, [debts, debtFilterImpuesto, debtFilterConcepto]);

  const sortedDebts = useMemo(() => {
    const sorted = [...filteredDebts].sort((a, b) => {
      let cmp = 0;
      if (debtSortKey === 'venceAt' || debtSortKey === 'detectadaAt') {
        cmp =
          new Date(a[debtSortKey] ?? 0).getTime() -
          new Date(b[debtSortKey] ?? 0).getTime();
      } else {
        cmp = (a[debtSortKey] ?? '').localeCompare(b[debtSortKey] ?? '');
      }
      return debtSortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [filteredDebts, debtSortKey, debtSortDir]);

  const ITEMS_PER_PAGE = 10;
  const debtTotalPages = Math.max(
    1,
    Math.ceil(sortedDebts.length / ITEMS_PER_PAGE)
  );
  const pagedDebts = sortedDebts.slice(
    (debtPage - 1) * ITEMS_PER_PAGE,
    debtPage * ITEMS_PER_PAGE
  );
  const dueDateTotalPages = Math.max(
    1,
    Math.ceil(dueDates.length / ITEMS_PER_PAGE)
  );
  const pagedDueDates = dueDates.slice(
    (dueDatePage - 1) * ITEMS_PER_PAGE,
    dueDatePage * ITEMS_PER_PAGE
  );

  const getPageRange = (currentPage: number, totalPages: number) => {
    const maxVisible = 7;
    if (totalPages <= maxVisible) return { startPage: 1, endPage: totalPages };
    let startPage = Math.max(1, currentPage - 3);
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1)
      startPage = Math.max(1, endPage - maxVisible + 1);
    return { startPage, endPage };
  };

  /** Formatea una fecha en hora local como YYYY-MM-DD (evita desfase por UTC con toISOString). */
  const formatLocalYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  /** Parsea YYYY-MM-DD como fecha en hora local (evita que "2026-01-01" se interprete como UTC y cambie de día). */
  const parseLocalDateOnly = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  /** `comprobante.tipo` es numérico; el filtro llega como string desde el select. */
  const matchInvoiceType = (invTipo: number, typeFilter: string): boolean => {
    if (!typeFilter || typeFilter === 'all') return true;
    return String(invTipo) === typeFilter.trim();
  };

  /** True si la factura pasa los filtros de perfil, tipo y dirección (para totales Ventas/Compras). */
  const invoicePassesFacturasFilters = (inv: ComprobanteRow): boolean => {
    if (selectedClientId && inv.clienteId !== selectedClientId) return false;
    if (facturasTypeFilter && facturasTypeFilter !== 'all') {
      if (!matchInvoiceType(inv.tipo, facturasTypeFilter)) return false;
    }
    if (facturasDirectionFilter && facturasDirectionFilter !== 'all') {
      if (inv.direccion !== facturasDirectionFilter) return false;
    }
    return true;
  };

  /** Rango de fechas para Facturas según tipo de período seleccionado. */
  const facturasBounds = useMemo((): {
    dateFrom: string | undefined;
    dateTo: string | undefined;
  } => {
    if (facturasPeriodType === 'none')
      return { dateFrom: undefined, dateTo: undefined };
    if (facturasPeriodType === 'year') {
      const from = new Date(facturasYear, 0, 1);
      const to = new Date(facturasYear, 11, 31);
      return {
        dateFrom: formatLocalYYYYMMDD(from),
        dateTo: formatLocalYYYYMMDD(to),
      };
    }
    if (facturasPeriodType === 'month') {
      const { from, to } = getMonthBounds(facturasYear, facturasMonth);
      return {
        dateFrom: formatLocalYYYYMMDD(from),
        dateTo: formatLocalYYYYMMDD(to),
      };
    }
    if (
      facturasPeriodType === 'range' &&
      facturasDateRange?.from &&
      facturasDateRange?.to
    ) {
      return {
        dateFrom: format(facturasDateRange.from, 'yyyy-MM-dd'),
        dateTo: format(facturasDateRange.to, 'yyyy-MM-dd'),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [facturasPeriodType, facturasYear, facturasMonth, facturasDateRange]);

  /** Totales de Ventas y Compras filtrados por el período de Facturas; null si no hay período seleccionado. */
  const invoiceStatsFiltered = useMemo(() => {
    if (
      !facturasBounds.dateFrom ||
      !facturasBounds.dateTo ||
      !allInvoicesData?.comprobantes
    ) {
      if (facturasPeriodType !== 'none')
        return { totalSales: 0, totalPurchases: 0 };
      return null;
    }
    const from = parseLocalDateOnly(facturasBounds.dateFrom);
    const to = parseLocalDateOnly(facturasBounds.dateTo);
    to.setHours(23, 59, 59, 999);
    let totalSales = 0;
    let totalPurchases = 0;
    allInvoicesData.comprobantes.forEach((inv) => {
      if (!invoicePassesFacturasFilters(inv)) return;
      const invDate = new Date(inv.fechaEmision);
      if (invDate < from || invDate > to) return;
      let amount = parseFloat(inv.total || '0');
      if (inv.moneda?.toUpperCase() === 'USD') {
        const rate = parseFloat(inv.cotizacion || '1');
        amount = amount * rate;
      }
      const direction = inv.direccion;
      if (direction === 'emitido') totalSales += amount;
      else if (direction === 'recibido') totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [
    allInvoicesData,
    facturasBounds,
    facturasPeriodType,
    selectedClientId,
    facturasTypeFilter,
    facturasDirectionFilter,
  ]);

  /** Totales del período anterior (mes anterior o año anterior) para la variación %. */
  const invoiceStatsPrevious = useMemo(() => {
    if (!allInvoicesData?.comprobantes?.length) return null;
    if (facturasPeriodType === 'month') {
      const prevMonth = facturasMonth === 0 ? 11 : facturasMonth - 1;
      const prevYear = facturasMonth === 0 ? facturasYear - 1 : facturasYear;
      const { from, to } = getMonthBounds(prevYear, prevMonth);
      const fromStr = formatLocalYYYYMMDD(from);
      const toStr = formatLocalYYYYMMDD(to);
      const fromDate = parseLocalDateOnly(fromStr);
      const toDate = parseLocalDateOnly(toStr);
      toDate.setHours(23, 59, 59, 999);
      let totalSales = 0;
      let totalPurchases = 0;
      allInvoicesData.comprobantes.forEach((inv) => {
        if (!invoicePassesFacturasFilters(inv)) return;
        const invDate = new Date(inv.fechaEmision);
        if (invDate < fromDate || invDate > toDate) return;
        let amount = parseFloat(inv.total || '0');
        if (inv.moneda?.toUpperCase() === 'USD')
          amount *= parseFloat(inv.cotizacion || '1');
        const dir = inv.direccion;
        if (dir === 'emitido') totalSales += amount;
        else if (dir === 'recibido') totalPurchases += amount;
      });
      return { totalSales, totalPurchases };
    }
    if (facturasPeriodType === 'year') {
      const from = new Date(facturasYear - 1, 0, 1);
      const to = new Date(facturasYear - 1, 11, 31);
      const fromStr = formatLocalYYYYMMDD(from);
      const toStr = formatLocalYYYYMMDD(to);
      const fromDate = parseLocalDateOnly(fromStr);
      const toDate = parseLocalDateOnly(toStr);
      toDate.setHours(23, 59, 59, 999);
      let totalSales = 0;
      let totalPurchases = 0;
      allInvoicesData.comprobantes.forEach((inv) => {
        if (!invoicePassesFacturasFilters(inv)) return;
        const invDate = new Date(inv.fechaEmision);
        if (invDate < fromDate || invDate > toDate) return;
        let amount = parseFloat(inv.total || '0');
        if (inv.moneda?.toUpperCase() === 'USD')
          amount *= parseFloat(inv.cotizacion || '1');
        const dir = inv.direccion;
        if (dir === 'emitido') totalSales += amount;
        else if (dir === 'recibido') totalPurchases += amount;
      });
      return { totalSales, totalPurchases };
    }
    return null;
  }, [
    allInvoicesData,
    facturasPeriodType,
    facturasYear,
    facturasMonth,
    selectedClientId,
    facturasTypeFilter,
    facturasDirectionFilter,
  ]);

  /** Variación % vs período anterior: { salesPct, purchasesPct } o null si no aplica. */
  const facturasVariationPct = useMemo(() => {
    if (invoiceStatsFiltered == null || invoiceStatsPrevious == null)
      return null;
    if (facturasPeriodType !== 'month' && facturasPeriodType !== 'year')
      return null;
    const salesPct =
      invoiceStatsPrevious.totalSales === 0
        ? invoiceStatsFiltered.totalSales === 0
          ? 0
          : null
        : ((invoiceStatsFiltered.totalSales - invoiceStatsPrevious.totalSales) /
            invoiceStatsPrevious.totalSales) *
          100;
    const purchasesPct =
      invoiceStatsPrevious.totalPurchases === 0
        ? invoiceStatsFiltered.totalPurchases === 0
          ? 0
          : null
        : ((invoiceStatsFiltered.totalPurchases -
            invoiceStatsPrevious.totalPurchases) /
            invoiceStatsPrevious.totalPurchases) *
          100;
    return { salesPct, purchasesPct };
  }, [invoiceStatsFiltered, invoiceStatsPrevious, facturasPeriodType]);

  /** Datos para el gráfico de barras Ventas/Compras: por mes o por año según el filtro de período. Respeta perfil, tipo y dirección. */
  const facturasChartData = useMemo((): {
    period: string;
    ventas: number;
    compras: number;
  }[] => {
    const invoices = allInvoicesData?.comprobantes;
    if (!invoices?.length) return [];
    const filtered = invoices.filter((inv) =>
      invoicePassesFacturasFilters(inv)
    );
    const getAmount = (inv: ComprobanteRow): number => {
      let amount = parseFloat(inv.total || '0');
      if (inv.moneda?.toUpperCase() === 'USD') {
        const rate = parseFloat(inv.cotizacion || '1');
        amount = amount * rate;
      }
      return amount;
    };

    // Por año: barras de todos los meses del año seleccionado
    if (facturasPeriodType === 'year') {
      const byMonth: Record<number, { ventas: number; compras: number }> = {};
      for (let i = 0; i < 12; i++) byMonth[i] = { ventas: 0, compras: 0 };
      filtered.forEach((inv) => {
        const d = new Date(inv.fechaEmision);
        if (d.getFullYear() !== facturasYear) return;
        const m = d.getMonth();
        const amount = getAmount(inv);
        const dir = inv.direccion;
        if (dir === 'emitido') byMonth[m].ventas += amount;
        else if (dir === 'recibido') byMonth[m].compras += amount;
      });
      return Array.from({ length: 12 }, (_, i) => ({
        period: MONTH_NAMES_SHORT[i],
        ventas: byMonth[i]?.ventas ?? 0,
        compras: byMonth[i]?.compras ?? 0,
      }));
    }

    // Por mes: solo el mes seleccionado (una barra de ventas y una de compras)
    if (facturasPeriodType === 'month') {
      let ventas = 0;
      let compras = 0;
      filtered.forEach((inv) => {
        const d = new Date(inv.fechaEmision);
        if (d.getFullYear() !== facturasYear || d.getMonth() !== facturasMonth)
          return;
        const amount = getAmount(inv);
        const dir = inv.direccion;
        if (dir === 'emitido') ventas += amount;
        else if (dir === 'recibido') compras += amount;
      });
      const periodLabel = `${MONTH_NAMES[facturasMonth]} ${facturasYear}`;
      return [{ period: periodLabel, ventas, compras }];
    }

    if (
      facturasPeriodType === 'range' &&
      facturasDateRange?.from &&
      facturasDateRange?.to
    ) {
      const from = new Date(
        facturasDateRange.from.getFullYear(),
        facturasDateRange.from.getMonth(),
        1
      );
      const to = new Date(
        facturasDateRange.to.getFullYear(),
        facturasDateRange.to.getMonth(),
        1
      );
      const byMonthKey: Record<string, { ventas: number; compras: number }> =
        {};
      for (let t = from.getTime(); t <= to.getTime(); ) {
        const d = new Date(t);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonthKey[key] = { ventas: 0, compras: 0 };
        d.setMonth(d.getMonth() + 1);
        t = d.getTime();
      }
      filtered.forEach((inv) => {
        const d = new Date(inv.fechaEmision);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direccion;
        if (dir === 'emitido') byMonthKey[key].ventas += amount;
        else if (dir === 'recibido') byMonthKey[key].compras += amount;
      });
      return Object.entries(byMonthKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => {
          const [y, m] = key.split('-').map(Number);
          const label = `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
          return { period: label, ventas: data.ventas, compras: data.compras };
        });
    }

    if (facturasPeriodType === 'none') {
      const now = new Date();
      const byMonthKey: Record<string, { ventas: number; compras: number }> =
        {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonthKey[key] = { ventas: 0, compras: 0 };
      }
      filtered.forEach((inv) => {
        const d = new Date(inv.fechaEmision);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direccion;
        if (dir === 'emitido') byMonthKey[key].ventas += amount;
        else if (dir === 'recibido') byMonthKey[key].compras += amount;
      });
      return Object.entries(byMonthKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => {
          const [y, m] = key.split('-').map(Number);
          const label = `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
          return { period: label, ventas: data.ventas, compras: data.compras };
        });
    }

    return [];
  }, [
    allInvoicesData,
    facturasPeriodType,
    facturasYear,
    facturasMonth,
    facturasDateRange,
    selectedClientId,
    facturasTypeFilter,
    facturasDirectionFilter,
  ]);

  /** Datos del gráfico para el Resumen: últimos 12 meses (mes actual + 11 anteriores). */
  const resumenChartData = useMemo((): {
    period: string;
    ventas: number;
    compras: number;
  }[] => {
    const invoices = allInvoicesData?.comprobantes;
    if (!invoices?.length) return [];
    // Build the 12 month buckets: from (currentYear, currentMonth - 11) to (currentYear, currentMonth)
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed
    const buckets: {
      year: number;
      month: number;
      ventas: number;
      compras: number;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) {
        m += 12;
        y -= 1;
      }
      buckets.push({ year: y, month: m, ventas: 0, compras: 0 });
    }
    invoices.forEach((inv) => {
      if (
        effectiveResumenProfileId &&
        inv.clienteId !== effectiveResumenProfileId
      )
        return;
      const d = new Date(inv.fechaEmision);
      const bucket = buckets.find(
        (b) => b.year === d.getFullYear() && b.month === d.getMonth()
      );
      if (!bucket) return;
      let amount = parseFloat(inv.total || '0');
      if (inv.moneda?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.cotizacion || '1');
      const dir = inv.direccion;
      if (dir === 'emitido') bucket.ventas += amount;
      else if (dir === 'recibido') bucket.compras += amount;
    });
    return buckets.map((b) => ({
      period: MONTH_NAMES_SHORT[b.month],
      ventas: b.ventas,
      compras: b.compras,
    }));
  }, [allInvoicesData, effectiveResumenProfileId]);

  /** Totales del mes actual para el Resumen. */
  const resumenCurrentMonthStats = useMemo(() => {
    const invoices = allInvoicesData?.comprobantes;
    if (!invoices?.length) return { totalSales: 0, totalPurchases: 0 };
    const now = new Date();
    const { from, to } = getMonthBounds(now.getFullYear(), now.getMonth());
    const fromDate = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate()
    );
    const toDate = new Date(
      to.getFullYear(),
      to.getMonth(),
      to.getDate(),
      23,
      59,
      59,
      999
    );
    let totalSales = 0;
    let totalPurchases = 0;
    invoices.forEach((inv) => {
      if (
        effectiveResumenProfileId &&
        inv.clienteId !== effectiveResumenProfileId
      )
        return;
      const invDate = new Date(inv.fechaEmision);
      if (invDate < fromDate || invDate > toDate) return;
      let amount = parseFloat(inv.total || '0');
      if (inv.moneda?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.cotizacion || '1');
      const dir = inv.direccion;
      if (dir === 'emitido') totalSales += amount;
      else if (dir === 'recibido') totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [allInvoicesData, effectiveResumenProfileId]);

  // Calculate due date statistics
  const dueDateStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next7Days = new Date(today);
    next7Days.setDate(today.getDate() + 7);
    const next15Days = new Date(today);
    next15Days.setDate(today.getDate() + 15);
    const next30Days = new Date(today);
    next30Days.setDate(today.getDate() + 30);

    const futureDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today;
    });

    const overdueDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const next7DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next7Days;
    });

    const next15DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next15Days;
    });

    const next30DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.venceAt);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next30Days;
    });

    const sortedFuture = [...futureDueDates].sort(
      (a, b) => new Date(a.venceAt).getTime() - new Date(b.venceAt).getTime()
    );
    const nextDueDate = sortedFuture.length > 0 ? sortedFuture[0] : null;

    return {
      total: dueDates.length,
      future: futureDueDates.length,
      overdue: overdueDueDates.length,
      next7Days: next7DaysDueDates.length,
      next15Days: next15DaysDueDates.length,
      next30Days: next30DaysDueDates.length,
      nextDueDate,
    };
  }, [dueDates]);

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

  // Compute avatar initials from selected profile or representative name
  const headerDisplayName =
    selectedProfile?.razonSocial ?? client.nombre ?? '?';
  const clientInitials = headerDisplayName
    .split(/[\s\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

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
            name: client.nombre,
            cuit: client.cuit,
            fiscalCondition: selectedProfile?.condicionIva ?? null,
            status: client.estado,
          }}
        />
      )}
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-col"
      >
        {/* ── Sticky client header ── */}
        <div className="sticky top-0 z-10 bg-[var(--arca-bg)] border-b border-[var(--arca-border)] overflow-hidden">
          <div className="px-4 md:px-[28px] pt-[18px]">
            {/* Top row */}
            <div className="flex items-center gap-[14px] pb-[18px] pt-4">
              {/* Back */}
              <button
                onClick={() => navigate({ to: '/clients' })}
                className="w-[30px] h-[30px] shrink-0 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] transition-colors"
                title="Volver"
              >
                <ArrowLeft className="h-[14px] w-[14px]" />
              </button>
              {/* Avatar */}
              <div className="w-[36px] h-[36px] shrink-0 rounded-[var(--arca-r-md)] bg-[var(--arca-navy-900)] text-white text-[13px] font-bold inline-flex items-center justify-center select-none">
                {clientInitials}
              </div>
              {/* Name + meta */}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-[10px] min-w-0">
                  {profiles.length > 1 ? (
                    <Select
                      value={selectedClientId}
                      onValueChange={(v) => onClientChange(v)}
                      disabled={loadingProfiles}
                    >
                      <SelectTrigger
                        title="Cambiar empresa"
                        className="group h-auto w-fit max-w-full gap-2 border-0 bg-transparent p-0 shadow-none rounded-md hover:opacity-70 focus-visible:ring-0 transition-opacity [&>svg]:!size-[18px] [&>svg]:!opacity-40 [&>svg]:text-[var(--arca-ink-3)] group-hover:[&>svg]:!opacity-70"
                      >
                        <span className="font-display text-[24px] font-semibold tracking-tight text-[var(--arca-ink)] leading-none truncate">
                          {toTitleCase(selectedProfile?.razonSocial ?? client.nombre)}
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {toTitleCase(p.razonSocial) || p.cuit || p.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <h1 className="font-display text-[24px] font-semibold tracking-tight text-[var(--arca-ink)] leading-none truncate">
                      {toTitleCase(selectedProfile?.razonSocial ?? client.nombre)}
                    </h1>
                  )}
                </div>
                <div className="mt-[4px] flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[11.5px] text-[var(--arca-ink-3)]">
                  {selectedProfile?.cuit && (
                    <span className="font-mono">
                      CUIT {selectedProfile.cuit}
                    </span>
                  )}
                  <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                  <span className="truncate max-w-[220px]">
                    Representante: {toTitleCase(client.nombre)}
                  </span>
                  {selectedProfile?.condicionIva && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                      <span>{selectedProfile.condicionIva}</span>
                    </>
                  )}
                  {selectedProfile?.iibbRegimen && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                      <span>
                        {selectedProfile.iibbRegimen === 'convenio_multilateral'
                          ? 'Convenio multilateral'
                          : 'Régimen local'}
                      </span>
                    </>
                  )}
                  <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                  <span>
                    Alta{' '}
                    {new Date(client.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={scrapingAll || !!scrapingSection}
                  onClick={async () => {
                    setScrapingAll(true);
                    toast('Iniciando scrapeo');
                    const jobTypes = [
                      'deuda',
                      'vencimientos',
                      'iva',
                      'notificaciones',
                      'comprobantes_full',
                    ] as const;
                    let failed = 0;
                    try {
                      for (const jobType of jobTypes) {
                        try {
                          await scrapSingleJob({
                            data: { credencialId: representativeId, jobType },
                          });
                        } catch {
                          failed++;
                        }
                      }
                      if (failed === 0) {
                        toast.success('Scraping completado');
                      } else if (failed < jobTypes.length) {
                        toast.warning(
                          `Scraping parcial: ${failed} job(s) fallaron`
                        );
                      } else {
                        toast.error('Todos los jobs fallaron');
                      }
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Error al encolar scraping'
                      );
                    } finally {
                      setScrapingAll(false);
                    }
                  }}
                  title="Scrapear todo (deuda, vencimientos, IVA, notificaciones)"
                >
                  {scrapingAll ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                  Scrapear todo
                </Button>
                <button
                  onClick={() => setEditRepresentativeDialogOpen(true)}
                  className="w-[24px] h-[24px] shrink-0 rounded-[var(--arca-r-sm)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-3)] inline-flex items-center justify-center hover:bg-[var(--arca-surface-2)] transition-colors"
                  title="Editar"
                >
                  <Edit className="h-3 w-3" />
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
              <TabsTrigger value="perfiles" className={tabTriggerCls()}>
                <Building2 className="h-[14px] w-[14px]" />
                Perfiles
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="px-4 md:px-[28px] pt-3 pb-[60px]">
          {/* Resumen Tab */}
          <TabsContent value="resumen" className="mt-4 space-y-[14px]">
            {/* Row 1: Estado general (3fr) | Facturación (2fr) | IVA (2fr) */}
            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr_2fr] gap-[14px]">
              {/* Estado general */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[12px]">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Estado general
                  </span>
                </div>
                <div className="flex flex-col gap-[12px]">
                  {/* Deuda total */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[120px]">
                      Deuda total
                    </span>
                    <div className="flex-1 flex flex-col items-end">
                      <span className="font-display font-semibold text-[18px] leading-none tracking-tight tabular-nums text-[var(--arca-ink)]">
                        {new Intl.NumberFormat('es-AR', {
                          style: 'currency',
                          currency: 'ARS',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(debtStats.totalBalance)}
                      </span>
                      <span className="text-[10.5px] text-[var(--arca-ink-4)] mt-1">
                        {debtStats.totalDebts === 0
                          ? 'Sin deudas'
                          : `${debtStats.totalDebts} ${debtStats.totalDebts === 1 ? 'deuda' : 'deudas'}${
                              debtStats.overdueCount > 0
                                ? ` · ${debtStats.overdueCount} vencida${debtStats.overdueCount === 1 ? '' : 's'}`
                                : ''
                            }`}
                      </span>
                    </div>
                  </div>
                  <div className="h-px bg-[var(--arca-border)]" />
                  {/* Próximo vencimiento */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[120px]">
                      Próx. vencimiento
                    </span>
                    <span className="flex-1 font-display font-semibold text-[14px] leading-none tracking-tight tabular-nums text-right text-[var(--arca-ink)]">
                      {dueDateStats.nextDueDate
                        ? new Date(
                            dueDateStats.nextDueDate.venceAt
                          ).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </span>
                  </div>
                  <div className="h-px bg-[var(--arca-border)]" />
                  {/* Notificaciones pendientes */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[120px]">
                      Notif. pendientes
                    </span>
                    <span className="flex-1 font-display font-semibold text-[14px] leading-none tracking-tight tabular-nums text-right text-[var(--arca-ink)]">
                      {unreadNotifications?.notifications.length ?? 0}
                    </span>
                  </div>
                </div>
                {selectedResumenProfile && (
                  <div className="pt-[8px] mt-auto border-t border-[var(--arca-border)]">
                    <Link
                      to="/clients/$clientId/$profileId"
                      params={{
                        clientId: representativeId,
                        profileId: selectedResumenProfile.id,
                      }}
                      className="text-[12px] font-medium text-[var(--arca-navy-700)] hover:underline"
                    >
                      Ver perfil completo →
                    </Link>
                  </div>
                )}
              </div>

              {/* Facturación */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[12px]">
                <div className="flex items-center gap-2">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Facturación
                  </span>
                  <div className="flex-1" />
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {MONTH_NAMES[now.getMonth()].toLowerCase()}{' '}
                    {now.getFullYear()}
                  </span>
                </div>
                <div className="flex flex-col gap-[10px]">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[56px]">
                      Ventas
                    </span>
                    <span className="flex-1 font-display font-semibold text-[15px] leading-none tracking-tight text-[var(--arca-ink)] tabular-nums text-right">
                      {new Intl.NumberFormat('es-AR', {
                        style: 'currency',
                        currency: 'ARS',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(resumenCurrentMonthStats.totalSales)}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[56px]">
                      Compras
                    </span>
                    <span className="flex-1 font-display font-semibold text-[15px] leading-none tracking-tight text-[var(--arca-ink)] tabular-nums text-right">
                      {new Intl.NumberFormat('es-AR', {
                        style: 'currency',
                        currency: 'ARS',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(resumenCurrentMonthStats.totalPurchases)}
                    </span>
                  </div>
                  <div className="h-px bg-[var(--arca-border)]" />
                  {(() => {
                    const saldo =
                      resumenCurrentMonthStats.totalSales -
                      resumenCurrentMonthStats.totalPurchases;
                    return (
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[56px]">
                          Saldo
                        </span>
                        <span
                          className={cn(
                            'flex-1 font-display font-semibold text-[20px] leading-none tracking-tight tabular-nums text-right',
                            saldo < 0
                              ? 'text-[var(--arca-accent-neg-fg)]'
                              : 'text-[var(--arca-ink)]'
                          )}
                        >
                          {new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(saldo)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* IVA */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[12px]">
                <div className="flex items-center gap-2">
                  <BanknoteArrowUp className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    IVA
                  </span>
                  <div className="flex-1" />
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {periodoFiscalResumen
                      ? `${MONTH_NAMES[parseInt(periodoFiscalResumen.split('/')[0], 10) - 1].toLowerCase()} ${periodoFiscalResumen.split('/')[1]}`
                      : `${MONTH_NAMES[now.getMonth()].toLowerCase()} ${now.getFullYear()}`}
                  </span>
                </div>
                {loadingResumenClientIva ? (
                  <div className="flex items-center gap-2 text-[var(--arca-ink-4)] text-xs py-4">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </div>
                ) : !resumenClientIva?.data ? (
                  <div className="flex flex-col items-start gap-[8px] py-[18px]">
                    <div className="inline-flex items-center gap-[7px] px-[9px] py-1 rounded-[var(--arca-r-pill)] bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)] text-[11.5px] font-medium">
                      <span className="w-[6px] h-[6px] rounded-full bg-[var(--arca-accent-info)] shrink-0" />
                      Pendiente de carga
                    </div>
                    <div className="text-[13px] font-medium text-[var(--arca-ink-3)]">
                      Sin datos del período
                    </div>
                    <div className="text-[11.5px] text-[var(--arca-ink-4)]">
                      El IVA se publica el 5to día hábil del mes siguiente.
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-[10px]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[72px]">
                        Saldo técnico
                      </span>
                      <span
                        className={cn(
                          'flex-1 font-display font-semibold text-[15px] leading-none tracking-tight tabular-nums text-right',
                          Number(
                            resumenClientIva.data
                              .saldoTecnicoFavor ?? 0
                          ) > 0
                            ? 'text-[var(--arca-accent-pos-fg)]'
                            : 'text-[var(--arca-ink-3)]'
                        )}
                      >
                        {formatIvaCurrency(
                          resumenClientIva.data.saldoTecnicoFavor
                        )}
                      </span>
                    </div>
                    <div className="h-px bg-[var(--arca-border)]" />
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] min-w-[72px]">
                        Libre disp.
                      </span>
                      <span
                        className={cn(
                          'flex-1 font-display font-semibold text-[20px] leading-none tracking-tight tabular-nums text-right',
                          Number(
                            resumenClientIva.data
                              .saldoLibreDisponibilidadFavor ??
                              0
                          ) > 0
                            ? 'text-[var(--arca-accent-pos-fg)]'
                            : 'text-[var(--arca-ink-3)]'
                        )}
                      >
                        {formatIvaCurrency(
                          resumenClientIva.data
                            .saldoLibreDisponibilidadFavor
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: Chart (1.7fr) | Notificaciones (1fr) */}
            <div
              className={cn(
                'grid grid-cols-1 gap-[14px] items-stretch',
                resumenChartData.length > 0 ? 'md:grid-cols-[17fr_10fr]' : ''
              )}
            >
              {resumenChartData.length > 0 && (
                <div className="h-[300px] bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px_14px] flex flex-col gap-[12px]">
                  <div className="flex items-center gap-[10px]">
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
                        Ventas y compras
                      </div>
                      <div className="text-[11.5px] text-[var(--arca-ink-4)] mt-[2px]">
                        Últimos 12 meses · valores en ARS
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-[5px] text-[11px] text-[var(--arca-ink-3)]">
                      <span className="w-2 h-2 rounded-[2px] bg-[#1E3460] shrink-0" />
                      Ventas
                    </span>
                    <span className="inline-flex items-center gap-[5px] text-[11px] text-[var(--arca-ink-3)]">
                      <span className="w-2 h-2 rounded-[2px] bg-[#7AA2C8] shrink-0" />
                      Compras
                    </span>
                  </div>
                  <ChartContainer
                    config={facturasChartConfig}
                    className="flex-1 w-full min-h-0"
                  >
                    <BarChart
                      data={resumenChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      barCategoryGap={4}
                    >
                      <CartesianGrid
                        vertical={false}
                        strokeDasharray="3 4"
                        stroke="#ECEAE3"
                      />
                      <XAxis
                        dataKey="period"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#6E7079', fontSize: 9 }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#9B9CA3', fontSize: 9 }}
                        tickFormatter={(v) =>
                          v >= 1e6
                            ? `${(v / 1e6).toFixed(1)}M`
                            : v >= 1e3
                              ? `${(v / 1e3).toFixed(0)}k`
                              : String(v)
                        }
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(30,52,96,0.06)' }}
                        contentStyle={{
                          background: '#12131A',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 12px',
                        }}
                        labelStyle={{
                          color: '#9B9CA3',
                          fontSize: 10,
                          marginBottom: 4,
                        }}
                        itemStyle={{ color: '#E8E6DF', fontSize: 11 }}
                        formatter={(value) =>
                          new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          }).format(Number(value))
                        }
                      />
                      <Bar
                        dataKey="ventas"
                        fill="var(--color-ventas)"
                        name="Ventas"
                        maxBarSize={36}
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="compras"
                        fill="var(--color-compras)"
                        name="Compras"
                        maxBarSize={36}
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                </div>
              )}

              {/* Notificaciones */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[14px] min-h-[260px]">
                <div className="flex items-center gap-2 shrink-0">
                  <Bell className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Notificaciones
                  </span>
                  <div className="flex-1" />
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {unreadNotifications?.notifications.length ?? 0}
                  </span>
                </div>
                <div className="relative flex-1 min-h-0">
                  {loadingUnreadNotifications ? (
                    <div className="absolute inset-0 flex items-center gap-2 text-[var(--arca-ink-4)] text-xs justify-center">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando...
                    </div>
                  ) : !unreadNotifications?.notifications.length ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-[var(--arca-surface-2)] border border-[var(--arca-border)] flex items-center justify-center">
                        <Check className="h-4 w-4 text-[var(--arca-ink-4)]" />
                      </div>
                      <p className="text-[13px] text-[var(--arca-ink-3)] font-medium">
                        Sin notificaciones pendientes
                      </p>
                      <p className="text-[11.5px] text-[var(--arca-ink-4)]">
                        Te avisaremos cuando AFIP publique novedades.
                      </p>
                    </div>
                  ) : (
                    <div className="absolute inset-0 space-y-1.5 overflow-y-auto pr-1">
                      {unreadNotifications.notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="flex items-start gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 hover:bg-[var(--arca-bg)] transition-colors"
                        >
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => setResumenNotifSelected(notif)}
                          >
                            {notif.clienteRazonSocial && (
                              <div className="text-[9.5px] text-[var(--arca-ink-4)] mb-0.5 font-semibold uppercase tracking-[0.06em]">
                                {notif.clienteRazonSocial}
                              </div>
                            )}
                            <p className="text-[var(--arca-ink)] text-[12px] line-clamp-2 leading-snug">
                              {notif.mensaje}
                            </p>
                            <p className="text-[10px] font-mono text-[var(--arca-ink-4)] mt-0.5">
                              {notif.publicadaAt
                                ? format(
                                    new Date(notif.publicadaAt),
                                    'dd/MM/yyyy',
                                    { locale: es }
                                  )
                                : '—'}
                            </p>
                          </button>
                          <button
                            onClick={() => markOpenedMutation.mutate(notif.id)}
                            disabled={markOpenedMutation.isPending}
                            className="shrink-0 mt-0.5 text-[var(--arca-accent-pos)] hover:text-[var(--arca-accent-pos-fg)] transition-colors"
                            title="Marcar como leída"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/*
              La configuración de cierre de ejercicio se eliminó: la tabla
              `representative_balance_config` no existe en el modelo nuevo.
            */}
          </TabsContent>

          {/* Dialog: detalle de notificación no leída (Resumen) */}
          <Dialog
            open={!!resumenNotifSelected}
            onOpenChange={(open) => {
              if (!open) setResumenNotifSelected(null);
            }}
          >
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4 shrink-0" />
                  {resumenNotifSelected?.clienteRazonSocial
                    ? `Notificación — ${resumenNotifSelected.clienteRazonSocial}`
                    : 'Notificación'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {/* Fechas */}
                <div className="flex gap-6 text-xs text-muted-foreground">
                  {resumenNotifSelected?.publicadaAt && (
                    <span>
                      <span className="font-medium text-foreground">
                        Publicación:{' '}
                      </span>
                      {format(
                        new Date(resumenNotifSelected.publicadaAt),
                        'dd/MM/yyyy',
                        { locale: es }
                      )}
                    </span>
                  )}
                  {resumenNotifSelected?.venceAt && (
                    <span>
                      <span className="font-medium text-foreground">
                        Vencimiento:{' '}
                      </span>
                      {format(
                        new Date(resumenNotifSelected.venceAt),
                        'dd/MM/yyyy',
                        { locale: es }
                      )}
                    </span>
                  )}
                </div>
                {/* Mensaje completo */}
                <p className="leading-relaxed whitespace-pre-wrap">
                  {resumenNotifSelected?.mensaje}
                </p>
                {/* Acciones */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (resumenNotifSelected)
                        markOpenedMutation.mutate(resumenNotifSelected.id);
                      setResumenNotifSelected(null);
                    }}
                    disabled={markOpenedMutation.isPending}
                    className="gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Marcar como leída
                  </Button>
                  <DialogClose asChild>
                    <Button variant="ghost" size="sm">
                      Cerrar
                    </Button>
                  </DialogClose>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Deudas Tab */}
          <TabsContent value="deudas" className="space-y-[14px]">
            {/* KPI Cards */}
            {!loadingDebts && debts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
                {(
                  [
                    {
                      label: 'Total Deudas',
                      value: debtStats.totalBalance,
                      sub: `${debtStats.totalDebts} ${debtStats.totalDebts === 1 ? 'deuda' : 'deudas'}`,
                      accent: 'var(--arca-accent-neg)',
                    },
                    {
                      label: 'Total con Intereses',
                      value: debtStats.totalDebt,
                      sub: `+ ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(debtStats.totalCompensatoryInterest + debtStats.totalPunitiveInterest)} intereses`,
                      accent: 'var(--arca-accent-neg)',
                    },
                    {
                      label: 'Int. Compensatorio',
                      value: debtStats.totalCompensatoryInterest,
                      sub: null,
                      accent: 'var(--arca-accent-warn)',
                    },
                    {
                      label: 'Int. Punitorio',
                      value: debtStats.totalPunitiveInterest,
                      sub: null,
                      accent: 'var(--arca-accent-warn)',
                    },
                  ] as const
                ).map((kpi) => (
                  <div
                    key={kpi.label}
                    className="relative overflow-hidden bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_18px] flex flex-col gap-2"
                  >
                    <div
                      className="absolute left-0 top-[14px] bottom-[14px] w-[2px] rounded-[0_2px_2px_0]"
                      style={{ background: kpi.accent }}
                    />
                    <span className="pl-[6px] text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                      {kpi.label}
                    </span>
                    <div className="pl-[6px] font-display font-semibold text-[22px] leading-none tracking-tight text-[var(--arca-ink)] tabular-nums">
                      {new Intl.NumberFormat('es-AR', {
                        style: 'currency',
                        currency: 'ARS',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(kpi.value)}
                    </div>
                    {kpi.sub && (
                      <div className="pl-[6px] text-[11.5px] text-[var(--arca-ink-4)]">
                        {kpi.sub}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Actualizar deudas (acción) + última actualización */}
            <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[12px_18px] flex flex-col gap-[12px]">
              <div className="flex flex-wrap items-center gap-[14px]">
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[11.5px] text-[var(--arca-ink-4)]">
                    Últ. actualización{' '}
                    {lastDeudaJob?.createdAt ? (
                      <span
                        className={cn(
                          'font-mono',
                          lastDeudaJob.success
                            ? 'text-[var(--arca-accent-pos-fg)]'
                            : 'text-destructive'
                        )}
                        title={lastDeudaJob.failedReason ?? undefined}
                      >
                        {formatLastUpdateAt(lastDeudaJob.createdAt)}
                      </span>
                    ) : (
                      <span className="font-mono text-[var(--arca-ink-2)]">
                        —
                      </span>
                    )}
                  </span>
                  {lastDeudaJob &&
                    !lastDeudaJob.success &&
                    lastDeudaJob.failedReason && (
                      <p className="text-[11px] text-destructive max-w-md">
                        {lastDeudaJob.failedReason}
                      </p>
                    )}
                </div>
                <div className="flex-1" />
                <Button
                  size="sm"
                  disabled={!!scrapingSection}
                  onClick={async () => {
                    setScrapingSection('deudas');
                    try {
                      await scrapSingleJob({
                        data: { credencialId: representativeId, jobType: 'deuda' },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: ['representativeDebts', representativeId],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['lastDeudaJob', representativeId],
                        }),
                      ]);
                      toast.success('Deudas actualizadas correctamente');
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Error al actualizar deudas'
                      );
                      queryClient.invalidateQueries({
                        queryKey: ['lastDeudaJob', representativeId],
                      });
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                  className="bg-[var(--arca-ink)] hover:bg-black text-white text-[12.5px] h-8 px-3 rounded-[var(--arca-r-md)] shrink-0"
                >
                  {scrapingSection === 'deudas' ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Actualizando…
                    </>
                  ) : (
                    'Actualizar deudas'
                  )}
                </Button>
              </div>

              {/* Filtros de tabla (solo afectan la vista, no la actualización) */}
              {!loadingDebts && debts.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[8px] pt-[12px] border-t border-[var(--arca-border)]">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--arca-ink-3)]">
                    <ListFilter className="h-3.5 w-3.5 text-[var(--arca-ink-4)]" />
                    Filtrar
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--arca-ink-4)]">
                      Impuesto
                    </span>
                    <Select
                      value={debtFilterImpuesto || 'all'}
                      onValueChange={(v) => {
                        setDebtFilterImpuesto(v === 'all' ? '' : v);
                        setDebtPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 min-w-[140px] text-[12px] border-[var(--arca-border)] rounded-full bg-[var(--arca-surface-2)] hover:bg-[var(--arca-surface)] data-[state=open]:bg-[var(--arca-surface)] data-[state=open]:ring-1 data-[state=open]:ring-[var(--arca-border-strong)] transition-colors">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {debtFilterOptions.impuestos.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--arca-ink-4)]">
                      Concepto
                    </span>
                    <Select
                      value={debtFilterConcepto || 'all'}
                      onValueChange={(v) => {
                        setDebtFilterConcepto(v === 'all' ? '' : v);
                        setDebtPage(1);
                      }}
                    >
                      <SelectTrigger className="h-8 min-w-[140px] text-[12px] border-[var(--arca-border)] rounded-full bg-[var(--arca-surface-2)] hover:bg-[var(--arca-surface)] data-[state=open]:bg-[var(--arca-surface)] data-[state=open]:ring-1 data-[state=open]:ring-[var(--arca-border-strong)] transition-colors">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {debtFilterOptions.conceptos.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(debtFilterImpuesto || debtFilterConcepto) && (
                    <button
                      onClick={() => {
                        setDebtFilterImpuesto('');
                        setDebtFilterConcepto('');
                        setDebtPage(1);
                      }}
                      className="inline-flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Limpiar
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] overflow-hidden flex flex-col">
              <div className="px-[20px] py-[14px] border-b border-[var(--arca-border)] flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                  Deudas del cliente
                </span>
                {debts.length > 0 && (
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {filteredDebts.length} mostradas · {debts.length} totales
                  </span>
                )}
              </div>
              {loadingDebts ? (
                <div className="flex items-center justify-center h-32 text-[var(--arca-ink-4)] gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-[13px]">Cargando deudas...</span>
                </div>
              ) : debts.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-[13px] text-[var(--arca-ink-4)]">
                  No hay deudas registradas para este cliente
                </div>
              ) : filteredDebts.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-[13px] text-[var(--arca-ink-4)]">
                  No hay deudas que coincidan con los filtros
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full border-collapse text-[12.5px] [&_th]:!px-[10px] [&_td]:!px-[10px]"
                    style={{ minWidth: 880 }}
                  >
                    <thead>
                      <tr className="bg-[var(--arca-surface-2)]">
                        {[
                          { label: 'Impuesto', key: 'impuesto' as const },
                          { label: 'Concepto', key: 'concepto' as const },
                          { label: 'Período', key: 'periodo' as const },
                          { label: 'Vencimiento', key: 'venceAt' as const },
                          { label: 'Actualiz.', key: 'detectadaAt' as const },
                        ].map(({ label, key }) => (
                          <th
                            key={key}
                            className="px-[14px] py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap cursor-pointer select-none hover:text-[var(--arca-ink-2)] transition-colors"
                            onClick={() => {
                              if (debtSortKey === key) {
                                setDebtSortDir((d) =>
                                  d === 'asc' ? 'desc' : 'asc'
                                );
                              } else {
                                setDebtSortKey(key);
                                setDebtSortDir(
                                  key === 'detectadaAt' ? 'desc' : 'asc'
                                );
                              }
                              setDebtPage(1);
                            }}
                          >
                            {label}{' '}
                            {debtSortKey === key
                              ? debtSortDir === 'asc'
                                ? '▲'
                                : '▼'
                              : ''}
                          </th>
                        ))}
                        {(['Saldo', 'Int. Comp.', 'Int. Punit.'] as const).map(
                          (h) => (
                            <th
                              key={h}
                              className="px-[14px] py-[9px] text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap"
                            >
                              {h}
                            </th>
                          )
                        )}
                        <th className="px-[14px] py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap">
                          Estado
                        </th>
                        <th className="px-[14px] py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap">
                          Gestión
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedDebts.map((debt, i) => {
                        const balance = Number(debt.saldo || 0);
                        const intC = Number(debt.interesResarcitorio || 0);
                        const intP = Number(debt.interesPunitorio || 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const due = debt.venceAt
                          ? new Date(debt.venceAt)
                          : null;
                        due?.setHours(0, 0, 0, 0);
                        const debtStatus = debt.estado;
                        const isIntimated = debt.intimada ?? false;
                        const isOverdue = !!due && due < today && balance > 0;
                        // Row background: red=abierta+vencida, orange=intimada, green=pagada, gray=plan_pago, default=prescripta
                        const rowBg =
                          debtStatus === 'pagada'
                            ? 'rgba(34,197,94,0.06)'
                            : debtStatus === 'plan_pago'
                              ? 'rgba(148,163,184,0.10)'
                              : isIntimated
                                ? 'rgba(249,115,22,0.08)'
                                : isOverdue
                                  ? 'rgba(239,68,68,0.07)'
                                  : i % 2 === 1
                                    ? 'var(--arca-bg)'
                                    : undefined;
                        const fmtD = (v: number) =>
                          new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 2,
                          }).format(v);
                        return (
                          <tr
                            key={debt.id}
                            className="border-b border-[var(--arca-border)] hover:brightness-95 transition-colors cursor-default"
                            style={{ background: rowBg }}
                          >
                            <td
                              className="px-[14px] py-[10px] text-[var(--arca-ink)] font-medium"
                              title={debt.impuesto || '-'}
                            >
                              <span className="block max-w-[150px] truncate">
                                {debt.impuesto || '-'}
                              </span>
                            </td>
                            <td
                              className="px-[14px] py-[10px] text-[var(--arca-ink-2)]"
                              title={debt.concepto || '-'}
                            >
                              <span className="block max-w-[170px] truncate">
                                {debt.concepto || '-'}
                              </span>
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap font-mono text-[var(--arca-ink-3)]">
                              {debt.periodo || '-'}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap font-mono text-[var(--arca-ink-3)]">
                              {debt.venceAt
                                ? new Date(debt.venceAt).toLocaleDateString(
                                    'es-AR'
                                  )
                                : '-'}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap font-mono text-[10.5px] text-[var(--arca-ink-4)]">
                              {debt.detectadaAt
                                ? new Date(debt.detectadaAt).toLocaleDateString(
                                    'es-AR',
                                    {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: '2-digit',
                                    }
                                  )
                                : '-'}
                            </td>
                            <td
                              className={cn(
                                'px-[14px] py-[10px] whitespace-nowrap text-right font-mono tabular-nums',
                                balance === 0
                                  ? 'text-[var(--arca-ink-4)]'
                                  : 'text-[var(--arca-ink)] font-semibold'
                              )}
                            >
                              {fmtD(balance)}
                            </td>
                            <td
                              className={cn(
                                'px-[14px] py-[10px] whitespace-nowrap text-right font-mono tabular-nums',
                                intC === 0
                                  ? 'text-[var(--arca-ink-4)]'
                                  : 'text-[var(--arca-accent-warn-fg)]'
                              )}
                            >
                              {fmtD(intC)}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap text-right font-mono tabular-nums text-[var(--arca-ink-4)]">
                              {fmtD(intP)}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap">
                              {debtStatus === 'pagada' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]">
                                  Pagada
                                </span>
                              ) : debtStatus === 'plan_pago' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[rgba(148,163,184,0.25)] text-[var(--arca-ink-3)]">
                                  En plan
                                </span>
                              ) : debtStatus === 'prescripta' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[rgba(139,92,246,0.15)] text-[rgba(139,92,246,0.9)]">
                                  Prescripta
                                </span>
                              ) : isOverdue ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]">
                                  Vencida
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]">
                                  Abierta
                                </span>
                              )}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <Select
                                  value={debtStatus}
                                  onValueChange={(v) => {
                                    updateDebtStatusMutation.mutate({
                                      id: debt.id,
                                      estado: v as
                                        | 'abierta'
                                        | 'pagada'
                                        | 'plan_pago'
                                        | 'prescripta',
                                      intimada: isIntimated,
                                    });
                                  }}
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="w-[110px] text-[11.5px]"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="abierta">
                                      Abierta
                                    </SelectItem>
                                    <SelectItem value="plan_pago">
                                      En plan
                                    </SelectItem>
                                    <SelectItem value="pagada">
                                      Pagada
                                    </SelectItem>
                                    <SelectItem value="prescripta">
                                      Prescripta
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <button
                                  onClick={() =>
                                    updateDebtStatusMutation.mutate({
                                      id: debt.id,
                                      estado: debtStatus,
                                      intimada: !isIntimated,
                                    })
                                  }
                                  className={cn(
                                    'text-[11px] font-semibold px-2 py-1 rounded-[var(--arca-r-md)] border transition-colors',
                                    isIntimated
                                      ? 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200'
                                      : 'bg-[var(--arca-surface)] text-[var(--arca-ink-3)] border-[var(--arca-border-strong)] hover:bg-[var(--arca-surface-2)]'
                                  )}
                                  title={
                                    isIntimated
                                      ? 'Quitar intimación'
                                      : 'Marcar como intimada'
                                  }
                                >
                                  Intimada
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {debtTotalPages > 1 && (
                <div className="px-[20px] py-[10px] border-t border-[var(--arca-border)] flex items-center gap-[10px] text-[11.5px] text-[var(--arca-ink-4)]">
                  <span>
                    Mostrando {pagedDebts.length} de {filteredDebts.length}
                  </span>
                  <div className="flex-1" />
                  {(() => {
                    const { startPage, endPage } = getPageRange(
                      debtPage,
                      debtTotalPages
                    );
                    const visiblePages = Array.from(
                      { length: endPage - startPage + 1 },
                      (_, i) => startPage + i
                    );
                    return (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setDebtPage((p) => Math.max(1, p - 1))}
                          disabled={debtPage === 1}
                          className="px-2.5 py-1 text-[12px] border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] disabled:opacity-40 hover:bg-[var(--arca-surface-2)] transition-colors"
                        >
                          ←
                        </button>
                        {startPage > 1 && (
                          <>
                            <button
                              onClick={() => setDebtPage(1)}
                              className="px-2.5 py-1 text-[12px] rounded-[var(--arca-r-md)] hover:bg-[var(--arca-surface-2)] transition-colors"
                            >
                              1
                            </button>
                            {startPage > 2 && (
                              <span className="px-1 text-[var(--arca-ink-4)]">
                                …
                              </span>
                            )}
                          </>
                        )}
                        {visiblePages.map((page) => (
                          <button
                            key={page}
                            onClick={() => setDebtPage(page)}
                            className={cn(
                              'px-2.5 py-1 text-[12px] rounded-[var(--arca-r-md)] transition-colors',
                              debtPage === page
                                ? 'bg-[var(--arca-ink)] text-white font-semibold'
                                : 'hover:bg-[var(--arca-surface-2)]'
                            )}
                          >
                            {page}
                          </button>
                        ))}
                        {endPage < debtTotalPages && (
                          <>
                            {endPage < debtTotalPages - 1 && (
                              <span className="px-1 text-[var(--arca-ink-4)]">
                                …
                              </span>
                            )}
                            <button
                              onClick={() => setDebtPage(debtTotalPages)}
                              className="px-2.5 py-1 text-[12px] rounded-[var(--arca-r-md)] hover:bg-[var(--arca-surface-2)] transition-colors"
                            >
                              {debtTotalPages}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() =>
                            setDebtPage((p) => Math.min(debtTotalPages, p + 1))
                          }
                          disabled={debtPage === debtTotalPages}
                          className="px-2.5 py-1 text-[12px] border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] disabled:opacity-40 hover:bg-[var(--arca-surface-2)] transition-colors"
                        >
                          →
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Vencimientos Tab */}
          <TabsContent value="vencimientos" className="space-y-6">
            {/* Due Date Summary Cards */}
            {!loadingDueDates && dueDates.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-[var(--arca-ink)]" />
                      Vencimientos Futuros
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[var(--arca-ink)]">
                      {dueDateStats.future}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Próximos vencimientos
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <CalendarX className="h-4 w-4 text-[var(--arca-ink)]" />
                      Vencimientos Vencidos
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-[var(--arca-ink)]">
                      {dueDateStats.overdue}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Requieren atención
                    </p>
                  </CardContent>
                </Card>

                {dueDateStats.nextDueDate && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4 text-[var(--arca-ink)]" />
                        Próximo Vencimiento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold">
                        {new Date(
                          dueDateStats.nextDueDate.venceAt
                        ).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dueDateStats.nextDueDate.impuesto || 'Sin impuesto'}
                      </p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Próximos 30 Días
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {dueDateStats.next30Days}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vencimientos del mes
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Ult. actualización{' '}
                    {lastVencimientosJob?.createdAt ? (
                      <span
                        className={
                          lastVencimientosJob.success
                            ? 'text-[var(--arca-accent-pos-fg)] font-medium'
                            : 'text-destructive'
                        }
                        title={lastVencimientosJob.failedReason ?? undefined}
                      >
                        {formatLastUpdateAt(lastVencimientosJob.createdAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </p>
                  {lastVencimientosJob &&
                    !lastVencimientosJob.success &&
                    lastVencimientosJob.failedReason && (
                      <p className="text-[11px] text-destructive max-w-md">
                        {lastVencimientosJob.failedReason}
                      </p>
                    )}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!!scrapingSection}
                  onClick={async () => {
                    setScrapingSection('vencimientos');
                    try {
                      await scrapSingleJob({
                        data: { credencialId: representativeId, jobType: 'vencimientos' },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: [
                            'representativeDueDates',
                            representativeId,
                          ],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['lastVencimientosJob', representativeId],
                        }),
                      ]);
                      toast.success('Vencimientos actualizados correctamente');
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Error al actualizar vencimientos'
                      );
                      queryClient.invalidateQueries({
                        queryKey: ['lastVencimientosJob', representativeId],
                      });
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                >
                  {scrapingSection === 'vencimientos' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Actualizando…
                    </>
                  ) : (
                    'Actualizar Vencimientos'
                  )}
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Vencimientos del Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDueDates ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">
                      Cargando vencimientos...
                    </div>
                  </div>
                ) : dueDates.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">
                      No hay vencimientos registrados para este cliente
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-md border overflow-x-auto">
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[14%]">Impuesto</TableHead>
                            <TableHead className="w-[16%]">Concepto</TableHead>
                            <TableHead className="w-[16%]">
                              Subconcepto
                            </TableHead>
                            <TableHead className="w-[10%]">Período</TableHead>
                            <TableHead className="w-[7%]">Cuota</TableHead>
                            <TableHead className="w-[12%]">
                              Vencimiento
                            </TableHead>
                            <TableHead className="w-[25%]">Detalle</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedDueDates.map((dueDate) => (
                            <TableRow key={dueDate.id}>
                              <TableCell
                                className="font-medium truncate"
                                title={dueDate.impuesto || '-'}
                              >
                                {dueDate.impuesto || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.concepto || '-'}
                              >
                                {dueDate.concepto || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.subConcepto || '-'}
                              >
                                {dueDate.subConcepto || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.periodo || '-'}
                              >
                                {dueDate.periodo || '-'}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-center">
                                {dueDate.cuota || '-'}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {new Date(dueDate.venceAt).toLocaleDateString(
                                  'es-AR'
                                )}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.detalle || '-'}
                              >
                                {dueDate.detalle || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {dueDateTotalPages > 1 &&
                      (() => {
                        const { startPage, endPage } = getPageRange(
                          dueDatePage,
                          dueDateTotalPages
                        );
                        const visiblePages = Array.from(
                          { length: endPage - startPage + 1 },
                          (_, i) => startPage + i
                        );
                        return (
                          <div className="flex justify-center w-full min-w-0">
                            <Pagination>
                              <PaginationContent className="flex-wrap justify-center">
                                <PaginationItem>
                                  <PaginationPrevious
                                    onClick={() =>
                                      setDueDatePage((p) => Math.max(1, p - 1))
                                    }
                                    className={
                                      dueDatePage === 1
                                        ? 'pointer-events-none opacity-50'
                                        : 'cursor-pointer'
                                    }
                                  />
                                </PaginationItem>
                                {startPage > 1 && (
                                  <>
                                    <PaginationItem>
                                      <PaginationLink
                                        onClick={() => setDueDatePage(1)}
                                        className="cursor-pointer"
                                      >
                                        1
                                      </PaginationLink>
                                    </PaginationItem>
                                    {startPage > 2 && (
                                      <PaginationItem>
                                        <span className="px-2">...</span>
                                      </PaginationItem>
                                    )}
                                  </>
                                )}
                                {visiblePages.map((page) => (
                                  <PaginationItem key={page}>
                                    <PaginationLink
                                      onClick={() => setDueDatePage(page)}
                                      isActive={dueDatePage === page}
                                      className="cursor-pointer"
                                    >
                                      {page}
                                    </PaginationLink>
                                  </PaginationItem>
                                ))}
                                {endPage < dueDateTotalPages && (
                                  <>
                                    {endPage < dueDateTotalPages - 1 && (
                                      <PaginationItem>
                                        <span className="px-2">...</span>
                                      </PaginationItem>
                                    )}
                                    <PaginationItem>
                                      <PaginationLink
                                        onClick={() =>
                                          setDueDatePage(dueDateTotalPages)
                                        }
                                        className="cursor-pointer"
                                      >
                                        {dueDateTotalPages}
                                      </PaginationLink>
                                    </PaginationItem>
                                  </>
                                )}
                                <PaginationItem>
                                  <PaginationNext
                                    onClick={() =>
                                      setDueDatePage((p) =>
                                        Math.min(dueDateTotalPages, p + 1)
                                      )
                                    }
                                    className={
                                      dueDatePage === dueDateTotalPages
                                        ? 'pointer-events-none opacity-50'
                                        : 'cursor-pointer'
                                    }
                                  />
                                </PaginationItem>
                              </PaginationContent>
                            </Pagination>
                          </div>
                        );
                      })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notificaciones Tab - mismo formato que la vista del navbar */}
          <TabsContent value="notificaciones" className="space-y-3 mt-4">
            <div className="rounded-lg border bg-card px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <p className="text-xs text-muted-foreground">
                    Ult. actualización{' '}
                    {lastNotificacionesJob?.createdAt ? (
                      <span
                        className={
                          lastNotificacionesJob.success
                            ? 'text-[var(--arca-accent-pos-fg)] font-medium'
                            : 'text-destructive'
                        }
                        title={lastNotificacionesJob.failedReason ?? undefined}
                      >
                        {formatLastUpdateAt(lastNotificacionesJob.createdAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </p>
                  {lastNotificacionesJob &&
                    !lastNotificacionesJob.success &&
                    lastNotificacionesJob.failedReason && (
                      <p className="text-[11px] text-destructive max-w-md">
                        {lastNotificacionesJob.failedReason}
                      </p>
                    )}
                  {lastNotificacionesJob?.notificationFetchWarning && (
                    <p className="text-[11px] text-[var(--arca-accent-warn-fg)] max-w-md mt-0.5">
                      {lastNotificacionesJob.notificationFetchWarning}
                    </p>
                  )}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!!scrapingSection}
                  onClick={async () => {
                    setScrapingSection('notificaciones');
                    try {
                      await scrapSingleJob({
                        data: { credencialId: representativeId, jobType: 'notificaciones' },
                      });
                      await queryClient.invalidateQueries({
                        queryKey: [
                          'clientNotifications',
                          orgKey,
                          representativeId,
                        ],
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ['lastNotificacionesJob', representativeId],
                      });
                      toast.success(
                        'Notificaciones actualizadas correctamente'
                      );
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Error al actualizar notificaciones'
                      );
                      queryClient.invalidateQueries({
                        queryKey: ['lastNotificacionesJob', representativeId],
                      });
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                >
                  {scrapingSection === 'notificaciones' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Actualizando…
                    </>
                  ) : (
                    'Actualizar Notificaciones'
                  )}
                </Button>
              </div>
            </div>
            <NotificationsView
              clientId={representativeId}
              profileId={selectedClientId}
              className="min-h-[500px]"
            />
          </TabsContent>

          {/* Facturas Tab */}
          <TabsContent value="facturas" className="space-y-6">
            {/* <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              disabled={!!scrapingSection}
              onClick={async () => {
                setScrapingSection("facturas");
                try {
                  await scrapSingleJob({
                    data: { credencialId: representativeId, jobType: "comprobantes" },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["clientAllInvoices", representativeId] }),
                    queryClient.invalidateQueries({ queryKey: ["invoices"] }),
                    queryClient.invalidateQueries({ queryKey: ["lastComprobantesFullJob", representativeId] }),
                  ]);
                  toast.success("Facturas (comprobantes) actualizadas correctamente");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Error al actualizar facturas"
                  );
                } finally {
                  setScrapingSection(null);
                }
              }}
            >
              {scrapingSection === "facturas" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Actualizando…
                </>
              ) : (
                "Actualizar Facturas"
              )}
            </Button>
          </div> */}
            <div className="rounded-lg border bg-card p-4 space-y-4">
              {/* Fila 1: solo botón Actualizar Facturas */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Ult. actualización{' '}
                    {lastComprobantesJob?.createdAt ? (
                      <span
                        className={
                          lastComprobantesJob.success
                            ? 'text-[var(--arca-accent-pos-fg)] font-medium'
                            : 'text-destructive'
                        }
                        title={lastComprobantesJob.failedReason ?? undefined}
                      >
                        {formatLastUpdateAt(lastComprobantesJob.createdAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </p>
                  {lastComprobantesJob &&
                    !lastComprobantesJob.success &&
                    lastComprobantesJob.failedReason && (
                      <p className="text-[11px] text-destructive max-w-md">
                        {lastComprobantesJob.failedReason}
                      </p>
                    )}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  disabled={!!scrapingSection}
                  onClick={async () => {
                    setScrapingSection('facturas');
                    try {
                      await scrapSingleJob({
                        data: { credencialId: representativeId, jobType: 'comprobantes' },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: ['clientAllInvoices', representativeId],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['invoices'],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: [
                            'lastComprobantesFullJob',
                            representativeId,
                          ],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['lastComprobantesJob', representativeId],
                        }),
                      ]);
                      toast.success(
                        'Facturas (comprobantes) actualizadas correctamente'
                      );
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : 'Error al actualizar facturas'
                      );
                      queryClient.invalidateQueries({
                        queryKey: ['lastComprobantesJob', representativeId],
                      });
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                >
                  {scrapingSection === 'facturas' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Actualizando…
                    </>
                  ) : (
                    'Actualizar Facturas'
                  )}
                </Button>
              </div>

              {/* Fila 2: filtros */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">
                  Período:
                </span>
                <Select
                  value={facturasPeriodType}
                  onValueChange={(v) => {
                    setFacturasPeriodType(
                      v as 'none' | 'year' | 'month' | 'range'
                    );
                    setFacturasPeriodPickerOpen(false);
                  }}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin período</SelectItem>
                    <SelectItem value="year">Por año</SelectItem>
                    <SelectItem value="month">Por mes</SelectItem>
                    <SelectItem value="range">Rango de días</SelectItem>
                  </SelectContent>
                </Select>
                {facturasPeriodType === 'year' && (
                  <Select
                    value={String(facturasYear)}
                    onValueChange={(v) => setFacturasYear(Number(v))}
                  >
                    <SelectTrigger className="w-[100px] h-9">
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
                )}
                {facturasPeriodType === 'month' && (
                  <Popover
                    open={facturasPeriodPickerOpen}
                    onOpenChange={setFacturasPeriodPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 min-w-[160px] justify-start text-left font-normal px-3"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        <span className="text-sm">{`${MONTH_NAMES[facturasMonth]} ${facturasYear}`}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="start">
                      <div className="space-y-3">
                        <Select
                          value={String(facturasYear)}
                          onValueChange={(v) => {
                            const y = Number(v);
                            const newMax =
                              y === now.getFullYear() ? now.getMonth() : 11;
                            setFacturasYear(y);
                            setFacturasMonth((m) => Math.min(m, newMax));
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
                          {Array.from(
                            {
                              length:
                                facturasYear === now.getFullYear()
                                  ? now.getMonth() + 1
                                  : 12,
                            },
                            (_, i) => i
                          ).map((i) => (
                            <Button
                              key={i}
                              variant={
                                facturasMonth === i ? 'default' : 'outline'
                              }
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => {
                                setFacturasMonth(i);
                                setFacturasPeriodPickerOpen(false);
                              }}
                            >
                              {MONTH_NAMES_SHORT[i]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                {facturasPeriodType === 'range' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'h-9 min-w-[200px] justify-start text-left font-normal',
                          !facturasDateRange?.from && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                        {facturasDateRange?.from
                          ? facturasDateRange?.to
                            ? `${format(facturasDateRange.from, 'dd/MM/yyyy', { locale: es })} – ${format(facturasDateRange.to, 'dd/MM/yyyy', { locale: es })}`
                            : format(facturasDateRange.from, 'dd/MM/yyyy', {
                                locale: es,
                              })
                          : 'Elegir fechas'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <DateRangeCalendar
                        mode="range"
                        defaultMonth={facturasDateRange?.from}
                        selected={facturasDateRange}
                        onSelect={setFacturasDateRange}
                        numberOfMonths={2}
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                <span className="text-sm text-muted-foreground shrink-0">
                  Tipo:
                </span>
                <Select
                  value={facturasTypeFilter}
                  onValueChange={setFacturasTypeFilter}
                >
                  <SelectTrigger className="w-[220px] h-9">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">Todas las facturas</SelectItem>
                    {Object.entries(INVOICE_TYPE_LABELS)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <span className="text-sm text-muted-foreground shrink-0">
                  Dirección:
                </span>
                <Select
                  value={facturasDirectionFilter}
                  onValueChange={setFacturasDirectionFilter}
                >
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="Dirección" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="Outbound">Emitida</SelectItem>
                    <SelectItem value="Inbound">Recibida</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fila 3: búsqueda por emisor/receptor y exportar Excel */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar mediante emisor o receptor..."
                    value={facturasSearchTerm}
                    onChange={(e) => setFacturasSearchTerm(e.target.value)}
                    className="pl-8 w-full md:w-80"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => invoicesTableRef.current?.exportExcel()}
                  className="h-9 gap-1.5 shrink-0 font-normal"
                >
                  <Download className="h-4 w-4" />
                  <span>Excel</span>
                </Button>
              </div>
            </div>

            {/* Resumen Ventas/Compras (1/3) + Gráfico (2/3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-full">
              <Card className="overflow-hidden min-h-[7.25rem]">
                <CardContent className="py-4 px-4 space-y-4">
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Total ventas
                    </div>
                    <div className="text-xl font-bold tabular-nums break-all">
                      {invoiceStatsFiltered == null
                        ? '—'
                        : new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(invoiceStatsFiltered.totalSales)}
                    </div>
                    {facturasVariationPct?.salesPct !== undefined && (
                      <div
                        className={cn(
                          'text-xs mt-0.5',
                          facturasVariationPct.salesPct === 0
                            ? 'text-muted-foreground'
                            : facturasVariationPct.salesPct !== null &&
                                facturasVariationPct.salesPct > 0
                              ? 'text-[var(--arca-accent-pos-fg)]'
                              : 'text-[var(--arca-accent-neg-fg)]'
                        )}
                      >
                        {facturasVariationPct.salesPct === null
                          ? '—'
                          : facturasVariationPct.salesPct >= 0
                            ? `+${facturasVariationPct.salesPct.toFixed(1)}%`
                            : `${facturasVariationPct.salesPct.toFixed(1)}%`}{' '}
                        vs{' '}
                        {facturasPeriodType === 'month'
                          ? 'mes ant.'
                          : 'año ant.'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Total compras
                    </div>
                    <div className="text-xl font-bold tabular-nums break-all">
                      {invoiceStatsFiltered == null
                        ? '—'
                        : new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(invoiceStatsFiltered.totalPurchases)}
                    </div>
                    {facturasVariationPct?.purchasesPct !== undefined && (
                      <div
                        className={cn(
                          'text-xs mt-0.5',
                          facturasVariationPct.purchasesPct === 0
                            ? 'text-muted-foreground'
                            : facturasVariationPct.purchasesPct !== null &&
                                facturasVariationPct.purchasesPct > 0
                              ? 'text-[var(--arca-accent-pos-fg)]'
                              : 'text-[var(--arca-accent-neg-fg)]'
                        )}
                      >
                        {facturasVariationPct.purchasesPct === null
                          ? '—'
                          : facturasVariationPct.purchasesPct >= 0
                            ? `+${facturasVariationPct.purchasesPct.toFixed(1)}%`
                            : `${facturasVariationPct.purchasesPct.toFixed(1)}%`}{' '}
                        vs{' '}
                        {facturasPeriodType === 'month'
                          ? 'mes ant.'
                          : 'año ant.'}
                      </div>
                    )}
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Ventas − Compras
                    </div>
                    <div
                      className={cn(
                        'text-xl font-bold tabular-nums break-all',
                        invoiceStatsFiltered != null &&
                          invoiceStatsFiltered.totalSales -
                            invoiceStatsFiltered.totalPurchases <
                            0
                          ? 'text-[var(--arca-accent-neg-fg)]'
                          : 'text-foreground'
                      )}
                    >
                      {invoiceStatsFiltered == null
                        ? '—'
                        : new Intl.NumberFormat('es-AR', {
                            style: 'currency',
                            currency: 'ARS',
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(
                            invoiceStatsFiltered.totalSales -
                              invoiceStatsFiltered.totalPurchases
                          )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Gráfico Ventas / Compras — 2/3 de la fila */}
              {facturasChartData.length > 0 && (
                <Card className="min-h-[7.25rem] md:col-span-2">
                  <CardHeader className="py-1.5 px-3">
                    <CardTitle className="text-sm font-semibold">
                      Ventas y compras{' '}
                      {facturasPeriodType === 'year'
                        ? 'por mes del año'
                        : facturasPeriodType === 'month'
                          ? 'del mes seleccionado'
                          : facturasPeriodType === 'range'
                            ? 'por mes (rango)'
                            : 'últimos 12 meses'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 pb-2">
                    <ChartContainer
                      config={facturasChartConfig}
                      className="h-[160px] w-full"
                    >
                      <BarChart
                        data={facturasChartData}
                        margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                        barCategoryGap={4}
                      >
                        <CartesianGrid
                          vertical={false}
                          strokeDasharray="3 4"
                          stroke="#ECEAE3"
                        />
                        <XAxis
                          dataKey="period"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#6E7079', fontSize: 9 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#9B9CA3', fontSize: 9 }}
                          tickFormatter={(v) =>
                            v >= 1e6
                              ? `${(v / 1e6).toFixed(1)}M`
                              : v >= 1e3
                                ? `${(v / 1e3).toFixed(0)}k`
                                : String(v)
                          }
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(30,52,96,0.06)' }}
                          contentStyle={{
                            background: '#12131A',
                            border: 'none',
                            borderRadius: 8,
                            padding: '8px 12px',
                          }}
                          labelStyle={{
                            color: '#9B9CA3',
                            fontSize: 10,
                            marginBottom: 4,
                          }}
                          itemStyle={{ color: '#E8E6DF', fontSize: 11 }}
                          formatter={(value) =>
                            new Intl.NumberFormat('es-AR', {
                              style: 'currency',
                              currency: 'ARS',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            }).format(Number(value))
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar
                          dataKey="ventas"
                          fill="var(--color-ventas)"
                          name="Ventas"
                          maxBarSize={36}
                          radius={[2, 2, 0, 0]}
                        />
                        <Bar
                          dataKey="compras"
                          fill="var(--color-compras)"
                          name="Compras"
                          maxBarSize={36}
                          radius={[2, 2, 0, 0]}
                        />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              )}
            </div>

            <InvoicesTable
              ref={invoicesTableRef}
              clientId={representativeId}
              profileId={selectedClientId}
              controlledDateFrom={facturasBounds.dateFrom}
              controlledDateTo={facturasBounds.dateTo}
              controlledProfileFilter={selectedClientId ?? 'all'}
              controlledTypeFilter={facturasTypeFilter}
              controlledDirectionFilter={facturasDirectionFilter}
              controlledSearchTerm={facturasDebouncedSearchTerm}
              onFiltersChange={facturasOnFiltersChange}
            />
          </TabsContent>

          {/* Convenio Multilateral Tab */}
          <TabsContent value="convenio-multilateral" className="space-y-6">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 shrink-0" />
                <h3 className="font-semibold text-lg">
                  Convenio Multilateral (ventas por provincia)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">
                    Período:
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="h-9 px-3 text-xs font-normal"
                      >
                        {multilateralPeriod
                          ? `${MONTH_NAMES_SHORT[multilateralSelectedMonth]} ${multilateralSelectedYear}`
                          : 'Sin filtro'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4" align="end">
                      <div className="space-y-3">
                        <Select
                          value={String(multilateralSelectedYear)}
                          onValueChange={(v) => {
                            const y = Number(v);
                            const newMax =
                              y === now.getFullYear() ? now.getMonth() : 11;
                            const m = Math.min(
                              multilateralSelectedMonth,
                              newMax
                            );
                            const range = getMonthBounds(y, m);
                            setMultilateralPeriod(range);
                            setMultilateralDateFrom(
                              range.from.toISOString().slice(0, 10)
                            );
                            setMultilateralDateTo(
                              range.to.toISOString().slice(0, 10)
                            );
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
                          {multilateralAvailableMonthIndices.map((i) => (
                            <Button
                              key={i}
                              variant={
                                multilateralSelectedMonth === i
                                  ? 'default'
                                  : 'outline'
                              }
                              size="sm"
                              className="text-xs h-8"
                              onClick={() => {
                                const range = getMonthBounds(
                                  multilateralSelectedYear,
                                  i
                                );
                                setMultilateralPeriod(range);
                                setMultilateralDateFrom(
                                  range.from.toISOString().slice(0, 10)
                                );
                                setMultilateralDateTo(
                                  range.to.toISOString().slice(0, 10)
                                );
                              }}
                            >
                              {MONTH_NAMES_SHORT[i]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                {multilateralPeriod && multilateralPrevPeriod && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Provincias con actividad
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold">
                          {multilateralAggCurrent.provinces}
                        </div>
                        <MetricDelta
                          current={multilateralAggCurrent.provinces}
                          previous={multilateralAggPrev.provinces}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Cantidad de comprobantes
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold">
                          {multilateralAggCurrent.invoices}
                        </div>
                        <MetricDelta
                          current={multilateralAggCurrent.invoices}
                          previous={multilateralAggPrev.invoices}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Total IVA del período
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold">
                          {formatIvaCurrency(multilateralAggCurrent.totalIVA)}
                        </div>
                        <MetricDelta
                          current={multilateralAggCurrent.totalIVA}
                          previous={multilateralAggPrev.totalIVA}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">
                          Base imponible del período
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-semibold">
                          {formatIvaCurrency(multilateralAggCurrent.totalBase)}
                        </div>
                        <MetricDelta
                          current={multilateralAggCurrent.totalBase}
                          previous={multilateralAggPrev.totalBase}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Gráficos: Actual vs Anterior */}
                {multilateralPeriod && multilateralPrevPeriod && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
                    {convenioActividadChartData.length > 0 && (
                      <Card className="overflow-hidden">
                        <CardHeader className="py-2 px-4">
                          <CardTitle className="text-sm font-semibold">
                            Actividad: período actual vs anterior
                          </CardTitle>
                          <p className="text-xs text-muted-foreground font-normal">
                            Provincias con actividad y cantidad de comprobantes
                          </p>
                        </CardHeader>
                        <CardContent className="pt-0 px-4 pb-4">
                          <ChartContainer
                            config={convenioChartConfig}
                            className="h-[180px] w-full"
                          >
                            <BarChart
                              data={convenioActividadChartData}
                              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                              barCategoryGap={12}
                            >
                              <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 4"
                                stroke="#ECEAE3"
                              />
                              <XAxis
                                dataKey="metrica"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#6E7079', fontSize: 10 }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#9B9CA3', fontSize: 9 }}
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(30,52,96,0.06)' }}
                                contentStyle={{
                                  background: '#12131A',
                                  border: 'none',
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                }}
                                labelStyle={{
                                  color: '#9B9CA3',
                                  fontSize: 10,
                                  marginBottom: 4,
                                }}
                                itemStyle={{ color: '#E8E6DF', fontSize: 11 }}
                                formatter={(value) => String(value)}
                              />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar
                                dataKey="actual"
                                fill="var(--color-actual)"
                                name="Período actual"
                                maxBarSize={36}
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="anterior"
                                fill="var(--color-anterior)"
                                name="Período anterior"
                                maxBarSize={36}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ChartContainer>
                        </CardContent>
                      </Card>
                    )}
                    {convenioMontosChartData.length > 0 && (
                      <Card className="overflow-hidden">
                        <CardHeader className="py-2 px-4">
                          <CardTitle className="text-sm font-semibold">
                            Montos: período actual vs anterior
                          </CardTitle>
                          <p className="text-xs text-muted-foreground font-normal">
                            Total IVA y base imponible (ARS)
                          </p>
                        </CardHeader>
                        <CardContent className="pt-0 px-4 pb-4">
                          <ChartContainer
                            config={convenioChartConfig}
                            className="h-[180px] w-full"
                          >
                            <BarChart
                              data={convenioMontosChartData}
                              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                              barCategoryGap={12}
                            >
                              <CartesianGrid
                                vertical={false}
                                strokeDasharray="3 4"
                                stroke="#ECEAE3"
                              />
                              <XAxis
                                dataKey="metrica"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#6E7079', fontSize: 10 }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#9B9CA3', fontSize: 9 }}
                                tickFormatter={(v) =>
                                  v >= 1e6
                                    ? `${(v / 1e6).toFixed(1)}M`
                                    : v >= 1e3
                                      ? `${(v / 1e3).toFixed(0)}k`
                                      : String(v)
                                }
                              />
                              <Tooltip
                                cursor={{ fill: 'rgba(30,52,96,0.06)' }}
                                contentStyle={{
                                  background: '#12131A',
                                  border: 'none',
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                }}
                                labelStyle={{
                                  color: '#9B9CA3',
                                  fontSize: 10,
                                  marginBottom: 4,
                                }}
                                itemStyle={{ color: '#E8E6DF', fontSize: 11 }}
                                formatter={(value) =>
                                  new Intl.NumberFormat('es-AR', {
                                    style: 'currency',
                                    currency: 'ARS',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  }).format(Number(value))
                                }
                              />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar
                                dataKey="actual"
                                fill="var(--color-actual)"
                                name="Período actual"
                                maxBarSize={36}
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="anterior"
                                fill="var(--color-anterior)"
                                name="Período anterior"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ChartContainer>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {loadingMultilateralSummary ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Cargando ventas por provincia…</span>
                  </div>
                ) : multilateralSummary.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">
                      No hay facturas emitidas registradas para este cliente
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Provincia</TableHead>
                          <TableHead className="text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none"
                              onClick={() => toggleMultilateralSort('count')}
                            >
                              Cant. comprobantes
                              {multilateralSortKey === 'count' &&
                                (multilateralSortDir === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                ))}
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none"
                              onClick={() => toggleMultilateralSort('iva')}
                            >
                              Total IVA
                              {multilateralSortKey === 'iva' &&
                                (multilateralSortDir === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                ))}
                            </button>
                          </TableHead>
                          <TableHead className="text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none"
                              onClick={() => toggleMultilateralSort('base')}
                            >
                              Base imponible (amount_taxed)
                              {multilateralSortKey === 'base' &&
                                (multilateralSortDir === 'asc' ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                ))}
                            </button>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedMultilateralSummary.map((row: any) => {
                          const provinceLabel =
                            row.receiptProvince || 'Capital Federal';
                          const provinceValue = row.receiptProvince ?? null; // null para agrupar "Capital Federal"
                          return (
                            <TableRow
                              key={provinceLabel}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedMultilateralProvince(provinceValue);
                                setSelectedMultilateralProvinceLabel(
                                  provinceLabel
                                );
                                setMultilateralDetailOpen(true);
                              }}
                            >
                              <TableCell className="font-medium">
                                {provinceLabel}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.invoiceCount}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatIvaCurrency(row.totalIVA)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatIvaCurrency(row.totalTaxed)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* IVA Tab */}
          <TabsContent value="iva" className="">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">
                    Ult. actualización{' '}
                    {lastIvaJob?.createdAt ? (
                      <span
                        className={
                          lastIvaJob.success
                            ? 'text-[var(--arca-accent-pos-fg)] font-medium'
                            : 'text-destructive'
                        }
                        title={lastIvaJob.failedReason ?? undefined}
                      >
                        {formatLastUpdateAt(lastIvaJob.createdAt)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </p>
                  {lastIvaJob &&
                    !lastIvaJob.success &&
                    lastIvaJob.failedReason && (
                      <p className="text-[11px] text-destructive max-w-md">
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
                          <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
                            Actualizar IVA
                          </h3>
                          <p className="text-[12px] leading-relaxed text-[var(--arca-ink-4)] mt-1">
                            Si las facturas ya están al día, podés scrapear solo
                            IVA para ir más rápido.
                          </p>
                        </div>
                        <div className="px-3 pb-3 space-y-1.5">
                          <DialogClose asChild>
                            <button
                              className="w-full flex items-start gap-3 rounded-[var(--arca-r-md,10px)] px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] border border-transparent hover:border-[var(--arca-border)] cursor-pointer group"
                              onClick={async () => {
                                setScrapingSection('iva');
                                try {
                                  await scrapSingleJob({
                                    data: {
                                      credencialId: representativeId,
                                      jobType: 'comprobantes',
                                    },
                                  });
                                  await scrapSingleJob({
                                    data: { credencialId: representativeId, jobType: 'iva' },
                                  });
                                  await Promise.all([
                                    queryClient.invalidateQueries({
                                      queryKey: ['clientIva', representativeId],
                                    }),
                                    queryClient.invalidateQueries({
                                      queryKey: [
                                        'clientAllInvoices',
                                        representativeId,
                                      ],
                                    }),
                                    queryClient.invalidateQueries({
                                      queryKey: ['invoices'],
                                    }),
                                    queryClient.invalidateQueries({
                                      queryKey: [
                                        'lastComprobantesFullJob',
                                        representativeId,
                                      ],
                                    }),
                                    queryClient.invalidateQueries({
                                      queryKey: [
                                        'lastIvaJob',
                                        representativeId,
                                      ],
                                    }),
                                  ]);
                                  toast.success(
                                    'IVA y comprobantes actualizados'
                                  );
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : 'Error al actualizar'
                                  );
                                  queryClient.invalidateQueries({
                                    queryKey: ['lastIvaJob', representativeId],
                                  });
                                  queryClient.invalidateQueries({
                                    queryKey: [
                                      'lastComprobantesJob',
                                      representativeId,
                                    ],
                                  });
                                } finally {
                                  setScrapingSection(null);
                                }
                              }}
                            >
                              <div className="shrink-0 mt-0.5 w-8 h-8 rounded-[var(--arca-r-sm,6px)] bg-[var(--arca-surface-2)] flex items-center justify-center text-[var(--arca-ink-3)] group-hover:text-[var(--arca-ink)]">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-[var(--arca-ink)]">
                                  Comprobantes + IVA
                                </div>
                                <div className="text-[11px] leading-snug text-[var(--arca-ink-4)] mt-0.5">
                                  Actualiza facturas primero, después IVA. Más
                                  lento pero completo.
                                </div>
                              </div>
                            </button>
                          </DialogClose>
                          <DialogClose asChild>
                            <button
                              className="w-full flex items-start gap-3 rounded-[var(--arca-r-md,10px)] px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] border border-transparent hover:border-[var(--arca-border)] cursor-pointer group"
                              onClick={async () => {
                                setScrapingSection('iva');
                                try {
                                  await scrapSingleJob({
                                    data: { credencialId: representativeId, jobType: 'iva' },
                                  });
                                  await Promise.all([
                                    queryClient.invalidateQueries({
                                      queryKey: ['clientIva', representativeId],
                                    }),
                                    queryClient.invalidateQueries({
                                      queryKey: [
                                        'lastIvaJob',
                                        representativeId,
                                      ],
                                    }),
                                  ]);
                                  toast.success(
                                    'IVA actualizado correctamente'
                                  );
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : 'Error al actualizar IVA'
                                  );
                                  queryClient.invalidateQueries({
                                    queryKey: ['lastIvaJob', representativeId],
                                  });
                                } finally {
                                  setScrapingSection(null);
                                }
                              }}
                            >
                              <div className="shrink-0 mt-0.5 w-8 h-8 rounded-[var(--arca-r-sm,6px)] bg-[var(--arca-surface-2)] flex items-center justify-center text-[var(--arca-ink-3)] group-hover:text-[var(--arca-ink)]">
                                <RefreshCw className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-[var(--arca-ink)]">
                                  Solo IVA
                                </div>
                                <div className="text-[11px] leading-snug text-[var(--arca-ink-4)] mt-0.5">
                                  Más rápido. Usá esta opción si las facturas ya
                                  están al día.
                                </div>
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
              <div className="flex flex-wrap items-center gap-2">
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
                  <PopoverContent className="w-auto p-4" align="end">
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
              </div>
            </div>
            <div className="w-full mt-4">
              {loadingClientIva ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando resumen de IVA…</span>
                </div>
              ) : (
                <RenderIvaResume
                  ref={ivaResumeRef}
                  representativeId={representativeId}
                  clientName={client?.nombre}
                  clientIva={clientIvaResume}
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
                      setSolicitudesStatusFilter(
                        v === 'all' ? '' : (v as SolicitudEstado)
                      )
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
                      <SelectItem value="abierta">Abierta</SelectItem>
                      <SelectItem value="completada">Completada</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
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
                      {clientRequestsData.map((req: SolicitudRow, i: number) => {
                        const statusColors: Record<
                          SolicitudEstado,
                          { bg: string; color: string; label: string }
                        > = {
                          abierta: {
                            bg: 'var(--arca-accent-warn-bg)',
                            color: 'var(--arca-accent-warn)',
                            label: 'Abierta',
                          },
                          completada: {
                            bg: 'var(--arca-accent-pos-bg)',
                            color: 'var(--arca-accent-pos)',
                            label: 'Completada',
                          },
                          cancelada: {
                            bg: 'var(--arca-surface-2)',
                            color: 'var(--arca-ink-3)',
                            label: 'Cancelada',
                          },
                        };
                        const sc =
                          statusColors[req.estado] ?? statusColors.abierta;
                        return (
                          <tr
                            key={req.id}
                            className={`border-b border-[var(--arca-border)] last:border-b-0 ${i % 2 === 1 ? 'bg-[var(--arca-surface-2)]' : ''}`}
                          >
                            <td className="px-[14px] py-[10px]">
                              <p className="font-medium text-[var(--arca-ink)] flex items-center gap-1.5">
                                {req.titulo}
                                {req.detalle?.documentoId && (
                                  <Paperclip className="h-3 w-3 text-[var(--arca-accent-primary)] shrink-0" />
                                )}
                              </p>
                              {req.descripcion && (
                                <p className="text-[11px] text-[var(--arca-ink-3)] mt-0.5 max-w-[280px] truncate">
                                  {req.descripcion}
                                </p>
                              )}
                              {req.detalle?.documentoNombre && (
                                <p className="text-[11px] text-[var(--arca-accent-primary)] mt-0.5">
                                  {req.detalle.documentoNombre}
                                </p>
                              )}
                            </td>
                            <td className="px-[14px] py-[10px] text-[var(--arca-ink-3)]">
                              {req.tipo}
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
                              {req.venceAt
                                ? new Date(req.venceAt).toLocaleDateString(
                                    'es-AR'
                                  )
                                : '—'}
                            </td>
                            <td className="px-[14px] py-[10px] text-[var(--arca-ink-3)] whitespace-nowrap">
                              {new Date(req.createdAt).toLocaleDateString(
                                'es-AR'
                              )}
                            </td>
                            <td className="px-[14px] py-[10px]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Descarga del documento si el detalle lo trae */}
                                {req.detalle?.documentoId && (
                                  <>
                                    <button
                                      onClick={async () => {
                                        try {
                                          const doc =
                                            await getDocumentoSolicitud({
                                              data: { solicitudId: req.id },
                                            });
                                          if (!doc?.url) {
                                            toast.error(
                                              'Documento no encontrado'
                                            );
                                            return;
                                          }
                                          const a = document.createElement('a');
                                          a.href = `${doc.url}?download=1`;
                                          a.download = doc.nombre ?? 'documento';
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
                                {req.estado === 'abierta' && (
                                  <>
                                    <button
                                      onClick={() =>
                                        updateRequestStatusMutation.mutate({
                                          solicitudId: req.id,
                                          estado: 'completada',
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
                                          solicitudId: req.id,
                                          estado: 'cancelada',
                                        })
                                      }
                                      className="text-[11px] text-[var(--arca-ink-3)] hover:underline"
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                )}
                                {req.estado !== 'abierta' && (
                                  <button
                                    onClick={() =>
                                      updateRequestStatusMutation.mutate({
                                        solicitudId: req.id,
                                        estado: 'abierta',
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
                      onValueChange={(v) =>
                        setNewRequestType(v as SolicitudTipo)
                      }
                    >
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="documentacion">
                          Documentación
                        </SelectItem>
                        <SelectItem value="informacion">Información</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="otra">Otra</SelectItem>
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
            {/* El acceso al portal se otorga por empresa (cliente), no por login. */}
            {selectedClientId ? (
              <PortalAccessTab clienteId={selectedClientId} />
            ) : (
              <div className="flex h-24 items-center justify-center text-sm text-[var(--arca-ink-3)]">
                Seleccioná una empresa para gestionar el acceso al portal.
              </div>
            )}
          </TabsContent>

          {/* Perfiles Tab */}
          <TabsContent value="perfiles" className="mt-4">
            <PerfilesTab representativeId={representativeId} />
          </TabsContent>
        </div>
        {/* end content area */}
      </Tabs>

      {/* El diálogo edita la empresa (cliente) y, opcionalmente, la clave del
          login de AFIP: sin empresa seleccionada no hay nada que editar. */}
      {selectedClientId && (
        <EditRepresentativeDialog
          clienteId={selectedClientId}
          credencialId={representativeId}
          open={editRepresentativeDialogOpen}
          onOpenChange={setEditRepresentativeDialogOpen}
        />
      )}

      {/* Modal de detalle de facturas por provincia (Convenio Multilateral) */}
      <Dialog
        open={multilateralDetailOpen}
        onOpenChange={(open) => {
          setMultilateralDetailOpen(open);
          if (!open) {
            setSelectedMultilateralProvince(null);
            setSelectedMultilateralProvinceLabel(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="!max-w-none !w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[calc(100vw-3rem)] xl:!w-[calc(100vw-4rem)] max-h-[88vh] overflow-y-auto rounded-xl border bg-background shadow-xl p-4 sm:p-5 md:p-6"
        >
          <DialogHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="pr-2">
                <DialogTitle className="text-lg sm:text-xl font-semibold">
                  Facturas outbound -{' '}
                  {selectedMultilateralProvinceLabel ?? 'Provincia'}
                </DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detalle de comprobantes utilizados para el Convenio
                  Multilateral.
                </p>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full border border-muted hover:bg-muted/80"
                  aria-label="Cerrar detalle de facturas"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          {loadingMultilateralDetail ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Cargando facturas...
            </div>
          ) : multilateralDetailInvoices.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No hay facturas para este filtro.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {multilateralDetailInvoices.length} comprobante
                  {multilateralDetailInvoices.length !== 1 && 's'} outbound
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
                  <span>
                    Base imponible total:{' '}
                    <span className="font-medium text-foreground">
                      {formatIvaCurrency(multilateralDetailTotals.base)}
                    </span>
                  </span>
                  <span>
                    IVA total:{' '}
                    <span className="font-medium text-foreground">
                      {formatIvaCurrency(multilateralDetailTotals.iva)}
                    </span>
                  </span>
                  <span>
                    Total facturado:{' '}
                    <span className="font-medium text-foreground">
                      {formatIvaCurrency(multilateralDetailTotals.total)}
                    </span>
                  </span>
                </div>
              </div>
              {isDesktopViewport ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="w-full text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">
                          Fecha emisión
                        </TableHead>
                        <TableHead className="whitespace-nowrap">
                          Tipo
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Pto. venta
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Número
                        </TableHead>
                        <TableHead className="whitespace-nowrap min-w-[180px]">
                          Destinatario
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Fuente provincia
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Moneda
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Base imponible
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Total IVA
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Total
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {multilateralDetailInvoices.map((inv) => (
                        <TableRow
                          key={inv.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <TableCell className="text-[11px]">
                            {inv.fechaEmision
                              ? new Date(inv.fechaEmision).toLocaleDateString(
                                  'es-AR',
                                  {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                  }
                                )
                              : '—'}
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {inv.tipoDescripcion || inv.tipo}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.puntoVenta || '—'}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.numero || '—'}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div
                              className="truncate"
                              title={inv.contraparteNombre ?? undefined}
                            >
                              {inv.contraparteNombre || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <ProvinceSourceCell inv={inv} />
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.moneda || 'ARS'}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(
                              inv.baseImponible ?? inv.netoGravado
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(inv.ivaTotal)}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(inv.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {multilateralDetailInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-md border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {inv.tipoDescripcion || inv.tipo}
                        </span>
                        <span className="text-muted-foreground">
                          {inv.fechaEmision
                            ? new Date(inv.fechaEmision).toLocaleDateString(
                                'es-AR',
                                {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                }
                              )
                            : '—'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">
                          Pto. venta
                        </span>
                        <span className="text-right">
                          {inv.puntoVenta || '—'}
                        </span>
                        <span className="text-muted-foreground">Número</span>
                        <span className="text-right">{inv.numero || '—'}</span>
                        <span className="text-muted-foreground">
                          Destinatario
                        </span>
                        <span
                          className="text-right truncate"
                          title={inv.contraparteNombre ?? undefined}
                        >
                          {inv.contraparteNombre || '—'}
                        </span>
                        <span className="text-muted-foreground">
                          Fuente provincia
                        </span>
                        <ProvinceSourceCell inv={inv} />
                        <span className="text-muted-foreground">Moneda</span>
                        <span className="text-right">
                          {inv.moneda || 'ARS'}
                        </span>
                        <span className="text-muted-foreground">
                          Base imponible
                        </span>
                        <span className="text-right">
                          {formatIvaCurrency(
                            inv.baseImponible ?? inv.netoGravado
                          )}
                        </span>
                        <span className="text-muted-foreground">Total IVA</span>
                        <span className="text-right">
                          {formatIvaCurrency(inv.ivaTotal)}
                        </span>
                        <span className="text-muted-foreground font-medium">
                          Total
                        </span>
                        <span className="text-right font-medium">
                          {formatIvaCurrency(inv.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Portal Access Tab ────────────────────────────────────────────────────────

/** Usuario del portal tal como lo devuelve `listPortalUsers`. */
type PortalUser = Awaited<ReturnType<typeof listPortalUsers>>[number];

type PermissionKey =
  | 'puedeVerDeudas'
  | 'puedeVerIva'
  | 'puedeVerSueldos'
  | 'puedeSubirDocumentos'
  | 'puedeChatearIa';

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  puedeVerDeudas: 'Deudas',
  puedeVerIva: 'IVA',
  puedeVerSueldos: 'Sueldos',
  puedeSubirDocumentos: 'Documentos',
  puedeChatearIa: 'Chat IA',
};

function PermissionBadge({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-[var(--arca-accent-primary-bg)] text-[var(--arca-accent-primary)] border border-[var(--arca-accent-primary)]/20">
      {label}
    </span>
  );
}

function PortalAccessTab({ clienteId }: { clienteId: string }) {
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
    puedeVerDeudas: true,
    puedeVerIva: true,
    puedeVerSueldos: false,
    puedeSubirDocumentos: true,
    puedeChatearIa: true,
  });

  // Edit form state (permissions only)
  const [editPerms, setEditPerms] = useState<Record<PermissionKey, boolean>>({
    puedeVerDeudas: true,
    puedeVerIva: true,
    puedeVerSueldos: false,
    puedeSubirDocumentos: true,
    puedeChatearIa: true,
  });

  // Reset password state
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['portalUsers', clienteId],
    queryFn: () => listPortalUsers({ data: { clienteId } }),
  });

  const createMutation = useMutation({
    mutationFn: (vars: Parameters<typeof createPortalUser>[0]['data']) =>
      createPortalUser({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['portalUsers', clienteId],
      });
      toast.success('Usuario creado');
      setCreateOpen(false);
      setCreateForm({
        name: '',
        email: '',
        password: '',
        puedeVerDeudas: true,
        puedeVerIva: true,
        puedeVerSueldos: false,
        puedeSubirDocumentos: true,
        puedeChatearIa: true,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: (
      vars: Parameters<typeof updatePortalUserPermissions>[0]['data']
    ) => updatePortalUserPermissions({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['portalUsers', clienteId],
      });
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
      queryClient.invalidateQueries({
        queryKey: ['portalUsers', clienteId],
      });
      toast.success('Acceso revocado');
      setRevokeTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(u: PortalUser) {
    setEditPerms({
      puedeVerDeudas: u.puedeVerDeudas,
      puedeVerIva: u.puedeVerIva,
      puedeVerSueldos: u.puedeVerSueldos,
      puedeSubirDocumentos: u.puedeSubirDocumentos,
      puedeChatearIa: u.puedeChatearIa,
    });
    setNewPassword('');
    setEditTarget(u);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--arca-ink)]">
            Usuarios con acceso al portal
          </h3>
          <p className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Los usuarios portal pueden consultar la información fiscal del
            cliente.
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
          <p className="text-sm text-[var(--arca-ink-3)]">
            No hay usuarios con acceso al portal
          </p>
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
              {users.map((u) => (
                <TableRow
                  key={u.accessId}
                  className="hover:bg-[var(--arca-surface-2)]/50"
                >
                  <TableCell className="text-sm font-medium">
                    {u.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--arca-ink-3)]">
                    {u.email ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map(
                        (k) => (
                          <PermissionBadge
                            key={k}
                            active={u[k]}
                            label={PERMISSION_LABELS[k]}
                          />
                        )
                      )}
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
              <label className="text-xs font-medium text-[var(--arca-ink)]">
                Nombre completo
              </label>
              <Input
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Ej: Juan García"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--arca-ink)]">
                Email
              </label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder="juan@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--arca-ink)]">
                Contraseña
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Mínimo 8 caracteres"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--arca-ink)]">
                Permisos
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map(
                  (k) => (
                    <label
                      key={k}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={createForm[k]}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            [k]: e.target.checked,
                          }))
                        }
                        className="rounded border-[var(--arca-border)]"
                      />
                      {PERMISSION_LABELS[k]}
                    </label>
                  )
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-[var(--arca-ink)] hover:bg-black text-white"
              disabled={
                !createForm.name ||
                !createForm.email ||
                createForm.password.length < 8 ||
                createMutation.isPending
              }
              onClick={() =>
                createMutation.mutate({
                  clienteId,
                  name: createForm.name,
                  email: createForm.email,
                  password: createForm.password,
                  permisos: {
                    puedeVerDeudas: createForm.puedeVerDeudas,
                    puedeVerIva: createForm.puedeVerIva,
                    puedeVerSueldos: createForm.puedeVerSueldos,
                    puedeSubirDocumentos: createForm.puedeSubirDocumentos,
                    puedeChatearIa: createForm.puedeChatearIa,
                  },
                })
              }
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Creando…
                </>
              ) : (
                'Crear usuario'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar acceso — {editTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Permissions */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-[var(--arca-ink)]">
                Permisos
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PERMISSION_LABELS) as PermissionKey[]).map(
                  (k) => (
                    <label
                      key={k}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editPerms[k]}
                        onChange={(e) =>
                          setEditPerms((p) => ({ ...p, [k]: e.target.checked }))
                        }
                        className="rounded border-[var(--arca-border)]"
                      />
                      {PERMISSION_LABELS[k]}
                    </label>
                  )
                )}
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
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    newPassword.length < 8 || resetPasswordMutation.isPending
                  }
                  onClick={() =>
                    editTarget &&
                    resetPasswordMutation.mutate({
                      userId: editTarget.userId,
                      newPassword,
                    })
                  }
                >
                  {resetPasswordMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    'Guardar'
                  )}
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
                editMutation.mutate({
                  accessId: editTarget.accessId,
                  permisos: editPerms,
                })
              }
            >
              {editMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar permisos'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirm Dialog */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revocar acceso</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--arca-ink-3)] py-2">
            ¿Confirmar revocar el acceso al portal de{' '}
            <span className="font-medium text-[var(--arca-ink)]">
              {revokeTarget?.name}
            </span>
            ? El usuario no podrá ingresar más al portal.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={revokeMutation.isPending}
              onClick={() =>
                revokeTarget &&
                revokeMutation.mutate({ accessId: revokeTarget.accessId })
              }
            >
              {revokeMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Revocando…
                </>
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
