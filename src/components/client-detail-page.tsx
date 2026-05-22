import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  CalendarIcon,
  Edit,
  FileText,
  User,
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
  BookOpen,
  ClipboardList,
  Plus,
  Paperclip,
  FileDown,
  RefreshCw,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  getRepresentative,
  getRepresentativeClients,
  getRepresentativeDebts,
  getRepresentativeDueDates,
  getRepresentativeIvaCredit,
  getLastJobByType,
  getRunningJobByType,
  getBalanceConfig,
  upsertBalanceConfig,
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
  getInvoices,
  getClientMultilateralSummary,
  getClientMultilateralInvoices,
} from '@/actions/invoice';
import {
  getNotifications,
  markNotificationOpened,
} from '@/actions/notification';
import { updateClientManagement } from '@/actions/profile';
import {
  scrapSingleJob,
  updateDebtStatus,
} from '@/actions/client';
import {
  listClientRequests,
  createClientRequest,
  updateClientRequestStatus,
  getRequestDocument,
} from '@/actions/client-portal';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Clock,
  CalendarCheck,
  CalendarX,
  Loader2,
  EyeOff,
  Eye,
  Play,
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
import { INVOICE_TYPES } from '@/lib/invoicesTypes';
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

interface RepresentativeDetailPageProps {
  representativeId: string;
}

const INVOICE_TYPE_MAP = new Map(
  INVOICE_TYPES.map((t) => [t.clave, t.valor] as const)
);

