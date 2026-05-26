import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, ChevronDown, ChevronUp } from 'lucide-react';
import { getCredentialAlerts } from '@/actions/dashboard';

export function CredentialAlertBanner() {
  const [expanded, setExpanded] = useState(false);
  const { data: alerts = [] } = useQuery({
    queryKey: ['credentialAlerts'],
    queryFn: () => getCredentialAlerts(),
    refetchInterval: 60_000,
  });

  if (alerts.length === 0) return null;

  return (
    <div
      className="mb-3.5 rounded-[12px] border overflow-hidden"
      style={{
        background: 'var(--arca-accent-neg-bg)',
        borderColor: 'var(--arca-accent-neg)',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span
          className="inline-flex items-center justify-center rounded-[8px] w-9 h-9 shrink-0"
          style={{ background: 'var(--arca-accent-neg)', color: '#fff' }}
        >
          <KeyRound size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="text-[14px] font-semibold leading-tight"
            style={{ color: 'var(--arca-accent-neg)' }}
          >
            {alerts.length} representante{alerts.length !== 1 ? 's' : ''} con
            credenciales invalidas
          </div>
          <div className="text-[11px] text-[var(--arca-ink-3)] leading-tight mt-0.5">
            No se scrappean hasta que se actualicen las claves
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-[var(--arca-ink-4)] shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-[var(--arca-ink-4)] shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t" style={{ borderColor: 'var(--arca-accent-neg)' }}>
          <table className="w-full text-[12.5px] mt-2">
            <thead>
              <tr className="border-b border-[var(--arca-border)]">
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-1.5">
                  Representante
                </th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-1.5">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a.alertId}
                  className="border-b border-[var(--arca-border)] last:border-0"
                >
                  <td className="py-1.5">
                    <div className="font-medium text-[var(--arca-ink)]">
                      {a.name || '(sin nombre)'}
                    </div>
                    <div className="text-[11px] text-[var(--arca-ink-4)] font-mono">
                      {a.cuit}
                    </div>
                  </td>
                  <td className="py-1.5 text-[var(--arca-ink-3)]">
                    {a.description || 'Credenciales invalidas'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
