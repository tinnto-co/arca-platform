import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  DashboardTopbar,
  periodToRange,
  type Period,
} from '@/components/dashboard/topbar';
import { DashboardGreeting } from '@/components/dashboard/greeting';
import { KpiCardsRow } from '@/components/dashboard/kpi-cards';
import { MiniKpiCardsRow } from '@/components/dashboard/mini-kpi-cards';
import { EvolucionChart } from '@/components/dashboard/evolucion-chart';
import { FlujoCajaCard } from '@/components/dashboard/flujo-caja-card';
import { ClientesTable } from '@/components/dashboard/clientes-table';
import { VencimientosList } from '@/components/dashboard/vencimientos-list';
import { ActividadFeed } from '@/components/dashboard/actividad-feed';
import { ExceptionsBar } from '@/components/dashboard/exceptions-bar';
import { TodayScrapedCard } from '@/components/dashboard/today-scraped';
import { CredentialAlertBanner } from '@/components/dashboard/credential-alert-banner';
import { ScheduleCard } from '@/components/dashboard/schedule-card';

export const Route = createFileRoute('/_authed/')({
  component: DashboardPage,
});

const DEFAULT_PERIOD: Period = '30d';

function DashboardPage() {
  const [activePeriod, setActivePeriod] = useState<Period | null>(
    DEFAULT_PERIOD
  );
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() =>
    periodToRange(DEFAULT_PERIOD)
  );

  function handlePeriodChange(period: Period) {
    setActivePeriod(period);
    setDateRange(periodToRange(period));
  }

  function handleDateRangeChange(range: { from: Date; to: Date }) {
    setActivePeriod(null); // custom range — no pill active
    setDateRange(range);
  }

  return (
    <>
      <DashboardTopbar
        activePeriod={activePeriod}
        onPeriodChange={handlePeriodChange}
      />
      <div className="p-[28px_36px_60px] max-w-[1440px]">
        <DashboardGreeting
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
        />
        <CredentialAlertBanner />
        <ExceptionsBar />
        <KpiCardsRow from={dateRange.from} to={dateRange.to} />
        <MiniKpiCardsRow from={dateRange.from} to={dateRange.to} />

        {/* Chart + Cashflow */}
        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3.5 mb-3.5">
          <EvolucionChart from={dateRange.from} to={dateRange.to} />
          <FlujoCajaCard from={dateRange.from} to={dateRange.to} />
        </section>

        {/* Clients table + Deadlines */}
        <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3.5">
          <ClientesTable from={dateRange.from} to={dateRange.to} />
          <VencimientosList />
        </section>

        {/* Today's scraping + Schedule */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          <TodayScrapedCard />
          <ScheduleCard />
        </section>

        {/* Activity feed */}
        <section className="mt-3.5">
          <ActividadFeed from={dateRange.from} to={dateRange.to} />
        </section>
      </div>
    </>
  );
}
