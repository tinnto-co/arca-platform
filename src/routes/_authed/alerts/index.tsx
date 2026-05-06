import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ArcaCard } from '@/components/dashboard/shared';
import { relativeTime } from '@/components/dashboard/shared';
import { listAlerts, resolveAlert, assignAlert } from '@/actions/alert';
import { getClients } from '@/actions/client';
import { listOrgMembersForAssignment } from '@/actions/notification';

export const Route = createFileRoute('/_authed/alerts/')({
  component: AlertsPage,
});

/* ─── Constants ─── */
const SEVERITY_CONFIG: Record<
  string,
  { label: string; bg: string; fg: string; dot: string }
> = {
  critical: {
    label: 'Crítico',
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
    dot: 'var(--arca-accent-neg)',
  },
  high: {
    label: 'Alto',
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
    dot: 'var(--arca-accent-warn)',
  },
  medium: {
    label: 'Medio',
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
    dot: 'var(--arca-accent-warn)',
  },
  low: {
    label: 'Bajo',
    bg: 'var(--arca-surface-2)',
    fg: 'var(--arca-ink-3)',
    dot: 'var(--arca-ink-3)',
  },
};

const TYPE_LABELS: Record<string, string> = {
  overdue_debt: 'Deuda vencida',
  critical_notification: 'Notificación crítica',
  upcoming_due_date: 'Vencimiento próximo',
  scraper_error: 'Error de scraping',
  balance_due_soon: 'Balance próximo',
  missing_activity: 'Sin actividad',
};

const SELECT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

/* ─── Helpers ─── */
function getSourceHref(alert: AlertRow): string {
  switch (alert.type) {
    case 'overdue_debt':
      return alert.clientId ? `/clients/${alert.clientId}` : '/clients';
    case 'critical_notification':
      return '/notifications';
    case 'upcoming_due_date':
      return '/vencimientos';
    case 'scraper_error':
      return '/jobs';
    default:
      return alert.clientId ? `/clients/${alert.clientId}` : '/clients';
  }
}

/* ─── Types ─── */
interface AlertRow {
  id: string;
  type: string;
  severity: string;
  title: string;
  description?: string | null;
  clientId?: string | null;
  sourceEntityType?: string | null;
  status: string;
  assignedToUserId?: string | null;
  createdAt: string | Date;
}

interface Member {
  userId: string;
  name: string;
  email: string;
}

/* ─── Severity badge ─── */
function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.low;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}

/* ─── Alert row ─── */
function AlertRowItem({
  alert,
  clientName,
  members,
  assigningId,
  setAssigningId,
  onResolve,
  onAssign,
}: {
  alert: AlertRow;
  clientName: string;
  members: Member[];
  assigningId: string | null;
  setAssigningId: (id: string | null) => void;
  onResolve: () => void;
  onAssign: (userId: string) => void;
}) {
  const isResolved = alert.status === 'resolved';
  const sourceHref = getSourceHref(alert);

  return (
    <div
      className="px-5 py-4 flex items-start gap-4 hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]"
      style={{ opacity: isResolved ? 0.5 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <SeverityBadge severity={alert.severity} />
          <span className="text-[11px] text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-1.5 py-0.5 rounded-[4px]">
            {TYPE_LABELS[alert.type] ?? alert.type}
          </span>
        </div>

        <div className="text-[13.5px] font-medium text-[var(--arca-ink)] leading-snug">
          {alert.title}
        </div>

        {alert.description && (
          <div className="text-[12px] text-[var(--arca-ink-3)] mt-0.5 line-clamp-1">
            {alert.description}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-[var(--arca-ink-3)] flex-wrap">
          {clientName !== '-' && (
            <span className="font-medium text-[var(--arca-ink-2)]">
              {clientName}
            </span>
          )}
          {clientName !== '-' && alert.sourceEntityType && <span>·</span>}
          {alert.sourceEntityType && <span>{alert.sourceEntityType}</span>}
          <span>·</span>
          <span>{relativeTime(alert.createdAt)}</span>
        </div>

        {assigningId === alert.id && (
          <div className="mt-2 flex items-center gap-2">
            <select
              autoFocus
              className="text-[12px] border border-[var(--arca-border)] rounded-[6px] px-2 py-1 bg-[var(--arca-surface)] text-[var(--arca-ink)]"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) onAssign(e.target.value);
              }}
            >
              <option value="">Seleccionar miembro...</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAssigningId(null)}
              className="text-[12px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {!isResolved && (
        <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
          <button
            onClick={() =>
              setAssigningId(assigningId === alert.id ? null : alert.id)
            }
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
            title="Asignar"
          >
            <UserCheck className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">Asignar</span>
          </button>
          <button
            onClick={onResolve}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
            title="Resolver"
          >
            <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">Resolver</span>
          </button>
          <a
            href={sourceHref}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
            title="Ver fuente"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="hidden sm:inline">Ver</span>
          </a>
        </div>
      )}
    </div>
  );
}

