import { useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getClient,
  getClientProfiles,
  getClientDebts,
  getClientDueDates,
  getClientIvaCredit,
  getLastJobByType,
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
import { InvoicesTable } from "@/components/invoices-table";
import {
  getInvoices,
  getClientMultilateralSummary,
  getClientMultilateralInvoices,
} from "@/actions/invoice";
import { scrapSingleJob } from "@/actions/client";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Clock, CalendarCheck, CalendarX, Loader2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ClientDetailPageProps {
  clientId: string;
}

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
      className={`text-xs mt-1 ${
        diff > 0
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
  /** Sección que está ejecutando un job (iva = comprobantes_full + iva, deudas = deuda, facturas = comprobantes_full, notificaciones = notificaciones). */
  const [scrapingSection, setScrapingSection] = useState<"iva" | "deudas" | "facturas" | "notificaciones" | null>(null);
  const queryClient = useQueryClient();
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

  useEffect(() => {
    setIvaProfileId(undefined);
    setMultilateralProfileId(undefined);
    const range = getMonthBounds(now.getFullYear(), now.getMonth());
    setMultilateralPeriod(range);
    setMultilateralDateFrom(range.from.toISOString().slice(0, 10));
    setMultilateralDateTo(range.to.toISOString().slice(0, 10));
  }, [clientId]);

  const { data: debts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ["clientDebts", clientId],
    queryFn: () => getClientDebts({ data: { clientId } }),
  });

  const { data: dueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ["clientDueDates", clientId],
    queryFn: () => getClientDueDates({ data: { clientId } }),
  });

  const { data: lastNotificacionesJob } = useQuery({
    queryKey: ["lastNotificacionesJob", clientId],
    queryFn: () =>
      getLastJobByType({ data: { clientId, jobType: "notificaciones" } }),
    enabled: !!clientId,
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

  const { data: multilateralSummary = [] } = useQuery({
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
    enabled: !!clientId && !!selectedMultilateralProvince && multilateralDetailOpen,
  });

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Activo</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactivo</Badge>;
      case "pending":
        return <Badge variant="outline">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

  // Calculate invoice totals (sales and purchases)
  const invoiceStats = useMemo(() => {
    if (!allInvoicesData?.invoices) {
      return { totalSales: 0, totalPurchases: 0 };
    }

    let totalSales = 0;
    let totalPurchases = 0;

    allInvoicesData.invoices.forEach((inv: any) => {
      // Convert amount to number
      let amount = parseFloat(inv.amount || "0");

      // If currency is USD, convert to ARS using the currency rate
      if (inv.currency?.toUpperCase() === "USD") {
        const rate = parseFloat(inv.currencyRate || "1");
        amount = amount * rate;
      }

      const direction = inv.direction?.toLowerCase();
      if (direction === "outbound") {
        totalSales += amount;
      } else if (direction === "inbound") {
        totalPurchases += amount;
      }
    });

    return { totalSales, totalPurchases };
  }, [allInvoicesData]);

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
    <div className="space-y-6 m-[3rem]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: "/clients" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">{client.name}</h1>
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
        <TabsList>
          <TabsTrigger value="resumen">
            <FileText className="mr-2 h-4 w-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="deudas" disabled>
            <DollarSign className="mr-2 h-4 w-4" />
            Deudas
          </TabsTrigger>
          <TabsTrigger value="vencimientos" disabled>
            <Calendar className="mr-2 h-4 w-4" />
            Vencimientos
          </TabsTrigger>
          <TabsTrigger value="notificaciones">
            <Bell className="mr-2 h-4 w-4" />
            Notificaciones
          </TabsTrigger>
          <TabsTrigger value="facturas">
            <Receipt className="mr-2 h-4 w-4" />
            Facturas
          </TabsTrigger>
          <TabsTrigger value="iva">
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
          {/* Client Information Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Información del Cliente Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Información del Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">CUIT</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {client.identityNumber || "-"}
                    </span>
                    {client.identityNumber && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() =>
                          copyToClipboard(client.identityNumber, "cuit")
                        }
                      >
                        {copiedField === "cuit" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Teléfono</div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{client.phone || "-"}</span>
                    {client.phone && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(client.phone!, "phone")}
                      >
                        {copiedField === "phone" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{client.email || "-"}</span>
                    {client.email && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(client.email!, "email")}
                      >
                        {copiedField === "email" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Dirección</div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>{client.address || "-"}</span>
                    {client.address && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => copyToClipboard(client.address!, "address")}
                      >
                        {copiedField === "address" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Estado del Cliente Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Perfiles Asociados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProfiles ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">
                      Cargando perfiles...
                    </div>
                  </div>
                ) : profiles.length === 0 ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="text-muted-foreground">
                      No hay perfiles asociados a este cliente
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Número de Identidad</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Teléfono</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profiles.map((profile) => (
                          <TableRow
                            key={profile.id}
                            className="cursor-pointer hover:bg-muted/50"
                          >
                            <TableCell className="font-medium">
                              <Link
                                to="/clients/$clientId/$profileId"
                                params={{
                                  clientId: clientId,
                                  profileId: profile.id,
                                }}
                                className="block"
                              >
                                {profile.name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link
                                to="/clients/$clientId/$profileId"
                                params={{
                                  clientId: clientId,
                                  profileId: profile.id,
                                }}
                                className="block"
                              >
                                {profile.identityNumber}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link
                                to="/clients/$clientId/$profileId"
                                params={{
                                  clientId: clientId,
                                  profileId: profile.id,
                                }}
                                className="block"
                              >
                                {profile.identityType}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link
                                to="/clients/$clientId/$profileId"
                                params={{
                                  clientId: clientId,
                                  profileId: profile.id,
                                }}
                                className="block"
                              >
                                {profile.email}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Link
                                to="/clients/$clientId/$profileId"
                                params={{
                                  clientId: clientId,
                                  profileId: profile.id,
                                }}
                                className="block"
                              >
                                {profile.phone}
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>


        </TabsContent>

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
                  <div className="text-2xl font-bold text-black">
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
                  <div className="text-2xl font-bold text-black">
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

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Deudas del Cliente
              </CardTitle>
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
                    await queryClient.invalidateQueries({ queryKey: ["clientDebts", clientId] });
                    toast.success("Deudas actualizadas correctamente");
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Error al actualizar deudas"
                    );
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Impuesto</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Saldo</TableHead>
                        <TableHead>Interés Compensatorio</TableHead>
                        <TableHead>Interés Punitorio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {debts.map((debt) => (
                        <TableRow key={debt.id}>
                          <TableCell className="font-medium">
                            {debt.tax || "-"}
                          </TableCell>
                          <TableCell>{debt.concept || "-"}</TableCell>
                          <TableCell>{debt.period || "-"}</TableCell>
                          <TableCell>
                            {new Date(debt.dueDate).toLocaleDateString("es-AR")}
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat("es-AR", {
                              style: "currency",
                              currency: "ARS",
                              minimumFractionDigits: 2,
                            }).format(Number(debt.balance) || 0)}
                          </TableCell>
                          <TableCell>
                            {new Intl.NumberFormat("es-AR", {
                              style: "currency",
                              currency: "ARS",
                              minimumFractionDigits: 2,
                            }).format(Number(debt.compensatoryInterest) || 0)}
                          </TableCell>
                          <TableCell>
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
                    <CalendarCheck className="h-4 w-4 text-black" />
                    Vencimientos Futuros
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">
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
                    <CalendarX className="h-4 w-4 text-black" />
                    Vencimientos Vencidos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-black">
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
                      <Clock className="h-4 w-4 text-black" />
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
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Impuesto</TableHead>
                        <TableHead>Concepto</TableHead>
                        <TableHead>Subconcepto</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Cuota</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead>Detalle</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dueDates.map((dueDate) => (
                        <TableRow key={dueDate.id}>
                          <TableCell className="font-medium">
                            {dueDate.tax || "-"}
                          </TableCell>
                          <TableCell>{dueDate.concept || "-"}</TableCell>
                          <TableCell>{dueDate.subConcept || "-"}</TableCell>
                          <TableCell>{dueDate.period || "-"}</TableCell>
                          <TableCell>{dueDate.quotaNumber || "-"}</TableCell>
                          <TableCell>
                            {new Date(dueDate.dueDate).toLocaleDateString(
                              "es-AR"
                            )}
                          </TableCell>
                          <TableCell>{dueDate.detail || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notificaciones Tab - mismo formato que la vista del navbar */}
        <TabsContent value="notificaciones" className="space-y-6 mt-6">
          <NotificationsView
            clientId={clientId}
            className="min-h-[500px]"
            toolbar={
              <>
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
              </>
            }
          />
        </TabsContent>

        {/* Facturas Tab */}
        <TabsContent value="facturas" className="space-y-6 mt-6">
          <div className="flex justify-end">
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
          </div>
          {/* Invoice Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-black" />
                  </div>
                  <span>Ventas</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-2">
                  TOTAL VENTAS
                </div>
                <div className="text-3xl font-bold mb-4">
                  {new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    minimumFractionDigits: 2,
                  }).format(invoiceStats.totalSales)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <DollarSign className="h-6 w-6 text-black" />
                  </div>
                  <span>Compras</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-muted-foreground mb-2">
                  TOTAL COMPRAS
                </div>
                <div className="text-3xl font-bold mb-4">
                  {new Intl.NumberFormat("es-AR", {
                    style: "currency",
                    currency: "ARS",
                    minimumFractionDigits: 2,
                  }).format(invoiceStats.totalPurchases)}
                </div>
              </CardContent>
            </Card>
          </div>

          <InvoicesTable clientId={clientId} />
        </TabsContent>

        {/* Convenio Multilateral Tab */}
        <TabsContent value="convenio-multilateral" className="space-y-6 mt-6">
          <Card>
            <CardHeader className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Convenio Multilateral (ventas por provincia)
                </CardTitle>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
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
                        <SelectTrigger className="min-w-[220px] w-auto">
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

                  {/* Selector de período (año + meses), igual que IVA pero aplicado al filtro de Convenio Multilateral */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
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
            </CardHeader>
            <CardContent>
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

              {multilateralSummary.length === 0 ? (
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
          <div className="space-y-4">
            {/* Perfil, Período y Descargar Excel (botón a la derecha) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Perfil para IVA:
                </span>
                {effectiveIvaProfileId ? (
                  <Select
                    key={`iva-${clientId}`}
                    defaultValue={effectiveIvaProfileId}
                    onValueChange={(value) => setIvaProfileId(value || undefined)}
                    disabled={loadingProfiles || profiles.length <= 1}
                  >
                    <SelectTrigger className="min-w-[200px] w-auto">
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
                      size="default"
                      className="h-9 min-w-[200px] w-auto justify-start text-left font-normal px-3 py-2"
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
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="default"
                  size="default"
                  disabled={!!scrapingSection}
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
                      ]);
                      toast.success("IVA y comprobantes actualizados correctamente");
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Error al actualizar IVA"
                      );
                    } finally {
                      setScrapingSection(null);
                    }
                  }}
                >
                  {scrapingSection === "iva" ? (
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
                  size="default"
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
            </div>
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
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Facturas outbound -{" "}
              {selectedMultilateralProvinceLabel ?? "Provincia"}
            </DialogTitle>
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
            <div className="rounded-md border mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha emisión</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Punto de venta</TableHead>
                    <TableHead className="text-right">Nro. desde</TableHead>
                    <TableHead className="text-right">Nro. hasta</TableHead>
                    <TableHead className="text-right">Base imponible</TableHead>
                    <TableHead className="text-right">Total IVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {multilateralDetailInvoices.map((inv: any) => (
                    <TableRow key={inv.id}>
                      <TableCell>
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
                      <TableCell>{inv.type || "—"}</TableCell>
                      <TableCell className="text-right">
                        {inv.salePoint}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.numberFrom}
                      </TableCell>
                      <TableCell className="text-right">
                        {inv.numberTo}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatIvaCurrency(inv.amountTaxed)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatIvaCurrency(inv.totalIVA)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatIvaCurrency(inv.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
