import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { getTodayScrapedCredenciales } from '@/actions/dashboard';
import { ArcaCard, ArcaCardHead, ArcaCardFoot } from './shared';

export function TodayScrapedCard() {
  const { data: reps = [], isLoading } = useQuery({
    queryKey: ['todayScraped'],
    queryFn: () => getTodayScrapedCredenciales(),
    refetchInterval: 30000, // Refresh every 30s to show progress
  });

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            Scraping del día
          </div>
          <p className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
            Credenciales scrapeadas hoy
          </p>
        </div>
      </ArcaCardHead>

      <div className="px-4 pb-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-[var(--arca-ink-4)] gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[13px]">Cargando...</span>
          </div>
        ) : reps.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[13px] text-[var(--arca-ink-4)]">
            No hay scrapes programados para hoy
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--arca-border)]">
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2">
                  Credencial
                </th>
                <th className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2 w-16">
                  Jobs
                </th>
                <th className="text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2 w-20">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => {
                const allDone = rep.pendientes === 0;
                const hasErrors = rep.fallidos > 0;
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
                    <td className="text-center tabular-nums text-[var(--arca-ink-3)]">
                      {rep.jobs}
                    </td>
                    <td className="text-center">
                      {!allDone ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-ink-3)]">
                          <Clock className="w-3 h-3" />
                          {rep.pendientes} pendientes
                        </span>
                      ) : hasErrors ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-accent-neg-fg)]">
                          <XCircle className="w-3 h-3" />
                          {rep.fallidos} error{rep.fallidos > 1 ? 'es' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--arca-accent-pos-fg)]">
                          <CheckCircle2 className="w-3 h-3" />
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <ArcaCardFoot
        leftText={`${reps.length} credencial${reps.length !== 1 ? 'es' : ''} hoy`}
        linkText="Ver jobs →"
        linkHref="/jobs"
      />
    </ArcaCard>
  );
}
