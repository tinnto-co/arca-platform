import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { ArcaCard } from '@/components/dashboard/shared';
import { relativeTime } from '@/components/dashboard/shared';
import {
  listAlerts,
  resolveAlert,
  assignAlert,
  retryAlertJobs,
  retryAllRetryable,
} from '@/actions/alert';
import { getCredenciales } from '@/actions/client';
import { listOrgMembersForAssignment } from '@/actions/notification';
import { CATEGORY_LABELS } from '@/lib/error-classifier';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authed/alerts/')({
  component: AlertsPage,
});

/* ─── Constants ─── */
const SEVERITY_CONFIG: Record<
  string,
  { label: string; bg: string; fg: string; dot: string }
> = {
  critica: {
    label: 'Crítico',
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
    dot: 'var(--arca-accent-neg)',
  },
  alta: {
    label: 'Alto',
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
    dot: 'var(--arca-accent-warn)',
  },
  media: {
    label: 'Medio',
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
    dot: 'var(--arca-accent-warn)',
  },
  baja: {
    label: 'Bajo',
    bg: 'var(--arca-surface-2)',
    fg: 'var(--arca-ink-3)',
    dot: 'var(--arca-ink-3)',
  },
};

const CATEGORY_BADGE: Record<string, { bg: string; fg: string }> = {
  credentials: {
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
  },
  captcha: {
    bg: 'var(--arca-surface-2)',
    fg: 'var(--arca-ink-3)',
  },
  infrastructure: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  selector_change: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  csv_not_found: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  profile_not_found: {
    bg: 'var(--arca-accent-neg-bg)',
    fg: 'var(--arca-accent-neg-fg)',
  },
  partial: {
    bg: 'var(--arca-accent-warn-bg)',
    fg: 'var(--arca-accent-warn-fg)',
  },
  unknown: {
    bg: 'var(--arca-surface-2)',
    fg: 'var(--arca-ink-3)',
  },
};

const TYPE_LABELS: Record<string, string> = {
  error_scraping: 'Error de scraping',
};

/* ─── Helpers ─── */
function getSourceHref(alert: AlertRow): string {
  if (alert.tipo === 'error_scraping') return '/jobs';
  return alert.clienteId ? `/clients/${alert.clienteId}` : '/clients';
}

/* ─── Types ─── */
type AlertRow = Awaited<ReturnType<typeof listAlerts>>[number];

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

