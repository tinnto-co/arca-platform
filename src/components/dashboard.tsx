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
} from "@/actions/dashboard";

export function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: () => getDashboardStats(),
  });

  const { data: upcomingDueDates = [], isLoading: loadingDueDates } = useQuery({
    queryKey: ["upcomingDueDates"],
    queryFn: () => getUpcomingDueDates({ data: { days: 7 } }),
  });

  const { data: overdueDebts = [], isLoading: loadingDebts } = useQuery({
    queryKey: ["overdueDebts"],
    queryFn: () => getOverdueDebts(),
  });

  const { data: recentInvoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["recentInvoices"],
    queryFn: () => getRecentInvoices({ data: { limit: 5 } }),
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
    <div className="h-[calc(100vh-2rem)] overflow-hidden flex flex-col m-[3rem]">
      {/* Main Stats Cards - Top Row */}
      <div className="grid grid-cols-5 gap-3 mb-3 flex-shrink-0">
        {/* Total Ventas */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Ventas (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold mb-1">
              {loadingStats ? "-" : formatCurrency(stats?.monthlySales || 0)}
            </div>
            {stats && salesChange !== 0 && (
              <div className="text-xs flex items-center gap-1 text-muted-foreground">
                {salesChange >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(salesChange).toFixed(1)}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Compras */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Compras (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold mb-1">
              {loadingStats
                ? "-"
                : formatCurrency(stats?.monthlyPurchases || 0)}
            </div>
            {stats && purchasesChange !== 0 && (
              <div className="text-xs flex items-center gap-1 text-muted-foreground">
                {purchasesChange >= 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(purchasesChange).toFixed(1)}% vs anterior
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resultado */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Resultado (Mes)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">
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
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
              Clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">
              {loadingStats ? "-" : stats?.totalClients || 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {loadingStats ? "-" : stats?.monthlyInvoices || 0} facturas este
              mes
            </div>
          </CardContent>
        </Card>

        {/* Vencimientos Próximos */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Vencimientos (7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-2xl font-bold">
              {loadingDueDates ? "-" : upcomingDueDates.length}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Requieren atención
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Section - Tables */}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        {/* Vencimientos Próximos */}
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1">
                <Calendar className="h-4 w-4 text-black" />
                Vencimientos Próximos
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto py-2">
            {loadingDueDates ? (
              <div className="text-sm text-muted-foreground">Cargando...</div>
            ) : upcomingDueDates.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No hay vencimientos próximos
              </div>
            ) : (
              <div className="space-y-2">
                {upcomingDueDates.slice(0, 5).map((dd) => (
                  <div
                    key={dd.id}
                    className="flex justify-between items-start text-xs border-b border-gray-100 pb-2"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {dd.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {dd.tax || "-"} - {dd.concept || "-"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-xs">
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
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-black" />
                Deudas Vencidas
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto py-2">
            {loadingDebts ? (
              <div className="text-sm text-muted-foreground">Cargando...</div>
            ) : overdueDebts.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No hay deudas vencidas
              </div>
            ) : (
              <div className="space-y-2">
                {overdueDebts.slice(0, 5).map((debt) => (
                  <div
                    key={debt.id}
                    className="flex justify-between items-start text-xs border-b border-gray-100 pb-2"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {debt.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground truncate text-xs">
                        {debt.tax || "-"} - {debt.concept || "-"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-xs">
                        {formatCurrency(Number(debt.balance || 0))}
                      </div>
                      <div className="text-muted-foreground text-xs">
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
        <Card className="flex flex-col min-h-0">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1">
                <FileText className="h-4 w-4 text-black" />
                Últimas Facturas
              </CardTitle>
              <Link to="/invoices">
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                  Ver todas
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto py-2">
            {loadingInvoices ? (
              <div className="text-sm text-muted-foreground">Cargando...</div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No hay facturas recientes
              </div>
            ) : (
              <div className="space-y-2">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex justify-between items-start text-xs border-b border-gray-100 pb-2"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="font-medium truncate">
                        {inv.clientName || "-"}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {inv.direction?.toLowerCase() === "outbound"
                          ? "Venta"
                          : "Compra"}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-medium text-xs">
                        {formatCurrency(parseFloat(inv.amount || "0"))}
                      </div>
                      <div className="text-muted-foreground text-xs">
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