/* ─── Page ─── */
function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [clientIdFilter, setClientIdFilter] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: alertsRaw = [] } = useQuery({
    queryKey: [
      'alerts',
      statusFilter,
      severityFilter,
      typeFilter,
      clientIdFilter,
    ],
    queryFn: () =>
      listAlerts({
        data: {
          status: statusFilter || undefined,
          severity: severityFilter || undefined,
          type: typeFilter || undefined,
          clientId: clientIdFilter || undefined,
          limit: 100,
        },
      }),
  });
  const alerts = alertsRaw as AlertRow[];

  const { data: clientsRaw = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getClients(),
    staleTime: 60_000,
  });
  const clients = clientsRaw as { id: string; name: string }[];

  const { data: membersRaw = [] } = useQuery({
    queryKey: ['orgMembersForAssignment'],
    queryFn: () => listOrgMembersForAssignment(),
    staleTime: 60_000,
  });
  const members = membersRaw as Member[];

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  const resolveMutation = useMutation({
    mutationFn: (id: string) => resolveAlert({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      assignAlert({ data: { id, userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      setAssigningId(null);
    },
  });

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        icon={AlertTriangle}
        title="Alertas"
        subtitle={`${alerts.length} alerta${alerts.length !== 1 ? 's' : ''}`}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="open">Abiertas</option>
          <option value="acknowledged">Reconocidas</option>
          <option value="resolved">Resueltas</option>
          <option value="">Todas</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Severidad</option>
          <option value="critical">Crítico</option>
          <option value="high">Alto</option>
          <option value="medium">Medio</option>
          <option value="low">Bajo</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Tipo</option>
          <option value="overdue_debt">Deuda vencida</option>
          <option value="critical_notification">Notificación crítica</option>
          <option value="upcoming_due_date">Vencimiento próximo</option>
          <option value="scraper_error">Error de scraping</option>
          <option value="balance_due_soon">Balance próximo</option>
          <option value="missing_activity">Sin actividad</option>
        </select>

        <select
          value={clientIdFilter}
          onChange={(e) => setClientIdFilter(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Alert list */}
      <ArcaCard>
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <AlertTriangle
              className="w-8 h-8 mb-2 opacity-40"
              strokeWidth={1.5}
            />
            <p className="text-[13px]">No hay alertas</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--arca-border)]">
            {alerts.map((alert) => (
              <AlertRowItem
                key={alert.id}
                alert={alert}
                clientName={
                  alert.clientId ? (clientMap[alert.clientId] ?? '-') : '-'
                }
                members={members}
                assigningId={assigningId}
                setAssigningId={setAssigningId}
                onResolve={() => resolveMutation.mutate(alert.id)}
                onAssign={(userId) =>
                  assignMutation.mutate({ id: alert.id, userId })
                }
              />
            ))}
          </div>
        )}
      </ArcaCard>
    </div>
  );
}
