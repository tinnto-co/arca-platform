import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientePortalVencimientos } from '@/actions/client-portal';
import { CalendarClock } from 'lucide-react';
import { periodoLegible } from '@/lib/periodo';

export const Route = createFileRoute('/_client/portal/vencimientos/')({
  component: PortalVencimientos,
});

/** Las columnas `date` llegan como 'YYYY-MM-DD': partirlas evita el corrimiento
 * de un día que produce `new Date(...)` al interpretarlas en UTC. */
function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return dia ? `${dia}/${mes}/${anio}` : fecha;
}

function diasRestantes(fecha: string): number {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
  const vence = new Date(anio, mes - 1, dia);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((vence.getTime() - hoy.getTime()) / 86_400_000);
}

function estadoPlazo(dias: number): {
  label: string;
  bg: string;
  color: string;
} {
  if (dias < 0)
    return {
      label: `Vencido hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}`,
      bg: 'var(--arca-accent-neg-bg)',
      color: 'var(--arca-accent-neg)',
    };
  if (dias === 0)
    return {
      label: 'Vence hoy',
      bg: 'var(--arca-accent-warn-bg)',
      color: 'var(--arca-accent-warn)',
    };
  if (dias <= 7)
    return {
      label: `En ${dias} ${dias === 1 ? 'día' : 'días'}`,
      bg: 'var(--arca-accent-warn-bg)',
      color: 'var(--arca-accent-warn)',
    };
  return {
    label: `En ${dias} días`,
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
  };
}

function PortalVencimientos() {
  const { clienteId } = Route.useRouteContext();

  const { data: vencimientos = [], isLoading } = useQuery({
    queryKey: ['portalVencimientos', clienteId],
    queryFn: () => getClientePortalVencimientos({ data: { clienteId } }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[var(--arca-ink)] leading-tight">
          Vencimientos
        </h1>
        <p className="text-sm text-[var(--arca-ink-3)] mt-1">
          Próximos vencimientos impositivos pendientes
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : vencimientos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--arca-ink-3)]">
          <CalendarClock size={32} className="opacity-30" />
          <p className="text-sm">No hay vencimientos pendientes</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {vencimientos.map((v) => {
            const dias = diasRestantes(v.venceAt);
            const plazo = estadoPlazo(dias);

            return (
              <li
                key={v.id}
                className="rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[var(--arca-ink)] leading-snug">
                      {v.impuesto ?? 'Sin impuesto'}
                    </p>
                    {v.concepto && (
                      <p className="text-[12px] text-[var(--arca-ink-3)] mt-1">
                        {v.concepto}
                        {v.subConcepto ? ` · ${v.subConcepto}` : ''}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      <span
                        className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: plazo.bg, color: plazo.color }}
                      >
                        {plazo.label}
                      </span>
                      <span className="text-[11px] text-[var(--arca-ink-4)]">
                        Período: {periodoLegible(v.periodo)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--arca-ink-4)]">
                      Vence
                    </p>
                    <p className="text-[15px] font-semibold text-[var(--arca-ink)] tabular-nums">
                      {fechaLegible(v.venceAt)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
