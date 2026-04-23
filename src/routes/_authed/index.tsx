import { createFileRoute } from '@tanstack/react-router';
import { DashboardTopbar } from '@/components/dashboard/topbar';
import { DashboardGreeting } from '@/components/dashboard/greeting';
import { KpiCardsRow } from '@/components/dashboard/kpi-cards';
import { MiniKpiCardsRow } from '@/components/dashboard/mini-kpi-cards';
import { EvolucionChart } from '@/components/dashboard/evolucion-chart';
import { FlujoCajaCard } from '@/components/dashboard/flujo-caja-card';
import { ClientesTable } from '@/components/dashboard/clientes-table';
import { VencimientosList } from '@/components/dashboard/vencimientos-list';
import { ActividadFeed } from '@/components/dashboard/actividad-feed';

export const Route = createFileRoute('/_authed/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <>
      <DashboardTopbar />
      <div className="p-[28px_36px_60px] max-w-[1440px]">
        <DashboardGreeting />
        <KpiCardsRow />
        <MiniKpiCardsRow />

        {/* Chart + Cashflow */}
        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3.5 mb-3.5">
          <EvolucionChart />
          <FlujoCajaCard />
        </section>

        {/* Clients table + Deadlines */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
          <ClientesTable />
          <VencimientosList />
        </section>

        {/* Activity feed */}
        <ActividadFeed />
      </div>
    </>
  );
}
