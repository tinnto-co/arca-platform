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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArcaCard,
  ArcaCardHead,
  formatArs,
} from '@/components/dashboard/shared';
import { getClientes } from '@/actions/client';
import {
  getExecutiveSummary,
  getClientesEnRiesgo,
  getRatios,
  generateIvaProjection,
} from '@/actions/analytics';

/** Fila del ranking de riesgo, tal cual la devuelve `getClientesEnRiesgo`. */
type RiesgoRow = Awaited<ReturnType<typeof getClientesEnRiesgo>>[number];
/** Nivel de riesgo = enum `riesgo_nivel` de la BD. */
type RiesgoNivel = RiesgoRow['nivel'];

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

/** Valores del enum `riesgo_nivel` en BD. */
const RISK_CONFIG: Record<
  RiesgoNivel,
  { label: string; color: string; bg: string; fg: string }
> = {
  bajo: {
    label: 'Bajo',
    color: '#4CAF7D',
    bg: 'var(--arca-accent-pos-bg)',
    fg: 'var(--arca-accent-pos-fg)',
  },
  medio: {
    label: 'Medio',
    color: '#F59E0B',
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  alto: {
    label: 'Alto',
    color: '#EF4444',
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
  },
  critico: {
    label: 'Crítico',
    color: '#7F1D1D',
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
  },
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
      {sub && <div className="text-[11px] text-[var(--arca-ink-3)]">{sub}</div>}
    </div>
  );
}

