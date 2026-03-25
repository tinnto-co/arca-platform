import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarIcon,
  Edit,
  FileText,
  User,
  Mail,
  Phone,
  MapPin,
  Copy,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getClient,
  getClientProfiles,
  getClientDebts,
  getClientDueDates,
  getClientIvaCredit,
  getLastJobByType,
  getRunningJobByType,
} from "@/actions/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { NotificationsView } from "@/components/notifications-view";
import { InvoicesTable, INVOICE_TYPE_LABELS, type InvoicesTableRef } from "@/components/invoices-table";
import {
  getInvoices,
  getClientMultilateralSummary,
  getClientMultilateralInvoices,
} from "@/actions/invoice";
import {
  getNotifications,
  markNotificationOpened,
} from "@/actions/notification";
import { scrapSingleJob } from "@/actions/client";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Clock, CalendarCheck, CalendarX, Loader2, TrendingUp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RenderIvaResume,
  getMonthBounds,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  type RenderIvaResumeRef,
} from "./render-iva-resume";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as DateRangeCalendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { userQuery } from "../lib/user-query";
import { INVOICE_TYPES } from "../../../arca-scrapper/invoicesTypes";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

interface ClientDetailPageProps {
  clientId: string;
}

const INVOICE_TYPE_MAP = new Map(
  INVOICE_TYPES.map((t) => [t.clave, t.valor] as const)
);

const getInvoiceTypeLabel = (code: string | number | null | undefined) => {
  if (code === null || code === undefined || code === "") return "—";
  const normalized = String(code);
  return INVOICE_TYPE_MAP.get(normalized) ?? normalized;
};

const facturasChartConfig = {
  ventas: { label: "Ventas", color: "hsl(142, 76%, 36%)" },
  compras: { label: "Compras", color: "hsl(0, 72%, 51%)" },
} satisfies ChartConfig;

/** Convenio Multilateral: comparativa período actual vs anterior */
const convenioChartConfig = {
  actual: { label: "Período actual", color: "hsl(142, 76%, 36%)" },
  anterior: { label: "Período anterior", color: "hsl(215, 20%, 55%)" },
} satisfies ChartConfig;

const formatIvaCurrency = (
  value: string | number | null | undefined
): string => {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(n);
};

type MetricDeltaProps = {
  current: number;
  previous: number;
  label?: string;
};

