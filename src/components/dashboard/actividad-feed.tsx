import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, Check, FileText, AlertTriangle, Upload } from 'lucide-react';
import { getRecentInvoices } from '@/actions/dashboard';
import { INVOICE_TYPES } from '@/lib/invoicesTypes';
import {
  ArcaCard,
  ArcaCardHead,
  ArcaCardFoot,
  TabBar,
  formatArs,
  relativeTime,
} from './shared';
import type { ReactNode } from 'react';

type FeedKind = 'pos' | 'info' | 'warn' | 'neutral';

interface FeedItem {
  id: string;
  kind: FeedKind;
  icon: ReactNode;
  title: ReactNode;
  sub: string;
  time: string;
}

const kindStyles: Record<FeedKind, string> = {
  pos: 'bg-[var(--arca-accent-pos-bg)] border-transparent text-[var(--arca-accent-pos-fg)]',
  info: 'bg-[var(--arca-accent-info-bg)] border-transparent text-[var(--arca-accent-info-fg)]',
  warn: 'bg-[var(--arca-accent-warn-bg)] border-transparent text-[var(--arca-accent-warn-fg)]',
  neutral:
    'bg-[var(--arca-surface-2)] border-[var(--arca-border)] text-[var(--arca-ink-2)]',
};

interface ActividadFeedProps {
  from: Date;
  to: Date;
}

export function ActividadFeed({ from, to }: ActividadFeedProps) {
  const [tab, setTab] = useState('Todo');
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  const { data: recentInvoices = [], isLoading } = useQuery({
    queryKey: ['recentInvoices', fromStr, toStr],
    queryFn: () =>
      getRecentInvoices({ data: { limit: 8, from: fromStr, to: toStr } }),
  });

  const feedItems: FeedItem[] = recentInvoices.map((inv, i) => {
    const amount = formatArs(Number(inv.total || 0));
    const isOutbound = inv.direccion === 'emitido';
    let kind: FeedKind;
    let icon: ReactNode;

    if (isOutbound) {
      kind = i % 3 === 0 ? 'pos' : 'info';
      icon =
        i % 3 === 0 ? (
          <Check className="w-[13px] h-[13px]" />
        ) : (
          <FileText className="w-[13px] h-[13px]" />
        );
    } else {
      kind = i % 4 === 0 ? 'warn' : 'neutral';
      icon =
        i % 4 === 0 ? (
          <AlertTriangle className="w-[13px] h-[13px]" />
        ) : (
          <Upload className="w-[13px] h-[13px]" />
        );
    }

    return {
      id: inv.id,
      kind,
      icon,
      title: (
        <>
          <b>{inv.clienteNombre || 'Cliente'}</b>{' '}
          {isOutbound ? 'factura emitida' : 'comprobante registrado'} ·{' '}
          {INVOICE_TYPES.find((t) => t.clave === String(inv.tipo))?.valor ||
            'Factura'}
        </>
      ),
      sub: `${amount} · ${isOutbound ? 'Venta' : 'Compra'}`,
      time: inv.fechaEmision ? relativeTime(inv.fechaEmision) : '-',
    };
  });

  const filtered =
    tab === 'Facturas'
      ? feedItems.filter((_, i) => recentInvoices[i]?.direccion === 'emitido')
      : tab === 'Compras'
        ? feedItems.filter(
            (_, i) => recentInvoices[i]?.direccion === 'recibido'
          )
        : feedItems;

  return (
    <ArcaCard className="mt-3.5">
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" />
            Actividad reciente
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Movimientos en el período seleccionado
          </div>
        </div>
        <TabBar
          options={['Todo', 'Facturas', 'Compras']}
          active={tab}
          onChange={setTab}
        />
      </ArcaCardHead>

      <div className="py-1.5">
        {isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--arca-ink-3)]">
            Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--arca-ink-3)]">
            No hay actividad en este período
          </div>
        ) : (
          filtered.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[28px_1fr_auto] gap-3 px-5 py-3 items-start border-b border-[var(--arca-border)] last:border-b-0"
            >
              <div
                className={`w-7 h-7 rounded-[7px] border flex items-center justify-center flex-shrink-0 ${kindStyles[item.kind]}`}
              >
                {item.icon}
              </div>

              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--arca-ink)] leading-[1.35]">
                  {item.title}
                </div>
                <div className="text-[11.5px] text-[var(--arca-ink-3)] mt-0.5 flex items-center gap-2">
                  {item.sub}
                </div>
              </div>

              <div className="text-[11px] text-[var(--arca-ink-4)] tabular-nums whitespace-nowrap">
                {item.time}
              </div>
            </div>
          ))
        )}
      </div>

      <ArcaCardFoot
        leftText={`${filtered.length} eventos`}
        linkText="Ver registro completo →"
      />
    </ArcaCard>
  );
}
