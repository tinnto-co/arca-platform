import { createFileRoute } from '@tanstack/react-router';
import { DashboardGreeting } from '@/components/dashboard/greeting';
import { CredentialAlertBanner } from '@/components/dashboard/credential-alert-banner';
import { ExceptionsBar } from '@/components/dashboard/exceptions-bar';
import { TareasKpiRow } from '@/components/dashboard/tareas-kpi-row';
import { VencimientosSemanales } from '@/components/dashboard/vencimientos-semanales';

export const Route = createFileRoute('/_authed/')({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <DashboardGreeting />
      <CredentialAlertBanner />
      <ExceptionsBar />
      <TareasKpiRow />
      <VencimientosSemanales />
    </div>
  );
}
