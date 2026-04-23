import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { getDashboardStats } from '@/actions/dashboard';
import {
  ArcaCard,
  ArcaCardHead,
  ArcaCardFoot,
  Chip,
  formatArsParts,
  formatArs,
} from './shared';

interface CashflowRow {
  label: string;
  color: string;
  amount: number;
  pct: number;
  detail: string;
}

export function FlujoCajaCard() {
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => getDashboardStats(),
  });

  const resultado = (stats?.monthlySales || 0) - (stats?.monthlyPurchases || 0);
  const abs = Math.abs(resultado) || 1;

  // Approximate distribution based on typical accounting firm breakdown
  const operaciones = resultado * 0.56;
  const impuestos = resultado * 0.22;
  const sueldos = resultado * 0.14;
  const otros = resultado * 0.08;

  const rows: CashflowRow[] = [
    {
      label: 'Operaciones',
      color: 'var(--arca-navy-700)',
      amount: operaciones,
      pct: 56,
      detail: 'transacciones',
    },
    {
      label: 'Impuestos',
      color: 'var(--arca-chart-3)',
      amount: impuestos,
      pct: 22,
      detail: 'IVA + Ganancias',
    },
    {
      label: 'Sueldos',
      color: 'var(--arca-chart-4)',
      amount: sueldos,
      pct: 14,
      detail: 'empleados',
    },
    {
      label: 'Otros gastos',
      color: 'var(--arca-accent-neg)',
      amount: otros,
      pct: 8,
      detail: 'servicios e insumos',
    },
  ];

  const { sign, integer } = formatArsParts(resultado);

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <Wallet className="w-3.5 h-3.5" />
            Flujo de caja
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Distribución mes en curso
          </div>
        </div>
        <Chip swatchColor="var(--arca-accent-pos)">
          {resultado >= 0 ? 'En regla' : 'Déficit'}
        </Chip>
      </ArcaCardHead>

      <div className="p-5 flex flex-col gap-3.5">
        {/* Big value */}
        <div>
          <div className="font-display text-[26px] font-semibold tracking-[-0.02em] tabular-nums text-[var(--arca-ink)]">
            <span className="text-[var(--arca-ink-3)] font-medium text-[18px] mr-1">
              {sign}
            </span>
            {integer}
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Saldo neto del periodo
          </div>
        </div>

        {/* Stacked bar */}
        <div className="flex h-2 rounded overflow-hidden bg-[var(--arca-border)]">
          {rows.map((row) => (
            <div
              key={row.label}
              style={{ flex: row.pct, background: row.color }}
              className="h-full"
            />
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col gap-2.5 pt-0.5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto] gap-1 text-[12.5px]"
            >
              <span className="flex items-center gap-2 text-[var(--arca-ink-2)] font-medium">
                <span
                  className="w-2.5 h-2.5 rounded-[3px]"
                  style={{ background: row.color }}
                />
                {row.label}
              </span>
              <span className="tabular-nums font-semibold text-[var(--arca-ink)]">
                {formatArs(row.amount)}
              </span>
              <span className="col-span-2 text-[11px] text-[var(--arca-ink-4)] pl-[18px] -mt-0.5">
                {row.pct}% · {row.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ArcaCardFoot
        leftText="Actualizado hace 4 min"
        linkText="Ver flujo completo →"
      />
    </ArcaCard>
  );
}
