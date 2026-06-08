'use client';

import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  Info,
  TrendingUp,
} from 'lucide-react';
import type { GetResumenSaludClienteResult } from '@/actions/copilot';

const formatArs = (n: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n);

interface ResumenSaludClienteProps {
  result: GetResumenSaludClienteResult;
}

const TIPO_LABEL: Record<string, string> = {
  iva: 'IVA',
  comprobantes: 'Facturas',
  notificaciones: 'Notif. AFIP',
  deuda: 'Deudas',
  vencimientos: 'Vencimientos',
};

export function ResumenSaludCliente({ result }: ResumenSaludClienteProps) {
  if ('error' in result) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        {result.error}
      </div>
    );
  }

  const {
    cliente,
    healthScore,
    facturacionMesActual,
    deudas,
    notificaciones,
    ultimoScrapePorTipo,
    observaciones,
  } = result;

  const scoreTone =
    healthScore >= 75 ? 'pos' : healthScore >= 50 ? 'warn' : 'neg';
  const scoreColor =
    scoreTone === 'pos'
      ? 'text-[var(--arca-accent-pos-fg)]'
      : scoreTone === 'warn'
        ? 'text-[var(--arca-accent-warn-fg)]'
        : 'text-[var(--arca-accent-neg-fg)]';
  const scoreBarColor =
    scoreTone === 'pos'
      ? 'bg-[var(--arca-accent-pos)]'
      : scoreTone === 'warn'
        ? 'bg-[var(--arca-accent-warn)]'
        : 'bg-[var(--arca-accent-neg)]';

  return (
    <div className="@container space-y-3">
      {/* Header con health score */}
      <div className="rounded-lg border bg-card px-3 py-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{cliente.name}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              CUIT {cliente.identityNumber}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div
              className={`font-display text-2xl font-bold tabular-nums leading-none ${scoreColor}`}
            >
              {healthScore}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              salud / 100
            </div>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${scoreBarColor}`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 @[24rem]:grid-cols-4 gap-2">
        <KpiCell
          icon={<TrendingUp className="h-3 w-3" />}
          label="Ventas mes"
          value={formatArs(facturacionMesActual.ventas)}
          sub={`${facturacionMesActual.cantidad} facts`}
        />
        <KpiCell
          icon={<TrendingUp className="h-3 w-3 rotate-180" />}
          label="Compras mes"
          value={formatArs(facturacionMesActual.compras)}
        />
        <KpiCell
          icon={<AlertCircle className="h-3 w-3" />}
          label="Deudas venc."
          value={String(deudas.vencidas)}
          sub={deudas.vencidasMonto > 0 ? formatArs(deudas.vencidasMonto) : ''}
          tone={deudas.vencidas > 0 ? 'neg' : undefined}
        />
        <KpiCell
          icon={<Bell className="h-3 w-3" />}
          label="Notif. sin leer"
          value={String(notificaciones.noLeidas)}
          tone={notificaciones.noLeidas > 5 ? 'warn' : undefined}
        />
      </div>

      {/* Estado de scrapes por tipo */}
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="px-3 py-2 border-b text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Último scrape por tipo
        </div>
        <div className="divide-y">
          {ultimoScrapePorTipo.map((s) => {
            const tone =
              s.status === 'failed'
                ? 'text-[var(--arca-accent-neg-fg)]'
                : s.status === 'finished' && (s.diasDesde ?? 99) <= 7
                  ? 'text-[var(--arca-accent-pos-fg)]'
                  : 'text-muted-foreground';
            const label =
              s.status === null
                ? 'sin datos'
                : s.status === 'failed'
                  ? `falló${s.diasDesde !== null ? ` · hace ${s.diasDesde}d` : ''}`
                  : s.diasDesde !== null
                    ? `hace ${s.diasDesde}d`
                    : s.status;
            return (
              <div
                key={s.tipo}
                className="flex items-center justify-between px-3 py-1.5 text-xs"
              >
                <span className="text-foreground">
                  {TIPO_LABEL[s.tipo] ?? s.tipo}
                </span>
                <span className={`tabular-nums ${tone}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Observaciones */}
      {observaciones.length > 0 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Atención requerida
          </div>
          <div className="divide-y">
            {observaciones.map((obs, i) => (
              <ObsRow key={i} {...obs} />
            ))}
          </div>
        </div>
      )}

      {observaciones.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-[var(--arca-accent-pos)]/30 bg-[var(--arca-accent-pos-bg)] px-3 py-2 text-xs text-[var(--arca-accent-pos-fg)]">
          <Check className="h-3.5 w-3.5" />
          Cliente saludable, sin observaciones.
        </div>
      )}
    </div>
  );
}

function KpiCell({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: 'pos' | 'neg' | 'warn';
}) {
  const toneClass =
    tone === 'pos'
      ? 'text-[var(--arca-accent-pos-fg)]'
      : tone === 'neg'
        ? 'text-[var(--arca-accent-neg-fg)]'
        : tone === 'warn'
          ? 'text-[var(--arca-accent-warn-fg)]'
          : 'text-foreground';
  return (
    <div className="rounded-md border bg-card px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-sm font-semibold tabular-nums truncate ${toneClass}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground tabular-nums truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

function ObsRow({
  severidad,
  mensaje,
}: {
  severidad: 'info' | 'warn' | 'error';
  mensaje: string;
}) {
  const Icon =
    severidad === 'error'
      ? AlertCircle
      : severidad === 'warn'
        ? AlertTriangle
        : Info;
  const color =
    severidad === 'error'
      ? 'text-[var(--arca-accent-neg-fg)]'
      : severidad === 'warn'
        ? 'text-[var(--arca-accent-warn-fg)]'
        : 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2 px-3 py-1.5 text-xs">
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
      <span className="text-foreground">{mensaje}</span>
    </div>
  );
}