const MetricDelta = ({
  current,
  previous,
  label = "vs. mes anterior",
}: MetricDeltaProps) => {
  if (previous === 0 && current === 0) {
    return (
      <p className="text-xs text-muted-foreground mt-1">{label}: sin cambios</p>
    );
  }

  if (previous === 0 && current !== 0) {
    return (
      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
        {label}: nuevo período con actividad
      </p>
    );
  }

  const diff = current - previous;
  const diffPct = (diff / Math.abs(previous)) * 100;
  const sign = diff > 0 ? "+" : "";
  const formattedPct = `${sign}${diffPct.toFixed(1)}%`;

  return (
    <p
      className={`text-xs mt-1 ${diff > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : diff < 0
          ? "text-red-600 dark:text-red-400"
          : "text-muted-foreground"
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
  const mm = String(prev.getMonth() + 1).padStart(2, "0");
  const yyyy = prev.getFullYear();
  return `${mm}/${yyyy}`;
}

/** Período "MM/YYYY" del mes que representa la fecha (ej. 1 feb 2026 → "02/2026"). Es el período del resumen que ve el usuario. */
function getResumenPeriodMMYYYY(from: Date | undefined): string | null {
  if (!from) return null;
  const mm = from.getMonth() + 1;
  const yyyy = from.getFullYear();
  return `${String(mm).padStart(2, "0")}/${yyyy}`;
}

/** Mínimo de caracteres del nombre del perfil para considerarlo un match (evita "S", "A", etc.). */
const MIN_PROFILE_NAME_LENGTH = 3;

/**
 * Elige el id del perfil que mejor coincide con el nombre del cliente (case-insensitive, por contiene).
 * Ej: cliente "Smart Solutions SRL" → perfil "Smart Solutions" (el nombre del perfil está contenido en el del cliente).
 */
function findBestMatchingProfileId(
  clientName: string | undefined,
  profiles: Array<{ id: string; name?: string }>
): string | undefined {
  if (!profiles.length) return undefined;
  const normalizedClient = (clientName ?? "").trim().toLowerCase();
  if (normalizedClient.length < 2) return profiles[0].id;

  const withName = profiles.filter(
    (p) => ((p.name ?? "").trim().length >= MIN_PROFILE_NAME_LENGTH)
  );
  if (withName.length === 0) return profiles[0].id;

  const containedInClient = withName
    .filter((p) =>
      normalizedClient.includes((p.name ?? "").trim().toLowerCase())
    )
    .sort((a, b) => (b.name ?? "").length - (a.name ?? "").length);
  if (containedInClient.length > 0) return containedInClient[0].id;

  const clientInProfile = withName.find((p) =>
    (p.name ?? "").trim().toLowerCase().includes(normalizedClient)
  );
  if (clientInProfile) return clientInProfile.id;

  return profiles[0].id;
}

export function ClientDetailPage({ clientId }: ClientDetailPageProps) {
  const navigate = useNavigate();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editClientDialogOpen, setEditClientDialogOpen] = useState(false);
  const now = new Date();
  const initialMultilateralRange = getMonthBounds(
    now.getFullYear(),
    now.getMonth()
  );
  const [ivaProfileId, setIvaProfileId] = useState<string | undefined>(undefined);
  const [multilateralProfileId, setMultilateralProfileId] = useState<string | undefined>(undefined);
  const [resumenProfileId, setResumenProfileId] = useState<string | undefined>(undefined);
  const [resumenNotifProfileId, setResumenNotifProfileId] = useState<string | "all">("all");
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
  const [selectedMultilateralProvince, setSelectedMultilateralProvince] = useState<string | null>(null);
  const [selectedMultilateralProvinceLabel, setSelectedMultilateralProvinceLabel] = useState<string | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [multilateralSortKey, setMultilateralSortKey] = useState<
    "count" | "iva" | "base" | null
  >(null);
  const [multilateralSortDir, setMultilateralSortDir] = useState<"asc" | "desc">("desc");
  /** Rango de fechas elegido en el resumen IVA (para resaltar el scrape del período usado). */
  const [ivaResumenDateRange, setIvaResumenDateRange] = useState<{
    from: Date;
    to: Date;
  }>(() => getMonthBounds(now.getFullYear(), now.getMonth()));
  const [ivaPeriodPickerOpen, setIvaPeriodPickerOpen] = useState(false);
  /** Sección que está ejecutando un job (iva = comprobantes_full + iva, deudas = deuda, vencimientos = vencimientos, facturas = comprobantes_full, notificaciones = notificaciones). */
  const [scrapingSection, setScrapingSection] = useState<"iva" | "deudas" | "vencimientos" | "facturas" | "notificaciones" | null>(null);
  /** Filtros del módulo de deudas (vacío = todos). */
  const [debtFilterImpuesto, setDebtFilterImpuesto] = useState<string>("");
  const [debtFilterConcepto, setDebtFilterConcepto] = useState<string>("");
  const [debtPage, setDebtPage] = useState(1);
  const [dueDatePage, setDueDatePage] = useState(1);

  /** Período para el módulo Facturas: sin período, por año, por mes o rango de días. */
  const [facturasPeriodType, setFacturasPeriodType] = useState<"none" | "year" | "month" | "range">("none");
  const [facturasYear, setFacturasYear] = useState(() => now.getFullYear());
  const [facturasMonth, setFacturasMonth] = useState(now.getMonth());
  const [facturasDateRange, setFacturasDateRange] = useState<DateRange | undefined>(undefined);
  const [facturasPeriodPickerOpen, setFacturasPeriodPickerOpen] = useState(false);
  /** Filtros de la tabla de facturas (perfil, tipo, dirección) para que los totales Ventas/Compras los respeten. */
  const [facturasProfileFilter, setFacturasProfileFilter] = useState<string>("all");
  const [facturasTypeFilter, setFacturasTypeFilter] = useState<string>("all");
  const [facturasDirectionFilter, setFacturasDirectionFilter] = useState<string>("all");
  const facturasOnFiltersChange = useCallback(
    ({ profileFilter, typeFilter, directionFilter }: { profileFilter: string; typeFilter: string; directionFilter: string }) => {
      setFacturasProfileFilter(profileFilter);
      setFacturasTypeFilter(typeFilter);
      setFacturasDirectionFilter(directionFilter);
    },
    []
  );
  const [facturasSearchTerm, setFacturasSearchTerm] = useState("");
  const [facturasDebouncedSearchTerm, setFacturasDebouncedSearchTerm] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFacturasDebouncedSearchTerm(facturasSearchTerm), 500);
    return () => clearTimeout(timer);
  }, [facturasSearchTerm]);
  const invoicesTableRef = useRef<InvoicesTableRef>(null);
  const queryClient = useQueryClient();
  const { data: sessionUser } = useQuery(userQuery);
  const orgKey = sessionUser?.activeOrganizationId ?? "__pending__";

  const markOpenedMutation = useMutation({
    mutationFn: (id: string) => markNotificationOpened({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["unreadNotifications", orgKey, clientId],
      });
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
    queryKey: ["client", clientId],
    queryFn: async () => {
      const result = await getClient({ data: { id: clientId } });
      return result;
    },
  });

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["clientProfiles", clientId],
    queryFn: () => getClientProfiles({ data: { clientId } }),
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
    queryKey: ["clientIva", clientId, effectiveIvaProfileId, periodoFiscalResumen],
    queryFn: () =>
      getClientIvaCredit({
        data: {
          clientId,
          profileId: effectiveIvaProfileId ?? undefined,
          periodoFiscalResumen: periodoFiscalResumen ?? undefined,
        },
      }),
    enabled: !!effectiveIvaProfileId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  /** IVA para el cuadro del Resumen: usa el perfil seleccionado en "Perfiles Asociados". */
  const {
    data: resumenClientIva,
    isLoading: loadingResumenClientIva,
  } = useQuery({
    queryKey: ["clientIva", clientId, effectiveResumenProfileId, periodoFiscalResumen],
    queryFn: () =>
      getClientIvaCredit({
        data: {
          clientId,
          profileId: effectiveResumenProfileId ?? undefined,
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
    setResumenNotifProfileId("all");
    const range = getMonthBounds(now.getFullYear(), now.getMonth());
    setMultilateralPeriod(range);
    setMultilateralDateFrom(range.from.toISOString().slice(0, 10));
    setMultilateralDateTo(range.to.toISOString().slice(0, 10));
  }, [clientId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktopViewport(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  const { data: debts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ["clientDebts", clientId],
    queryFn: () => getClientDebts({ data: { clientId } }),
  });

  const { data: dueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ["clientDueDates", clientId],
    queryFn: () => getClientDueDates({ data: { clientId } }),
  });

  // Últimos jobs por tipo para mostrar errores en Resumen
  const { data: lastComprobantesJob } = useQuery({
    queryKey: ["lastComprobantesJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "comprobantes" } }),
    enabled: !!clientId,
  });

  const { data: lastIvaJob } = useQuery({
    queryKey: ["lastIvaJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "iva" } }),
    enabled: !!clientId,
  });

  const { data: lastNotificacionesJob } = useQuery({
    queryKey: ["lastNotificacionesJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "notificaciones" } }),
    enabled: !!clientId,
  });

  const { data: lastDeudaJob } = useQuery({
    queryKey: ["lastDeudaJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "deuda" } }),
    enabled: !!clientId,
  });

  const { data: unreadNotifications, isLoading: loadingUnreadNotifications } = useQuery({
    queryKey: ["unreadNotifications", orgKey, clientId, resumenNotifProfileId],
    queryFn: () =>
      getNotifications({
        data: {
          clientFilter: clientId,
          profileId: resumenNotifProfileId !== "all" ? resumenNotifProfileId : undefined,
          opened: false,
          limit: 50,
          page: 1,
        },
      }),
    enabled: !!clientId,
  });

  const { data: lastVencimientosJob } = useQuery({
    queryKey: ["lastVencimientosJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "vencimientos" } }),
    enabled: !!clientId,
  });

  // Job incremental de comprobantes en curso (para mostrar loader de IVA aunque se haya iniciado en otro lado)
  const { data: runningComprobantesJob } = useQuery({
    queryKey: ["runningComprobantesJob", clientId],
    queryFn: () =>
      getRunningJobByType({ data: { clientId, jobType: "comprobantes" } }),
    enabled: !!clientId,
    // Refrescar cada 5s para reflejar cambios de estado
    refetchInterval: 5000,
  });

  // Get all invoices for the client to calculate totals
  const { data: allInvoicesData } = useQuery({
    queryKey: ["clientAllInvoices", clientId],
    queryFn: () =>
      getInvoices({
        data: {
          page: 1,
          limit: 10000, // Get all invoices
          clientFilter: clientId,
        },
      }),
  });

  const {
    data: multilateralSummary = [],
    isLoading: loadingMultilateralSummary,
  } = useQuery({
    queryKey: [
      "clientMultilateralSummary",
      clientId,
      effectiveMultilateralProfileId,
      multilateralDateFrom,
      multilateralDateTo,
    ],
    queryFn: () =>
      getClientMultilateralSummary({
        data: {
          clientId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!clientId,
  });

  const multilateralPrevDateFrom = multilateralPrevPeriod
    ? multilateralPrevPeriod.from.toISOString().slice(0, 10)
    : undefined;
  const multilateralPrevDateTo = multilateralPrevPeriod
    ? multilateralPrevPeriod.to.toISOString().slice(0, 10)
    : undefined;

  const { data: multilateralSummaryPrev = [] } = useQuery({
    queryKey: [
      "clientMultilateralSummaryPrev",
      clientId,
      effectiveMultilateralProfileId,
      multilateralPrevDateFrom,
      multilateralPrevDateTo,
    ],
    queryFn: () =>
      getClientMultilateralSummary({
        data: {
          clientId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          dateFrom: multilateralPrevDateFrom,
          dateTo: multilateralPrevDateTo,
        },
      }),
    enabled: !!clientId && !!multilateralPrevDateFrom && !!multilateralPrevDateTo,
  });

  type MultilateralAgg = {
    provinces: number;
    invoices: number;
    totalIVA: number;
    totalBase: number;
  };

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
        metrica: "Provincias",
        actual: multilateralAggCurrent.provinces,
        anterior: multilateralAggPrev.provinces,
      },
      {
        metrica: "Comprobantes",
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
        metrica: "Total IVA",
        actual: Number(multilateralAggCurrent.totalIVA) || 0,
        anterior: Number(multilateralAggPrev.totalIVA) || 0,
      },
      {
        metrica: "Base imponible",
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
      const dir = multilateralSortDir === "asc" ? 1 : -1;
      let av = 0;
      let bv = 0;
      if (multilateralSortKey === "count") {
        av = Number(a.invoiceCount ?? 0);
        bv = Number(b.invoiceCount ?? 0);
      } else if (multilateralSortKey === "iva") {
        av = Number(a.totalIVA ?? 0);
        bv = Number(b.totalIVA ?? 0);
      } else if (multilateralSortKey === "base") {
        av = Number(a.totalTaxed ?? 0);
        bv = Number(b.totalTaxed ?? 0);
      }
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return copy;
  }, [multilateralSummary, multilateralSortKey, multilateralSortDir]);

  const toggleMultilateralSort = (key: "count" | "iva" | "base") => {
    setMultilateralSortKey((prevKey) => {
      // Caso 1: nuevo campo → ordenar ASC
      if (prevKey !== key) {
        setMultilateralSortDir("asc");
        return key;
      }

      // Caso 2: mismo campo y estaba ASC → pasar a DESC
      if (multilateralSortDir === "asc") {
        setMultilateralSortDir("desc");
        return key;
      }

      // Caso 3: mismo campo y estaba DESC → limpiar orden (sin ordenar)
      setMultilateralSortDir("asc");
      return null;
    });
  };

  const {
    data: multilateralDetailInvoices = [],
    isLoading: loadingMultilateralDetail,
  } = useQuery({
    queryKey: [
      "clientMultilateralInvoices",
      clientId,
      effectiveMultilateralProfileId,
      multilateralDateFrom,
      multilateralDateTo,
      selectedMultilateralProvince,
    ],
    queryFn: () =>
      getClientMultilateralInvoices({
        data: {
          clientId,
          profileId: effectiveMultilateralProfileId ?? undefined,
          receiptProvince: selectedMultilateralProvince,
          dateFrom: multilateralDateFrom || undefined,
          dateTo: multilateralDateTo || undefined,
        },
      }),
    enabled: !!clientId && multilateralDetailOpen,
  });

  const multilateralDetailTotals = useMemo(() => {
    if (!multilateralDetailInvoices?.length) {
      return { base: 0, iva: 0, total: 0 };
    }
    return multilateralDetailInvoices.reduce(
      (acc: { base: number; iva: number; total: number }, inv: any) => {
        acc.base += Number(inv.amountTaxed ?? 0);
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
    toast.success("Copiado al portapapeles");
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
      new Set(debts.map((d) => (d.tax ?? "").trim()).filter(Boolean))
    ).sort();
    const conceptos = Array.from(
      new Set(debts.map((d) => (d.concept ?? "").trim()).filter(Boolean))
    ).sort();
    return { impuestos, conceptos };
  }, [debts]);

  // Deudas filtradas por impuesto y concepto
  const filteredDebts = useMemo(() => {
    return debts.filter((debt) => {
      if (debtFilterImpuesto && (debt.tax ?? "").trim() !== debtFilterImpuesto)
        return false;
      if (debtFilterConcepto && (debt.concept ?? "").trim() !== debtFilterConcepto)
        return false;
      return true;
    });
  }, [debts, debtFilterImpuesto, debtFilterConcepto]);

  const ITEMS_PER_PAGE = 10;
  const debtTotalPages = Math.max(1, Math.ceil(filteredDebts.length / ITEMS_PER_PAGE));
  const pagedDebts = filteredDebts.slice((debtPage - 1) * ITEMS_PER_PAGE, debtPage * ITEMS_PER_PAGE);
  const dueDateTotalPages = Math.max(1, Math.ceil(dueDates.length / ITEMS_PER_PAGE));
  const pagedDueDates = dueDates.slice((dueDatePage - 1) * ITEMS_PER_PAGE, dueDatePage * ITEMS_PER_PAGE);

  const getPageRange = (currentPage: number, totalPages: number) => {
    const maxVisible = 7;
    if (totalPages <= maxVisible) return { startPage: 1, endPage: totalPages };
    let startPage = Math.max(1, currentPage - 3);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
    return { startPage, endPage };
  };

  /** Formatea una fecha en hora local como YYYY-MM-DD (evita desfase por UTC con toISOString). */
  const formatLocalYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  /** Parsea YYYY-MM-DD como fecha en hora local (evita que "2026-01-01" se interprete como UTC y cambie de día). */
  const parseLocalDateOnly = (s: string): Date => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  /** Coincide tipo de factura con el filtro (código exacto o etiqueta "...(código)" al final). */
  const matchInvoiceType = (invType: string | null | undefined, typeFilter: string): boolean => {
    if (!typeFilter || typeFilter === "all") return true;
    const t = (invType ?? "").trim();
    if (t === typeFilter) return true;
    if (/^\d+$/.test(typeFilter) && new RegExp(`\\(${typeFilter}\\)$`).test(t)) return true;
    return false;
  };

  /** True si la factura pasa los filtros de perfil, tipo y dirección (para totales Ventas/Compras). */
  const invoicePassesFacturasFilters = (inv: any): boolean => {
    if (facturasProfileFilter && facturasProfileFilter !== "all") {
      if ((inv.profileId ?? inv.profile) !== facturasProfileFilter) return false;
    }
    if (facturasTypeFilter && facturasTypeFilter !== "all") {
      if (!matchInvoiceType(inv.type, facturasTypeFilter)) return false;
    }
    if (facturasDirectionFilter && facturasDirectionFilter !== "all") {
      const dir = (inv.direction ?? "").trim();
      if (dir.toLowerCase() !== facturasDirectionFilter.toLowerCase()) return false;
    }
    return true;
  };

  /** Rango de fechas para Facturas según tipo de período seleccionado. */
  const facturasBounds = useMemo((): { dateFrom: string | undefined; dateTo: string | undefined } => {
    if (facturasPeriodType === "none") return { dateFrom: undefined, dateTo: undefined };
    if (facturasPeriodType === "year") {
      const from = new Date(facturasYear, 0, 1);
      const to = new Date(facturasYear, 11, 31);
      return { dateFrom: formatLocalYYYYMMDD(from), dateTo: formatLocalYYYYMMDD(to) };
    }
    if (facturasPeriodType === "month") {
      const { from, to } = getMonthBounds(facturasYear, facturasMonth);
      return { dateFrom: formatLocalYYYYMMDD(from), dateTo: formatLocalYYYYMMDD(to) };
    }
    if (facturasPeriodType === "range" && facturasDateRange?.from && facturasDateRange?.to) {
      return {
        dateFrom: format(facturasDateRange.from, "yyyy-MM-dd"),
        dateTo: format(facturasDateRange.to, "yyyy-MM-dd"),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [facturasPeriodType, facturasYear, facturasMonth, facturasDateRange]);

  /** Totales de Ventas y Compras filtrados por el período de Facturas; null si no hay período seleccionado. */
  const invoiceStatsFiltered = useMemo(() => {
    if (!facturasBounds.dateFrom || !facturasBounds.dateTo || !allInvoicesData?.invoices) {
      if (facturasPeriodType !== "none") return { totalSales: 0, totalPurchases: 0 };
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
      let amount = parseFloat(inv.amount || "0");
      if (inv.currency?.toUpperCase() === "USD") {
        const rate = parseFloat(inv.currencyRate || "1");
        amount = amount * rate;
      }
      const direction = inv.direction?.toLowerCase();
      if (direction === "outbound") totalSales += amount;
      else if (direction === "inbound") totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [allInvoicesData, facturasBounds, facturasPeriodType, facturasProfileFilter, facturasTypeFilter, facturasDirectionFilter]);

  /** Totales del período anterior (mes anterior o año anterior) para la variación %. */
  const invoiceStatsPrevious = useMemo(() => {
    if (!allInvoicesData?.invoices?.length) return null;
    if (facturasPeriodType === "month") {
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
        let amount = parseFloat(inv.amount || "0");
        if (inv.currency?.toUpperCase() === "USD") amount *= parseFloat(inv.currencyRate || "1");
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") totalSales += amount;
        else if (dir === "inbound") totalPurchases += amount;
      });
      return { totalSales, totalPurchases };
    }
    if (facturasPeriodType === "year") {
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
        let amount = parseFloat(inv.amount || "0");
        if (inv.currency?.toUpperCase() === "USD") amount *= parseFloat(inv.currencyRate || "1");
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") totalSales += amount;
        else if (dir === "inbound") totalPurchases += amount;
      });
      return { totalSales, totalPurchases };
    }
    return null;
  }, [allInvoicesData, facturasPeriodType, facturasYear, facturasMonth, facturasProfileFilter, facturasTypeFilter, facturasDirectionFilter]);

  /** Variación % vs período anterior: { salesPct, purchasesPct } o null si no aplica. */
  const facturasVariationPct = useMemo(() => {
    if (invoiceStatsFiltered == null || invoiceStatsPrevious == null) return null;
    if (facturasPeriodType !== "month" && facturasPeriodType !== "year") return null;
    const salesPct =
      invoiceStatsPrevious.totalSales === 0
        ? (invoiceStatsFiltered.totalSales === 0 ? 0 : null)
        : ((invoiceStatsFiltered.totalSales - invoiceStatsPrevious.totalSales) / invoiceStatsPrevious.totalSales) * 100;
    const purchasesPct =
      invoiceStatsPrevious.totalPurchases === 0
        ? (invoiceStatsFiltered.totalPurchases === 0 ? 0 : null)
        : ((invoiceStatsFiltered.totalPurchases - invoiceStatsPrevious.totalPurchases) / invoiceStatsPrevious.totalPurchases) * 100;
    return { salesPct, purchasesPct };
  }, [invoiceStatsFiltered, invoiceStatsPrevious, facturasPeriodType]);

  /** Datos para el gráfico de barras Ventas/Compras: por mes o por año según el filtro de período. Respeta perfil, tipo y dirección. */
  const facturasChartData = useMemo((): { period: string; ventas: number; compras: number }[] => {
    const invoices = allInvoicesData?.invoices;
    if (!invoices?.length) return [];
    const filtered = invoices.filter((inv: any) => invoicePassesFacturasFilters(inv));
    const getAmount = (inv: any): number => {
      let amount = parseFloat(inv.amount || "0");
      if (inv.currency?.toUpperCase() === "USD") {
        const rate = parseFloat(inv.currencyRate || "1");
        amount = amount * rate;
      }
      return amount;
    };

    // Por año: barras de todos los meses del año seleccionado
    if (facturasPeriodType === "year") {
      const byMonth: Record<number, { ventas: number; compras: number }> = {};
      for (let i = 0; i < 12; i++) byMonth[i] = { ventas: 0, compras: 0 };
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        if (d.getFullYear() !== facturasYear) return;
        const m = d.getMonth();
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") byMonth[m].ventas += amount;
        else if (dir === "inbound") byMonth[m].compras += amount;
      });
      return Array.from({ length: 12 }, (_, i) => ({
        period: MONTH_NAMES_SHORT[i],
        ventas: byMonth[i]?.ventas ?? 0,
        compras: byMonth[i]?.compras ?? 0,
      }));
    }

    // Por mes: solo el mes seleccionado (una barra de ventas y una de compras)
    if (facturasPeriodType === "month") {
      let ventas = 0;
      let compras = 0;
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        if (d.getFullYear() !== facturasYear || d.getMonth() !== facturasMonth) return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") ventas += amount;
        else if (dir === "inbound") compras += amount;
      });
      const periodLabel = `${MONTH_NAMES[facturasMonth]} ${facturasYear}`;
      return [{ period: periodLabel, ventas, compras }];
    }

    if (facturasPeriodType === "range" && facturasDateRange?.from && facturasDateRange?.to) {
      const from = new Date(facturasDateRange.from.getFullYear(), facturasDateRange.from.getMonth(), 1);
      const to = new Date(facturasDateRange.to.getFullYear(), facturasDateRange.to.getMonth(), 1);
      const byMonthKey: Record<string, { ventas: number; compras: number }> = {};
      for (let t = from.getTime(); t <= to.getTime();) {
        const d = new Date(t);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonthKey[key] = { ventas: 0, compras: 0 };
        d.setMonth(d.getMonth() + 1);
        t = d.getTime();
      }
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") byMonthKey[key].ventas += amount;
        else if (dir === "inbound") byMonthKey[key].compras += amount;
      });
      return Object.entries(byMonthKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => {
          const [y, m] = key.split("-").map(Number);
          const label = `${MONTH_NAMES_SHORT[m - 1]} ${y}`;
          return { period: label, ventas: data.ventas, compras: data.compras };
        });
    }

    if (facturasPeriodType === "none") {
      const now = new Date();
      const byMonthKey: Record<string, { ventas: number; compras: number }> = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonthKey[key] = { ventas: 0, compras: 0 };
      }
      filtered.forEach((inv: any) => {
        const d = new Date(inv.emitionDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonthKey[key]) return;
        const amount = getAmount(inv);
        const dir = inv.direction?.toLowerCase();
        if (dir === "outbound") byMonthKey[key].ventas += amount;
        else if (dir === "inbound") byMonthKey[key].compras += amount;
      });
      return Object.entries(byMonthKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, data]) => {
          const [y, m] = key.split("-").map(Number);
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

  /** Datos del gráfico para el Resumen: meses del año en curso, sin filtros de Facturas. */
  const resumenChartData = useMemo((): { period: string; ventas: number; compras: number }[] => {
    const invoices = allInvoicesData?.invoices;
    if (!invoices?.length) return [];
    const year = now.getFullYear();
    const byMonth: Record<number, { ventas: number; compras: number }> = {};
    for (let i = 0; i < 12; i++) byMonth[i] = { ventas: 0, compras: 0 };
    invoices.forEach((inv: any) => {
      if (effectiveResumenProfileId && inv.profileId !== effectiveResumenProfileId) return;
      const d = new Date(inv.emitionDate);
      if (d.getFullYear() !== year) return;
      let amount = parseFloat(inv.amount || "0");
      if (inv.currency?.toUpperCase() === "USD") amount *= parseFloat(inv.currencyRate || "1");
      const dir = inv.direction?.toLowerCase();
      if (dir === "outbound") byMonth[d.getMonth()].ventas += amount;
      else if (dir === "inbound") byMonth[d.getMonth()].compras += amount;
    });
    return Array.from({ length: 12 }, (_, i) => ({
      period: MONTH_NAMES_SHORT[i],
      ventas: byMonth[i].ventas,
      compras: byMonth[i].compras,
    }));
  }, [allInvoicesData, effectiveResumenProfileId]);

  /** Totales del mes actual para el Resumen. */
  const resumenCurrentMonthStats = useMemo(() => {
    const invoices = allInvoicesData?.invoices;
    if (!invoices?.length) return { totalSales: 0, totalPurchases: 0 };
    const now = new Date();
    const { from, to } = getMonthBounds(now.getFullYear(), now.getMonth());
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    let totalSales = 0;
    let totalPurchases = 0;
    invoices.forEach((inv: any) => {
      if (effectiveResumenProfileId && inv.profileId !== effectiveResumenProfileId) return;
      const invDate = new Date(inv.emitionDate);
      if (invDate < fromDate || invDate > toDate) return;
      let amount = parseFloat(inv.amount || "0");
      if (inv.currency?.toUpperCase() === "USD") amount *= parseFloat(inv.currencyRate || "1");
      const dir = inv.direction?.toLowerCase();
      if (dir === "outbound") totalSales += amount;
      else if (dir === "inbound") totalPurchases += amount;
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

  return (
    <div className="space-y-4 p-4 md:space-y-6 md:p-0 md:m-[3rem]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate({ to: "/clients" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold truncate">{client.name}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditClientDialogOpen(true)}
            className="gap-2"
          >
            <Edit className="h-4 w-4" />
            Editar
          </Button>
          <EditClientDialog
            clientId={clientId}
            open={editClientDialogOpen}
            onOpenChange={setEditClientDialogOpen}
          />
        </div>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="resumen" className="w-full">
        <TabsList className="flex flex-wrap h-auto w-full gap-1">
          <TabsTrigger value="resumen">
            <FileText className="mr-2 h-4 w-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger
            value="deudas"
            className={cn(
              lastDeudaJob && !lastDeudaJob.success
                ? "text-orange-600 dark:text-orange-400"
                : undefined
            )}
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Deudas
          </TabsTrigger>
          <TabsTrigger
            value="vencimientos"
            className={cn(
              lastVencimientosJob && !lastVencimientosJob.success
                ? "text-orange-600 dark:text-orange-400"
                : undefined
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            Vencimientos
          </TabsTrigger>
          <TabsTrigger
            value="notificaciones"
            className={cn(
              (lastNotificacionesJob && !lastNotificacionesJob.success) ||
                lastNotificacionesJob?.notificationFetchWarning
                ? "text-orange-600 dark:text-orange-400"
                : undefined
            )}
          >
            <Bell className="mr-2 h-4 w-4" />
            Notificaciones
          </TabsTrigger>
          <TabsTrigger
            value="facturas"
            className={cn(
              lastComprobantesJob && !lastComprobantesJob.success
                ? "text-orange-600 dark:text-orange-400"
                : undefined
            )}
          >
            <Receipt className="mr-2 h-4 w-4" />
            Facturas
          </TabsTrigger>
          <TabsTrigger
            value="iva"
            className={cn(
              lastIvaJob && !lastIvaJob.success
                ? "text-orange-600 dark:text-orange-400"
                : undefined
            )}
          >
            <BanknoteArrowUp className="mr-2 h-4 w-4" />
            Iva
          </TabsTrigger>
          <TabsTrigger value="convenio-multilateral">
            <MapPin className="mr-2 h-4 w-4" />
            Convenio Multilateral
          </TabsTrigger>
        </TabsList>

        {/* Resumen Tab */}
        <TabsContent value="resumen" className="space-y-6 mt-6">
          {/* Fila superior: Perfiles (col-span-2) + Facturación + IVA */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            {/* Cuadro combinado: Perfiles Asociados */}
            <Card className="col-span-2 md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    Perfiles Asociados
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditClientDialogOpen(true)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {loadingProfiles ? (
                  <p className="text-xs text-muted-foreground">Cargando perfiles...</p>
                ) : profiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin perfiles asociados.</p>
                ) : (
                  <>
                    {/* Pills selector */}
                    <div className="flex flex-wrap gap-1.5">
                      {profiles.map((prof) => {
                        const normCuit = (s: string) => s.replace(/\D/g, "");
                        const warningCuits = lastNotificacionesJob?.notificationFetchWarningCuits ?? [];
                        const isWarning = warningCuits.some(
                          (c) => normCuit(c) === normCuit(prof.identityNumber ?? "")
                        );
                        const isSelected = effectiveResumenProfileId === prof.id;
                        return (
                          <button
                            key={prof.id}
                            onClick={() => setResumenProfileId(prof.id)}
                            className={cn(
                              "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                              isSelected
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : isWarning
                                  ? "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950/50"
                                  : "bg-muted/60 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {prof.name || prof.identityNumber}
                          </button>
                        );
                      })}
                    </div>
                    {/* Datos del perfil seleccionado */}
                    {selectedResumenProfile && (
                      <div className="rounded-xl bg-muted/40 border border-border/60 p-3 text-sm">
                        <div className="flex flex-wrap gap-x-10 gap-y-3">
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">CUIT</div>
                            <div className="font-medium tabular-nums">{selectedResumenProfile.identityNumber || "—"}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Teléfono</div>
                            <div>{client?.phone || "—"}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Email</div>
                            <div className="truncate">{client?.email || "—"}</div>
                          </div>
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-border/50">
                          <Link
                            to="/clients/$clientId/$profileId"
                            params={{ clientId, profileId: selectedResumenProfile.id }}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            Ver perfil completo →
                          </Link>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Facturación del mes actual */}
            <Card className="py-0 gap-0">
              <CardHeader className="pt-3 pb-1.5 px-3 md:pt-4 md:pb-2 md:px-5">
                <CardTitle className="flex items-center gap-1.5 text-xs md:text-sm">
                  <Receipt className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
                  Facturación
                </CardTitle>
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
                </p>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-1.5 md:px-5 md:pb-4 md:space-y-2.5">
                <div>
                  <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Ventas</div>
                  <div className="text-sm md:text-lg font-bold tabular-nums">
                    {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(resumenCurrentMonthStats.totalSales)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Compras</div>
                  <div className="text-sm md:text-lg font-bold tabular-nums">
                    {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(resumenCurrentMonthStats.totalPurchases)}
                  </div>
                </div>
                <div className="pt-1.5 md:pt-2 border-t">
                  <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Saldo</div>
                  <div className={cn(
                    "text-sm md:text-lg font-bold tabular-nums",
                    resumenCurrentMonthStats.totalSales - resumenCurrentMonthStats.totalPurchases < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(
                      resumenCurrentMonthStats.totalSales - resumenCurrentMonthStats.totalPurchases
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* IVA — saldo del período */}
            <Card className="py-0 gap-0">
              <CardHeader className="pt-3 pb-1.5 px-3 md:pt-4 md:pb-2 md:px-5">
                <CardTitle className="flex items-center gap-1.5 text-xs md:text-sm">
                  <BanknoteArrowUp className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" />
                  IVA
                </CardTitle>
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  {periodoFiscalResumen
                    ? `${MONTH_NAMES[parseInt(periodoFiscalResumen.split("/")[0]!, 10) - 1]} ${periodoFiscalResumen.split("/")[1]}`
                    : `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
                  }
                </p>
              </CardHeader>
              <CardContent className="px-3 pb-3 pt-0 space-y-1.5 md:px-5 md:pb-4 md:space-y-2.5">
                {loadingResumenClientIva ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs md:text-sm">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </div>
                ) : !resumenClientIva?.data ? (
                  <p className="text-xs md:text-sm text-muted-foreground">Sin datos.</p>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Saldo técnico</div>
                      <div className={cn(
                        "text-sm md:text-lg font-bold tabular-nums",
                        Number(resumenClientIva.data.saldoTecnicoFavorContribuyente ?? 0) > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      )}>
                        {formatIvaCurrency(resumenClientIva.data.saldoTecnicoFavorContribuyente)}
                      </div>
                    </div>
                    <div className="pt-1.5 md:pt-2 border-t">
                      <div className="text-[10px] md:text-[11px] text-muted-foreground uppercase tracking-wide">Saldo libre disp.</div>
                      <div className={cn(
                        "text-sm md:text-lg font-bold tabular-nums",
                        Number(resumenClientIva.data.saldoLibreDisponibilidadFavorContribuyentePeriodo ?? 0) > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                      )}>
                        {formatIvaCurrency(resumenClientIva.data.saldoLibreDisponibilidadFavorContribuyentePeriodo)}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Gráfico ventas/compras + Notificaciones no leídas */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {/* Gráfico — 2 columnas */}
            {resumenChartData.length > 0 && (
              <Card className="md:col-span-2">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Ventas y compras — {now.getFullYear()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-4">
                  <ChartContainer config={facturasChartConfig} className="h-[200px] w-full">
                    <BarChart
                      data={resumenChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      barCategoryGap={4}
                      barSize={20}
                    >
                      <CartesianGrid strokeDasharray="2 2" className="stroke-muted" />
                      <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v))} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: "ARS",
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(Number(value))
                            }
                          />
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="ventas" fill="var(--color-ventas)" name="Ventas" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="compras" fill="var(--color-compras)" name="Compras" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Notificaciones no leídas */}
            <Card className={cn("flex flex-col self-start", resumenChartData.length === 0 ? "md:col-span-3" : "")}>
              <CardHeader className="py-2.5 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notificaciones
                  </CardTitle>
                </div>
                {/* Filtro por perfil */}
                {profiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    <button
                      onClick={() => setResumenNotifProfileId("all")}
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all border",
                        resumenNotifProfileId === "all"
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/60 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                      )}
                    >
                      Todos
                    </button>
                    {profiles.map((prof) => (
                      <button
                        key={prof.id}
                        onClick={() => setResumenNotifProfileId(prof.id)}
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all border",
                          resumenNotifProfileId === prof.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/60 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                        )}
                      >
                        {prof.name || prof.identityNumber}
                      </button>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 flex flex-col min-h-[140px]">
                {loadingUnreadNotifications ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-xs py-4 justify-center">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando...
                  </div>
                ) : !unreadNotifications?.notifications.length ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sin notificaciones pendientes.</p>
                ) : (
                  <div className="space-y-1.5 overflow-y-auto pr-1 max-h-[140px]">
                    {unreadNotifications.notifications.map((notif) => (
                      <div
                        key={notif.id}
                        className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs hover:bg-muted/60 transition-colors"
                      >
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => setResumenNotifSelected(notif)}
                        >
                          {notif.profileName && (
                            <div className="text-[10px] text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">{notif.profileName}</div>
                          )}
                          <p className="text-foreground line-clamp-2 leading-snug">{notif.message}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {notif.publicationDate
                              ? format(new Date(notif.publicationDate), "dd/MM/yyyy", { locale: es })
                              : "—"}
                          </p>
                        </button>
                        <button
                          onClick={() => markOpenedMutation.mutate(notif.id)}
                          disabled={markOpenedMutation.isPending}
                          className="shrink-0 mt-0.5 text-emerald-500 hover:text-emerald-600 transition-colors"
                          title="Marcar como leída"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

        </TabsContent>

        {/* Dialog: detalle de notificación no leída (Resumen) */}
        <Dialog open={!!resumenNotifSelected} onOpenChange={(open) => { if (!open) setResumenNotifSelected(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Bell className="h-4 w-4 shrink-0" />
                {resumenNotifSelected?.profileName
                  ? `Notificación — ${resumenNotifSelected.profileName}`
                  : "Notificación"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              {/* Fechas */}
              <div className="flex gap-6 text-xs text-muted-foreground">
                {resumenNotifSelected?.publicationDate && (
                  <span>
                    <span className="font-medium text-foreground">Publicación: </span>
                    {format(new Date(resumenNotifSelected.publicationDate), "dd/MM/yyyy", { locale: es })}
                  </span>
                )}
                {resumenNotifSelected?.expirationDate && (
                  <span>
                    <span className="font-medium text-foreground">Vencimiento: </span>
                    {format(new Date(resumenNotifSelected.expirationDate), "dd/MM/yyyy", { locale: es })}
                  </span>
                )}
              </div>
              {/* Mensaje completo */}
              <p className="leading-relaxed whitespace-pre-wrap">{resumenNotifSelected?.message}</p>
              {/* Acciones */}
              <div className="flex justify-between items-center pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (resumenNotifSelected) markOpenedMutation.mutate(resumenNotifSelected.id);
                    setResumenNotifSelected(null);
                  }}
                  disabled={markOpenedMutation.isPending}
                  className="gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Marcar como leída
                </Button>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">Cerrar</Button>
                </DialogClose>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deudas Tab */}
        <TabsContent value="deudas" className="space-y-6 mt-6">
          {/* Debt Summary Cards */}
          {!loadingDebts && debts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Deudas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(debtStats.totalBalance)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {debtStats.totalDebts}{" "}
                    {debtStats.totalDebts === 1 ? "deuda" : "deudas"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total con Intereses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(debtStats.totalDebt)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    +{" "}
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(
                      debtStats.totalCompensatoryInterest +
                      debtStats.totalPunitiveInterest
                    )}{" "}
                    intereses
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Interés Compensatorio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#232c50]">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(debtStats.totalCompensatoryInterest)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Interés Punitorio
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#232c50]">
                    {new Intl.NumberFormat("es-AR", {
                      style: "currency",
                      currency: "ARS",
                      minimumFractionDigits: 2,
                    }).format(debtStats.totalPunitiveInterest)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  Ult. actualización{" "}
                  {lastDeudaJob?.createdAt ? (
                    <span
                      className={
                        lastDeudaJob.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive"
                      }
                      title={lastDeudaJob.failedReason ?? undefined}
                    >
                      {new Date(lastDeudaJob.createdAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </p>
                {lastDeudaJob && !lastDeudaJob.success && lastDeudaJob.failedReason && (
                  <p className="text-[11px] text-destructive max-w-md">
                    {lastDeudaJob.failedReason}
                  </p>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                disabled={!!scrapingSection}
                onClick={async () => {
                  setScrapingSection("deudas");
                  try {
                    await scrapSingleJob({
                      data: { clientId, jobType: "deuda" },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["clientDebts", clientId] }),
                      queryClient.invalidateQueries({ queryKey: ["lastDeudaJob", clientId] }),
                    ]);
                    toast.success("Deudas actualizadas correctamente");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Error al actualizar deudas"
                    );
                    queryClient.invalidateQueries({ queryKey: ["lastDeudaJob", clientId] });
                  } finally {
                    setScrapingSection(null);
                  }
                }}
              >
                {scrapingSection === "deudas" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando…
                  </>
                ) : (
                  "Actualizar Deudas"
                )}
              </Button>
            </div>
            {!loadingDebts && debts.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Impuesto:</span>
                  <Select
                    value={debtFilterImpuesto || "all"}
                    onValueChange={(v) => { setDebtFilterImpuesto(v === "all" ? "" : v); setDebtPage(1); }}
                  >
                    <SelectTrigger className="w-[180px] h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {debtFilterOptions.impuestos.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Concepto:</span>
                  <Select
                    value={debtFilterConcepto || "all"}
                    onValueChange={(v) => { setDebtFilterConcepto(v === "all" ? "" : v); setDebtPage(1); }}
                  >
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {debtFilterOptions.conceptos.map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(debtFilterImpuesto || debtFilterConcepto) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      setDebtFilterImpuesto("");
                      setDebtFilterConcepto("");
                      setDebtPage(1);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Limpiar filtros
                  </Button>
                )}
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Deudas del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingDebts ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-muted-foreground">
                    Cargando deudas...
                  </div>
                </div>
              ) : debts.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-muted-foreground">
                    No hay deudas registradas para este cliente
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {(debtFilterImpuesto || debtFilterConcepto) && (
                    <p className="text-sm text-muted-foreground">
                      Mostrando {filteredDebts.length} de {debts.length} deudas
                    </p>
                  )}
                  <div className="rounded-md border overflow-x-auto">
                    {filteredDebts.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        No hay deudas que coincidan con los filtros
                      </div>
                    ) : (
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[15%]">Impuesto</TableHead>
                            <TableHead className="w-[22%]">Concepto</TableHead>
                            <TableHead className="w-[9%]">Período</TableHead>
                            <TableHead className="w-[12%]">Vencimiento</TableHead>
                            <TableHead className="w-[14%] text-right">Saldo</TableHead>
                            <TableHead className="w-[14%] text-right">
                              Interés Comp.
                            </TableHead>
                            <TableHead className="w-[14%] text-right">
                              Interés Punit.
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedDebts.map((debt) => (
                            <TableRow key={debt.id}>
                              <TableCell className="font-medium truncate" title={debt.tax || "-"}>
                                {debt.tax || "-"}
                              </TableCell>
                              <TableCell className="truncate" title={debt.concept || "-"}>
                                {debt.concept || "-"}
                              </TableCell>
                              <TableCell className="truncate" title={debt.period || "-"}>
                                {debt.period || "-"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {new Date(debt.dueDate).toLocaleDateString("es-AR")}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {new Intl.NumberFormat("es-AR", {
                                  style: "currency",
                                  currency: "ARS",
                                  minimumFractionDigits: 2,
                                }).format(Number(debt.balance) || 0)}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {new Intl.NumberFormat("es-AR", {
                                  style: "currency",
                                  currency: "ARS",
                                  minimumFractionDigits: 2,
                                }).format(Number(debt.compensatoryInterest) || 0)}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                {new Intl.NumberFormat("es-AR", {
                                  style: "currency",
                                  currency: "ARS",
                                  minimumFractionDigits: 2,
                                }).format(Number(debt.punitiveInterest) || 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  {debtTotalPages > 1 && (() => {
                    const { startPage, endPage } = getPageRange(debtPage, debtTotalPages);
                    const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
                    return (
                      <div className="flex justify-center w-full min-w-0">
                        <Pagination>
                          <PaginationContent className="flex-wrap justify-center">
                            <PaginationItem>
                              <PaginationPrevious
                                onClick={() => setDebtPage((p) => Math.max(1, p - 1))}
                                className={debtPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            {startPage > 1 && (
                              <>
                                <PaginationItem>
                                  <PaginationLink onClick={() => setDebtPage(1)} className="cursor-pointer">1</PaginationLink>
                                </PaginationItem>
                                {startPage > 2 && <PaginationItem><span className="px-2">...</span></PaginationItem>}
                              </>
                            )}
                            {visiblePages.map((page) => (
                              <PaginationItem key={page}>
                                <PaginationLink onClick={() => setDebtPage(page)} isActive={debtPage === page} className="cursor-pointer">{page}</PaginationLink>
                              </PaginationItem>
                            ))}
                            {endPage < debtTotalPages && (
                              <>
                                {endPage < debtTotalPages - 1 && <PaginationItem><span className="px-2">...</span></PaginationItem>}
                                <PaginationItem>
                                  <PaginationLink onClick={() => setDebtPage(debtTotalPages)} className="cursor-pointer">{debtTotalPages}</PaginationLink>
                                </PaginationItem>
                              </>
                            )}
                            <PaginationItem>
                              <PaginationNext
                                onClick={() => setDebtPage((p) => Math.min(debtTotalPages, p + 1))}
                                className={debtPage === debtTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

        {/* Vencimientos Tab */}
        <TabsContent value="vencimientos" className="space-y-6 mt-6">
          {/* Due Date Summary Cards */}
          {!loadingDueDates && dueDates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-[#232c50]" />
                    Vencimientos Futuros
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#232c50]">
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
                    <CalendarX className="h-4 w-4 text-[#232c50]" />
                    Vencimientos Vencidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[#232c50]">
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
                      <Clock className="h-4 w-4 text-[#232c50]" />
                      Próximo Vencimiento
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-bold">
                      {new Date(
                        dueDateStats.nextDueDate.dueDate
                      ).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dueDateStats.nextDueDate.tax || "Sin impuesto"}
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
                  Ult. actualización{" "}
                  {lastVencimientosJob?.createdAt ? (
                    <span
                      className={
                        lastVencimientosJob.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive"
                      }
                      title={lastVencimientosJob.failedReason ?? undefined}
                    >
                      {new Date(lastVencimientosJob.createdAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </p>
                {lastVencimientosJob && !lastVencimientosJob.success && lastVencimientosJob.failedReason && (
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
                  setScrapingSection("vencimientos");
                  try {
                    await scrapSingleJob({
                      data: { clientId, jobType: "vencimientos" },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["clientDueDates", clientId] }),
                      queryClient.invalidateQueries({ queryKey: ["lastVencimientosJob", clientId] }),
                    ]);
                    toast.success("Vencimientos actualizados correctamente");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Error al actualizar vencimientos"
                    );
                    queryClient.invalidateQueries({ queryKey: ["lastVencimientosJob", clientId] });
                  } finally {
                    setScrapingSection(null);
                  }
                }}
              >
                {scrapingSection === "vencimientos" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando…
                  </>
                ) : (
                  "Actualizar Vencimientos"
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
                          <TableHead className="w-[16%]">Subconcepto</TableHead>
                          <TableHead className="w-[10%]">Período</TableHead>
                          <TableHead className="w-[7%]">Cuota</TableHead>
                          <TableHead className="w-[12%]">Vencimiento</TableHead>
                          <TableHead className="w-[25%]">Detalle</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedDueDates.map((dueDate) => (
                          <TableRow key={dueDate.id}>
                            <TableCell className="font-medium truncate" title={dueDate.tax || "-"}>
                              {dueDate.tax || "-"}
                            </TableCell>
                            <TableCell className="truncate" title={dueDate.concept || "-"}>
                              {dueDate.concept || "-"}
                            </TableCell>
                            <TableCell className="truncate" title={dueDate.subConcept || "-"}>
                              {dueDate.subConcept || "-"}
                            </TableCell>
                            <TableCell className="truncate" title={dueDate.period || "-"}>
                              {dueDate.period || "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-center">
                              {dueDate.quotaNumber || "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {new Date(dueDate.dueDate).toLocaleDateString("es-AR")}
                            </TableCell>
                            <TableCell className="truncate" title={dueDate.detail || "-"}>
                              {dueDate.detail || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {dueDateTotalPages > 1 && (() => {
                    const { startPage, endPage } = getPageRange(dueDatePage, dueDateTotalPages);
                    const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);
                    return (
                      <div className="flex justify-center w-full min-w-0">
                        <Pagination>
                          <PaginationContent className="flex-wrap justify-center">
                            <PaginationItem>
                              <PaginationPrevious
                                onClick={() => setDueDatePage((p) => Math.max(1, p - 1))}
                                className={dueDatePage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                              />
                            </PaginationItem>
                            {startPage > 1 && (
                              <>
                                <PaginationItem>
                                  <PaginationLink onClick={() => setDueDatePage(1)} className="cursor-pointer">1</PaginationLink>
                                </PaginationItem>
                                {startPage > 2 && <PaginationItem><span className="px-2">...</span></PaginationItem>}
                              </>
                            )}
                            {visiblePages.map((page) => (
                              <PaginationItem key={page}>
                                <PaginationLink onClick={() => setDueDatePage(page)} isActive={dueDatePage === page} className="cursor-pointer">{page}</PaginationLink>
                              </PaginationItem>
                            ))}
                            {endPage < dueDateTotalPages && (
                              <>
                                {endPage < dueDateTotalPages - 1 && <PaginationItem><span className="px-2">...</span></PaginationItem>}
                                <PaginationItem>
                                  <PaginationLink onClick={() => setDueDatePage(dueDateTotalPages)} className="cursor-pointer">{dueDateTotalPages}</PaginationLink>
                                </PaginationItem>
                              </>
                            )}
                            <PaginationItem>
                              <PaginationNext
                                onClick={() => setDueDatePage((p) => Math.min(dueDateTotalPages, p + 1))}
                                className={dueDatePage === dueDateTotalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
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
                  Ult. actualización{" "}
                  {lastNotificacionesJob?.createdAt ? (
                    <span
                      className={
                        lastNotificacionesJob.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive"
                      }
                      title={lastNotificacionesJob.failedReason ?? undefined}
                    >
                      {new Date(lastNotificacionesJob.createdAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    "—"
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
                  <p className="text-[11px] text-orange-600 dark:text-orange-400 max-w-md mt-0.5">
                    {lastNotificacionesJob.notificationFetchWarning}
                  </p>
                )}
              </div>
              <Button
                variant="default"
                size="sm"
                disabled={!!scrapingSection}
                onClick={async () => {
                  setScrapingSection("notificaciones");
                  try {
                    await scrapSingleJob({
                      data: { clientId, jobType: "notificaciones" },
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["clientNotifications", clientId],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["lastNotificacionesJob", clientId],
                    });
                    toast.success("Notificaciones actualizadas correctamente");
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Error al actualizar notificaciones"
                    );
                    queryClient.invalidateQueries({ queryKey: ["lastNotificacionesJob", clientId] });
                  } finally {
                    setScrapingSection(null);
                  }
                }}
              >
                {scrapingSection === "notificaciones" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando…
                  </>
                ) : (
                  "Actualizar Notificaciones"
                )}
              </Button>
            </div>
          </div>
          <NotificationsView
            clientId={clientId}
            className="min-h-[500px]"
          />
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
                    data: { clientId, jobType: "comprobantes" },
                  });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ["clientAllInvoices", clientId] }),
                    queryClient.invalidateQueries({ queryKey: ["invoices"] }),
                    queryClient.invalidateQueries({ queryKey: ["lastComprobantesFullJob", clientId] }),
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
                  Ult. actualización{" "}
                  {lastComprobantesJob?.createdAt ? (
                    <span
                      className={
                        lastComprobantesJob.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive"
                      }
                      title={lastComprobantesJob.failedReason ?? undefined}
                    >
                      {new Date(lastComprobantesJob.createdAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    "—"
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
                  setScrapingSection("facturas");
                  try {
                    await scrapSingleJob({
                      data: { clientId, jobType: "comprobantes" },
                    });
                    await Promise.all([
                      queryClient.invalidateQueries({ queryKey: ["clientAllInvoices", clientId] }),
                      queryClient.invalidateQueries({ queryKey: ["invoices"] }),
                      queryClient.invalidateQueries({ queryKey: ["lastComprobantesFullJob", clientId] }),
                      queryClient.invalidateQueries({ queryKey: ["lastComprobantesJob", clientId] }),
                    ]);
                    toast.success("Facturas (comprobantes) actualizadas correctamente");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Error al actualizar facturas"
                    );
                    queryClient.invalidateQueries({ queryKey: ["lastComprobantesJob", clientId] });
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
            </div>

            {/* Fila 2: filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">Período:</span>
              <Select
                value={facturasPeriodType}
                onValueChange={(v) => {
                  setFacturasPeriodType(v as "none" | "year" | "month" | "range");
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
              {facturasPeriodType === "year" && (
                <Select value={String(facturasYear)} onValueChange={(v) => setFacturasYear(Number(v))}>
                  <SelectTrigger className="w-[100px] h-9">
                    <SelectValue placeholder="Año" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {facturasPeriodType === "month" && (
                <Popover open={facturasPeriodPickerOpen} onOpenChange={setFacturasPeriodPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-9 min-w-[160px] justify-start text-left font-normal px-3">
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
                          const newMax = y === now.getFullYear() ? now.getMonth() : 11;
                          setFacturasYear(y);
                          setFacturasMonth((m) => Math.min(m, newMax));
                        }}
                      >
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Año" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-3 gap-1.5">
                        {Array.from(
                          { length: facturasYear === now.getFullYear() ? now.getMonth() + 1 : 12 },
                          (_, i) => i
                        ).map((i) => (
                          <Button
                            key={i}
                            variant={facturasMonth === i ? "default" : "outline"}
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
              {facturasPeriodType === "range" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("h-9 min-w-[200px] justify-start text-left font-normal", !facturasDateRange?.from && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {facturasDateRange?.from
                        ? facturasDateRange?.to
                          ? `${format(facturasDateRange.from, "dd/MM/yyyy", { locale: es })} – ${format(facturasDateRange.to, "dd/MM/yyyy", { locale: es })}`
                          : format(facturasDateRange.from, "dd/MM/yyyy", { locale: es })
                        : "Elegir fechas"}
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

              <span className="text-sm text-muted-foreground shrink-0 ml-1">Perfil:</span>
              <Select value={facturasProfileFilter} onValueChange={setFacturasProfileFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="Perfil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los perfiles</SelectItem>
                  {(profiles as { id: string; name?: string; identityNumber?: string }[]).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.identityNumber || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span className="text-sm text-muted-foreground shrink-0">Tipo:</span>
              <Select value={facturasTypeFilter} onValueChange={setFacturasTypeFilter}>
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

              <span className="text-sm text-muted-foreground shrink-0">Dirección:</span>
              <Select value={facturasDirectionFilter} onValueChange={setFacturasDirectionFilter}>
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
                      ? "—"
                      : new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(invoiceStatsFiltered.totalSales)}
                  </div>
                  {facturasVariationPct != null && facturasVariationPct.salesPct !== undefined && (
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        facturasVariationPct.salesPct === 0
                          ? "text-muted-foreground"
                          : facturasVariationPct.salesPct !== null && facturasVariationPct.salesPct > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {facturasVariationPct.salesPct === null
                        ? "—"
                        : facturasVariationPct.salesPct >= 0
                          ? `+${facturasVariationPct.salesPct.toFixed(1)}%`
                          : `${facturasVariationPct.salesPct.toFixed(1)}%`}{" "}
                      vs {facturasPeriodType === "month" ? "mes ant." : "año ant."}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Total compras
                  </div>
                  <div className="text-xl font-bold tabular-nums break-all">
                    {invoiceStatsFiltered == null
                      ? "—"
                      : new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(invoiceStatsFiltered.totalPurchases)}
                  </div>
                  {facturasVariationPct != null && facturasVariationPct.purchasesPct !== undefined && (
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        facturasVariationPct.purchasesPct === 0
                          ? "text-muted-foreground"
                          : facturasVariationPct.purchasesPct !== null && facturasVariationPct.purchasesPct > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {facturasVariationPct.purchasesPct === null
                        ? "—"
                        : facturasVariationPct.purchasesPct >= 0
                          ? `+${facturasVariationPct.purchasesPct.toFixed(1)}%`
                          : `${facturasVariationPct.purchasesPct.toFixed(1)}%`}{" "}
                      vs {facturasPeriodType === "month" ? "mes ant." : "año ant."}
                    </div>
                  )}
                </div>
                <div className="pt-2 border-t">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Ventas − Compras
                  </div>
                  <div
                    className={cn(
                      "text-xl font-bold tabular-nums break-all",
                      invoiceStatsFiltered != null &&
                        invoiceStatsFiltered.totalSales - invoiceStatsFiltered.totalPurchases < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground"
                    )}
                  >
                    {invoiceStatsFiltered == null
                      ? "—"
                      : new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(
                        invoiceStatsFiltered.totalSales - invoiceStatsFiltered.totalPurchases
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
                    Ventas y compras {facturasPeriodType === "year" ? "por mes del año" : facturasPeriodType === "month" ? "del mes seleccionado" : facturasPeriodType === "range" ? "por mes (rango)" : "últimos 12 meses"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-3 pb-2">
                  <ChartContainer config={facturasChartConfig} className="h-[160px] w-full">
                    <BarChart
                      data={facturasChartData}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                      barCategoryGap={4}
                      barSize={20}
                    >
                      <CartesianGrid strokeDasharray="2 2" className="stroke-muted" />
                      <XAxis dataKey="period" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v))} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            formatter={(value) =>
                              new Intl.NumberFormat("es-AR", {
                                style: "currency",
                                currency: "ARS",
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(Number(value))
                            }
                          />
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="ventas" fill="var(--color-ventas)" name="Ventas" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="compras" fill="var(--color-compras)" name="Compras" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>

          <InvoicesTable
            ref={invoicesTableRef}
            clientId={clientId}
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
                    key={`multilateral-${clientId}`}
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
                      ? "Cargando perfiles..."
                      : profiles.length === 0
                        ? "Sin perfiles"
                        : "Seleccionar perfil"}
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
                        : "Sin filtro"}
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
                                ? "default"
                                : "outline"
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
                        <ChartContainer config={convenioChartConfig} className="h-[180px] w-full">
                          <BarChart
                            data={convenioActividadChartData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                            barCategoryGap={12}
                            barSize={28}
                          >
                            <CartesianGrid strokeDasharray="2 2" className="stroke-muted" />
                            <XAxis dataKey="metrica" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  formatter={(value) => String(value)}
                                  labelFormatter={(label) => label}
                                />
                              }
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="actual" fill="var(--color-actual)" name="Período actual" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="anterior" fill="var(--color-anterior)" name="Período anterior" radius={[4, 4, 0, 0]} />
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
                        <ChartContainer config={convenioChartConfig} className="h-[180px] w-full">
                          <BarChart
                            data={convenioMontosChartData}
                            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                            barCategoryGap={12}
                            barSize={28}
                          >
                            <CartesianGrid strokeDasharray="2 2" className="stroke-muted" />
                            <XAxis dataKey="metrica" tick={{ fontSize: 10 }} />
                            <YAxis
                              tick={{ fontSize: 9 }}
                              tickFormatter={(v) =>
                                v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)
                              }
                            />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  formatter={(value) =>
                                    new Intl.NumberFormat("es-AR", {
                                      style: "currency",
                                      currency: "ARS",
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    }).format(Number(value))
                                  }
                                  labelFormatter={(label) => label}
                                />
                              }
                            />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Bar dataKey="actual" fill="var(--color-actual)" name="Período actual" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="anterior" fill="var(--color-anterior)" name="Período anterior" radius={[4, 4, 0, 0]} />
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
                            onClick={() => toggleMultilateralSort("count")}
                          >
                            Cant. comprobantes
                            {multilateralSortKey === "count" && (
                              multilateralSortDir === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )
                            )}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none"
                            onClick={() => toggleMultilateralSort("iva")}
                          >
                            Total IVA
                            {multilateralSortKey === "iva" && (
                              multilateralSortDir === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )
                            )}
                          </button>
                        </TableHead>
                        <TableHead className="text-right">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer select-none"
                            onClick={() => toggleMultilateralSort("base")}
                          >
                            Base imponible (amount_taxed)
                            {multilateralSortKey === "base" && (
                              multilateralSortDir === "asc" ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )
                            )}
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedMultilateralSummary.map((row: any) => {
                        const provinceLabel = row.receiptProvince || "Sin datos";
                        const provinceValue =
                          row.receiptProvince ?? null; // null para agrupar "Sin datos"
                        return (
                          <TableRow
                            key={provinceLabel}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedMultilateralProvince(provinceValue);
                              setSelectedMultilateralProvinceLabel(provinceLabel);
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
                  Ult. actualización{" "}
                  {lastIvaJob?.createdAt ? (
                    <span
                      className={
                        lastIvaJob.success
                          ? "text-emerald-600 dark:text-emerald-400 font-medium"
                          : "text-destructive"
                      }
                      title={lastIvaJob.failedReason ?? undefined}
                    >
                      {new Date(lastIvaJob.createdAt).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  ) : (
                    "—"
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
                    Job de comprobantes en curso desde{" "}
                    {new Date(runningComprobantesJob.createdAt).toLocaleTimeString(
                      "es-AR",
                      { hour: "2-digit", minute: "2-digit" }
                    )}
                  </span>
                )}
                <Button
                  variant="default"
                  size="sm"
                  disabled={!!scrapingSection || !!runningComprobantesJob}
                  onClick={async () => {
                    setScrapingSection("iva");
                    try {
                      await scrapSingleJob({
                        data: { clientId, jobType: "comprobantes" },
                      });
                      await scrapSingleJob({
                        data: { clientId, jobType: "iva" },
                      });
                      await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["clientIva", clientId] }),
                        queryClient.invalidateQueries({ queryKey: ["clientAllInvoices", clientId] }),
                        queryClient.invalidateQueries({ queryKey: ["invoices"] }),
                        queryClient.invalidateQueries({ queryKey: ["lastComprobantesFullJob", clientId] }),
                        queryClient.invalidateQueries({ queryKey: ["lastIvaJob", clientId] }),
                      ]);
                      toast.success("IVA y comprobantes actualizados correctamente");
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Error al actualizar IVA"
                      );
                      queryClient.invalidateQueries({ queryKey: ["lastIvaJob", clientId] });
                      queryClient.invalidateQueries({ queryKey: ["lastComprobantesJob", clientId] });
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                >
                  {scrapingSection === "iva" || runningComprobantesJob ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Actualizando…
                    </>
                  ) : (
                    "Actualizar IVA"
                  )}
                </Button>
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
                  key={`iva-${clientId}`}
                  defaultValue={effectiveIvaProfileId}
                  onValueChange={(value) => setIvaProfileId(value || undefined)}
                  disabled={loadingProfiles || profiles.length <= 1}
                >
                  <SelectTrigger className="h-9 min-w-[200px] w-auto">
                    <SelectValue placeholder="Seleccionar perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((profile: { id: string; name?: string; identityNumber?: string }) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name || profile.identityNumber || profile.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="min-w-[200px] text-sm text-muted-foreground">
                  {loadingProfiles ? "Cargando perfiles..." : profiles.length === 0 ? "Sin perfiles" : "Seleccionar perfil"}
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
                            ivaSelectedMonth === i ? "default" : "outline"
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
                clientId={clientId}
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
      </Tabs>

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
                  Facturas outbound -{" "}
                  {selectedMultilateralProvinceLabel ?? "Provincia"}
                </DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detalle de comprobantes utilizados para el Convenio Multilateral.
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
                  {multilateralDetailInvoices.length !== 1 && "s"} outbound
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
                  <span>
                    Base imponible total:{" "}
                    <span className="font-medium text-foreground">
                      {formatIvaCurrency(multilateralDetailTotals.base)}
                    </span>
                  </span>
                  <span>
                    IVA total:{" "}
                    <span className="font-medium text-foreground">
                      {formatIvaCurrency(multilateralDetailTotals.iva)}
                    </span>
                  </span>
                  <span>
                    Total facturado:{" "}
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
                        <TableHead className="whitespace-nowrap">Tipo</TableHead>
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
                                "es-AR",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                }
                              )
                              : "—"}
                          </TableCell>
                          <TableCell className="text-[11px]">
                            {getInvoiceTypeLabel(inv.type)}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.salePoint || "—"}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.numberFrom || "—"}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.numberTo || "—"}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="truncate" title={inv.emitterName}>
                              {inv.emitterName || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="truncate" title={inv.recipientName}>
                              {inv.recipientName || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {inv.currency || "ARS"}
                          </TableCell>
                          <TableCell className="text-right text-[11px]">
                            {formatIvaCurrency(inv.amountTaxed)}
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
                    <div key={inv.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{inv.type || "—"}</span>
                        <span className="text-muted-foreground">
                          {inv.emitionDate
                            ? new Date(inv.emitionDate).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })
                            : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Pto. venta</span>
                        <span className="text-right">{inv.salePoint || "—"}</span>
                        <span className="text-muted-foreground">Nro. desde/hasta</span>
                        <span className="text-right">
                          {inv.numberFrom || "—"} / {inv.numberTo || "—"}
                        </span>
                        <span className="text-muted-foreground">Emisor</span>
                        <span className="text-right truncate" title={inv.emitterName}>
                          {inv.emitterName || "—"}
                        </span>
                        <span className="text-muted-foreground">Destinatario</span>
                        <span className="text-right truncate" title={inv.recipientName}>
                          {inv.recipientName || "—"}
                        </span>
                        <span className="text-muted-foreground">Moneda</span>
                        <span className="text-right">{inv.currency || "ARS"}</span>
                        <span className="text-muted-foreground">Base imponible</span>
                        <span className="text-right">{formatIvaCurrency(inv.amountTaxed)}</span>
                        <span className="text-muted-foreground">Total IVA</span>
                        <span className="text-right">{formatIvaCurrency(inv.totalIVA)}</span>
                        <span className="text-muted-foreground font-medium">Total</span>
                        <span className="text-right font-medium">{formatIvaCurrency(inv.amount)}</span>
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
