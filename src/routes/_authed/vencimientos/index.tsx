import { createFileRoute } from '@tanstack/react-router';
import { VencimientosCalendar } from '@/components/vencimientos-calendar';

export const Route = createFileRoute('/_authed/vencimientos/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="max-w-[1400px] mx-auto px-[44px] pt-[34px] pb-[64px] bg-[#F7F6F2] min-h-screen">
      <VencimientosCalendar />
    </div>
  );
}
