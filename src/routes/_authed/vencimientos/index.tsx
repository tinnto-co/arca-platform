import { createFileRoute } from '@tanstack/react-router';
import { VencimientosCalendar } from '@/components/vencimientos-calendar';
import { PageShell } from '@/components/shared/page-shell';

export const Route = createFileRoute('/_authed/vencimientos/')({
  component: RouteComponent,
});

function RouteComponent() {
  // El input del asistente flota sobre el borde inferior de la pantalla: el
  // padding de abajo es el hueco que le deja para que no tape la última fila.
  return (
    <PageShell variant="panel" className="pb-[136px] md:pb-[76px]">
      <VencimientosCalendar />
    </PageShell>
  );
}
