import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
  Users,
  Bell,
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
    <div className="h-full overflow-y-auto hide-scrollbar flex flex-col p-4 md:p-6">
      {/* Header */}
      <div className="mb-3 md:mb-4 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-[#232c50] mb-1">
          Bienvenido {user?.name}
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Aquí tienes un resumen general de todos tus clientes y su actividad
          contable
        </p>
      </div>

      {/* Main Stats Cards - Top Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3 mb-2 md:mb-3 flex-shrink-0">
        {/* Total Ventas */}

        {/* Total Compras */}


        {/* Total Clientes */}
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-center gap-2 mb-4">
              <Users className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Clientes activos</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingStats ? "-" : stats?.totalClients || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Notificaciones pendientes</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingStats ? "-" : 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Deudas vencidas</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingDebts ? "-" : overdueDebts.length}
            </div>
          </CardContent>
        </Card>

        {/* Vencimientos Próximos */}
        <Card>
          <CardContent className="pt-1">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="text-[#139ed9] h-4 w-4" />
              <p className="text-xs text-muted-foreground">Vencimientos (7d)</p>
            </div>
            <div className="text-2xl font-bold">
              {loadingDueDates ? "-" : upcomingDueDates.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section - Lists and Chart */}
      <div className="flex flex-col gap-2 flex-1 min-h-0">
        {/* Lists Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-shrink-0">
          {/* Vencimientos Próximos */}
          <Card className="flex flex-col">
            <CardHeader className="pb-1 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex flex-row items-center gap-0.5">
                  <Calendar className="w-4 h-4 text-[#232c50]" />
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
                <CardTitle className="text-sm font-semibold flex flex-row items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-[#232c50]" />
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

        </div>


      </div>
    </div>
  );
}
