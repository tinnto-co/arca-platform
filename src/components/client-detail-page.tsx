import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
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
} from "@/actions/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getNotifications } from "@/actions/notification";
import { EditClientDialog } from "@/components/edit-client-dialog";
import { InvoicesTable } from "@/components/invoices-table";
import { getInvoices } from "@/actions/invoice";
import { scrapOldClient } from "@/actions/client";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Clock, CalendarCheck, CalendarX } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RenderIvaResume } from "./render-iva-resume";

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

export function ClientDetailPage({ clientId }: ClientDetailPageProps) {
  const navigate = useNavigate();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [ivaExpanded, setIvaExpanded] = useState(false);
  const [ivaProfileId, setIvaProfileId] = useState<string | undefined>(
    undefined
  );
  /** Rango de fechas elegido en el resumen IVA (para resaltar el scrape del período usado). */
  const [ivaResumenDateRange, setIvaResumenDateRange] = useState<{
    from?: Date;
    to?: Date;
  } | null>(null);

  /** Período fiscal del scrape que alimenta el resumen (mes anterior al elegido en el calendario). */
  const periodUsedForResumen = useMemo(
    () => getPeriodUsedForResumen(ivaResumenDateRange?.from),
    [ivaResumenDateRange?.from]
  );

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ["client", clientId],
    queryFn: async () => {
      const result = await getClient({ data: { id: clientId } });
      console.log("getClient result", result);
      return result;
    },
  });

  const periodoFiscalResumen = getResumenPeriodMMYYYY(ivaResumenDateRange?.from);

  const {
    data: clientIva,
    isLoading: loadingClientIva,
    error: clientIvaError,
  } = useQuery({
    queryKey: ["clientIva", clientId, ivaProfileId, periodoFiscalResumen],
    queryFn: () =>
      getClientIvaCredit({
        data: {
          clientId,
          profileId: ivaProfileId ?? undefined,
          periodoFiscalResumen: periodoFiscalResumen ?? undefined,
        },
      }),
    enabled: !!ivaProfileId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["clientProfiles", clientId],
    queryFn: () => getClientProfiles({ data: { clientId } }),
  });

  useEffect(() => {
    if (profiles.length > 0 && !ivaProfileId) {
      setIvaProfileId(profiles[0].id);
    }
  }, [profiles, ivaProfileId]);

  useEffect(() => {
    console.log("clientIva", clientIva);
  }, [clientIva]);

  const { data: debts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ["clientDebts", clientId],
    queryFn: () => getClientDebts({ data: { clientId } }),
  });

  const { data: dueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ["clientDueDates", clientId],
    queryFn: () => getClientDueDates({ data: { clientId } }),
  });

  const { data: notifications = [], isLoading: loadingNotifications } =
    useQuery({
      queryKey: ["clientNotifications", clientId],
      queryFn: () =>
        getNotifications({
          data: {
            clientFilter: clientId,
            page: 1,
            limit: 100,
          },
        }),
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
        </div>
        <EditClientDialog clientId={clientId}>
          <Button variant="default">
            <Edit className="mr-2 h-4 w-4" />
            Editar Cliente
          </Button>
        </EditClientDialog>
        <Button
          variant="default"
          onClick={() => scrapOldClient({ data: { clientId } })}
        >
          Scrapear Cliente
        </Button>
      </div>

      {/* Navigation Tabs */}
      <Tabs defaultValue="resumen" className="w-full">
        <TabsList>
          <TabsTrigger value="resumen">
            <FileText className="mr-2 h-4 w-4" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="deudas">
            <DollarSign className="mr-2 h-4 w-4" />
            Deudas
          </TabsTrigger>
          <TabsTrigger value="vencimientos">
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
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{client.phone || "-"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Email</div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{client.email || "-"}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Dirección</div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{client.address || "-"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Estado del Cliente Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Estado del Cliente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-black"></div>
                      <div className="font-semibold">
                        {getStatusBadge(client.status)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Registrado el{" "}
                    {new Date(client.registeredAt).toLocaleDateString("es-AR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profiles Section */}
          <div className="mt-8">
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

        {/* Notificaciones Tab */}
        <TabsContent value="notificaciones" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notificaciones del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNotifications ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-muted-foreground">
                    Cargando notificaciones...
                  </div>
                </div>
              ) : !notifications ||
                !("notifications" in notifications) ||
                notifications.notifications.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-muted-foreground">
                    No hay notificaciones registradas para este cliente
                  </div>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha de Publicación</TableHead>
                        <TableHead>Mensaje</TableHead>
                        <TableHead>Fecha de Vencimiento</TableHead>
                        <TableHead>ID Externo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {("notifications" in notifications
                        ? notifications.notifications
                        : []
                      ).map((notification: any) => (
                        <TableRow key={notification.id}>
                          <TableCell>
                            {new Date(
                              notification.publicationDate
                            ).toLocaleDateString("es-AR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {notification.message || "-"}
                          </TableCell>
                          <TableCell>
                            {new Date(
                              notification.expirationDate
                            ).toLocaleDateString("es-AR", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {notification.externalId || "-"}
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

        {/* Facturas Tab */}
        <TabsContent value="facturas" className="space-y-6 mt-6">
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

        {/* IVA Tab */}
        <TabsContent value="iva" className="mt-6">
          <div className="space-y-4">
            {/* Selector de perfil: define qué perfil ver en IVA y Resumen */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Perfil para IVA:
              </span>
              <Select
                value={ivaProfileId ?? ""}
                onValueChange={(value) => setIvaProfileId(value || undefined)}
                disabled={loadingProfiles || profiles.length <= 1}
              >
                <SelectTrigger className="min-w-[200px] w-auto">
                  <SelectValue
                    placeholder={
                      loadingProfiles
                        ? "Cargando perfiles..."
                        : profiles.length === 0
                          ? "Sin perfiles"
                          : "Seleccionar perfil"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile: { id: string; name?: string; identityNumber?: string }) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name || profile.identityNumber || profile.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1 min-w-0">
                <RenderIvaResume
                  clientId={clientId}
                  clientName={client?.name}
                  clientIva={clientIva ?? undefined}
                  selectedProfileId={ivaProfileId ?? undefined}
                  onDateRangeChange={(range) => setIvaResumenDateRange(range)}
                />
              </div>
              <div className="flex-1 min-w-0">
                {!ivaProfileId ? (
                  <div className="text-sm text-muted-foreground p-6 rounded-lg border bg-muted/30">
                    Seleccioná un perfil para ver la información de IVA.
                  </div>
                ) : loadingClientIva ? (
                  <div className="flex items-center justify-center h-32 p-6">
                    <div className="text-muted-foreground">
                      Calculando IVA del cliente...
                    </div>
                  </div>
                ) : clientIvaError ? (
                  <div className="flex flex-col gap-2 p-6">
                    <div className="text-sm font-medium text-red-600">
                      No se pudo obtener la información de IVA.
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Verificá las credenciales del cliente o intentá nuevamente
                      más tarde.
                    </div>
                  </div>
                ) : !clientIva || !clientIva.data ? (
                  <Card className="border-dashed">
                    <CardContent className="flex items-center justify-center py-10">
                      <p className="text-sm text-muted-foreground text-center">
                        No hay información de IVA para este perfil.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div
                    className={
                      periodUsedForResumen &&
                        clientIva?.data?.periodoFiscal === periodUsedForResumen
                        ? "rounded-lg border-2 border-emerald-500 transition-colors"
                        : ""
                    }
                  >
                    {/* Vista compacta: siempre visible, clickeable para desplegar */}
                    <button
                      type="button"
                      onClick={() => setIvaExpanded((e) => !e)}
                      className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-muted/50 transition-colors rounded-lg border-b"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 shrink-0 rounded-full bg-muted flex items-center justify-center">
                          <BanknoteArrowUp className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground uppercase tracking-wide">
                            CUIT
                          </div>
                          <div className="font-semibold truncate">
                            {clientIva.cuit || client.identityNumber}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">
                            Período fiscal
                          </div>
                          <div className="font-semibold">
                            {clientIva.data.periodoFiscal}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Presentado {clientIva.data.fechaPresentacion ?? "—"}
                          </div>
                        </div>
                        {ivaExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Contenido desplegable */}
                    {ivaExpanded && (
                      <div className="space-y-6 p-4 pt-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Card className="border border-gray-200 shadow-none">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">
                                Débito Fiscal
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {formatIvaCurrency(clientIva.data.debitoFiscal)}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border border-gray-200 shadow-none">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-muted-foreground">
                                Crédito Fiscal
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-2xl font-bold">
                                {formatIvaCurrency(clientIva.data.creditoFiscal)}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <Card className="border border-dashed border-gray-200 shadow-none">
                            <CardHeader className="pb-1">
                              <CardTitle className="text-xs font-medium text-muted-foreground">
                                Saldo a favor del contribuyente del período anterior
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-lg font-semibold">
                                {formatIvaCurrency(clientIva.data.saldoMesPasado)}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border border-dashed border-gray-200 shadow-none">
                            <CardHeader className="pb-1">
                              <CardTitle className="text-xs font-medium text-muted-foreground">
                                Saldo a favor de ARCA este mes
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-lg font-semibold">
                                {formatIvaCurrency(clientIva.data.saldoArcaMes)}
                              </div>
                            </CardContent>
                          </Card>

                          <Card className="border border-dashed border-gray-200 shadow-none">
                            <CardHeader className="pb-1">
                              <CardTitle className="text-xs font-medium text-muted-foreground">
                                Estado
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-sm font-medium">
                                {clientIva.data.ok
                                  ? "Scraping completado correctamente"
                                  : "Hubo un problema al obtener los datos"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {clientIva.message}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Determinación del impuesto (panel 1) - campos adicionales */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Determinación del impuesto
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <Card className="border border-dashed border-gray-200 shadow-none">
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                  Saldo técnico a favor del contribuyente
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-semibold">
                                  {formatIvaCurrency(
                                    clientIva.data.saldoTecnicoFavorContribuyente
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        {/* Determinación de la posición mensual (panel 2) */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Determinación de la posición mensual
                          </h4>
                          <div className="flex flex-wrap gap-4">
                            <Card className="border border-dashed border-gray-200 shadow-none min-w-[12rem] flex-1 basis-48 overflow-hidden">
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                  Saldo técnico a favor del contribuyente (posición
                                  mensual)
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-semibold break-words min-w-0">
                                  {formatIvaCurrency(
                                    clientIva.data
                                      .saldoTecnicoFavorContribuyentePosicionMensual
                                  )}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border border-dashed border-gray-200 shadow-none min-w-[12rem] flex-1 basis-48 overflow-hidden">
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                  Saldo libre disponibilidad período anterior (neto)
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-semibold break-words min-w-0">
                                  {formatIvaCurrency(
                                    clientIva.data
                                      .saldoLibreDisponibilidadPeriodoAnteriorNeto
                                  )}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border border-dashed border-gray-200 shadow-none min-w-[12rem] flex-1 basis-48 overflow-hidden">
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                  Total retenciones y percepciones del período
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-semibold break-words min-w-0">
                                  {formatIvaCurrency(
                                    clientIva.data
                                      .totalRetencionesPercepcionesPeriodo
                                  )}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border border-dashed border-gray-200 shadow-none min-w-[12rem] flex-1 basis-48 overflow-hidden">
                              <CardHeader className="pb-1">
                                <CardTitle className="text-xs font-medium text-muted-foreground">
                                  Saldo libre disponibilidad a favor del contribuyente
                                  (período)
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-lg font-semibold break-words min-w-0">
                                  {formatIvaCurrency(
                                    clientIva.data
                                      .saldoLibreDisponibilidadFavorContribuyentePeriodo
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
