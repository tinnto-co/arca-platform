/**
 * Transcripción de un balance ya presentado, para alimentar la columna
 * comparativa cuando el ejercicio anterior no está cargado en el sistema.
 *
 * Es una planilla y no un asiento a propósito: el contador copia los importes
 * tal como están impresos en su balance, del lado natural de cada cuenta, sin
 * pensar en Debe ni Haber. Los dos asientos —apertura y movimientos— los arma
 * el servidor a partir de las dos columnas.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  getReferenceBalances,
  saveReferenceBalances,
  type ReferenceBalanceRow,
  type ReferenceBalancesView,
} from '@/actions/accounting';
import { ArcaCard } from '@/components/dashboard/shared';

const fmtMoney = (n: number) =>
  n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Acepta "1.234,56" y "1234.56": el contador copia y pega desde Excel. */
function parseAmount(raw: string): number {
  const clean = raw.trim();
  if (clean === '' || clean === '-') return 0;
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

interface Draft {
  inicio: string;
  cierre: string;
}

export function SaldosReferencia({
  clientId,
  fiscalYearId,
  canWrite,
}: {
  clientId: string;
  fiscalYearId: string;
  canWrite: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'reference-balances', fiscalYearId],
    queryFn: () => getReferenceBalances({ data: { clientId, fiscalYearId } }),
    enabled: !!fiscalYearId,
  });

  if (isLoading) {
    return (
      <ArcaCard className="mt-4">
        <div className="flex items-center gap-2 px-5 py-6 text-[12.5px] text-[var(--arca-ink-3)]">
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} />
          Cargando el plan de cuentas…
        </div>
      </ArcaCard>
    );
  }
  if (!data) return null;

  // La `key` hace que React remonte la planilla al cambiar de ejercicio, así el
  // borrador arranca de los saldos guardados sin sincronizarlo por efecto.
  return (
    <Planilla
      key={fiscalYearId}
      clientId={clientId}
      fiscalYearId={fiscalYearId}
      canWrite={canWrite}
      data={data}
    />
  );
}

