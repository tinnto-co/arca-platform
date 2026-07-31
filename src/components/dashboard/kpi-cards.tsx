import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/actions/dashboard';
import { formatArsParts, Chip } from './shared';

interface KpiData {
  label: string;
  value: number;
  chipColor: string;
  chipText: string;
  footLabel: string;
  footValue?: string;
}

function KpiCard({ data }: { data: KpiData }) {
  const { sign, integer } = formatArsParts(data.value);

  return (
    <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] p-[18px_20px] flex flex-col gap-3.5 relative overflow-hidden hover:-translate-y-px hover:shadow-[var(--arca-shadow-md)] transition-all duration-[120ms]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-[var(--arca-ink-3)]">
          {data.label}
        </div>
        <Chip swatchColor={data.chipColor}>{data.chipText}</Chip>
      </div>
      <div className="font-display text-[28px] font-semibold tracking-[-0.025em] text-[var(--arca-ink)] tabular-nums leading-none">
        <span className="text-[var(--arca-ink-3)] font-medium text-[18px] mr-1">
          {sign}
        </span>
        {integer}
      </div>
      <div className="flex items-center gap-1.5 text-[11.5px] tabular-nums text-[var(--arca-ink-3)]">
        <span className="text-[var(--arca-ink-4)]">{data.footLabel}</span>
        {data.footValue && <span>{data.footValue}</span>}
      </div>
    </div>
  );
}

interface KpiCardsRowProps {
  from: Date;
  to: Date;
}

export function KpiCardsRow({ from, to }: KpiCardsRowProps) {
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboardStats', fromStr, toStr],
    queryFn: () => getDashboardStats({ data: { from: fromStr, to: toStr } }),
  });

  if (isLoading || !stats) {
    return (
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] p-[18px_20px] h-[130px] animate-pulse"
          />
        ))}
      </section>
    );
  }

  const salesChange =
    stats.ventasPeriodoAnterior > 0
      ? ((stats.ventasDelPeriodo - stats.ventasPeriodoAnterior) /
          stats.ventasPeriodoAnterior) *
        100
      : 0;

  const purchasesChange =
    stats.comprasPeriodoAnterior > 0
      ? ((stats.comprasDelPeriodo - stats.comprasPeriodoAnterior) /
          stats.comprasPeriodoAnterior) *
        100
      : 0;

  const resultadoBruto = stats.ventasDelPeriodo - stats.comprasDelPeriodo;
  const margen =
    stats.ventasDelPeriodo > 0
      ? (resultadoBruto / stats.ventasDelPeriodo) * 100
      : 0;
  const ivaAPagar = resultadoBruto * 0.21;

  const { sign: prevSalesSign, integer: prevSalesInt } = formatArsParts(
    stats.ventasPeriodoAnterior
  );
  const { sign: prevPurchSign, integer: prevPurchInt } = formatArsParts(
    stats.comprasPeriodoAnterior
  );

  const posColor = 'var(--arca-accent-pos)';
  const negColor = 'var(--arca-accent-neg)';
  const warnColor = 'var(--arca-accent-warn)';
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  const kpis: KpiData[] = [
    {
      label: 'Ventas del período',
      value: stats.ventasDelPeriodo,
      chipColor: salesChange >= 0 ? posColor : negColor,
      chipText:
        stats.ventasPeriodoAnterior > 0
          ? `${fmtPct(salesChange)}`
          : 'sin comparación',
      footLabel: 'período anterior',
      footValue:
        stats.ventasPeriodoAnterior > 0
          ? `${prevSalesSign} ${prevSalesInt}`
          : undefined,
    },
    {
      label: 'Compras del período',
      value: stats.comprasDelPeriodo,
      chipColor: purchasesChange <= 0 ? posColor : negColor,
      chipText:
        stats.comprasPeriodoAnterior > 0
          ? `${fmtPct(purchasesChange)}`
          : 'sin comparación',
      footLabel: 'período anterior',
      footValue:
        stats.comprasPeriodoAnterior > 0
          ? `${prevPurchSign} ${prevPurchInt}`
          : undefined,
    },
    {
      label: 'Resultado bruto',
      value: resultadoBruto,
      chipColor: margen >= 20 ? posColor : margen >= 5 ? warnColor : negColor,
      chipText: `${margen.toFixed(1)}%`,
      footLabel: 'margen s/ ventas',
    },
    {
      label: 'IVA a pagar',
      value: ivaAPagar,
      chipColor: warnColor,
      chipText: 'estimado',
      footLabel: 'débito − crédito fiscal',
    },
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} data={kpi} />
      ))}
    </section>
  );
}
