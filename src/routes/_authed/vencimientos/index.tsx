import { createFileRoute } from '@tanstack/react-router';
import { VencimientosCalendar } from '@/components/vencimientos-calendar';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/vencimientos/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-4 md:px-[3rem] md:pt-[3rem] md:pb-6">
      <PageHeader
        title="Calendario de vencimientos"
        subtitle="Obligaciones fiscales y deudas por fecha"
      />
      <VencimientosCalendar />
    </div>
  );
}
