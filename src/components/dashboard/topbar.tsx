import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ArrowRight, CheckCheck, Mail, MailOpen } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getPendingNotificationsCount } from '@/actions/dashboard';
import {
  getNotifications,
  markNotificationOpened,
  markNotificationUnread,
  markAllNotificationsRead,
} from '@/actions/notification';
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
      from = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        0,
        0,
        0,
        0
      );
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

export function DashboardTopbar({
  activePeriod,
  onPeriodChange,
}: DashboardTopbarProps) {
  const queryClient = useQueryClient();

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

  const invalidateNotifs = () => {
    queryClient.invalidateQueries({ queryKey: ['pendingNotificationsCount'] });
    queryClient.invalidateQueries({ queryKey: ['recentNotifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationOpened({ data: { id } }),
    onSuccess: invalidateNotifs,
  });

  const markUnreadMutation = useMutation({
    mutationFn: (id: string) => markNotificationUnread({ data: { id } }),
    onSuccess: invalidateNotifs,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidateNotifs,
  });

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
              <div className="flex items-center gap-2">
                {hasNotifications && (
                  <>
                    <span
                      className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md text-white"
                      style={{ background: 'oklch(0.60 0.15 25)' }}
                    >
                      {notifData?.count} sin leer
                    </span>
                    <button
                      onClick={() => markAllReadMutation.mutate()}
                      disabled={markAllReadMutation.isPending}
                      className="text-[11px] font-medium text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors cursor-pointer flex items-center gap-1"
                      title="Marcar todas como leídas"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* List */}
            <div className="divide-y divide-[var(--arca-border)]">
              {notifications.length === 0 ? (
                <p className="text-[12.5px] text-[var(--arca-ink-3)] text-center py-8">
                  Sin notificaciones recientes
                </p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-1 px-4 py-3 hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
                  >
                    <Link
                      to="/notifications"
                      search={{ notificationId: n.id }}
                      className="flex-1 min-w-0"
                    >
                      <p
                        className={`text-[12.5px] leading-snug line-clamp-2 ${n.leida === false ? 'font-semibold text-[var(--arca-ink)]' : 'text-[var(--arca-ink-2)]'}`}
                      >
                        {n.mensaje}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {n.clienteRazonSocial && (
                          <span className="text-[11px] text-[var(--arca-ink-4)] truncate">
                            {n.clienteRazonSocial}
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--arca-ink-4)] ml-auto shrink-0">
                          {relativeTime(
                            new Date(n.publicadaAt ?? n.createdAt)
                          )}
                        </span>
                      </div>
                    </Link>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (n.leida) {
                          markUnreadMutation.mutate(n.id);
                        } else {
                          markReadMutation.mutate(n.id);
                        }
                      }}
                      className="shrink-0 p-1 rounded hover:bg-[var(--arca-surface)] transition-colors mt-0.5 cursor-pointer"
                      title={
                        n.leida ? 'Marcar como no leída' : 'Marcar como leída'
                      }
                    >
                      {n.leida ? (
                        <Mail className="w-3 h-3 text-[var(--arca-ink-4)]" />
                      ) : (
                        <MailOpen className="w-3 h-3 text-[var(--arca-ink-4)]" />
                      )}
                    </button>
                  </div>
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
