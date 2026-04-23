import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Bell, Plus } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { getPendingNotificationsCount } from '@/actions/dashboard';

const PERIOD_OPTIONS = ['Hoy', '7d', '30d', '90d', 'YTD'] as const;
type Period = (typeof PERIOD_OPTIONS)[number];

interface DashboardTopbarProps {
  onPeriodChange?: (period: Period) => void;
}

export function DashboardTopbar({ onPeriodChange }: DashboardTopbarProps) {
  const [activePeriod, setActivePeriod] = useState<Period>('30d');

  const { data: notifData } = useQuery({
    queryKey: ['pendingNotificationsCount'],
    queryFn: () => getPendingNotificationsCount(),
  });

  const hasNotifications = (notifData?.count ?? 0) > 0;

  function handlePeriod(p: Period) {
    setActivePeriod(p);
    onPeriodChange?.(p);
  }

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
              onClick={() => handlePeriod(p)}
              className={[
                'px-3 py-1.5 transition-colors duration-[120ms]',
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

        {/* Export */}
        <button
          title="Exportar"
          className="w-8 h-8 border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] inline-flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* Notifications */}
        <Link
          to="/notifications"
          title="Notificaciones"
          className="w-8 h-8 border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] inline-flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] relative"
        >
          <Bell className="w-3.5 h-3.5" />
          {hasNotifications && (
            <span className="absolute top-[5px] right-[5px] w-[7px] h-[7px] rounded-full bg-[var(--arca-accent-neg)] border-[1.5px] border-[var(--arca-surface)]" />
          )}
        </Link>

        {/* Nueva factura */}
        <Link
          to="/invoices"
          className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-[var(--arca-r-md)] text-[13px] font-medium bg-[var(--arca-ink)] text-white border border-[var(--arca-ink)] hover:bg-black transition-colors duration-[120ms]"
        >
          <Plus className="w-3 h-3" strokeWidth={2.2} />
          Nueva factura
        </Link>
      </div>
    </header>
  );
}
