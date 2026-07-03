'use client';

import { TrendingUp, TrendingDown, Users, FileText } from 'lucide-react';
import type { GetResumenLiquidacionMesResult } from '@/actions/sueldos';

const formatArs = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

interface ResumenLiquidacionMesProps {
  result: GetResumenLiquidacionMesResult;
}

export function ResumenLiquidacionMes({ result }: ResumenLiquidacionMesProps) {
  const { periodo, totales, porTipo } = result;

  if (totales.recibos === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        No hay liquidaciones registradas para el período {periodo}.
      </div>
    );
  }

  const tipoEntries = Object.entries(porTipo).sort(
    (a, b) => b[1].count - a[1].count
  );

  return (
    <div className="@container space-y-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="font-medium text-foreground">
          Liquidación · período {periodo}
        </div>
        <div className="text-muted-foreground">
          {totales.empleados} empleados · {totales.recibos} recibos
          {totales.confirmados > 0
            ? ` · ${totales.confirmados} confirmados`
            : ''}
        </div>
      </div>

      <div className="grid grid-cols-1 @[24rem]:grid-cols-3 gap-2.5">
        <KpiCell
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Haberes"
          value={formatArs(totales.haberes)}
          tone="pos"
        />
        <KpiCell
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          label="Descuentos + retenciones"
          value={formatArs(totales.descuentos + totales.retenciones)}
          tone="neg"
        />
        <KpiCell
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Neto a pagar"
          value={formatArs(totales.neto)}
          tone="primary"
        />
      </div>

      {totales.noRemunerativo > 0 && (
        <div className="rounded-md border bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">No remunerativo: </span>
          <span className="font-medium tabular-nums">
            {formatArs(totales.noRemunerativo)}
          </span>
        </div>
      )}

      {tipoEntries.length > 1 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Recibos por tipo
          </div>
          <div className="divide-y">
            {tipoEntries.map(([tipo, agg]) => (
              <div
                key={tipo}
                className="flex items-center justify-between px-3 py-1.5 text-xs"
              >
                <span className="capitalize">
                  <Users className="inline h-3 w-3 mr-1.5 text-muted-foreground" />
                  {tipo}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {agg.count} · {formatArs(agg.neto)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'pos' | 'neg' | 'primary';
}) {
  const toneClass =
    tone === 'pos'
      ? 'text-[var(--arca-accent-pos-fg)]'
      : tone === 'neg'
        ? 'text-[var(--arca-accent-neg-fg)]'
        : 'text-foreground';
  return (
    <div className="rounded-md border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div
        className={`font-display text-base font-semibold tabular-nums ${toneClass}`}
      >
        {value}
      </div>
    </div>
  );
}
