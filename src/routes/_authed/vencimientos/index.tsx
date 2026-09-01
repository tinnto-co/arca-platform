import { createFileRoute } from '@tanstack/react-router';
import { VencimientosCalendar } from '@/components/vencimientos-calendar';
import { PageShell } from '@/components/shared/page-shell';

export const Route = createFileRoute('/_authed/vencimientos/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <PageShell>
      <VencimientosCalendar />
    </PageShell>
  );
}
