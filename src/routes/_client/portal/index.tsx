import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientePortalDashboard } from '@/actions/client-portal';
import {
  Calendar,
  FileText,
  Bell,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { format, isPast } from 'date-fns';
import { es } from 'date-fns/locale';

export const Route = createFileRoute('/_client/portal/')({
  component: PortalDashboard,
});

function PortalDashboard() {
  const { clienteId } = Route.useRouteContext();

  const { data, isLoading } = useQuery({
    queryKey: ['portalDashboard', clienteId],
    queryFn: () => getClientePortalDashboard({ data: { clienteId } }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <span className="text-[var(--arca-ink-3)] text-sm">Cargando...</span>
      </div>
    );
  }

  if (!data) return null;

  const {
    cliente,
    proximosVencimientos: nextDueDates,
    deudasAbiertas: openDebts,
    notificacionesSinLeer: unreadNotificationsCount,
    solicitudesAbiertas: pendingRequests,
    permisos: permissions,
  } = data;

  const totalDebt = openDebts
    ? openDebts.reduce((sum, d) => sum + parseFloat(d.saldo ?? '0'), 0)
    : 0;

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Greeting */}
      <div className="mb-7">
        <h1 className="text-[22px] font-semibold text-[var(--arca-ink)] leading-tight">
          Bienvenido, {cliente.razonSocial}
        </h1>
        <p className="text-sm text-[var(--arca-ink-3)] mt-1">
          Resumen de su estado fiscal
        </p>
      </div>

      {/* Summary cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          icon={<Calendar size={16} />}
          label="Vencimientos"
          value={
            nextDueDates.length > 0
              ? `${nextDueDates.length} próximos`
              : 'Sin vencimientos'
          }
          colorVar="var(--arca-accent-primary)"
          bgVar="var(--arca-accent-primary-bg)"
        />
        {permissions.puedeVerDeudas && (
          <SummaryCard
            icon={<FileText size={16} />}
            label="Deuda abierta"
            value={
              openDebts && openDebts.length > 0
                ? `$${totalDebt.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                : 'Sin deudas'
            }
            colorVar={
              openDebts && openDebts.length > 0
                ? 'var(--arca-accent-neg)'
                : 'var(--arca-accent-pos)'
            }
            bgVar={
              openDebts && openDebts.length > 0
                ? 'var(--arca-accent-neg-bg)'
                : 'var(--arca-accent-pos-bg)'
            }
          />
        )}
        <SummaryCard
          icon={<Bell size={16} />}
          label="Notificaciones"
          value={
            unreadNotificationsCount > 0
              ? `${unreadNotificationsCount} sin leer`
              : 'Sin novedades'
          }
          colorVar={
            unreadNotificationsCount > 0
              ? 'var(--arca-accent-warn)'
              : 'var(--arca-accent-pos)'
          }
          bgVar={
            unreadNotificationsCount > 0
              ? 'var(--arca-accent-warn-bg)'
              : 'var(--arca-accent-pos-bg)'
          }
        />
        <SummaryCard
          icon={<ClipboardList size={16} />}
          label="Solicitudes"
          value={
            pendingRequests.length > 0
              ? `${pendingRequests.length} pendientes`
              : 'Sin solicitudes'
          }
          colorVar={
            pendingRequests.length > 0
              ? 'var(--arca-accent-warn)'
              : 'var(--arca-accent-pos)'
          }
          bgVar={
            pendingRequests.length > 0
              ? 'var(--arca-accent-warn-bg)'
              : 'var(--arca-accent-pos-bg)'
          }
        />
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Next due dates */}
        <PortalCard
          title="Próximos vencimientos"
          icon={<Calendar size={15} className="text-[var(--arca-ink-3)]" />}
          href="/portal/vencimientos"
          linkLabel="Ver todos"
        >
          {nextDueDates.length === 0 ? (
            <EmptyState message="No hay vencimientos próximos" />
          ) : (
            <ul className="divide-y divide-[var(--arca-border)]">
              {nextDueDates.map((d) => {
                const date = new Date(d.venceAt);
                const overdue = isPast(date);
                return (
                  <li key={d.id} className="py-2.5 flex items-center gap-3">
                    <span
                      className="shrink-0 text-xs font-semibold w-10 text-center rounded-md py-1"
                      style={{
                        background: overdue
                          ? 'var(--arca-accent-neg-bg)'
                          : 'var(--arca-accent-primary-bg)',
                        color: overdue
                          ? 'var(--arca-accent-neg)'
                          : 'var(--arca-accent-primary)',
                      }}
                    >
                      {format(date, 'd MMM', { locale: es })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--arca-ink)] truncate">
                        {d.impuesto}
                      </p>
                      <p className="text-xs text-[var(--arca-ink-3)] truncate">
                        {d.concepto}
                      </p>
                    </div>
                    {overdue && (
                      <AlertCircle
                        size={14}
                        className="shrink-0 text-[var(--arca-accent-neg)]"
                      />
                    )}
                    {d.completadoAt && (
                      <CheckCircle2
                        size={14}
                        className="shrink-0 text-[var(--arca-accent-pos)]"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PortalCard>

        {/* Open debts */}
        {permissions.puedeVerDeudas && (
          <PortalCard
            title="Deudas abiertas"
            icon={<FileText size={15} className="text-[var(--arca-ink-3)]" />}
            href="/portal/deudas"
            linkLabel="Ver detalle"
          >
            {!openDebts || openDebts.length === 0 ? (
              <EmptyState message="Sin deudas abiertas" positive />
            ) : (
              <ul className="divide-y divide-[var(--arca-border)]">
                {openDebts.slice(0, 4).map((d) => (
                  <li key={d.id} className="py-2.5 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--arca-ink)] truncate">
                        {d.impuesto}
                      </p>
                      <p className="text-xs text-[var(--arca-ink-3)] truncate">
                        {d.concepto}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--arca-accent-neg)] tabular-nums shrink-0">
                      $
                      {parseFloat(d.saldo ?? '0').toLocaleString('es-AR', {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </li>
                ))}
                {openDebts.length > 4 && (
                  <li className="py-2 text-xs text-[var(--arca-ink-3)] text-center">
                    +{openDebts.length - 4} más
                  </li>
                )}
              </ul>
            )}
          </PortalCard>
        )}

        {/* Pending requests */}
        {pendingRequests.length > 0 && (
          <PortalCard
            title="Solicitudes pendientes"
            icon={
              <ClipboardList size={15} className="text-[var(--arca-ink-3)]" />
            }
            href="/portal/solicitudes"
            linkLabel="Ver todas"
          >
            <ul className="divide-y divide-[var(--arca-border)]">
              {pendingRequests.slice(0, 4).map((r) => (
                <li key={r.id} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--arca-ink)] truncate">
                      {r.titulo}
                    </p>
                    <p className="text-xs text-[var(--arca-ink-3)]">
                      {r.venceAt
                        ? `Vence: ${format(new Date(r.venceAt), 'dd/MM/yyyy')}`
                        : `Recibida: ${format(new Date(r.createdAt), 'dd/MM/yyyy')}`}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--arca-accent-warn-bg)',
                      color: 'var(--arca-accent-warn)',
                    }}
                  >
                    Pendiente
                  </span>
                </li>
              ))}
            </ul>
          </PortalCard>
        )}

        {/* Notifications summary */}
        {unreadNotificationsCount > 0 && (
          <PortalCard
            title="Notificaciones sin leer"
            icon={<Bell size={15} className="text-[var(--arca-ink-3)]" />}
            href="/portal/notificaciones"
            linkLabel="Ver notificaciones"
          >
            <div className="py-4 flex flex-col items-center gap-2">
              <span
                className="text-4xl font-bold tabular-nums"
                style={{ color: 'var(--arca-accent-warn)' }}
              >
                {unreadNotificationsCount}
              </span>
              <p className="text-sm text-[var(--arca-ink-3)]">
                notificaciones sin leer
              </p>
            </div>
          </PortalCard>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  colorVar,
  bgVar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colorVar: string;
  bgVar: string;
}) {
  return (
    <div
      className="rounded-[12px] border px-4 py-3"
      style={{ background: bgVar, borderColor: colorVar + '40' }}
    >
      <div
        className="flex items-center gap-1.5 mb-1"
        style={{ color: colorVar }}
      >
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--arca-ink)]">{value}</p>
    </div>
  );
}

function PortalCard({
  title,
  icon,
  href,
  linkLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)]">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
            {title}
          </span>
        </div>
        <a
          href={href}
          className="text-xs text-[var(--arca-accent-primary)] hover:underline font-medium"
        >
          {linkLabel}
        </a>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function EmptyState({
  message,
  positive,
}: {
  message: string;
  positive?: boolean;
}) {
  return (
    <div className="py-4 flex items-center justify-center gap-2">
      {positive ? (
        <CheckCircle2 size={15} className="text-[var(--arca-accent-pos)]" />
      ) : (
        <Calendar size={15} className="text-[var(--arca-ink-3)]" />
      )}
      <span className="text-sm text-[var(--arca-ink-3)]">{message}</span>
    </div>
  );
}