/* ─── Risk badge ─── */
function RiskBadge({ level }: { level: RiesgoNivel }) {
  const cfg = RISK_CONFIG[level];
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
  const [riskFilter, setRiskFilter] = useState<'medio' | 'alto' | 'critico'>(
    'alto'
  );
  const [riskPeriod, setRiskPeriod] = useState<string>(currentPeriod());
  const [ivaClienteId, setIvaClienteId] = useState<string>('');

  /* Clients list for selectors */
  const { data: clients = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
  });

  /* Executive summary */
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['executiveSummary'],
    queryFn: () => getExecutiveSummary(),
  });

  /* Clients at risk */
  const { data: atRisk = [], isLoading: riskLoading } = useQuery({
    queryKey: ['clientesEnRiesgo', riskFilter, riskPeriod],
    queryFn: () =>
      getClientesEnRiesgo({
        data: {
          nivelMinimo: riskFilter,
          periodo: riskPeriod,
          limit: 20,
        },
      }),
  });

  /* Ratios for selected client */
  const { data: ratios, isLoading: ratiosLoading } = useQuery({
    queryKey: ['ratios', selectedClientId, ratiosFrom, ratiosTo],
    queryFn: () =>
      getRatios({
        data: { clienteId: selectedClientId, from: ratiosFrom, to: ratiosTo },
      }),
    enabled: !!selectedClientId,
  });

  /* IVA projection for selected client */
  const { data: ivaProjection, isLoading: ivaLoading } = useQuery({
    queryKey: ['ivaProjection', ivaClienteId],
    queryFn: () =>
      generateIvaProjection({
        data: { clienteId: ivaClienteId, periodo: currentPeriod() },
      }),
    enabled: !!ivaClienteId,
  });

  /* Recharts data for ratios */
  const ratiosChartData = ratios
    ? [
        {
          name: 'Ventas',
          actual: ratios.ventas,
          prev: ratios.ventasAnterior,
        },
        {
          name: 'Compras',
          actual: ratios.compras,
          prev: ratios.comprasAnterior,
        },
      ]
    : [];

  return (
    <PageShell className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        subtitle="Resumen ejecutivo, riesgo por cliente y ratios financieros"
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
              value={String(summary.totalClientes)}
              sub="activos"
              icon={Users}
            />
            <SummaryKpi
              label="Deudas abiertas"
              value={String(summary.deudasAbiertas)}
              sub={formatArs(summary.deudaTotal)}
              icon={DollarSign}
              accent={summary.deudasAbiertas > 0 ? 'neg' : undefined}
            />
            <SummaryKpi
              label="Notif. urgentes"
              value={String(summary.notificacionesUrgentes)}
              icon={Bell}
              accent={summary.notificacionesUrgentes > 0 ? 'neg' : undefined}
            />
            <SummaryKpi
              label="Vencimientos (7d)"
              value={String(summary.vencimientosProximos)}
              icon={Calendar}
              accent={summary.vencimientosProximos > 0 ? 'warn' : undefined}
            />
            <SummaryKpi
              label="Clientes en riesgo"
              value={String(
                summary.clientesRiesgoCritico + summary.clientesRiesgoAlto
              )}
              sub={`${summary.clientesRiesgoCritico} crítico / ${summary.clientesRiesgoAlto} alto`}
              icon={AlertTriangle}
              accent={
                summary.clientesRiesgoCritico > 0
                  ? 'neg'
                  : summary.clientesRiesgoAlto > 0
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
              value={formatArs(summary.ventasDelMes)}
              icon={TrendingUp}
              accent="pos"
            />
            <SummaryKpi
              label="Compras"
              value={formatArs(summary.comprasDelMes)}
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
            <Select
              value={riskFilter}
              onValueChange={(v) =>
                setRiskFilter(v as 'medio' | 'alto' | 'critico')
              }
            >
              <SelectTrigger className="w-[170px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medio">Medio y superior</SelectItem>
                <SelectItem value="alto">Alto y crítico</SelectItem>
                <SelectItem value="critico">Solo crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ArcaCard>
          <ArcaCardHead>
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Clientes por nivel de riesgo
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
              No hay clientes con ese nivel de riesgo en el período actual.
            </div>
          ) : (
            <div className="divide-y divide-[var(--arca-border)]">
              {atRisk.map((row: RiesgoRow) => (
                <div
                  key={row.snapshotId}
                  className="flex items-center justify-between px-5 py-3 hover:bg-[var(--arca-surface-2)] transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-[var(--arca-ink)]">
                      {row.razonSocial}
                    </span>
                    <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                      {row.cuit ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                      {row.score.toFixed(1)}
                    </span>
                    <RiskBadge level={row.nivel} />
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
          <Select
            value={selectedClientId}
            onValueChange={(v) => setSelectedClientId(v)}
          >
            <SelectTrigger className="w-[220px] text-[13px]">
              <SelectValue placeholder="Seleccionar cliente…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.razonSocial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                      value: formatArs(ratios.ventas),
                      pct: ratios.variacionVentasPct,
                    },
                    {
                      label: 'Compras totales',
                      value: formatArs(ratios.compras),
                      pct: ratios.variacionComprasPct,
                    },
                    {
                      label: 'Posición neta',
                      value: formatArs(ratios.posicionNeta),
                      pct: null,
                    },
                    {
                      label: 'Ratio ventas/compras',
                      value:
                        ratios.ratioVentasCompras !== null
                          ? ratios.ratioVentasCompras.toFixed(2)
                          : '—',
                      pct: null,
                    },
                    {
                      label: 'Comprobantes',
                      value: String(ratios.comprobantes),
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
                      <Bar
                        dataKey="actual"
                        name="Período actual"
                        radius={[4, 4, 0, 0]}
                      >
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
          <Select
            value={ivaClienteId}
            onValueChange={(v) => setIvaClienteId(v)}
          >
            <SelectTrigger className="w-[260px] text-[13px]">
              <SelectValue placeholder="Seleccionar cliente…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.razonSocial}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {ivaClienteId && (
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
                      ivaProjection.confianza === 'alta'
                        ? 'var(--arca-accent-pos-bg)'
                        : ivaProjection.confianza === 'media'
                          ? 'var(--arca-accent-warn-bg)'
                          : 'var(--arca-surface-2)',
                    color:
                      ivaProjection.confianza === 'alta'
                        ? 'var(--arca-accent-pos-fg)'
                        : ivaProjection.confianza === 'media'
                          ? 'var(--arca-accent-warn-fg)'
                          : 'var(--arca-ink-3)',
                  }}
                >
                  Confianza:{' '}
                  {ivaProjection.confianza === 'alta'
                    ? 'Alta'
                    : ivaProjection.confianza === 'media'
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
                      {formatArs(ivaProjection.montoProyectado)}
                    </span>
                    <span className="text-[13px] text-[var(--arca-ink-3)] mb-1.5">
                      estimado a pagar
                    </span>
                  </div>
                  {ivaProjection.factores.metodo === 'promedio_historico' ? (
                    <div className="text-[12px] text-[var(--arca-ink-3)]">
                      Basado en {ivaProjection.factores.muestras} declaraciones
                      históricas
                    </div>
                  ) : (
                    <div className="text-[12px] text-[var(--arca-ink-3)]">
                      {ivaProjection.factores.mensaje ??
                        'Sin declaraciones históricas para proyectar.'}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </ArcaCard>
        )}
      </section>
    </PageShell>
  );
}
