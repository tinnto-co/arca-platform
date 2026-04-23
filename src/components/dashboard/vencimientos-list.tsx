import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { getUpcomingDueDates } from '@/actions/dashboard';
import { ArcaCard, ArcaCardHead, ArcaCardFoot, Chip } from './shared';

export function VencimientosList() {
  const { data: dueDates = [], isLoading } = useQuery({
    queryKey: ['upcomingDueDates30'],
    queryFn: () => getUpcomingDueDates({ data: { days: 30, limit: 5 } }),
  });

  // Count urgent (within 3 days)
  const now = new Date();
  const urgentCount = dueDates.filter((dd) => {
    const diff = new Date(dd.dueDate).getTime() - now.getTime();
    return diff < 3 * 86400000;
  }).length;

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Vencimientos próximos
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Obligaciones fiscales e internas
          </div>
        </div>
        {urgentCount > 0 && <Chip variant="neg">{urgentCount} urgentes</Chip>}
      </ArcaCardHead>

      <div className="py-1.5">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--arca-ink-3)]">
            Cargando...
          </div>
        ) : dueDates.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--arca-ink-3)]">
            No hay vencimientos próximos
          </div>
        ) : (
          dueDates.map((dd) => {
            const d = new Date(dd.dueDate);
            const day = String(d.getDate()).padStart(2, '0');
            const month = d.toLocaleDateString('es-AR', { month: 'short' });
            const diffMs = d.getTime() - now.getTime();
            const isUrgent = diffMs < 3 * 86400000;

            return (
              <div
                key={dd.id}
                className="grid grid-cols-[46px_1fr_auto] gap-3 px-5 py-2.5 items-center border-b border-[var(--arca-border)] last:border-b-0"
              >
                {/* Date block */}
                <div
                  className={`rounded-lg py-1 text-center font-display ${
                    isUrgent
                      ? 'bg-[var(--arca-accent-neg-bg)]'
                      : 'bg-[var(--arca-surface-2)] border border-[var(--arca-border)]'
                  }`}
                >
                  <div
                    className={`text-[16px] font-bold leading-none tracking-[-0.02em] ${
                      isUrgent
                        ? 'text-[var(--arca-accent-neg-fg)]'
                        : 'text-[var(--arca-ink)]'
                    }`}
                  >
                    {day}
                  </div>
                  <span
                    className={`text-[9.5px] font-semibold uppercase tracking-[0.1em] mt-0.5 block ${
                      isUrgent
                        ? 'text-[var(--arca-accent-neg-fg)]'
                        : 'text-[var(--arca-ink-3)]'
                    }`}
                  >
                    {month}
                  </span>
                </div>

                {/* Info */}
                <div>
                  <div className="text-[13px] font-medium text-[var(--arca-ink)]">
                    {dd.tax || '-'}
                  </div>
                  <div className="text-[11.5px] text-[var(--arca-ink-3)] mt-0.5">
                    {dd.concept || '-'} · {dd.clientName || 'General'}
                  </div>
                </div>

                {/* Amount placeholder */}
                <div className="text-xs tabular-nums font-semibold text-[var(--arca-ink)]">
                  {/* Due dates don't have amounts in the current schema */}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ArcaCardFoot leftText="Próximos 30 días" linkText="Ver calendario →" />
    </ArcaCard>
  );
}
