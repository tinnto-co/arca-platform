import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Users,
  DollarSign,
  Bell,
  Calendar,
  BarChart2,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import {
  ArcaCard,
  ArcaCardHead,
  formatArs,
} from '@/components/dashboard/shared';
import { getClients, getClientsWithProfiles } from '@/actions/client';
import {
  getExecutiveSummary,
  getClientsAtRisk,
  getRatios,
  generateIvaProjection,
} from '@/actions/analytics';

export const Route = createFileRoute('/_authed/analytics/')({
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'analytics')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: AnalyticsPage,
});

/* ─── Helpers ─── */
const SELECT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; fg: string }> = {
  low: { label: 'Bajo', color: '#4CAF7D', bg: 'var(--arca-accent-pos-bg)', fg: 'var(--arca-accent-pos-fg)' },
  medium: { label: 'Medio', color: '#F59E0B', bg: 'var(--arca-accent-warn-bg)', fg: 'var(--arca-accent-warn-fg)' },
  high: { label: 'Alto', color: '#EF4444', bg: 'var(--arca-accent-neg-bg)', fg: 'var(--arca-accent-neg-fg)' },
  critical: { label: 'Crítico', color: '#7F1D1D', bg: 'var(--arca-accent-neg-bg)', fg: 'var(--arca-accent-neg-fg)' },
};

/* ─── Summary card ─── */
function SummaryKpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: 'pos' | 'neg' | 'warn';
}) {
  const bgMap = {
    pos: 'var(--arca-accent-pos-bg)',
    neg: 'var(--arca-accent-neg-bg)',
    warn: 'var(--arca-accent-warn-bg)',
  };
  const fgMap = {
    pos: 'var(--arca-accent-pos-fg)',
    neg: 'var(--arca-accent-neg-fg)',
    warn: 'var(--arca-accent-warn-fg)',
  };
  return (
    <div
      className="flex flex-col gap-1 px-5 py-4 rounded-[14px] border border-[var(--arca-border)]"
      style={{ background: 'var(--arca-surface)' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-medium text-[var(--arca-ink-3)] uppercase tracking-wide">
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-[8px] flex items-center justify-center"
          style={{
            background: accent ? bgMap[accent] : 'var(--arca-surface-2)',
          }}
        >
          <Icon
            className="w-3.5 h-3.5"
            style={{ color: accent ? fgMap[accent] : 'var(--arca-ink-3)' }}
          />
        </div>
      </div>
      <div className="font-display text-[22px] font-bold tracking-[-0.02em] text-[var(--arca-ink)] tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-[var(--arca-ink-3)]">{sub}</div>
      )}
    </div>
  );
}

/* ─── Risk badge ─── */
function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_CONFIG[level] ?? RISK_CONFIG.low;
  return (
    <span
      className="inline-flex items-center gap-[5px] px-2 py-[2px] rounded-[20px] text-[11px] font-medium"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: cfg.color }}
      />
      {cfg.label}
    </span>
  );
}

