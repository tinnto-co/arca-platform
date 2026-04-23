import { useQuery } from '@tanstack/react-query';
import { Bell, ArrowRight } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getPendingNotificationsCount } from '@/actions/dashboard';
import { getNotifications } from '@/actions/notification';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { relativeTime } from './shared';

export const PERIOD_OPTIONS = ['Hoy', '7d', '30d', '90d', 'YTD'] as const;
export type Period = (typeof PERIOD_OPTIONS)[number];

export function periodToRange(period: Period): { from: Date; to: Date } {
  const to = new Date();
  let from: Date;
  switch (period) {
    case 'Hoy':
      from = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 0, 0, 0, 0);
      break;
    case '7d':
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'YTD':
      from = new Date(to.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
  }
  return { from, to };
}

interface DashboardTopbarProps {
  activePeriod: Period | null;
  onPeriodChange: (period: Period) => void;
}

export function DashboardTopbar({ activePeriod, onPeriodChange }: DashboardTopbarProps) {
  const { data: notifData } = useQuery({
    queryKey: ['pendingNotificationsCount'],
    queryFn: () => getPendingNotificationsCount(),
  });

  const { data: recentNotifs } = useQuery({
    queryKey: ['recentNotifications'],
    queryFn: () => getNotifications({ data: { page: 1, limit: 5 } }),
  });

  const hasNotifications = (notifData?.count ?? 0) > 0;
  const notifications = recentNotifs?.notifications ?? [];

  return (
    <header className="flex items-center justify-between px-9 py-[18px] border-b border-[var(--arca-border)] bg-[var(--arca-bg)] sticky top-0 z-10">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[12.5px] text-[var(--arca-ink-3)]">
        <span>Workspace</span>
        <span className="text-[var(--arca-ink-4)]">/</span>
        <span className="text-[var(--arca-ink)] font-medium">Inicio</span>
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Period pill */}
        <div className="flex items-center bg-[var(--arca-surface)] border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] overflow-hidden text-[12.5px] font-medium">
          {PERIOD_OPTIONS.map((p, i) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={[
                'px-3 py-1.5 transition-colors duration-[120ms] cursor-pointer',
                i < PERIOD_OPTIONS.length - 1
                  ? 'border-r border-[var(--arca-border)]'
                  : '',
                activePeriod === p
                  ? 'bg-[var(--arca-ink)] text-white'
                  : 'text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)]',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Notifications popover */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Notificaciones"
              className="w-8 h-8 border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] inline-flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] relative"
            >
              <Bell className="w-3.5 h-3.5" />
              {hasNotifications && (
                <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] rounded-full bg-[var(--arca-accent-neg)] border-[1.5px] border-[var(--arca-surface)]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[340px] p-0 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--arca-border)]">
              <span className="text-[12.5px] font-semibold text-[var(--arca-ink)]">
                Notificaciones
              </span>
              {hasNotifications && (
                <span
                  className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md text-white"
                  style={{ background: 'oklch(0.60 0.15 25)' }}
                >
                  {notifData?.count} sin leer
                </span>
              )}
            </div>

            {/* List */}
            <div className="divide-y divide-[var(--arca-border)]">
              {notifications.length === 0 ? (
                <p className="text-[12.5px] text-[var(--arca-ink-3)] text-center py-8">
                  Sin notificaciones recientes
                </p>
              ) : (
                notifications.map((n) => (
                  <Link
                    key={n.id}
                    to="/notifications"
                    search={{ notificationId: n.id }}
                    className="block px-4 py-3 hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
                  >
                    <p className="text-[12.5px] text-[var(--arca-ink)] leading-snug line-clamp-2">
                      {n.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {n.clientName && (
                        <span className="text-[11px] text-[var(--arca-ink-4)] truncate">
                          {n.clientName}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--arca-ink-4)] ml-auto shrink-0">
                        {relativeTime(new Date(n.publicationDate ?? n.createdAt))}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-[var(--arca-border)] px-4 py-2.5">
              <Link
                to="/notifications"
                className="flex items-center justify-center gap-1.5 w-full text-[12.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors duration-[120ms]"
              >
                Ver todas las notificaciones
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
