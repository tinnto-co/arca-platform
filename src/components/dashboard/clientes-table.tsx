import { useQuery } from '@tanstack/react-query';
import { Users, SlidersHorizontal } from 'lucide-react';
import { getDashboardStats, getTopRepresentatives } from '@/actions/dashboard';
import {
  ArcaCard,
  ArcaCardHead,
  ArcaCardFoot,
  StatusTag,
  formatArs,
  relativeTime,
} from './shared';

const AVATAR_COLORS = ['#1E3460', '#8FB39F', '#C2A878', '#2A4680', '#7AA2C8'];

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

interface ClientesTableProps {
  from: Date;
  to: Date;
}

export function ClientesTable({ from, to }: ClientesTableProps) {
  const fromStr = from.toISOString();
  const toStr = to.toISOString();

  const { data: stats } = useQuery({
    queryKey: ['dashboardStats', fromStr, toStr],
    queryFn: () => getDashboardStats({ data: { from: fromStr, to: toStr } }),
  });

  const { data: representatives = [], isLoading } = useQuery({
    queryKey: ['topRepresentatives', fromStr, toStr],
    queryFn: () =>
      getTopRepresentatives({ data: { limit: 5, from: fromStr, to: toStr } }),
  });

  return (
    <ArcaCard>
      <ArcaCardHead>
        <div>
          <div className="font-display text-[15px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            Clientes con movimiento
          </div>
          <div className="text-xs text-[var(--arca-ink-3)] mt-0.5">
            Facturación del período · top por volumen
          </div>
        </div>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--arca-r-md)] text-xs font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
          <SlidersHorizontal className="w-3 h-3" />
          Filtrar
        </button>
      </ArcaCardHead>

      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {['Cliente', 'Estado', 'Últ. actividad', 'Facturado'].map(
              (th, i) => (
                <th
                  key={th}
                  className="text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-3)] px-5 py-2.5 bg-[var(--arca-surface-2)] border-y border-[var(--arca-border)]"
                  style={i === 3 ? { textAlign: 'right' } : undefined}
                >
                  {th}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td
                colSpan={4}
                className="px-5 py-8 text-center text-[var(--arca-ink-3)]"
              >
                Cargando...
              </td>
            </tr>
          ) : representatives.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-5 py-8 text-center text-[var(--arca-ink-3)]"
              >
                No hay clientes con movimiento en este período
              </td>
            </tr>
          ) : (
            representatives.map((c, i) => (
              <tr
                key={c.clientId}
                className="border-b border-[var(--arca-border)] last:border-b-0 hover:bg-[var(--arca-surface-2)] cursor-pointer transition-colors duration-[120ms]"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[10.5px] font-bold text-white tracking-[0.02em] flex-shrink-0"
                      style={{
                        background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      }}
                    >
                      {getInitials(c.name)}
                    </div>
                    <div>
                      <div className="font-semibold text-[13px] text-[var(--arca-ink)] leading-tight">
                        {c.name}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--arca-ink-4)]">
                        CUIT {c.cuit || '-'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <StatusTag kind={c.status}>{c.statusLabel}</StatusTag>
                </td>
                <td className="px-5 py-3 text-[var(--arca-ink-2)]">
                  {c.lastActivity ? relativeTime(c.lastActivity) : '-'}
                </td>
                <td className="px-5 py-3 text-right tabular-nums font-medium text-[var(--arca-ink)]">
                  {formatArs(c.totalAmount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <ArcaCardFoot
        leftText={`Mostrando ${representatives.length} de ${stats?.totalClients || 0} clientes`}
        linkText="Ver todos →"
        linkHref="/clients"
      />
    </ArcaCard>
  );
}