/* ─── Main page ─── */
function AnalyticsPage() {
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [ratiosFrom, setRatiosFrom] = useState(monthStart());
  const [ratiosTo, setRatiosTo] = useState(today());
  const [riskFilter, setRiskFilter] = useState<'medium' | 'high' | 'critical'>('high');
  const [riskPeriod, setRiskPeriod] = useState<string>(currentPeriod());
  const [ivaProfileId, setIvaProfileId] = useState<string>('');

  /* Clients list for selectors */
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
  });

  /* Clients with profiles (for IVA projection selector) */
  const { data: clientsWithProfiles = [] } = useQuery({
    queryKey: ['clientsWithProfiles'],
    queryFn: () => getClientsWithProfiles(),
  });

  /* Executive summary */
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['executiveSummary'],
    queryFn: () => getExecutiveSummary(),
  });

  /* Clients at risk */
  const { data: atRisk = [], isLoading: riskLoading } = useQuery({
    queryKey: ['clientsAtRisk', riskFilter, riskPeriod],
    queryFn: () =>
      getClientsAtRisk({
        data: {
          riskLevel: riskFilter,
          period: riskPeriod,
          limit: 20,
        },
      }),
  });

  /* Ratios for selected client */
  const { data: ratios, isLoading: ratiosLoading } = useQuery({
    queryKey: ['ratios', selectedClientId, ratiosFrom, ratiosTo],
    queryFn: () =>
      getRatios({
        data: { clientId: selectedClientId, from: ratiosFrom, to: ratiosTo },
      }),
    enabled: !!selectedClientId,
  });

  /* IVA projection for selected profile */
  const { data: ivaProjection, isLoading: ivaLoading } = useQuery({
    queryKey: ['ivaProjection', ivaProfileId],
    queryFn: () =>
      generateIvaProjection({
        data: { profileId: ivaProfileId, period: currentPeriod() },
      }),
    enabled: !!ivaProfileId,
  });

  /* Recharts data for ratios */
  const ratiosChartData = ratios
    ? [
        { name: 'Ventas', actual: ratios.totalSales, prev: ratios.prevTotalSales },
        {
          name: 'Compras',
          actual: ratios.totalPurchases,
          prev: ratios.prevTotalPurchases,
        },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 p-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="Analytics"
        subtitle="Resumen ejecutivo, riesgo por cliente y ratios financieros"
        icon={BarChart2}
      />

      {/* ─── Executive summary ─── */}
      <section>
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--arca-ink-3)] mb-3">
          Resumen ejecutivo
        </h2>
        {summaryLoading ? (
          <div className="text-[13px] text-[var(--arca-ink-3)]">Cargando…</div>
        ) : summary ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryKpi
              label="Clientes"
              value={String(summary.totalClients)}
              sub={`${summary.totalManagedProfiles} perfiles administrados`}
              icon={Users}
            />
            <SummaryKpi
              label="Deudas abiertas"
              value={String(summary.openDebtCount)}
              sub={formatArs(summary.openDebtTotal)}
              icon={DollarSign}
              accent={summary.openDebtCount > 0 ? 'neg' : undefined}
            />
            <SummaryKpi
              label="Notif. críticas"
              value={String(summary.criticalNotificationCount)}
              icon={Bell}
              accent={summary.criticalNotificationCount > 0 ? 'neg' : undefined}
            />
            <SummaryKpi
              label="Vencimientos (7d)"
              value={String(summary.upcomingDueDateCount)}
              icon={Calendar}
              accent={summary.upcomingDueDateCount > 0 ? 'warn' : undefined}
            />
            <SummaryKpi
              label="Perfiles en riesgo"
              value={String(
                summary.criticalRiskProfileCount + summary.highRiskProfileCount
              )}
              sub={`${summary.criticalRiskProfileCount} crítico / ${summary.highRiskProfileCount} alto`}
              icon={AlertTriangle}
              accent={
                summary.criticalRiskProfileCount > 0
                  ? 'neg'
                  : summary.highRiskProfileCount > 0
                    ? 'warn'
                    : undefined
              }
            />
          </div>
        ) : null}
      </section>

      {/* ─── Sales & purchases this month ─── */}
      {summary && (
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--arca-ink-3)] mb-3">
            Facturación del mes
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <SummaryKpi
              label="Ventas"
              value={formatArs(summary.currentMonthSales)}
              icon={TrendingUp}
              accent="pos"
            />
            <SummaryKpi
              label="Compras"
              value={formatArs(summary.currentMonthPurchases)}
              icon={TrendingDown}
            />
          </div>
        </section>
      )}

      {/* ─── Risk ranking ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--arca-ink-3)]">
            Ranking de riesgo
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="month"
              className={SELECT_CLASS}
              value={riskPeriod}
              onChange={(e) => setRiskPeriod(e.target.value)}
              title="Período del snapshot de riesgo"
            />
            <select
              className={SELECT_CLASS}
              value={riskFilter}
              onChange={(e) =>
                setRiskFilter(e.target.value as 'medium' | 'high' | 'critical')
              }
            >
              <option value="medium">Medio y superior</option>
              <option value="high">Alto y crítico</option>
              <option value="critical">Solo crítico</option>
            </select>
          </div>
        </div>
        <ArcaCard>
          <ArcaCardHead>
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Perfiles por nivel de riesgo
            </span>
            <span className="text-[12px] text-[var(--arca-ink-3)]">
              Período: {riskPeriod}
            </span>
          </ArcaCardHead>
          {riskLoading ? (
            <div className="px-5 py-4 text-[13px] text-[var(--arca-ink-3)]">
              Cargando…
            </div>
          ) : atRisk.length === 0 ? (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--arca-ink-3)]">
              No hay perfiles con ese nivel de riesgo en el período actual.
            </div>
          ) : (
            <div className="divide-y divide-[var(--arca-border)]">
              {atRisk.map((row: {
                snapshotId: string;
                profileId: string;
                profileName: string;
                clientName: string;
                clientCuit?: string | null;
                riskLevel: string;
                score: number;
              }) => (
                <div
                  key={row.snapshotId}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[var(--arca-surface-2)] transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[var(--arca-ink)]">
                      {row.profileName}
                    </span>
                    <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                      {row.clientName}
                      {row.clientCuit ? ` · ${row.clientCuit}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                      {row.score.toFixed(1)}
                    </span>
                    <RiskBadge level={row.riskLevel} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </ArcaCard>
      </section>

      {/* ─── Business ratios ─── */}
      <section>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--arca-ink-3)]">
            Ratios por cliente
          </h2>
          <select
            className={SELECT_CLASS}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
          >
            <option value="">Seleccionar cliente…</option>
            {clients.map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={SELECT_CLASS}
            value={ratiosFrom}
            onChange={(e) => setRatiosFrom(e.target.value)}
          />
          <input
            type="date"
            className={SELECT_CLASS}
            value={ratiosTo}
            onChange={(e) => setRatiosTo(e.target.value)}
          />
        </div>

        {selectedClientId && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Ratios summary */}
            <ArcaCard>
              <ArcaCardHead>
                <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                  Indicadores financieros
                </span>
              </ArcaCardHead>
              {ratiosLoading ? (
                <div className="px-5 py-4 text-[13px] text-[var(--arca-ink-3)]">
                  Cargando…
                </div>
              ) : ratios ? (
                <div className="divide-y divide-[var(--arca-border)]">
                  {[
                    {
                      label: 'Ventas totales',
                      value: formatArs(ratios.totalSales),
                      pct: ratios.salesGrowthPct,
                    },
                    {
                      label: 'Compras totales',
                      value: formatArs(ratios.totalPurchases),
                      pct: ratios.purchasesGrowthPct,
                    },
                    {
                      label: 'Posición neta',
                      value: formatArs(ratios.netPosition),
                      pct: null,
                    },
                    {
                      label: 'Ratio ventas/compras',
                      value:
                        ratios.salesPurchasesRatio !== null
                          ? ratios.salesPurchasesRatio.toFixed(2)
                          : '—',
                      pct: null,
                    },
                    {
                      label: 'Facturas',
                      value: String(ratios.invoiceCount),
                      pct: null,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between px-5 py-2.5"
                    >
                      <span className="text-[13px] text-[var(--arca-ink-3)]">
                        {row.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                          {row.value}
                        </span>
                        {row.pct !== null && (
                          <span
                            className="text-[11px] font-medium tabular-nums"
                            style={{
                              color:
                                row.pct >= 0
                                  ? 'var(--arca-accent-pos-fg)'
                                  : 'var(--arca-accent-neg-fg)',
                            }}
                          >
                            {fmtPct(row.pct)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </ArcaCard>

            {/* Bar chart */}
            <ArcaCard>
              <ArcaCardHead>
                <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                  Ventas vs Compras
                </span>
                <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                  Período actual vs anterior
                </span>
              </ArcaCardHead>
              <div className="px-3 py-4">
                {ratiosLoading ? (
                  <div className="text-[13px] text-[var(--arca-ink-3)]">
                    Cargando…
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={ratiosChartData}
                      margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--arca-border)"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'var(--arca-ink-3)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--arca-ink-3)' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) =>
                          v >= 1_000_000
                            ? `$${(v / 1_000_000).toFixed(1)}M`
                            : v >= 1000
                              ? `$${(v / 1000).toFixed(0)}K`
                              : `$${v}`
                        }
                      />
                      <Tooltip
                        formatter={(v: number) => formatArs(v)}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: '1px solid var(--arca-border)',
                          background: 'var(--arca-surface)',
                        }}
                      />
                      <Bar dataKey="actual" name="Período actual" radius={[4, 4, 0, 0]}>
                        {ratiosChartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              i === 0
                                ? 'var(--arca-accent-pos)'
                                : 'var(--arca-accent-neg)'
                            }
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="prev"
                        name="Período anterior"
                        radius={[4, 4, 0, 0]}
                        fill="var(--arca-border)"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </ArcaCard>
          </div>
        )}
      </section>

      {/* ─── IVA Projection ─── */}
      <section>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--arca-ink-3)]">
            Proyección IVA
          </h2>
          <select
            className={SELECT_CLASS}
            value={ivaProfileId}
            onChange={(e) => setIvaProfileId(e.target.value)}
          >
            <option value="">Seleccionar perfil…</option>
            {clientsWithProfiles.flatMap((c: { id: string; name: string; profiles?: { id: string; name: string }[] }) =>
              (c.profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {c.name} — {p.name}
                </option>
              ))
            )}
          </select>
        </div>
        {ivaProfileId && (
          <ArcaCard>
            <ArcaCardHead>
              <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                Proyección IVA — {currentPeriod()}
              </span>
              {ivaProjection && (
                <span
                  className="text-[11.5px] px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      ivaProjection.confidence === 'high'
                        ? 'var(--arca-accent-pos-bg)'
                        : ivaProjection.confidence === 'medium'
                          ? 'var(--arca-accent-warn-bg)'
                          : 'var(--arca-surface-2)',
                    color:
                      ivaProjection.confidence === 'high'
                        ? 'var(--arca-accent-pos-fg)'
                        : ivaProjection.confidence === 'medium'
                          ? 'var(--arca-accent-warn-fg)'
                          : 'var(--arca-ink-3)',
                  }}
                >
                  Confianza:{' '}
                  {ivaProjection.confidence === 'high'
                    ? 'Alta'
                    : ivaProjection.confidence === 'medium'
                      ? 'Media'
                      : 'Baja'}
                </span>
              )}
            </ArcaCardHead>
            <div className="px-5 py-5">
              {ivaLoading ? (
                <div className="text-[13px] text-[var(--arca-ink-3)]">
                  Calculando proyección…
                </div>
              ) : ivaProjection ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-end gap-3">
                    <span className="font-display text-[32px] font-bold tracking-[-0.02em] text-[var(--arca-ink)] tabular-nums">
                      {formatArs(ivaProjection.projectedAmount)}
                    </span>
                    <span className="text-[13px] text-[var(--arca-ink-3)] mb-1.5">
                      estimado a pagar
                    </span>
                  </div>
                  {ivaProjection.factors &&
                    typeof ivaProjection.factors === 'object' &&
                    'samplesUsed' in (ivaProjection.factors as object) && (
                      <div className="text-[12px] text-[var(--arca-ink-3)]">
                        Basado en{' '}
                        {(ivaProjection.factors as { samplesUsed: number }).samplesUsed}{' '}
                        declaraciones históricas
                      </div>
                    )}
                </div>
              ) : null}
            </div>
          </ArcaCard>
        )}
      </section>
    </div>
  );
}