function Planilla({
  clientId,
  fiscalYearId,
  canWrite,
  data,
}: {
  clientId: string;
  fiscalYearId: string;
  canWrite: boolean;
  data: ReferenceBalancesView;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, Draft>>(() => {
    const next: Record<string, Draft> = {};
    for (const r of data.rows) {
      next[r.accountId] = {
        inicio: r.inicio ? String(r.inicio) : '',
        cierre: r.cierre ? String(r.cierre) : '',
      };
    }
    return next;
  });
  const [filter, setFilter] = useState('');
  const [onlyFilled, setOnlyFilled] = useState(false);

  const rows = data.rows;

  const totals = useMemo(() => {
    let inicio = 0;
    let cierre = 0;
    let cargadas = 0;
    for (const r of rows) {
      const d = draft[r.accountId];
      if (!d) continue;
      const sign = r.side === 'credit' ? -1 : 1;
      const i = parseAmount(d.inicio);
      const c = parseAmount(d.cierre);
      if (i !== 0 || c !== 0) cargadas++;
      inicio += sign * i;
      cierre += sign * c;
    }
    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    return { inicio: r2(inicio), cierre: r2(cierre), cargadas };
  }, [rows, draft]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyFilled) {
        const d = draft[r.accountId];
        const filled =
          d && (parseAmount(d.inicio) !== 0 || parseAmount(d.cierre) !== 0);
        if (!filled) return false;
      }
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.groupLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, draft, filter, onlyFilled]);

  const save = useMutation({
    mutationFn: () =>
      saveReferenceBalances({
        data: {
          clientId,
          fiscalYearId,
          rows: rows.map((r) => ({
            accountId: r.accountId,
            inicio: parseAmount(draft[r.accountId]?.inicio ?? ''),
            cierre: parseAmount(draft[r.accountId]?.cierre ?? ''),
          })),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Saldos guardados en ${res.cuentas} imputación(es).`);
      void qc.invalidateQueries({ queryKey: ['accounting'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cuadra =
    Math.abs(totals.inicio) < 0.005 && Math.abs(totals.cierre) < 0.005;

  return (
    <ArcaCard className="mt-4">
      <div className="px-5 pt-4 pb-3 border-b border-[var(--arca-border)]">
        <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Saldos del balance anterior
        </div>
        <div className="text-[12px] text-[var(--arca-ink-3)] mt-0.5">
          Ejercicio N°{data.fiscalYearNumber} · {data.periodLabel}. Copiá los
          importes como figuran en el balance: positivos del lado natural de
          cada cuenta. El sistema arma los asientos.
        </div>
        {data.loaded && (
          <div className="text-[11.5px] text-[var(--arca-ink-3)] mt-1.5 italic">
            Ya hay saldos cargados. Guardar los reemplaza por completo.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-[var(--arca-border)]">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar cuenta o rubro"
            className="h-8 pl-8 pr-3 w-56 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] bg-transparent"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--arca-ink-2)] cursor-pointer">
          <input
            type="checkbox"
            checked={onlyFilled}
            onChange={(e) => setOnlyFilled(e.target.checked)}
          />
          Solo las cargadas
        </label>
        <span className="text-[11.5px] text-[var(--arca-ink-3)] ml-auto">
          {totals.cargadas} de {rows.length} cuentas con saldo
        </span>
      </div>

      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-[var(--arca-surface-2)] z-10">
            <tr className="text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)]">
              <th className="text-left font-semibold px-4 py-2">Cuenta</th>
              <th className="text-left font-semibold px-3 py-2">Rubro</th>
              <th className="text-right font-semibold px-3 py-2 w-40">
                Saldo al inicio
              </th>
              <th className="text-right font-semibold px-3 py-2 w-40">
                Saldo al cierre
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <BalanceRow
                key={r.accountId}
                row={r}
                draft={draft[r.accountId] ?? { inicio: '', cierre: '' }}
                disabled={!canWrite || save.isPending}
                onChange={(field, value) =>
                  setDraft((d) => ({
                    ...d,
                    [r.accountId]: {
                      ...(d[r.accountId] ?? { inicio: '', cierre: '' }),
                      [field]: value,
                    },
                  }))
                }
              />
            ))}
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-[12px] text-[var(--arca-ink-3)]"
                >
                  Ninguna cuenta coincide con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-[var(--arca-border)]">
        <div className="flex items-center gap-2 text-[12px]">
          {cuadra ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" strokeWidth={2} />
              <span className="text-[var(--arca-ink-3)]">
                Las dos columnas cuadran.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle
                className="w-4 h-4 text-amber-600"
                strokeWidth={2}
              />
              <span style={{ color: 'oklch(0.58 0.13 75)' }}>
                {Math.abs(totals.inicio) >= 0.005 &&
                  `Al inicio faltan $ ${fmtMoney(-totals.inicio)}. `}
                {Math.abs(totals.cierre) >= 0.005 &&
                  `Al cierre faltan $ ${fmtMoney(-totals.cierre)}.`}
              </span>
            </>
          )}
        </div>
        {canWrite && (
          <button
            disabled={!cuadra || save.isPending || totals.cargadas === 0}
            onClick={() => save.mutate()}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-40"
          >
            {save.isPending ? 'Guardando…' : 'Guardar saldos'}
          </button>
        )}
      </div>
    </ArcaCard>
  );
}

/**
 * Una fila de la planilla. Separada porque cada tecleada re-renderiza el
 * borrador entero y la tabla puede tener más de cien cuentas.
 */
function BalanceRow({
  row,
  draft,
  disabled,
  onChange,
}: {
  row: ReferenceBalanceRow;
  draft: Draft;
  disabled: boolean;
  onChange: (field: 'inicio' | 'cierre', value: string) => void;
}) {
  const cell =
    'h-8 w-full px-2 text-right tabular-nums text-[12.5px] rounded-[6px] border border-[var(--arca-border)] bg-transparent focus:border-[var(--arca-navy-900)] outline-none';
  return (
    <tr className="border-t border-[var(--arca-border)]">
      <td className="px-4 py-1.5">
        <span className="text-[var(--arca-ink-3)] tabular-nums">
          {row.code}
        </span>{' '}
        <span className="text-[var(--arca-ink)]">{row.name}</span>
        <span className="ml-1.5 text-[10.5px] text-[var(--arca-ink-3)]">
          {row.side === 'credit' ? 'acreedora' : 'deudora'}
        </span>
      </td>
      <td className="px-3 py-1.5 text-[11.5px] text-[var(--arca-ink-3)]">
        {row.groupLabel}
      </td>
      <td className="px-3 py-1.5">
        <input
          inputMode="decimal"
          value={draft.inicio}
          disabled={disabled}
          onChange={(e) => onChange('inicio', e.target.value)}
          className={cell}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          inputMode="decimal"
          value={draft.cierre}
          disabled={disabled}
          onChange={(e) => onChange('cierre', e.target.value)}
          className={cell}
        />
      </td>
    </tr>
  );
}
