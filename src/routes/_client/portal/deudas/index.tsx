import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { getClientePortalDeudas } from '@/actions/client-portal';
import { FileText, Lock } from 'lucide-react';
import { periodoLegible } from '@/lib/periodo';

export const Route = createFileRoute('/_client/portal/deudas/')({
  component: PortalDeudas,
});

const ESTADO_LABELS: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  abierta: {
    label: 'Abierta',
    bg: 'var(--arca-accent-neg-bg)',
    color: 'var(--arca-accent-neg)',
  },
  plan_pago: {
    label: 'En plan de pago',
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
  },
  pagada: {
    label: 'Pagada',
    bg: 'var(--arca-accent-pos-bg)',
    color: 'var(--arca-accent-pos)',
  },
  prescripta: {
    label: 'Prescripta',
    bg: 'var(--arca-surface-2)',
    color: 'var(--arca-ink-3)',
  },
};

/** Las columnas `date` llegan como 'YYYY-MM-DD': partirlas evita el corrimiento
 * de un día que produce `new Date(...)` al interpretarlas en UTC. */
function fechaLegible(fecha: string | null): string {
  if (!fecha) return '—';
  const [anio, mes, dia] = fecha.slice(0, 10).split('-');
  return dia ? `${dia}/${mes}/${anio}` : fecha;
}

function pesos(monto: string | null): string {
  return `$${parseFloat(monto ?? '0').toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PortalDeudas() {
  const { clienteId, access } = Route.useRouteContext();

  const { data: deudas = [], isLoading } = useQuery({
    queryKey: ['portalDeudas', clienteId],
    queryFn: () => getClientePortalDeudas({ data: { clienteId } }),
    enabled: !!clienteId && access.puedeVerDeudas,
    staleTime: 60_000,
  });

  if (!access.puedeVerDeudas) {
    return (
      <div>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--arca-ink-3)]">
          <Lock size={32} className="opacity-30" />
          <p className="text-sm">
            Su estudio contable no habilitó la consulta de deudas.
          </p>
        </div>
      </div>
    );
  }

  const totalSaldo = deudas.reduce(
    (sum, d) => sum + parseFloat(d.saldo ?? '0'),
    0
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold text-[var(--arca-ink)] leading-tight">
          Deudas
        </h1>
        <p className="text-sm text-[var(--arca-ink-3)] mt-1">
          Deuda registrada en AFIP a su nombre
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24 text-sm text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : deudas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--arca-ink-3)]">
          <FileText size={32} className="opacity-30" />
          <p className="text-sm">No hay deudas registradas</p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-[var(--arca-ink-4)]">
              Saldo total
            </p>
            <p className="text-[20px] font-semibold text-[var(--arca-ink)] tabular-nums mt-0.5">
              {pesos(String(totalSaldo))}
            </p>
            <p className="text-[11px] text-[var(--arca-ink-4)] mt-0.5">
              {deudas.length} {deudas.length === 1 ? 'concepto' : 'conceptos'}
            </p>
          </div>

          <ul className="space-y-3">
            {deudas.map((d) => {
              const ec = ESTADO_LABELS[d.estado] ?? ESTADO_LABELS.abierta;
              const intereses =
                parseFloat(d.interesResarcitorio ?? '0') +
                parseFloat(d.interesPunitorio ?? '0');

              return (
                <li
                  key={d.id}
                  className="rounded-[14px] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-sm)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--arca-ink)] leading-snug">
                        {d.impuesto ?? 'Sin impuesto'}
                      </p>
                      {d.concepto && (
                        <p className="text-[12px] text-[var(--arca-ink-3)] mt-1">
                          {d.concepto}
                          {d.subConcepto ? ` · ${d.subConcepto}` : ''}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-2.5">
                        <span
                          className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: ec.bg, color: ec.color }}
                        >
                          {ec.label}
                        </span>
                        {d.intimada && (
                          <span
                            className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: 'var(--arca-accent-warn-bg)',
                              color: 'var(--arca-accent-warn)',
                            }}
                          >
                            Intimada
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--arca-ink-4)]">
                          Período: {periodoLegible(d.periodo)}
                        </span>
                        <span className="text-[11px] text-[var(--arca-ink-4)]">
                          Venció: {fechaLegible(d.venceAt)}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[15px] font-semibold text-[var(--arca-ink)] tabular-nums">
                        {pesos(d.saldo)}
                      </p>
                      {intereses > 0 && (
                        <p className="text-[11px] text-[var(--arca-ink-4)] tabular-nums mt-0.5">
                          + {pesos(String(intereses))} de intereses
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