/* ─── Category badge ─── */
function CategoryBadge({ category }: { category: string }) {
  const cfg = CATEGORY_BADGE[category] ?? CATEGORY_BADGE.unknown;
  const label =
    CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[11px] font-medium shrink-0"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {label}
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
  onRetry,
  retryingId,
}: {
  alert: AlertRow;
  clientName: string;
  members: Member[];
  assigningId: string | null;
  setAssigningId: (id: string | null) => void;
  onResolve: () => void;
  onAssign: (userId: string) => void;
  onRetry: () => void;
  retryingId: string | null;
}) {
  const isResolved = alert.estado === 'resuelta';
  const sourceHref = getSourceHref(alert);
  const meta = alert.detalle;
  const jobCount = meta?.failedJobIds?.length;
  const isRetryable = meta?.retryable === true;
  const isRetrying = retryingId === alert.id;

  return (
    <div
      className="px-5 py-4 flex items-start gap-4 hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]"
      style={{ opacity: isResolved ? 0.5 : 1 }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <SeverityBadge severity={alert.severidad} />
          <span className="text-[11px] text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-1.5 py-0.5 rounded-[4px]">
            {TYPE_LABELS[alert.tipo] ?? alert.tipo}
          </span>
          {meta?.errorCategory && (
            <CategoryBadge category={meta.errorCategory} />
          )}
          {jobCount != null && (
            <span className="text-[11px] text-[var(--arca-ink-3)]">
              {jobCount} job{jobCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="text-[13.5px] font-medium text-[var(--arca-ink)] leading-snug">
          {alert.titulo}
        </div>

        {alert.descripcion && (
          <div className="text-[12px] text-[var(--arca-ink-3)] mt-0.5 line-clamp-1">
            {alert.descripcion}
          </div>
        )}

        {meta?.errorMessage && (
          <div className="text-[11px] text-[var(--arca-ink-3)] mt-0.5 font-mono bg-[var(--arca-surface-2)] px-2 py-0.5 rounded-[4px] line-clamp-1">
            {meta.errorMessage}
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-[var(--arca-ink-3)] flex-wrap">
          {clientName !== '-' && (
            <span className="font-medium text-[var(--arca-ink-2)]">
              {clientName}
            </span>
          )}
          {clientName !== '-' && alert.origenTipo && <span>·</span>}
          {alert.origenTipo && <span>{alert.origenTipo}</span>}
          <span>·</span>
          <span>{relativeTime(alert.createdAt)}</span>
        </div>

        {assigningId === alert.id && (
          <div className="mt-2 flex items-center gap-2">
            <Select onValueChange={(v) => onAssign(v)}>
              <SelectTrigger size="sm" className="w-[190px] text-[12px]">
                <SelectValue placeholder="Seleccionar miembro..." />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {isRetryable && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-[6px] text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors disabled:opacity-50"
              title="Reintentar jobs fallidos"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`}
                strokeWidth={1.8}
              />
              <span className="hidden sm:inline">Reintentar</span>
            </button>
          )}
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
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('abierta');
  const [credencialIdFilter, setCredencialIdFilter] = useState('all');
  const [errorCategoryFilter, setErrorCategoryFilter] = useState('all');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const toFilter = <T extends string>(v: string) =>
    v === 'all' ? undefined : (v as T);

  const { data: alerts = [] } = useQuery({
    queryKey: [
      'alerts',
      statusFilter,
      severityFilter,
      typeFilter,
      credencialIdFilter,
      errorCategoryFilter,
    ],
    queryFn: () =>
      listAlerts({
        data: {
          estado: toFilter<'abierta' | 'resuelta'>(statusFilter),
          severidad: toFilter<'baja' | 'media' | 'alta' | 'critica'>(
            severityFilter
          ),
          tipo: toFilter<'error_scraping'>(typeFilter),
          credencialId: toFilter(credencialIdFilter),
          errorCategory: toFilter(errorCategoryFilter),
          limit: 100,
        },
      }),
  });

  // Las alertas de scraping cuelgan de la credencial (el login AFIP), no del
  // cliente: un job scrapea todas las relaciones de ese login.
  const { data: credenciales = [] } = useQuery({
    queryKey: ['credenciales'],
    queryFn: () => getCredenciales(),
    staleTime: 60_000,
  });

  const { data: membersRaw = [] } = useQuery({
    queryKey: ['orgMembersForAssignment'],
    queryFn: () => listOrgMembersForAssignment(),
    staleTime: 60_000,
  });
  const members = membersRaw as Member[];

  const credencialMap: Record<string, string> = Object.fromEntries(
    credenciales.map((c) => [c.id, c.nombre ?? c.cuit])
  );

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

  const retryMutation = useMutation({
    mutationFn: (id: string) => retryAlertJobs({ data: { id } }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(
        `${data.retried} job${data.retried !== 1 ? 's' : ''} encolado${data.retried !== 1 ? 's' : ''} para reintento`
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Error al reintentar');
    },
    onSettled: () => setRetryingId(null),
  });

  const retryAllMutation = useMutation({
    mutationFn: () => retryAllRetryable(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(
        `${data.retried} job${data.retried !== 1 ? 's' : ''} encolado${data.retried !== 1 ? 's' : ''} — ${data.resolved} alerta${data.resolved !== 1 ? 's' : ''} resuelta${data.resolved !== 1 ? 's' : ''}`
      );
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Error al reintentar');
    },
  });

  const retryableCount = alerts.filter(
    (a) => a.detalle?.retryable === true
  ).length;

  return (
    <PageShell>
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageHeader
          title="Alertas"
          subtitle={`${alerts.length} alerta${alerts.length !== 1 ? 's' : ''}`}
        />
        {retryableCount > 0 && statusFilter === 'abierta' && (
          <button
            onClick={() => retryAllMutation.mutate()}
            disabled={retryAllMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-medium bg-[var(--arca-surface)] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors disabled:opacity-50 shrink-0 mt-1"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${retryAllMutation.isPending ? 'animate-spin' : ''}`}
              strokeWidth={1.8}
            />
            Reintentar todos ({retryableCount})
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        <SearchableSelect
          options={[
            { value: 'abierta', label: 'Abiertas' },
            { value: 'resuelta', label: 'Resueltas' },
            { value: 'all', label: 'Todas' },
          ]}
          value={statusFilter}
          onValueChange={setStatusFilter}
          placeholder="Estado"
          searchPlaceholder="Buscar estado..."
          width={160}
        />

        <SearchableSelect
          options={[
            { value: 'all', label: 'Todos los tipos' },
            { value: 'error_scraping', label: 'Error de scraping' },
          ]}
          value={typeFilter}
          onValueChange={setTypeFilter}
          placeholder="Tipo"
          searchPlaceholder="Buscar tipo..."
          width={192}
        />

        <SearchableSelect
          options={[
            { value: 'all', label: 'Todas las severidades' },
            { value: 'critica', label: 'Crítico' },
            { value: 'alta', label: 'Alto' },
            { value: 'media', label: 'Medio' },
            { value: 'baja', label: 'Bajo' },
          ]}
          value={severityFilter}
          onValueChange={setSeverityFilter}
          placeholder="Severidad"
          searchPlaceholder="Buscar severidad..."
          width={176}
        />

        <SearchableSelect
          options={[
            { value: 'all', label: 'Todas las categorías' },
            { value: 'credentials', label: 'Credenciales inválidas' },
            { value: 'captcha', label: 'Error de CAPTCHA' },
            { value: 'infrastructure', label: 'Infraestructura' },
            { value: 'selector_change', label: 'AFIP cambió la interfaz' },
            { value: 'csv_not_found', label: 'CSV no encontrado' },
            { value: 'profile_not_found', label: 'Perfil no encontrado' },
            { value: 'partial', label: 'Falla parcial' },
            { value: 'unknown', label: 'Desconocido' },
          ]}
          value={errorCategoryFilter}
          onValueChange={setErrorCategoryFilter}
          placeholder="Categoría de error"
          searchPlaceholder="Buscar categoría..."
          width={208}
        />

        <SearchableSelect
          options={[
            { value: 'all', label: 'Todas las credenciales' },
            ...credenciales.map((c) => ({
              value: c.id,
              label: c.nombre ?? c.cuit,
            })),
          ]}
          value={credencialIdFilter}
          onValueChange={setCredencialIdFilter}
          placeholder="Filtrar por credencial"
          searchPlaceholder="Buscar credencial..."
          width={224}
        />
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
                  alert.credencialId
                    ? (credencialMap[alert.credencialId] ?? '-')
                    : '-'
                }
                members={members}
                assigningId={assigningId}
                setAssigningId={setAssigningId}
                onResolve={() => resolveMutation.mutate(alert.id)}
                onAssign={(userId) =>
                  assignMutation.mutate({ id: alert.id, userId })
                }
                onRetry={() => {
                  setRetryingId(alert.id);
                  retryMutation.mutate(alert.id);
                }}
                retryingId={retryingId}
              />
            ))}
          </div>
        )}
      </ArcaCard>
    </PageShell>
  );
}
