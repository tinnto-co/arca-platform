import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { getMonthlyEvolution } from '@/actions/dashboard';
import {
  ArcaCard,
  ArcaCardHead,
  ArcaCardFoot,
  TabBar,
  formatArs,
} from './shared';

interface EvolucionChartProps {
  from: Date;
  to: Date;
}

export function EvolucionChart({ from, to }: EvolucionChartProps) {
  const [tab, setTab] = useState('Mensual');
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  const { data: monthlyData = [], isLoading } = useQuery({
    queryKey: ['monthlyEvolution', fromStr, toStr],
    queryFn: () =>
      getMonthlyEvolution({ data: { from: fromStr, to: toStr } }),
  });

  const average =
    monthlyData.length > 0
      ? monthlyData.reduce((s, m) => s + m.outbound + m.inbound, 0) /
        monthlyData.length
      : 0;

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            Evolución mensual
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Ventas vs Compras · período seleccionado
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TabBar
            options={['Mensual', 'Trimestral', 'Anual']}
            active={tab}
            onChange={setTab}
          />
          <button className="w-8 h-8 border border-[var(--arca-border-strong)] rounded-[var(--arca-r-md)] bg-[var(--arca-surface)] inline-flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </ArcaCardHead>

      {/* Legend */}
      <div className="flex gap-4 px-5 py-2.5 text-[11.5px] text-[var(--arca-ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--arca-navy-700)]" />{' '}
          Ventas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-[var(--arca-chart-2)]" />{' '}
          Compras
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--arca-chart-3)]" />{' '}
          Margen
        </span>
      </div>

      {/* Chart */}
      <div className="px-3.5 pt-2 pb-3 h-[316px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--arca-ink-3)]">
            Cargando...
          </div>
        ) : monthlyData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-[var(--arca-ink-3)]">
            No hay datos de facturación
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlyData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 4"
                stroke="#ECEAE3"
              />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tick={{ fill: '#6E7079' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={10}
                tick={{ fill: '#9B9CA3' }}
                tickFormatter={(v) =>
                  v >= 1_000_000_000
                    ? `${(v / 1_000_000_000).toFixed(1)}B`
                    : v >= 1_000_000
                      ? `${(v / 1_000_000).toFixed(1)}M`
                      : v >= 1_000
                        ? `${(v / 1_000).toFixed(0)}K`
                        : String(v)
                }
                width={50}
              />
              <Tooltip
                contentStyle={{
                  background: '#12131A',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#fff',
                  padding: '8px 12px',
                }}
                itemStyle={{ color: '#fff' }}
                labelStyle={{ color: '#9B9CA3', marginBottom: 4 }}
                formatter={(value: number) => [formatArs(value), '']}
              />
              <Bar
                dataKey="outbound"
                fill="#1E3460"
                radius={[5, 5, 0, 0]}
                maxBarSize={36}
                name="Ventas"
              />
              <Bar
                dataKey="inbound"
                fill="#7AA2C8"
                radius={[5, 5, 0, 0]}
                maxBarSize={36}
                name="Compras"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <ArcaCardFoot
        leftText={`Promedio mensual: ${formatArs(average)}`}
        linkText="Ver reporte completo →"
      />
    </ArcaCard>
  );
}