const getInvoiceTypeLabel = (code: string | number | null | undefined) => {
  if (code === null || code === undefined || code === '') return '—';
  const normalized = String(code);
  return INVOICE_TYPE_MAP.get(normalized) ?? normalized;
};

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
      className={`text-xs mt-1 ${diff > 0
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

export function RepresentativeDetailPage({ representativeId }: RepresentativeDetailPageProps) {
  const navigate = useNavigate();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editRepresentativeDialogOpen, setEditRepresentativeDialogOpen] = useState(false);
  const now = new Date();
  const initialMultilateralRange = getMonthBounds(
    now.getFullYear(),
    now.getMonth()
  );
  const [ivaProfileId, setIvaProfileId] = useState<string | undefined>(
    undefined
  );
  const [multilateralProfileId, setMultilateralProfileId] = useState<
    string | undefined
  >(undefined);
  const [resumenProfileId, setResumenProfileId] = useState<string | undefined>(
    undefined
  );
  const [resumenNotifProfileId, setResumenNotifProfileId] = useState<
    string | 'all'
  >('all');
  const [resumenNotifSelected, setResumenNotifSelected] = useState<{
    id: string;
    message: string;
    profileName: string | null | undefined;
    publicationDate: Date | string | null;
    expirationDate: Date | string | null;
  } | null>(null);
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
  const [debtFilterProfileId, setDebtFilterProfileId] = useState<string>('');
  const [debtFilterImpuesto, setDebtFilterImpuesto] = useState<string>('');
  const [debtFilterConcepto, setDebtFilterConcepto] = useState<string>('');
  const [debtPage, setDebtPage] = useState(1);
  const [debtSortKey, setDebtSortKey] = useState<'profileName' | 'tax' | 'concept' | 'period' | 'dueDate' | 'detectedAt'>('detectedAt');
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
  /** Filtros de la tabla de facturas (perfil, tipo, dirección) para que los totales Ventas/Compras los respeten. */
  const [facturasProfileFilter, setFacturasProfileFilter] =
    useState<string>('all');
  const [facturasTypeFilter, setFacturasTypeFilter] = useState<string>('all');
  const [facturasDirectionFilter, setFacturasDirectionFilter] =
    useState<string>('all');
  const facturasOnFiltersChange = useCallback(
    ({
      profileFilter,
      typeFilter,
      directionFilter,
    }: {
      profileFilter: string;
      typeFilter: string;
      directionFilter: string;
    }) => {
      setFacturasProfileFilter(profileFilter);
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

  const toggleClientManagementMutation = useMutation({
    mutationFn: (vars: { clientId: string; managedByStudy: boolean }) =>
      updateClientManagement({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representativeClients', representativeId] });
      toast.success('Perfil actualizado');
    },
    onError: () => {
      toast.error('Error al actualizar el perfil');
    },
  });
  const updateDebtStatusMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      status: 'open' | 'in_plan' | 'paid' | 'disputed';
      isIntimated: boolean;
    }) => updateDebtStatus({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representativeDebts', representativeId] });
      toast.success('Deuda actualizada');
    },
    onError: () => {
      toast.error('Error al actualizar la deuda');
    },
  });

  // Balance config state
  const [balanceMonth, setBalanceMonth] = useState<string>('12');
  const [balanceDay, setBalanceDay] = useState<string>('31');
  const [balancePresentationDays, setBalancePresentationDays] =
    useState<string>('');
  const [balanceAlertDays, setBalanceAlertDays] =
    useState<string>('60,30,15,7');

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
  const {
    data: clientRequestsData = [] as RequestRow[],
    refetch: refetchRequests,
  } = useQuery({
    queryKey: ['clientRequests', representativeId, solicitudesStatusFilter],
    queryFn: () =>
      listClientRequests({
        data: { clientId: representativeId, status: solicitudesStatusFilter || undefined },
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

  const { data: balanceConfig } = useQuery({
    queryKey: ['balanceConfig', representativeId],
    queryFn: () => getBalanceConfig({ data: { representativeId } }),
    enabled: !!representativeId,
  });

  // Sync form state when config loads
  useEffect(() => {
    if (balanceConfig) {
      setBalanceMonth(String(balanceConfig.fiscalYearEndMonth));
      setBalanceDay(String(balanceConfig.fiscalYearEndDay));
      setBalancePresentationDays(
        balanceConfig.presentationDueDays != null
          ? String(balanceConfig.presentationDueDays)
          : ''
      );
      const days = balanceConfig.alertDaysBefore;
      setBalanceAlertDays(Array.isArray(days) ? days.join(',') : '60,30,15,7');
    }
  }, [balanceConfig]);

  const upsertBalanceConfigMutation = useMutation({
    mutationFn: (vars: {
      fiscalYearEndMonth: number;
      fiscalYearEndDay: number;
      presentationDueDays: number | null;
      alertDaysBefore: number[];
    }) => upsertBalanceConfig({ data: { representativeId, ...vars } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balanceConfig', representativeId] });
      toast.success('Configuración guardada');
    },
    onError: () => {
      toast.error('Error al guardar la configuración');
    },
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

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['representative', representativeId],
    queryFn: async () => {
      const result = await getRepresentative({ data: { id: representativeId } });
      return result;
    },
  });

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['representativeClients', representativeId],
    queryFn: () => getRepresentativeClients({ data: { representativeId } }),
  });

  /** Perfil IVA por defecto (según nombre del cliente). Se calcula cuando hay client + profiles. */
  const defaultIvaProfileId = useMemo(() => {
    if (!client || profiles.length === 0) return undefined;
    return findBestMatchingProfileId(client.name, profiles) ?? profiles[0].id;
  }, [client, profiles]);

  /** Perfil efectivo: selección del usuario o el default. Solo hay valor cuando hay perfiles. */
  const effectiveIvaProfileId =
    ivaProfileId ?? defaultIvaProfileId ?? profiles[0]?.id;

  /** Perfil efectivo para Convenio Multilateral (usa mismo default). */
  const effectiveMultilateralProfileId =
    multilateralProfileId ?? defaultIvaProfileId ?? profiles[0]?.id;

  /** Perfil efectivo para el cuadro de Resumen (selector de perfiles asociados). */
  const effectiveResumenProfileId =
    resumenProfileId ?? defaultIvaProfileId ?? profiles[0]?.id;
  const selectedResumenProfile = profiles.find(
    (p) => p.id === effectiveResumenProfileId
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
        getRepresentativeIvaCredit({
          data: {
            representativeId,
            clientId: effectiveResumenProfileId ?? undefined,
            periodoFiscalResumen: periodoFiscalResumen ?? undefined,
          },
        }),
      enabled: !!effectiveResumenProfileId,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    });

  useEffect(() => {
    setIvaProfileId(undefined);
    setMultilateralProfileId(undefined);
    setResumenProfileId(undefined);
    setResumenNotifProfileId('all');
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
    queryKey: ['representativeDebts', representativeId, debtFilterProfileId],
    queryFn: () => getRepresentativeDebts({ data: { representativeId, clientId: debtFilterProfileId || undefined } }),
  });

  const { data: dueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ['representativeDueDates', representativeId],
    queryFn: () => getRepresentativeDueDates({ data: { representativeId } }),
  });

  // Últimos jobs por tipo para mostrar errores en Resumen
  const { data: lastComprobantesJob } = useQuery({
    queryKey: ['lastComprobantesJob', representativeId],
    queryFn: () =>
      getLastJobByType({ data: { representativeId, jobType: 'comprobantes' } }),
    enabled: !!representativeId,
  });

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

  const { data: unreadNotifications, isLoading: loadingUnreadNotifications } =
    useQuery({
      queryKey: [
        'unreadNotifications',
        orgKey,
        representativeId,
        resumenNotifProfileId,
      ],
      queryFn: () =>
        getNotifications({
          data: {
            representativeFilter: representativeId,
            clientId:
              resumenNotifProfileId !== 'all'
                ? resumenNotifProfileId
                : undefined,
            opened: false,
            limit: 50,
            page: 1,
          },
        }),
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
      getClientMultilateralSummary({
        data: {
          clientId: representativeId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!representativeId,
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
      getClientMultilateralSummary({
        data: {
          clientId: representativeId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          dateFrom: multilateralPrevDateFrom,
          dateTo: multilateralPrevDateTo,
        },
      }),
    enabled:
      !!representativeId && !!multilateralPrevDateFrom && !!multilateralPrevDateTo,
  });

  interface MultilateralAgg {
    provinces: number;
    invoices: number;
    totalIVA: number;
    totalBase: number;
  }

  const aggregateMultilateral = (rows: any[]): MultilateralAgg => {
    if (!rows?.length) {
      return { provinces: 0, invoices: 0, totalIVA: 0, totalBase: 0 };
    }
    const provinces = rows.length;
    let invoices = 0;
    let totalIVA = 0;
    let totalBase = 0;
    for (const row of rows) {
      invoices += Number(row.invoiceCount ?? 0);
      totalIVA += Number(row.totalIVA ?? 0);
      totalBase += Number(row.totalTaxed ?? 0);
    }
    return { provinces, invoices, totalIVA, totalBase };
  };

  const multilateralAggCurrent = useMemo(
    () => aggregateMultilateral(multilateralSummary as any[]),
    [multilateralSummary]
  );
  const multilateralAggPrev = useMemo(
    () => aggregateMultilateral(multilateralSummaryPrev as any[]),
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
    copy.sort((a: any, b: any) => {
      const dir = multilateralSortDir === 'asc' ? 1 : -1;
      let av = 0;
      let bv = 0;
      if (multilateralSortKey === 'count') {
        av = Number(a.invoiceCount ?? 0);
        bv = Number(b.invoiceCount ?? 0);
      } else if (multilateralSortKey === 'iva') {
        av = Number(a.totalIVA ?? 0);
        bv = Number(b.totalIVA ?? 0);
      } else if (multilateralSortKey === 'base') {
        av = Number(a.totalTaxed ?? 0);
        bv = Number(b.totalTaxed ?? 0);
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
      getClientMultilateralInvoices({
        data: {
          clientId: representativeId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          receiptProvince: selectedMultilateralProvince,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!representativeId && multilateralDetailOpen,
  });

  const multilateralDetailTotals = useMemo(() => {
    if (!multilateralDetailInvoices?.length) {
      return { base: 0, iva: 0, total: 0 };
    }
    return multilateralDetailInvoices.reduce(
      (acc: { base: number; iva: number; total: number }, inv: any) => {
        acc.base += Number(inv.baseImponible ?? inv.amountTaxed ?? 0);
        acc.iva += Number(inv.totalIVA ?? 0);
        acc.total += Number(inv.amount ?? 0);
        return acc;
      },
      { base: 0, iva: 0, total: 0 }
    );
  }, [multilateralDetailInvoices]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copiado al portapapeles');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Calculate debt statistics
  const debtStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalBalance = debts.reduce(
      (sum, debt) => sum + Number(debt.balance || 0),
      0
    );
    const totalCompensatoryInterest = debts.reduce(
      (sum, debt) => sum + Number(debt.compensatoryInterest || 0),
      0
    );
    const totalPunitiveInterest = debts.reduce(
      (sum, debt) => sum + Number(debt.punitiveInterest || 0),
      0
    );
    const totalDebt =
      totalBalance + totalCompensatoryInterest + totalPunitiveInterest;

    const overdueDebts = debts.filter((debt) => {
      const dueDate = new Date(debt.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const upcomingDebts = debts.filter((debt) => {
      const dueDate = new Date(debt.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today;
    });

    const totalOverdueBalance = overdueDebts.reduce(
      (sum, debt) => sum + Number(debt.balance || 0),
      0
    );
    const totalUpcomingBalance = upcomingDebts.reduce(
      (sum, debt) => sum + Number(debt.balance || 0),
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
      new Set(debts.map((d) => (d.tax ?? '').trim()).filter(Boolean))
    ).sort();
    const conceptos = Array.from(
      new Set(debts.map((d) => (d.concept ?? '').trim()).filter(Boolean))
    ).sort();
    return { impuestos, conceptos };
  }, [debts]);

  // Deudas filtradas por impuesto y concepto
  const filteredDebts = useMemo(() => {
    return debts.filter((debt) => {
      if (debtFilterImpuesto && (debt.tax ?? '').trim() !== debtFilterImpuesto)
        return false;
      if (
        debtFilterConcepto &&
        (debt.concept ?? '').trim() !== debtFilterConcepto
      )
        return false;
      return true;
    });
  }, [debts, debtFilterImpuesto, debtFilterConcepto]);

  const sortedDebts = useMemo(() => {
    const sorted = [...filteredDebts].sort((a, b) => {
      let cmp = 0;
      if (debtSortKey === 'dueDate' || debtSortKey === 'detectedAt') {
        cmp = new Date(a[debtSortKey] ?? 0).getTime() - new Date(b[debtSortKey] ?? 0).getTime();
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

  /** Coincide tipo de factura con el filtro (código exacto o etiqueta "...(código)" al final). */
  const matchInvoiceType = (
    invType: string | null | undefined,
    typeFilter: string
  ): boolean => {
    if (!typeFilter || typeFilter === 'all') return true;
    const t = (invType ?? '').trim();
    if (t === typeFilter) return true;
    if (/^\d+$/.test(typeFilter) && new RegExp(`\\(${typeFilter}\\)$`).test(t))
      return true;
    return false;
  };

  /** True si la factura pasa los filtros de perfil, tipo y dirección (para totales Ventas/Compras). */
  const invoicePassesFacturasFilters = (inv: any): boolean => {
    if (facturasProfileFilter && facturasProfileFilter !== 'all') {
      if ((inv.profileId ?? inv.profile) !== facturasProfileFilter)
        return false;
    }
    if (facturasTypeFilter && facturasTypeFilter !== 'all') {
      if (!matchInvoiceType(inv.type, facturasTypeFilter)) return false;
    }
    if (facturasDirectionFilter && facturasDirectionFilter !== 'all') {
      const dir = (inv.direction ?? '').trim();
      if (dir.toLowerCase() !== facturasDirectionFilter.toLowerCase())
        return false;
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
      !allInvoicesData?.invoices
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
    allInvoicesData.invoices.forEach((inv: any) => {
      if (!invoicePassesFacturasFilters(inv)) return;
      const invDate = new Date(inv.emitionDate);
      if (invDate < from || invDate > to) return;
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD') {
        const rate = parseFloat(inv.currencyRate || '1');
        amount = amount * rate;
      }
      const direction = inv.direction?.toLowerCase();
      if (direction === 'outbound') totalSales += amount;
      else if (direction === 'inbound') totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [
    allInvoicesData,
    facturasBounds,
    facturasPeriodType,
    facturasProfileFilter,
    facturasTypeFilter,
    facturasDirectionFilter,
  ]);

  /** Totales del período anterior (mes anterior o año anterior) para la variación %. */
  const invoiceStatsPrevious = useMemo(() => {
    if (!allInvoicesData?.invoices?.length) return null;
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
      allInvoicesData.invoices.forEach((inv: any) => {
        if (!invoicePassesFacturasFilters(inv)) return;
        const invDate = new Date(inv.emitionDate);
        if (invDate < fromDate || invDate > toDate) return;
        let amount = parseFloat(inv.amount || '0');
        if (inv.currency?.toUpperCase() === 'USD')
          amount *= parseFloat(inv.currencyRate || '1');
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') totalSales += amount;
        else if (dir === 'inbound') totalPurchases += amount;
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
      allInvoicesData.invoices.forEach((inv: any) => {
        if (!invoicePassesFacturasFilters(inv)) return;
        const invDate = new Date(inv.emitionDate);
        if (invDate < fromDate || invDate > toDate) return;
        let amount = parseFloat(inv.amount || '0');
        if (inv.currency?.toUpperCase() === 'USD')
          amount *= parseFloat(inv.currencyRate || '1');
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') totalSales += amount;
        else if (dir === 'inbound') totalPurchases += amount;
      });
      return { totalSales, totalPurchases };
    }
    return null;
  }, [
    allInvoicesData,
    facturasPeriodType,
    facturasYear,
    facturasMonth,
    facturasProfileFilter,
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
    const invoices = allInvoicesData?.invoices;
    if (!invoices?.length) return [];
    const filtered = invoices.filter((inv: any) =>
      invoicePassesFacturasFilters(inv)
    );
    const getAmount = (inv: any): number => {
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD') {
        const rate = parseFloat(inv.currencyRate || '1');
        amount = amount * rate;
      }
      return amount;
    };

    // Por año: barras de todos los meses del año seleccionado
    if (facturasPeriodType === 'year') {
      const byMonth: Record<number, { ventas: number; compras: number }> = {};
      for (let i = 0; i < 12; i++) byMonth[i] = { ventas: 0, compras: 0 };
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        if (d.getFullYear() !== facturasYear) return;
        const m = d.getMonth();
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') byMonth[m].ventas += amount;
        else if (dir === 'inbound') byMonth[m].compras += amount;
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
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        if (d.getFullYear() !== facturasYear || d.getMonth() !== facturasMonth)
          return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') ventas += amount;
        else if (dir === 'inbound') compras += amount;
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
      for (let t = from.getTime(); t <= to.getTime();) {
        const d = new Date(t);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        byMonthKey[key] = { ventas: 0, compras: 0 };
        d.setMonth(d.getMonth() + 1);
        t = d.getTime();
      }
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') byMonthKey[key].ventas += amount;
        else if (dir === 'inbound') byMonthKey[key].compras += amount;
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
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === 'outbound') byMonthKey[key].ventas += amount;
        else if (dir === 'inbound') byMonthKey[key].compras += amount;
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
    facturasProfileFilter,
    facturasTypeFilter,
    facturasDirectionFilter,
  ]);

  /** Datos del gráfico para el Resumen: últimos 12 meses (mes actual + 11 anteriores). */
  const resumenChartData = useMemo((): {
    period: string;
    ventas: number;
    compras: number;
  }[] => {
    const invoices = allInvoicesData?.invoices;
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
    invoices.forEach((inv: any) => {
      if (
        effectiveResumenProfileId &&
        inv.profileId !== effectiveResumenProfileId
      )
        return;
      const d = new Date(inv.emitionDate);
      const bucket = buckets.find(
        (b) => b.year === d.getFullYear() && b.month === d.getMonth()
      );
      if (!bucket) return;
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.currencyRate || '1');
      const dir = inv.direction?.toLowerCase();
      if (dir === 'outbound') bucket.ventas += amount;
      else if (dir === 'inbound') bucket.compras += amount;
    });
    return buckets.map((b) => ({
      period: MONTH_NAMES_SHORT[b.month],
      ventas: b.ventas,
      compras: b.compras,
    }));
  }, [allInvoicesData, effectiveResumenProfileId]);

  /** Totales del mes actual para el Resumen. */
  const resumenCurrentMonthStats = useMemo(() => {
    const invoices = allInvoicesData?.invoices;
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
    invoices.forEach((inv: any) => {
      if (
        effectiveResumenProfileId &&
        inv.profileId !== effectiveResumenProfileId
      )
        return;
      const invDate = new Date(inv.emitionDate);
      if (invDate < fromDate || invDate > toDate) return;
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.currencyRate || '1');
      const dir = inv.direction?.toLowerCase();
      if (dir === 'outbound') totalSales += amount;
      else if (dir === 'inbound') totalPurchases += amount;
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
      const dueDate = new Date(dd.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today;
    });

    const overdueDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const next7DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next7Days;
    });

    const next15DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next15Days;
    });

    const next30DaysDueDates = dueDates.filter((dd) => {
      const dueDate = new Date(dd.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= today && dueDate <= next30Days;
    });

    const sortedFuture = [...futureDueDates].sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
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

  // Compute avatar initials from client name
  const clientInitials = (client.name || '?')
    .split(/[\s\-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');

  // Shared tab trigger style (overrides shadcn defaults for this page-level nav)
  const tabTriggerCls = (hasError?: boolean) =>
    cn(
      // shape overrides
      'relative h-auto flex-none px-[14px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
      // inactive
      'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
      // active
      'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px',
      hasError && 'data-[state=inactive]:text-[var(--arca-accent-warn-fg)]'
    );

  return (
    <div>
      <Tabs defaultValue="resumen" className="flex flex-col">
        {/* ── Sticky client header ── */}
        <div className="sticky top-0 z-10 bg-[var(--arca-bg)] border-b border-[var(--arca-border)]">
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
                <div className="flex items-center gap-[10px] flex-wrap">
                  <h1 className="font-display text-[24px] font-semibold tracking-tight text-[var(--arca-ink)] leading-none truncate">
                    {client.name}
                  </h1>
                </div>
                <div className="mt-[4px] flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-[11.5px] text-[var(--arca-ink-3)]">
                  {client.identityNumber && (
                    <span className="font-mono">
                      CUIT {client.identityNumber}
                    </span>
                  )}
                  {client.fiscalCondition && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                      <span>{client.fiscalCondition}</span>
                    </>
                  )}
                  {client.regimenLocal && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                      <span>{client.regimenLocal}</span>
                    </>
                  )}
                  {client.registeredAt && (
                    <>
                      <span className="w-[3px] h-[3px] rounded-full bg-[var(--arca-ink-4)] shrink-0" />
                      <span>
                        Alta{' '}
                        {new Date(client.registeredAt).toLocaleDateString(
                          'es-AR',
                          { day: 'numeric', month: 'short', year: 'numeric' }
                        )}
                      </span>
                    </>
                  )}
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
                    try {
                      const modules = ['deuda', 'vencimientos', 'iva', 'notificaciones', 'comprobantes'] as const;
                      const invalidateAll = () => {
                        queryClient.invalidateQueries({ queryKey: ['representativeDebts', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['representativeDueDates', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['clientIva', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['clientAllInvoices', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['invoices'] });
                        queryClient.invalidateQueries({ queryKey: ['notifications', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['lastDeudaJob', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['lastVencimientosJob', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['lastIvaJob', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['lastNotificacionesJob', representativeId] });
                        queryClient.invalidateQueries({ queryKey: ['lastComprobantesFullJob', representativeId] });
                      };
                      let completedCount = 0;
                      for (const jobType of modules) {
                        try {
                          await scrapSingleJob({ data: { representativeId, jobType } });
                          completedCount++;
                          toast.success(`${jobType} actualizado`);
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Error desconocido';
                          // Si las credenciales son inválidas, cortar todo
                          if (msg.includes('incorrecto') || msg.includes('inválida') || msg.includes('Credenciales')) {
                            toast.error(`Credenciales AFIP inválidas. Scraping detenido.`);
                            invalidateAll();
                            break;
                          }
                          toast.error(`Error en ${jobType}: ${msg}`);
                        }
                        invalidateAll();
                      }
                      if (completedCount === modules.length) {
                        toast.success('Scraping completo');
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Error al encolar scraping');
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
                  title="Editar cliente"
                >
                  <Edit className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <TabsList className="flex h-auto w-full bg-transparent p-0 rounded-none gap-0 overflow-x-auto justify-start">
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
            </TabsList>
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="px-4 md:px-[28px] pt-5 pb-[60px]">
          {/* Resumen Tab */}
          <TabsContent value="resumen" className="mt-4 space-y-[14px]">
            {/* Row 1: Perfiles (3fr) | Facturación (2fr) | IVA (2fr) */}
            <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr_2fr] gap-[14px]">
              {/* Perfiles Asociados */}
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[14px]">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Perfiles asociados
                  </span>
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {profiles.length}
                  </span>
                  <div className="flex-1" />
                  <button
                    onClick={() => setEditRepresentativeDialogOpen(true)}
                    className="text-[12px] font-medium text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
                  >
                    Editar →
                  </button>
                </div>
                {loadingProfiles ? (
                  <div className="flex items-center gap-2 text-[var(--arca-ink-4)] text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </div>
                ) : profiles.length === 0 ? (
                  <p className="text-[12.5px] text-[var(--arca-ink-4)]">
                    Sin perfiles asociados.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-[6px]">
                      {profiles.map((prof) => {
                        const normCuit = (s: string) => s.replace(/\D/g, '');
                        const warningCuits =
                          lastNotificacionesJob?.notificationFetchWarningCuits ??
                          [];
                        const isWarning = warningCuits.some(
                          (c) =>
                            normCuit(c) === normCuit(prof.identityNumber ?? '')
                        );
                        const isSelected =
                          effectiveResumenProfileId === prof.id;
                        const isUnmanaged = prof.managedByStudy === false;
                        const initials = (
                          prof.name ||
                          prof.identityNumber ||
                          '?'
                        )
                          .split(' ')
                          .slice(0, 2)
                          .map((w: string) => w[0])
                          .join('')
                          .toUpperCase();
                        return (
                          <div key={prof.id} className="relative group">
                            <button
                              onClick={() => setResumenProfileId(prof.id)}
                              className={cn(
                                'inline-flex items-center gap-[7px] px-[9px] py-[5px] rounded-[var(--arca-r-pill)] text-[11.5px] font-medium border transition-all',
                                isUnmanaged
                                  ? 'opacity-50 bg-[var(--arca-surface-2)] text-[var(--arca-ink-4)] border-[var(--arca-border)]'
                                  : isSelected
                                    ? 'bg-[var(--arca-ink)] text-[#F7F6F2] border-[var(--arca-ink)]'
                                    : isWarning
                                      ? 'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)] border-[var(--arca-accent-warn)]/30'
                                      : 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)] border-[var(--arca-border)] hover:text-[var(--arca-ink)]'
                              )}
                            >
                              <span
                                className={cn(
                                  'w-4 h-4 rounded-[4px] inline-flex items-center justify-center text-[8.5px] font-bold text-white shrink-0',
                                  isUnmanaged
                                    ? 'bg-[var(--arca-ink-4)]'
                                    : isSelected
                                      ? 'bg-white/10'
                                      : 'bg-[#1E3460]'
                                )}
                              >
                                {initials}
                              </span>
                              {prof.name || prof.identityNumber}
                              {isUnmanaged && (
                                <span className="ml-1 text-[10px] font-semibold text-[var(--arca-ink-4)]">
                                  No administrado
                                </span>
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleClientManagementMutation.mutate({
                                  clientId: prof.id,
                                  managedByStudy: !prof.managedByStudy,
                                });
                              }}
                              title={
                                isUnmanaged
                                  ? 'Marcar como administrado'
                                  : 'Marcar como no administrado'
                              }
                              className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-[var(--arca-surface)] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors shadow-sm"
                            >
                              {isUnmanaged ? (
                                <Eye className="w-2.5 h-2.5" />
                              ) : (
                                <EyeOff className="w-2.5 h-2.5" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {selectedResumenProfile && (
                      <div className="grid grid-cols-3 gap-[14px] pt-[2px]">
                        <div>
                          <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] mb-1">
                            CUIT
                          </div>
                          <div className="font-mono text-[12.5px] text-[var(--arca-ink)]">
                            {selectedResumenProfile.identityNumber || '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] mb-1">
                            Teléfono
                          </div>
                          <div className="font-mono text-[12.5px] text-[var(--arca-ink)]">
                            {client?.phone || '—'}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)] mb-1">
                            Email
                          </div>
                          <div className="font-mono text-[12.5px] text-[var(--arca-ink)] truncate">
                            {client?.email || '—'}
                          </div>
                        </div>
                      </div>
                    )}
                    {selectedResumenProfile && (
                      <div className="pt-[6px] border-t border-[var(--arca-border)] flex items-center gap-3">
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
                        <div className="flex-1" />
                        {selectedResumenProfile.managedByStudy === false && (
                          <span className="text-[11px] font-medium text-[var(--arca-ink-4)] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-2 py-0.5 rounded-full">
                            No administrado
                          </span>
                        )}
                      </div>
                    )}
                  </>
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
                              .saldoTecnicoFavorContribuyente ?? 0
                          ) > 0
                            ? 'text-[var(--arca-accent-pos-fg)]'
                            : 'text-[var(--arca-ink-3)]'
                        )}
                      >
                        {formatIvaCurrency(
                          resumenClientIva.data.saldoTecnicoFavorContribuyente
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
                              .saldoLibreDisponibilidadFavorContribuyentePeriodo ??
                            0
                          ) > 0
                            ? 'text-[var(--arca-accent-pos-fg)]'
                            : 'text-[var(--arca-ink-3)]'
                        )}
                      >
                        {formatIvaCurrency(
                          resumenClientIva.data
                            .saldoLibreDisponibilidadFavorContribuyentePeriodo
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
                'grid grid-cols-1 gap-[14px] items-start',
                resumenChartData.length > 0 ? 'md:grid-cols-[17fr_10fr]' : ''
              )}
            >
              {resumenChartData.length > 0 && (
                <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px_14px] flex flex-col gap-[12px]">
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
                    className="h-[200px] w-full"
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
              <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[14px]">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                  <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                    Notificaciones
                  </span>
                  <div className="flex-1" />
                  <span className="text-[11px] font-mono text-[var(--arca-ink-4)]">
                    {unreadNotifications?.notifications.length ?? 0}
                  </span>
                </div>
                {profiles.length > 0 && (
                  <div className="flex flex-wrap gap-[6px]">
                    {['all', ...profiles.map((p) => p.id)].map((pid) => {
                      const label =
                        pid === 'all'
                          ? 'Todos'
                          : profiles.find((p) => p.id === pid)?.name ||
                          profiles.find((p) => p.id === pid)
                            ?.identityNumber ||
                          pid;
                      const on = resumenNotifProfileId === pid;
                      return (
                        <button
                          key={pid}
                          onClick={() => setResumenNotifProfileId(pid)}
                          className={cn(
                            'px-[9px] py-[4px] rounded-[var(--arca-r-pill)] text-[11px] font-medium border transition-all',
                            on
                              ? 'bg-[var(--arca-ink)] text-[#F7F6F2] border-[var(--arca-ink)]'
                              : 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)] border-[var(--arca-border)] hover:text-[var(--arca-ink)]'
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {loadingUnreadNotifications ? (
                  <div className="flex items-center gap-2 text-[var(--arca-ink-4)] text-xs py-4 justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </div>
                ) : !unreadNotifications?.notifications.length ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-8">
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
                  <div className="space-y-1.5 overflow-y-auto pr-1 max-h-[280px]">
                    {unreadNotifications.notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className="flex items-start gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 hover:bg-[var(--arca-bg)] transition-colors"
                      >
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => setResumenNotifSelected(notif)}
                        >
                          {notif.profileName && (
                            <div className="text-[9.5px] text-[var(--arca-ink-4)] mb-0.5 font-semibold uppercase tracking-[0.06em]">
                              {notif.profileName}
                            </div>
                          )}
                          <p className="text-[var(--arca-ink)] text-[12px] line-clamp-2 leading-snug">
                            {notif.message}
                          </p>
                          <p className="text-[10px] font-mono text-[var(--arca-ink-4)] mt-0.5">
                            {notif.publicationDate
                              ? format(
                                new Date(notif.publicationDate),
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

            {/* Row 3: Cierre de ejercicio */}
            <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[16px_20px] flex flex-col gap-[14px]">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--arca-ink-3)]" />
                <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                  Cierre de ejercicio
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-[14px]">
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
                    Mes de cierre
                  </label>
                  <select
                    value={balanceMonth}
                    onChange={(e) => setBalanceMonth(e.target.value)}
                    className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 text-[12.5px] text-[var(--arca-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--arca-navy-700)]"
                  >
                    {[
                      'Enero',
                      'Febrero',
                      'Marzo',
                      'Abril',
                      'Mayo',
                      'Junio',
                      'Julio',
                      'Agosto',
                      'Septiembre',
                      'Octubre',
                      'Noviembre',
                      'Diciembre',
                    ].map((m, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
                    Día de cierre
                  </label>
                  <select
                    value={balanceDay}
                    onChange={(e) => setBalanceDay(e.target.value)}
                    className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 text-[12.5px] text-[var(--arca-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--arca-navy-700)]"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
                    Días para presentación
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="Opcional"
                    value={balancePresentationDays}
                    onChange={(e) => setBalancePresentationDays(e.target.value)}
                    className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 text-[12.5px] text-[var(--arca-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--arca-navy-700)]"
                  />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <label className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
                    Alertas (días antes)
                  </label>
                  <input
                    type="text"
                    placeholder="60,30,15,7"
                    value={balanceAlertDays}
                    onChange={(e) => setBalanceAlertDays(e.target.value)}
                    className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 text-[12.5px] text-[var(--arca-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--arca-navy-700)]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={upsertBalanceConfigMutation.isPending}
                  onClick={() => {
                    const month = parseInt(balanceMonth, 10);
                    const day = parseInt(balanceDay, 10);
                    const presentationDays = balancePresentationDays
                      ? parseInt(balancePresentationDays, 10)
                      : null;
                    const alertDays = balanceAlertDays
                      .split(',')
                      .map((s) => parseInt(s.trim(), 10))
                      .filter((n) => !isNaN(n) && n > 0);
                    if (isNaN(month) || isNaN(day)) {
                      toast.error('Mes y día son obligatorios');
                      return;
                    }
                    upsertBalanceConfigMutation.mutate({
                      fiscalYearEndMonth: month,
                      fiscalYearEndDay: day,
                      presentationDueDays: presentationDays,
                      alertDaysBefore:
                        alertDays.length > 0 ? alertDays : [60, 30, 15, 7],
                    });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--arca-r-md)] text-[12px] font-semibold bg-[var(--arca-ink)] text-[#F7F6F2] hover:bg-[var(--arca-ink)]/90 transition-colors disabled:opacity-50"
                >
                  {upsertBalanceConfigMutation.isPending
                    ? 'Guardando...'
                    : 'Guardar'}
                </button>
                {balanceConfig && (
                  <span className="text-[11px] text-[var(--arca-ink-4)]">
                    Cierre: {balanceConfig.fiscalYearEndDay}/
                    {balanceConfig.fiscalYearEndMonth}
                  </span>
                )}
              </div>
            </div>
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
                  {resumenNotifSelected?.profileName
                    ? `Notificación — ${resumenNotifSelected.profileName}`
                    : 'Notificación'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                {/* Fechas */}
                <div className="flex gap-6 text-xs text-muted-foreground">
                  {resumenNotifSelected?.publicationDate && (
                    <span>
                      <span className="font-medium text-foreground">
                        Publicación:{' '}
                      </span>
                      {format(
                        new Date(resumenNotifSelected.publicationDate),
                        'dd/MM/yyyy',
                        { locale: es }
                      )}
                    </span>
                  )}
                  {resumenNotifSelected?.expirationDate && (
                    <span>
                      <span className="font-medium text-foreground">
                        Vencimiento:{' '}
                      </span>
                      {format(
                        new Date(resumenNotifSelected.expirationDate),
                        'dd/MM/yyyy',
                        { locale: es }
                      )}
                    </span>
                  )}
                </div>
                {/* Mensaje completo */}
                <p className="leading-relaxed whitespace-pre-wrap">
                  {resumenNotifSelected?.message}
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
          <TabsContent value="deudas" className="mt-4 space-y-[14px]">
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

            {/* Filter Bar */}
            <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] shadow-[var(--arca-shadow-sm)] p-[12px_18px] flex flex-wrap items-center gap-[14px]">
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
              {profiles.length > 1 && (
                <Select
                  value={debtFilterProfileId || 'all'}
                  onValueChange={(v) => {
                    setDebtFilterProfileId(v === 'all' ? '' : v);
                    setDebtFilterImpuesto('');
                    setDebtFilterConcepto('');
                    setDebtPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 gap-1.5 px-3 text-[12px] border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] min-w-[150px]">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                      Empresa
                    </span>
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!loadingDebts && debts.length > 0 && (
                <>
                  <Select
                    value={debtFilterImpuesto || 'all'}
                    onValueChange={(v) => {
                      setDebtFilterImpuesto(v === 'all' ? '' : v);
                      setDebtPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 gap-1.5 px-3 text-[12px] border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] min-w-[130px]">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                        Impuesto
                      </span>
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
                  <Select
                    value={debtFilterConcepto || 'all'}
                    onValueChange={(v) => {
                      setDebtFilterConcepto(v === 'all' ? '' : v);
                      setDebtPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 gap-1.5 px-3 text-[12px] border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] min-w-[130px]">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                        Concepto
                      </span>
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
                  {(debtFilterImpuesto || debtFilterConcepto || debtFilterProfileId) && (
                    <button
                      onClick={() => {
                        setDebtFilterProfileId('');
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
                </>
              )}
              <Button
                size="sm"
                disabled={!!scrapingSection}
                onClick={async () => {
                  setScrapingSection('deudas');
                  try {
                    await scrapSingleJob({
                      data: { representativeId, jobType: 'deuda' },
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
                    className="w-full border-collapse text-[12.5px]"
                    style={{ minWidth: 960 }}
                  >
                    <thead>
                      <tr className="bg-[var(--arca-surface-2)]">
                        {([
                          ...(profiles.length > 1 ? [{ label: 'Perfil', key: 'profileName' as const }] : []),
                          { label: 'Impuesto', key: 'tax' as const },
                          { label: 'Concepto', key: 'concept' as const },
                          { label: 'Período', key: 'period' as const },
                          { label: 'Vencimiento', key: 'dueDate' as const },
                          { label: 'Últ. Actualización', key: 'detectedAt' as const },
                        ]).map(({ label, key }) => (
                          <th
                            key={key}
                            className="px-[14px] py-[9px] text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] border-b border-[var(--arca-border)] whitespace-nowrap cursor-pointer select-none hover:text-[var(--arca-ink-2)] transition-colors"
                            onClick={() => {
                              if (debtSortKey === key) {
                                setDebtSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                              } else {
                                setDebtSortKey(key);
                                setDebtSortDir(key === 'detectedAt' ? 'desc' : 'asc');
                              }
                              setDebtPage(1);
                            }}
                          >
                            {label} {debtSortKey === key ? (debtSortDir === 'asc' ? '▲' : '▼') : ''}
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
                        const balance = Number(debt.balance || 0);
                        const intC = Number(debt.compensatoryInterest || 0);
                        const intP = Number(debt.punitiveInterest || 0);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const due = new Date(debt.dueDate);
                        due.setHours(0, 0, 0, 0);
                        const debtStatus = (debt.status ?? 'open') as
                          | 'open'
                          | 'in_plan'
                          | 'paid'
                          | 'disputed';
                        const isIntimated = debt.isIntimated ?? false;
                        const isOverdue = due < today && balance > 0;
                        // Row background: red=open+overdue, orange=intimated, green=paid, gray=in_plan, default=disputed
                        const rowBg =
                          debtStatus === 'paid'
                            ? 'rgba(34,197,94,0.06)'
                            : debtStatus === 'in_plan'
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
                            {profiles.length > 1 && (
                              <td className="px-[14px] py-[10px] whitespace-nowrap text-[var(--arca-ink-2)] text-[11.5px]">
                                {debt.profileName || '-'}
                              </td>
                            )}
                            <td
                              className="px-[14px] py-[10px] whitespace-nowrap text-[var(--arca-ink)] font-medium"
                              title={debt.tax || '-'}
                            >
                              {debt.tax || '-'}
                            </td>
                            <td
                              className="px-[14px] py-[10px] whitespace-nowrap text-[var(--arca-ink-2)]"
                              title={debt.concept || '-'}
                            >
                              {debt.concept || '-'}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap font-mono text-[var(--arca-ink-3)]">
                              {debt.period || '-'}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap font-mono text-[var(--arca-ink-3)]">
                              {new Date(debt.dueDate).toLocaleDateString(
                                'es-AR'
                              )}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap text-[11px] text-[var(--arca-ink-4)]">
                              {debt.detectedAt
                                ? new Date(debt.detectedAt).toLocaleDateString('es-AR', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
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
                              {debtStatus === 'paid' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]">
                                  Pagada
                                </span>
                              ) : debtStatus === 'in_plan' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[rgba(148,163,184,0.25)] text-[var(--arca-ink-3)]">
                                  En plan
                                </span>
                              ) : debtStatus === 'disputed' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[rgba(139,92,246,0.15)] text-[rgba(139,92,246,0.9)]">
                                  Disputada
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
                              {isIntimated && (
                                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold bg-orange-100 text-orange-700">
                                  Intimada
                                </span>
                              )}
                            </td>
                            <td className="px-[14px] py-[10px] whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <select
                                  value={debtStatus}
                                  onChange={(e) => {
                                    const newStatus = e.target.value as
                                      | 'open'
                                      | 'in_plan'
                                      | 'paid'
                                      | 'disputed';
                                    updateDebtStatusMutation.mutate({
                                      id: debt.id,
                                      status: newStatus,
                                      isIntimated,
                                    });
                                  }}
                                  className="text-[11.5px] border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] px-2 py-1 text-[var(--arca-ink)] cursor-pointer"
                                >
                                  <option value="open">Abierta</option>
                                  <option value="in_plan">En plan</option>
                                  <option value="paid">Pagada</option>
                                  <option value="disputed">Disputada</option>
                                </select>
                                <button
                                  onClick={() =>
                                    updateDebtStatusMutation.mutate({
                                      id: debt.id,
                                      status: debtStatus,
                                      isIntimated: !isIntimated,
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
          <TabsContent value="vencimientos" className="space-y-6 mt-6">
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
                          dueDateStats.nextDueDate.dueDate
                        ).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dueDateStats.nextDueDate.tax || 'Sin impuesto'}
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
                        data: { representativeId, jobType: 'vencimientos' },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: ['representativeDueDates', representativeId],
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
                                title={dueDate.tax || '-'}
                              >
                                {dueDate.tax || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.concept || '-'}
                              >
                                {dueDate.concept || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.subConcept || '-'}
                              >
                                {dueDate.subConcept || '-'}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.period || '-'}
                              >
                                {dueDate.period || '-'}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-center">
                                {dueDate.quotaNumber || '-'}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {new Date(dueDate.dueDate).toLocaleDateString(
                                  'es-AR'
                                )}
                              </TableCell>
                              <TableCell
                                className="truncate"
                                title={dueDate.detail || '-'}
                              >
                                {dueDate.detail || '-'}
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
          <TabsContent value="notificaciones" className="space-y-6 mt-6">
            <div className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
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
                        data: { representativeId, jobType: 'notificaciones' },
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ['clientNotifications', representativeId],
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
            <NotificationsView representativeId={representativeId} className="min-h-[500px]" />
          </TabsContent>

          {/* Facturas Tab */}
          <TabsContent value="facturas" className="space-y-6 mt-6">
            {/* <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              disabled={!!scrapingSection}
              onClick={async () => {
                setScrapingSection("facturas");
                try {
                  await scrapSingleJob({
                    data: { representativeId, jobType: "comprobantes" },
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
                        data: { representativeId, jobType: 'comprobantes' },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: ['clientAllInvoices', representativeId],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['invoices'],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['lastComprobantesFullJob', representativeId],
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

                <span className="text-sm text-muted-foreground shrink-0 ml-1">
                  Perfil:
                </span>
                <Select
                  value={facturasProfileFilter}
                  onValueChange={setFacturasProfileFilter}
                >
                  <SelectTrigger className="w-[160px] h-9">
                    <SelectValue placeholder="Perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los perfiles</SelectItem>
                    {(
                      profiles as {
                        id: string;
                        name?: string;
                        identityNumber?: string;
                      }[]
                    ).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name || p.identityNumber || p.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

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
              representativeId={representativeId}
              controlledDateFrom={facturasBounds.dateFrom}
              controlledDateTo={facturasBounds.dateTo}
              controlledProfileFilter={facturasProfileFilter}
              controlledTypeFilter={facturasTypeFilter}
              controlledDirectionFilter={facturasDirectionFilter}
              controlledSearchTerm={facturasDebouncedSearchTerm}
              onFiltersChange={facturasOnFiltersChange}
            />
          </TabsContent>

          {/* Convenio Multilateral Tab */}
          <TabsContent value="convenio-multilateral" className="space-y-6 mt-6">
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
                    Perfil:
                  </span>
                  {effectiveMultilateralProfileId ? (
                    <Select
                      key={`multilateral-${representativeId}`}
                      defaultValue={effectiveMultilateralProfileId}
                      onValueChange={(value) =>
                        setMultilateralProfileId(value || undefined)
                      }
                      disabled={loadingProfiles || profiles.length <= 1}
                    >
                      <SelectTrigger className="h-9 min-w-[220px] w-auto">
                        <SelectValue placeholder="Seleccionar perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(
                          (profile: {
                            id: string;
                            name?: string;
                            identityNumber?: string;
                          }) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name ||
                                profile.identityNumber ||
                                profile.id}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="min-w-[220px] text-sm text-muted-foreground">
                      {loadingProfiles
                        ? 'Cargando perfiles...'
                        : profiles.length === 0
                          ? 'Sin perfiles'
                          : 'Seleccionar perfil'}
                    </span>
                  )}
                </div>
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
                            row.receiptProvince || 'Sin datos';
                          const provinceValue = row.receiptProvince ?? null; // null para agrupar "Sin datos"
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
          <TabsContent value="iva" className="mt-6">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground shrink-0">
                  Perfil para IVA:
                </span>
                {effectiveIvaProfileId ? (
                  <Select
                    key={`iva-${representativeId}`}
                    defaultValue={effectiveIvaProfileId}
                    onValueChange={(value) =>
                      setIvaProfileId(value || undefined)
                    }
                    disabled={loadingProfiles || profiles.length <= 1}
                  >
                    <SelectTrigger className="h-9 min-w-[200px] w-auto">
                      <SelectValue placeholder="Seleccionar perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map(
                        (profile: {
                          id: string;
                          name?: string;
                          identityNumber?: string;
                        }) => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name ||
                              profile.identityNumber ||
                              profile.id}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="min-w-[200px] text-sm text-muted-foreground">
                    {loadingProfiles
                      ? 'Cargando perfiles...'
                      : profiles.length === 0
                        ? 'Sin perfiles'
                        : 'Seleccionar perfil'}
                  </span>
                )}
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
          <TabsContent value="solicitudes" className="mt-4">
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
        </div>
        {/* end content area */}
      </Tabs>

      <EditRepresentativeDialog
        representativeId={representativeId}
        open={editRepresentativeDialogOpen}
        onOpenChange={setEditRepresentativeDialogOpen}
      />

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
                          Nro. desde
                        </TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Nro. hasta
                        </TableHead>
                        <TableHead className="whitespace-nowrap min-w-[180px]">
                          Emisor
                        </TableHead>
                        <TableHead className="whitespace-nowrap min-w-[180px]">
                          Destinatario
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
                      {multilateralDetailInvoices.map((inv: any) => (
                        <TableRow
                          key={inv.id}
                          className="hover:bg-muted/50 transition-colors"
                        >
                          <TableCell className="text-[11px]">
                            {inv.emitionDate
                              ? new Date(inv.emitionDate).toLocaleDateString(
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
                            {getInvoiceTypeLabel(inv.type)}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.salePoint || '—'}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.numberFrom || '—'}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.numberTo || '—'}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="truncate" title={inv.emitterName}>
                              {inv.emitterName || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="truncate" title={inv.recipientName}>
                              {inv.recipientName || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.currency || 'ARS'}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(
                              inv.baseImponible ?? inv.amountTaxed
                            )}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(inv.totalIVA)}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(inv.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {multilateralDetailInvoices.map((inv: any) => (
                    <div
                      key={inv.id}
                      className="rounded-md border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{inv.type || '—'}</span>
                        <span className="text-muted-foreground">
                          {inv.emitionDate
                            ? new Date(inv.emitionDate).toLocaleDateString(
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
                          {inv.salePoint || '—'}
                        </span>
                        <span className="text-muted-foreground">
                          Nro. desde/hasta
                        </span>
                        <span className="text-right">
                          {inv.numberFrom || '—'} / {inv.numberTo || '—'}
                        </span>
                        <span className="text-muted-foreground">Emisor</span>
                        <span
                          className="text-right truncate"
                          title={inv.emitterName}
                        >
                          {inv.emitterName || '—'}
                        </span>
                        <span className="text-muted-foreground">
                          Destinatario
                        </span>
                        <span
                          className="text-right truncate"
                          title={inv.recipientName}
                        >
                          {inv.recipientName || '—'}
                        </span>
                        <span className="text-muted-foreground">Moneda</span>
                        <span className="text-right">
                          {inv.currency || 'ARS'}
                        </span>
                        <span className="text-muted-foreground">
                          Base imponible
                        </span>
                        <span className="text-right">
                          {formatIvaCurrency(
                            inv.baseImponible ?? inv.amountTaxed
                          )}
                        </span>
                        <span className="text-muted-foreground">Total IVA</span>
                        <span className="text-right">
                          {formatIvaCurrency(inv.totalIVA)}
                        </span>
                        <span className="text-muted-foreground font-medium">
                          Total
                        </span>
                        <span className="text-right font-medium">
                          {formatIvaCurrency(inv.amount)}
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
