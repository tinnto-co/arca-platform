'use client';

import { AlertCircle, AlertTriangle, Check, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GetResumenSaludClienteResult } from '@/actions/copilot';
import {
  ChatAviso,
  ChatCard,
  ChatCardHead,
  ChatCardLabel,
  ChatKpi,
  ChatKpiGrid,
  ChatRow,
  ChatRows,
  formatArs,
  type Tono,
} from './chat-card';

const TIPO_LABEL: Record<string, string> = {
  iva: 'IVA',
  comprobantes: 'Facturas',
  notificaciones: 'Notificaciones',
  deuda: 'Deudas',
  vencimientos: 'Vencimientos',
};

/**
 * El estado de una empresa en una tarjeta: el score arriba, cuatro números,
 * cuándo se actualizó cada dato y qué hay que mirar.
 *
 * El score es el ancla tipográfica de la card —número grande, display, tabular—
 * y la barra debajo lo repite en color: verde ≥75, ámbar ≥50, coral abajo. Son
 * los mismos tres estados que usa el resto del producto para "al día /
 * pendiente / vencido", así que se leen sin leyenda.
 */
export function ResumenSaludCliente({
  result,
}: {
  result: GetResumenSaludClienteResult;
}) {
  if ('error' in result) {
    return <ChatAviso>{result.error}</ChatAviso>;
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

  const tono: Tono =
    healthScore >= 75 ? 'pos' : healthScore >= 50 ? 'warn' : 'neg';
  const colorTexto =
    tono === 'pos'
      ? 'text-[var(--arca-accent-pos-fg)]'
      : tono === 'warn'
        ? 'text-[var(--arca-accent-warn-fg)]'
        : 'text-[var(--arca-accent-neg-fg)]';
  const colorBarra =
    tono === 'pos'
      ? 'bg-[var(--arca-accent-pos)]'
      : tono === 'warn'
        ? 'bg-[var(--arca-accent-warn)]'
        : 'bg-[var(--arca-accent-neg)]';

  return (
    <div className="space-y-2.5">
      <ChatCard>
        <div className="px-3 py-2.5">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-[14px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
                {cliente.razonSocial}
              </div>
              <div className="mt-0.5 text-[11.5px] tabular-nums text-[var(--arca-ink-4)] [font-family:var(--ff-mono)]">
                {cliente.cuit}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div
                className={`font-display text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums ${colorTexto}`}
              >
                {healthScore}
              </div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.07em] text-[var(--arca-ink-4)]">
                salud / 100
              </div>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--arca-surface-2)]">
            <div
              className={`h-full rounded-full ${colorBarra}`}
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </div>
      </ChatCard>

      <ChatKpiGrid>
        <ChatKpi
          label="Ventas del mes"
          value={formatArs(facturacionMesActual.ventas)}
          sub={
            facturacionMesActual.cantidad === 1
              ? '1 comprobante'
              : `${facturacionMesActual.cantidad} comprobantes`
          }
        />
        <ChatKpi
          label="Compras del mes"
          value={formatArs(facturacionMesActual.compras)}
        />
        <ChatKpi
          label="Deudas vencidas"
          value={String(deudas.vencidas)}
          sub={
            deudas.vencidas > 0 ? formatArs(deudas.vencidasMonto) : 'sin deuda'
          }
          tone={deudas.vencidas > 0 ? 'neg' : undefined}
        />
        <ChatKpi
          label="Notificaciones sin leer"
          value={String(notificaciones.noLeidas)}
          tone={notificaciones.noLeidas >= 5 ? 'warn' : undefined}
        />
      </ChatKpiGrid>

      <ChatCard>
        <ChatCardLabel>Última actualización</ChatCardLabel>
        <ChatRows>
          {ultimoScrapePorTipo.map((s) => {
            const tono: Tono | undefined =
              s.status === 'failed'
                ? 'neg'
                : s.status === 'finished' && (s.diasDesde ?? 99) <= 7
                  ? 'pos'
                  : 'neutro';
            const dias =
              s.diasDesde === null
                ? null
                : s.diasDesde === 0
                  ? 'hoy'
                  : s.diasDesde === 1
                    ? 'ayer'
                    : `hace ${s.diasDesde} d`;
            const valor =
              s.status === null
                ? 'sin datos'
                : s.status === 'failed'
                  ? `falló${dias ? ` · ${dias}` : ''}`
                  : (dias ?? s.status);
            return (
              <ChatRow
                key={s.tipo}
                label={TIPO_LABEL[s.tipo] ?? s.tipo}
                value={valor}
                tone={tono}
              />
            );
          })}
        </ChatRows>
      </ChatCard>

      {observaciones.length > 0 ? (
        <ChatCard>
          <ChatCardLabel>Atención requerida</ChatCardLabel>
          <ChatRows>
            {observaciones.map((obs, i) => (
              <Observacion key={i} {...obs} />
            ))}
          </ChatRows>
        </ChatCard>
      ) : (
        <ChatCard>
          <ChatCardHead
            title="Sin observaciones"
            sub="No hay nada pendiente de revisar."
            trailing={
              <Badge variant="success" size="sm">
                <Check className="size-3" />
                Al día
              </Badge>
            }
          />
        </ChatCard>
      )}
    </div>
  );
}

function Observacion({
  severidad,
  mensaje,
}: {
  severidad: 'info' | 'warn' | 'error';
  mensaje: string;
}) {
  const Icono =
    severidad === 'error'
      ? AlertCircle
      : severidad === 'warn'
        ? AlertTriangle
        : Info;
  const color =
    severidad === 'error'
      ? 'text-[var(--arca-accent-neg)]'
      : severidad === 'warn'
        ? 'text-[var(--arca-accent-warn)]'
        : 'text-[var(--arca-ink-4)]';
  return (
    <div className="flex items-start gap-2 px-3 py-[7px] text-[12.5px]">
      <Icono className={`mt-[2px] size-3.5 shrink-0 ${color}`} />
      <span className="min-w-0 text-[var(--arca-ink-2)]">{mensaje}</span>
    </div>
  );
}
