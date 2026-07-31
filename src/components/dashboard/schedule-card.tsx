import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Loader2 } from 'lucide-react';
import { getScheduleStatus } from '@/actions/dashboard';
import { ArcaCard, ArcaCardHead, ArcaCardFoot } from './shared';

const FREQ_LABEL: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

const FREQ_COLOR: Record<string, string> = {
  daily: 'var(--arca-accent-pos-fg)',
  weekly: 'var(--arca-accent-warn)',
  monthly: 'var(--arca-ink-3)',
};

function FreqBadge({ freq }: { freq: string }) {
  return (
    <span
      className="inline-block text-[9px] font-semibold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[4px]"
      style={{
        color: FREQ_COLOR[freq] || 'var(--arca-ink-3)',
        background: 'var(--arca-surface-2)',
      }}
    >
      {FREQ_LABEL[freq] || freq}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getModuleSummary(
  modules: Record<string, { frequency: string; lastScrapedAt: string | null; nextScheduledAfter: string | null }>
) {
  const pending: string[] = [];
  let nextDate: string | null = null;

  for (const [mod, info] of Object.entries(modules)) {
    if (!info.lastScrapedAt) {
      pending.push(mod);
    }
    if (info.nextScheduledAfter) {
      if (!nextDate || info.nextScheduledAfter < nextDate) {
        nextDate = info.nextScheduledAfter;
      }
    }
  }

  return { pending, nextDate };
}

export function ScheduleCard() {
  const { data: reps = [], isLoading } = useQuery({
    queryKey: ['scheduleStatus'],
    queryFn: () => getScheduleStatus(),
    staleTime: 60_000,
  });

  const activeReps = reps.filter((r) => !r.tieneAlertaCredencial);

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <CalendarClock className="w-3.5 h-3.5" />
            Plan de scraping
          </div>
          <p className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
            Frecuencias: comprobantes/notif. diario, deuda/venc. semanal, IVA mensual
          </p>
        </div>
      </ArcaCardHead>

      <div className="px-4 pb-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-[var(--arca-ink-4)] gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Cargando...</span>
          </div>
        ) : activeReps.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[13px] text-[var(--arca-ink-4)]">
            No hay credenciales activas
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-[var(--arca-surface)]">
                <tr className="border-b border-[var(--arca-border)]">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2">
                    Credencial
                  </th>
                  <th className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2 w-20">
                    Ultimo
                  </th>
                  <th className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2 w-20">
                    Proximo
                  </th>
                  <th className="text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2 w-28">
                    Modulos
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeReps.map((rep) => {
                  const { nextDate } = getModuleSummary(rep.modules);
                  // Find the most recent scrape across all modules
                  const lastDates = Object.values(rep.modules)
                    .map((m) => m.lastScrapedAt)
                    .filter(Boolean) as string[];
                  const lastScrape = lastDates.length > 0
                    ? lastDates.sort().reverse()[0]
                    : null;

                  return (
                    <tr
                      key={rep.credencialId}
                      className="border-b border-[var(--arca-border)] last:border-0"
                    >
                      <td className="py-2">
                        <div className="font-medium text-[var(--arca-ink)]">
                          {rep.nombre || '(sin nombre)'}
                        </div>
                        <div className="text-[11px] text-[var(--arca-ink-4)] font-mono">
                          {rep.cuit}
                        </div>
                      </td>
                      <td className="text-center text-[11px] text-[var(--arca-ink-3)] tabular-nums">
                        {formatDate(lastScrape)}
                      </td>
                      <td className="text-center text-[11px] text-[var(--arca-ink-3)] tabular-nums">
                        {formatDate(nextDate)}
                      </td>
                      <td className="text-right py-2">
                        <div className="flex flex-wrap justify-end gap-1">
                          {Object.entries(rep.modules).map(([mod, info]) => (
                            <FreqBadge key={mod} freq={info.frequency} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ArcaCardFoot
        leftText={`${activeReps.length} credencial${activeReps.length !== 1 ? 'es' : ''} activas`}
        linkText="Ver jobs →"
        linkHref="/jobs"
      />
    </ArcaCard>
  );
}
