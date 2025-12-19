import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getDashboardStats,
  getUpcomingDueDates,
  getOverdueDebts,
  getRecentInvoices,
  getMonthlyEvolution,
} from "@/actions/dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { getUser } from "@/actions/user";

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

  const formatCurrency = (amount: number) => {
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
    <div className="h-[calc(100vh-1rem)] overflow-hidden flex flex-col p-3 md:p-4">
      {/* Header */}
      <div className="mb-3 md:mb-4 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-semibold mb-1">
          Bienvenido {user?.name}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Aquí tienes un resumen general de todos tus clientes y su actividad
          contable
        </p>
      </div>

      {/* Main Stats Cards - Top Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3 mb-2 md:mb-3 flex-shrink-0">
        {/* Total Ventas */}
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="pb-1">
            <CardTitle className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase">
              Ventas (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="text-base md:text-lg font-bold mb-0.5">
              {loadingStats ? "-" : formatCurrency(stats?.monthlySales || 0)}
            </div>
            {stats && salesChange !== 0 && (
              <div className="text-[9px] md:text-[10px] flex items-center gap-0.5 text-muted-foreground">
                {salesChange >= 0 ? (
                  <TrendingUp className="h-2 w-2" />
                ) : (
                  <TrendingDown className="h-2 w-2" />
                )}
                {Math.abs(salesChange).toFixed(1)}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Compras */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase">
              Compras (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="text-base md:text-lg font-bold mb-0.5">
              {loadingStats
                ? "-"
                : formatCurrency(stats?.monthlyPurchases || 0)}
            </div>
            {stats && purchasesChange !== 0 && (
              <div className="text-[9px] md:text-[10px] flex items-center gap-0.5 text-muted-foreground">
                {purchasesChange >= 0 ? (
                  <TrendingUp className="h-2 w-2" />
                ) : (
                  <TrendingDown className="h-2 w-2" />
                )}
                {Math.abs(purchasesChange).toFixed(1)}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase">
              Resultado (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="text-base md:text-lg font-bold">
              {loadingStats
                ? "-"
                : formatCurrency(
                    (stats?.monthlySales || 0) - (stats?.monthlyPurchases || 0)
                  )}
            </div>
          </CardContent>
        </Card>

        {/* Total Clientes */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase">
              Clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="text-base md:text-lg font-bold">
              {loadingStats ? "-" : stats?.totalClients || 0}
            </div>
            <div className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">
              {loadingStats ? "-" : stats?.monthlyInvoices || 0} facturas este
              mes
            </div>
          </CardContent>
        </Card>

        {/* Vencimientos Próximos */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase flex items-center gap-0.5">
              <Calendar className="h-2 w-2" />
              Vencimientos (7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-1">
            <div className="text-base md:text-lg font-bold">
              {loadingDueDates ? "-" : upcomingDueDates.length}
            </div>
            <div className="text-[9px] md:text-[10px] text-muted-foreground mt-0.5">
              Requieren atención
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section - Lists and Chart */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {/* Lists Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-shrink-0">
          {/* Vencimientos Próximos */}
          <Card className="flex flex-col">
            <CardHeader className="pb-1 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] md:text-xs font-semibold flex items-center gap-0.5">
                  <Calendar className="h-2.5 w-2.5 text-black" />
                  Vencimientos Próximos
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="py-1">
              {loadingDueDates ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  Cargando...
                </div>
              ) : upcomingDueDates.length === 0 ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  No hay vencimientos próximos
                </div>
              ) : (
                <div className="space-y-1.5 md:space-y-2">
                  {upcomingDueDates.slice(0, 5).map((dd) => (
                    <div
                      key={dd.id}
                      className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5 md:pb-2"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium truncate">
                          {dd.clientName || "-"}
                        </div>
                        <div className="text-muted-foreground truncate text-[10px] md:text-xs">
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
            <CardHeader className="pb-1.5 md:pb-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 md:h-4 md:w-4 text-black" />
                  Deudas Vencidas
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="py-1.5 md:py-2">
              {loadingDebts ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  Cargando...
                </div>
              ) : overdueDebts.length === 0 ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  No hay deudas vencidas
                </div>
              ) : (
                <div className="space-y-1.5 md:space-y-2">
                  {overdueDebts.slice(0, 5).map((debt) => (
                    <div
                      key={debt.id}
                      className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5 md:pb-2"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium truncate">
                          {debt.clientName || "-"}
                        </div>
                        <div className="text-muted-foreground truncate text-[10px] md:text-xs">
                          {debt.tax || "-"} - {debt.concept || "-"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium text-[10px] md:text-xs">
                          {formatCurrency(Number(debt.balance || 0))}
                        </div>
                        <div className="text-muted-foreground text-[10px] md:text-xs">
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
            <CardHeader className="pb-1.5 md:pb-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs md:text-sm font-semibold flex items-center gap-1">
                  <FileText className="h-3 w-3 md:h-4 md:w-4 text-black" />
                  Últimas Facturas
                </CardTitle>
                <Link to="/invoices">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 md:h-6 text-[10px] md:text-xs px-1.5 md:px-2"
                  >
                    Ver todas
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="py-1.5 md:py-2">
              {loadingInvoices ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  Cargando...
                </div>
              ) : recentInvoices.length === 0 ? (
                <div className="text-xs md:text-sm text-muted-foreground">
                  No hay facturas recientes
                </div>
              ) : (
                <div className="space-y-1.5 md:space-y-2">
                  {recentInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex justify-between items-start text-[11px] md:text-xs border-b border-gray-100 pb-1.5 md:pb-2"
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="font-medium truncate">
                          {inv.clientName || "-"}
                        </div>
                        <div className="text-muted-foreground text-[10px] md:text-xs">
                          {inv.direction?.toLowerCase() === "outbound"
                            ? "Venta"
                            : "Compra"}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-medium text-[10px] md:text-xs">
                          {formatCurrency(parseFloat(inv.amount || "0"))}
                        </div>
                        <div className="text-muted-foreground text-[10px] md:text-xs">
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

        {/* Chart Section */}
        {!loadingMonthly && monthlyData.length > 0 && (
          <Card className="flex-shrink-0">
            <CardHeader className="pb-1">
              <CardTitle className="text-[11px] md:text-xs font-semibold">
                Evolución Mensual - Últimos 6 Meses
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 md:p-3">
              <ChartContainer
                config={{
                  ventas: {
                    label: "Ventas",
                    color: "#1F2937",
                  },
                  compras: {
                    label: "Compras",
                    color: "#6B7280",
                  },
                }}
                className="h-[160px] md:h-[180px] w-full"
              >
                <BarChart
                  data={monthlyData}
                  margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E5E7EB"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="#6B7280"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    stroke="#6B7280"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                    tickMargin={8}
                    tickFormatter={(value) => {
                      if (value >= 1000000) {
                        return `$${(value / 1000000).toFixed(1)}M`;
                      }
                      if (value >= 1000) {
                        return `$${(value / 1000).toFixed(0)}K`;
                      }
                      return `$${value}`;
                    }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                    iconSize={10}
                  />
                  <Bar
                    dataKey="outbound"
                    name="Ventas"
                    fill="#1F2937"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey="inbound"
                    name="Compras"
                    fill="#6B7280"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
