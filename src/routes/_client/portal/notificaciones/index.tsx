import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientePortalNotificaciones } from '@/actions/client-portal';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';

export const Route = createFileRoute('/_client/portal/notificaciones/')({
  component: PortalNotificaciones,
});

const SEVERIDAD_LABELS: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  urgente: {
    label: 'Urgente',
    bg: 'var(--arca-accent-neg-bg)',
    color: 'var(--arca-accent-neg)',
  },
  accion_requerida: {
    label: 'Acción requerida',
    bg: 'var(--arca-accent-warn-bg)',
    color: 'var(--arca-accent-warn)',
  },
  informativa: {
    label: 'Informativa',
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
  },
  sin_clasificar: {
    label: 'Sin clasificar',
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
  },
};

function PortalNotificaciones() {
  const { clienteId } = Route.useRouteContext();

  const { data: notificaciones = [], isLoading } = useQuery({
    queryKey: ['portalNotificaciones', clienteId],
    queryFn: () => getClientePortalNotificaciones({ data: { clienteId } }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[var(--arca-ink)] leading-tight">
          Notificaciones
        </h1>
        <p className="text-sm text-[var(--arca-ink-3)] mt-1">
          Comunicaciones del domicilio fiscal electrónico
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : notificaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--arca-ink-3)]">
          <Bell size={32} className="opacity-30" />
          <p className="text-sm">No hay notificaciones pendientes</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notificaciones.map((n) => {
            const sev =
              SEVERIDAD_LABELS[n.severidad] ?? SEVERIDAD_LABELS.sin_clasificar;

            return (
              <li
                key={n.id}
                className="rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] text-[var(--arca-ink)] leading-snug whitespace-pre-line">
                      {n.mensaje ?? 'Sin mensaje'}
                    </p>
                    {n.aiResumen && (
                      <p className="text-[12px] text-[var(--arca-ink-3)] mt-2">
                        {n.aiResumen}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      <span
                        className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: sev.bg, color: sev.color }}
                      >
                        {sev.label}
                      </span>
                      {n.categoria && (
                        <span className="text-[11px] text-[var(--arca-ink-4)]">
                          {n.categoria}
                        </span>
                      )}
                      {!n.leida && (
                        <span className="text-[11px] font-semibold text-[var(--arca-accent-info)]">
                          No leída
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--arca-ink-4)]">
                      Publicada
                    </p>
                    <p className="text-[13px] font-medium text-[var(--arca-ink)] tabular-nums">
                      {n.publicadaAt
                        ? format(new Date(n.publicadaAt), 'dd/MM/yyyy')
                        : '—'}
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
