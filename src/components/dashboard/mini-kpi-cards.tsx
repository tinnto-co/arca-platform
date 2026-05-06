import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Bell, AlertCircle } from 'lucide-react';
import {
  getDashboardStats,
  getOverdueDebts,
  getPendingNotificationsCount,
} from '@/actions/dashboard';
import { ProgressBar, formatArs } from './shared';
import type { ReactNode } from 'react';

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;

interface MiniKpiData {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  value: string;
  valueSub: string;
  progressKind: 'pos' | 'neg' | 'warn' | 'info';
  progressPct: number;
  footLeft: string;
  footRight: string;
  footAlert?: boolean;
}

function MiniKpiCard({ data }: { data: MiniKpiData }) {
  return (
    <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] p-[14px_16px] flex flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs font-medium text-[var(--arca-ink-3)]">
        <span className="flex items-center gap-1.5">{data.label}</span>
      </div>
      <div className="font-display text-[22px] font-semibold tracking-[-0.02em] text-[var(--arca-ink)] tabular-nums leading-none flex items-baseline justify-between">
        {data.value}
        <span className="font-sans text-[11.5px] font-medium text-[var(--arca-ink-3)]">
          {data.valueSub}
        </span>
      </div>
      <ProgressBar kind={data.progressKind} pct={data.progressPct} />
      <div className="flex items-center justify-between text-[11px] text-[var(--arca-ink-4)]">
        <span>{data.footLeft}</span>
        <span
          className={
            data.footAlert
              ? 'font-semibold text-[var(--arca-accent-neg-fg)] tabular-nums'
              : ''
          }
        >
          {data.footRight}
        </span>
      </div>
    </div>
  );
}

interface MiniKpiCardsRowProps {
  from: Date;
  to: Date;
  stats?: DashboardStats;
}

export function MiniKpiCardsRow({
  from,
  to,
  stats: statsProp,
}: MiniKpiCardsRowProps) {
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  const skipStatsQuery = statsProp !== undefined;
  const { data: queryStats } = useQuery({
    queryKey: ['dashboardStats', fromStr, toStr],
    queryFn: () => getDashboardStats({ data: { from: fromStr, to: toStr } }),
    enabled: !skipStatsQuery,
  });
  const stats = statsProp ?? queryStats;

  const { data: overdueDebts = [] } = useQuery({
    queryKey: ['overdueDebts'],
    queryFn: () => getOverdueDebts({ data: { limit: 50 } }),
  });

  const { data: pendingNotifications } = useQuery({
    queryKey: ['pendingNotificationsCount'],
    queryFn: () => getPendingNotificationsCount(),
  });

  const totalClients = stats?.totalClients ?? 0;
  const monthlyInvoices = stats?.monthlyInvoices ?? 0;
  const totalInvoices = stats?.totalInvoices ?? 0;
  const notifCount = pendingNotifications?.count ?? 0;
  const overdueCount = overdueDebts.length;
  const totalOverdue = overdueDebts.reduce(
    (s, d) => s + Number(d.balance ?? 0),
    0
  );

  const miniKpis: MiniKpiData[] = [
    {
      label: 'Clientes activos',
      icon: <Users className="w-3 h-3" />,
      value: String(totalClients),
      valueSub: 'total',
      progressKind: 'info',
      progressPct: totalClients > 0 ? 92 : 0,
      footLeft: `${totalClients} registrados`,
      footRight: '100% activos',
    },
    {
      label: 'Facturas del período',
      icon: <FileText className="w-3 h-3" />,
      trailing:
        totalInvoices > monthlyInvoices ? (
          <span className="text-[var(--arca-accent-pos-fg)] font-semibold">
            +
            {(
              (monthlyInvoices / Math.max(totalInvoices - monthlyInvoices, 1)) *
              100
            ).toFixed(0)}
            %
          </span>
        ) : null,
      value: String(monthlyInvoices),
      valueSub: 'emitidas',
      progressKind: 'pos',
      progressPct:
        totalInvoices > 0 ? (monthlyInvoices / totalInvoices) * 100 : 0,
      footLeft: `${totalInvoices} total`,
      footRight:
        totalInvoices > 0
          ? `${((monthlyInvoices / totalInvoices) * 100).toFixed(0)}%`
          : '0%',
    },
    {
      label: 'Notificaciones pendientes',
      icon: <Bell className="w-3 h-3" />,
      trailing:
        notifCount > 0 ? (
          <span className="text-[var(--arca-accent-warn-fg)] font-semibold">
            {notifCount} pendientes
          </span>
        ) : null,
      value: String(notifCount),
      valueSub: 'sin leer',
      progressKind: 'warn',
      progressPct: notifCount > 0 ? Math.min(notifCount * 2, 100) : 0,
      footLeft: 'Total acumulado',
      footRight: `${notifCount}`,
    },
    {
      label: 'Deudas vencidas',
      icon: <AlertCircle className="w-3 h-3" />,
      value: String(overdueCount),
      valueSub: 'clientes',
      progressKind: 'neg',
      progressPct: overdueCount > 0 ? Math.min(overdueCount * 5, 100) : 0,
      footLeft: `Total: ${formatArs(totalOverdue)}`,
      footRight: overdueCount > 0 ? `${overdueCount} pendientes` : 'Sin deuda',
      footAlert: overdueCount > 0,
    },
  ];

  return (
    <section className="grid grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
      {miniKpis.map((kpi) => (
        <MiniKpiCard key={kpi.label} data={kpi} />
      ))}
    </section>
  );
}
