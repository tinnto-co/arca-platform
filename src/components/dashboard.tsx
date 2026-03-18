import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Bell,
  DollarSign,
  ShoppingCart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDashboardStats,
  getUpcomingDueDates,
  getOverdueDebts,
  getRecentInvoices,
  getMonthlyEvolution,
  getPendingNotificationsCount,
} from "@/actions/dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { getUser } from "@/actions/user";

const chartConfig = {
  outbound: {
    label: "Ventas",
    color: "#139ed9",
  },
  inbound: {
    label: "Compras",
    color: "#232c50",
  },
} satisfies ChartConfig;

export function Dashboard() {
  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: () => getUser(),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: () => getDashboardStats(),
  });

  const { data: upcomingDueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ["upcomingDueDates"],
    queryFn: () => getUpcomingDueDates({ data: { days: 7, limit: 5 } }),
  });

  const { data: overdueDebts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ["overdueDebts"],
    queryFn: () => getOverdueDebts({ data: { limit: 5 } }),
  });

  const { data: recentInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["recentInvoices"],
    queryFn: () => getRecentInvoices({ data: { limit: 5 } }),
  });

  const { data: monthlyData = [], isLoading: loadingMonthly } = useQuery({
    queryKey: ["monthlyEvolution"],
    queryFn: () => getMonthlyEvolution({ data: { months: 6 } }),
  });

  const { data: pendingNotifications, isLoading: loadingNotifications } =
    useQuery({
      queryKey: ["pendingNotificationsCount"],
      queryFn: () => getPendingNotificationsCount(),
    });

  const salesChange =
    stats && stats.previousMonthSales > 0
      ? ((stats.monthlySales - stats.previousMonthSales) /
          stats.previousMonthSales) *
        100
      : 0;

  const purchasesChange =
    stats && stats.previousMonthPurchases > 0
      ? ((stats.monthlyPurchases - stats.previousMonthPurchases) /
          stats.previousMonthPurchases) *
        100
      : 0;

  const totalOverdueAmount = overdueDebts.reduce(
    (sum, d) => sum + Number(d.balance || 0),
    0
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCurrencyFull = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="h-full overflow-y-auto hide-scrollbar flex flex-col p-4 md:p-6 gap-3 md:gap-4">
      {/* Header */}
      <div className="flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-[#232c50] mb-1">
          Bienvenido {user?.name}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Aquí tienes un resumen general de todos tus clientes y su actividad
          contable
        </p>
      </div>

      {/* Row 1: KPI Cards - Sales & Purchases */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-shrink-0">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#139ed9]/10">
                  <DollarSign className="h-4 w-4 text-[#139ed9]" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  Ventas del mes
                </p>
              </div>
              {!loadingStats && salesChange !== 0 && (
                <div
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    salesChange > 0
                      ? "text-emerald-700 bg-emerald-50"
                      : "text-red-700 bg-red-50"
                  }`}
                >
                  {salesChange > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(salesChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="text-2xl md:text-3xl font-bold text-[#232c50]">
              {loadingStats ? "-" : formatCurrency(stats?.monthlySales || 0)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              vs {formatCurrency(stats?.previousMonthSales || 0)} mes anterior
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#232c50]/10">
                  <ShoppingCart className="h-4 w-4 text-[#232c50]" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  Compras del mes
                </p>
              </div>
              {!loadingStats && purchasesChange !== 0 && (
                <div
                  className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    purchasesChange > 0
                      ? "text-red-700 bg-red-50"
                      : "text-emerald-700 bg-emerald-50"
                  }`}
                >
                  {purchasesChange > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(purchasesChange).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="text-2xl md:text-3xl font-bold text-[#232c50]">
              {loadingStats
                ? "-"
                : formatCurrency(stats?.monthlyPurchases || 0)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              vs {formatCurrency(stats?.previousMonthPurchases || 0)} mes
              anterior
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 flex-shrink-0">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Users className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Clientes activos</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingStats ? "-" : stats?.totalClients || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Facturas del mes</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingStats ? "-" : stats?.monthlyInvoices || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">
                Notificaciones pendientes
              </p>
            </div>
            <div className="text-2xl font-bold">
              {loadingNotifications
                ? "-"
                : pendingNotifications?.count || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Deudas vencidas</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingDebts ? "-" : overdueDebts.length}
            </div>
            {!loadingDebts && totalOverdueAmount > 0 && (
              <p className="text-[11px] text-red-600 font-medium mt-0.5">
                {formatCurrency(totalOverdueAmount)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Monthly Evolution Chart */}
      <Card className="flex-shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#232c50]" />
            Evolución Mensual
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-3">
          {loadingMonthly ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              Cargando...
            </div>
          ) : monthlyData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
              No hay datos de facturación
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <BarChart
                data={monthlyData}
                margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(v) =>
                    v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                        ? `${(v / 1_000).toFixed(0)}K`
                        : String(v)
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        formatCurrencyFull(Number(value))
                      }
                    />
                  }
                />
                <Bar
                  dataKey="outbound"
                  fill="var(--color-outbound)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  dataKey="inbound"
                  fill="var(--color-inbound)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Three Lists */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-3 flex-shrink-0">
        {/* Vencimientos Próximos */}
        <Card className="flex flex-col">
          <CardHeader className="pb-1 flex-shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <Calendar className="w-4 h-4 text-[#232c50]" />
              Vencimientos Próximos
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {loadingDueDates ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Cargando...
              </div>
            ) : upcomingDueDates.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No hay vencimientos próximos
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingDueDates.slice(0, 5).map((dd) => (
                  <div
                    key={dd.id}
                    className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {dd.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground truncate text-[10px]">
                        {dd.tax || "-"} - {dd.concept || "-"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-[10px] md:text-xs">
                        {formatDate(dd.dueDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deudas Vencidas */}
        <Card className="flex flex-col">
          <CardHeader className="pb-1 flex-shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-[#232c50]" />
              Deudas Vencidas
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {loadingDebts ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Cargando...
              </div>
            ) : overdueDebts.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No hay deudas vencidas
              </div>
            ) : (
              <div className="space-y-1.5">
                {overdueDebts.slice(0, 5).map((debt) => (
                  <div
                    key={debt.id}
                    className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {debt.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground truncate text-[10px]">
                        {debt.tax || "-"} - {debt.concept || "-"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-[10px] md:text-xs">
                        {formatCurrencyFull(Number(debt.balance || 0))}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {formatDate(debt.dueDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimas Facturas */}
        <Card className="flex flex-col">
          <CardHeader className="pb-1 flex-shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-1">
              <FileText className="w-4 h-4 text-[#232c50]" />
              Últimas Facturas
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            {loadingInvoices ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                Cargando...
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No hay facturas recientes
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentInvoices.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {inv.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground truncate text-[10px]">
                        {inv.type || "-"}{" "}
                        <span
                          className={`inline-block px-1 rounded text-[9px] font-medium ${
                            inv.direction === "outbound"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {inv.direction === "outbound" ? "Venta" : "Compra"}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-[10px] md:text-xs">
                        {formatCurrencyFull(Number(inv.amount || 0))}
                      </div>
                      <div className="text-muted-foreground text-[10px]">
                        {formatDate(inv.emitionDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
