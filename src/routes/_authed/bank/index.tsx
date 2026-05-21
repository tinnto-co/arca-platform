import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Landmark,
  CheckCircle2,
  CircleDashed,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Plus,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ArcaCard } from '@/components/dashboard/shared';
import { getRepresentatives } from '@/actions/client';
import {
  listBankAccounts,
  listBankTransactions,
  autoMatchTransactions,
  getReconciliationSummary,
  createBankAccount,
} from '@/actions/bank';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authed/bank/')({
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'banco')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: BankPage,
});

/* ─── Types ─── */
interface BankAccountRow {
  id: string;
  bankName: string;
  accountNumber?: string | null;
  alias?: string | null;
  cbu?: string | null;
  currency: string;
}

interface TransactionRow {
  id: string;
  transactionDate: string | Date;
  description?: string | null;
  amount: string;
  direction: string;
  counterpartyName?: string | null;
  counterpartyIdentityNumber?: string | null;
  matched: boolean;
  matches: { matchType: string; confidence?: string | null }[];
}

/* ─── Helpers ─── */
const SELECT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

function fmtAmount(amount: string, direction: string) {
  const n = parseFloat(amount);
  const sign = direction === 'credit' ? '+' : '-';
  return `${sign}$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/* ─── Summary cards ─── */
function SummaryCards({
  summary,
}: {
  summary: {
    totalTransactions: number;
    matchedTransactions: number;
    unmatchedTransactions: number;
    matchRate: number;
    totalCredit: string;
    totalDebit: string;
    accountCount: number;
  };
}) {
  const cards = [
    {
      label: 'Cuentas',
      value: summary.accountCount,
      icon: Landmark,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Transacciones',
      value: summary.totalTransactions,
      icon: ArrowLeftRight,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Conciliadas',
      value: summary.matchedTransactions,
      icon: CheckCircle2,
      color: 'oklch(0.55 0.12 145)',
    },
    {
      label: 'Pendientes',
      value: summary.unmatchedTransactions,
      icon: CircleDashed,
      color: 'var(--arca-accent-warn)',
    },
    {
      label: 'Tasa de conciliación',
      value: `${summary.matchRate}%`,
      icon: ArrowLeftRight,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Total créditos',
      value: `$${parseFloat(summary.totalCredit).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'oklch(0.55 0.12 145)',
    },
    {
      label: 'Total débitos',
      value: `$${parseFloat(summary.totalDebit).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      icon: TrendingDown,
      color: 'var(--arca-accent-neg)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col gap-1 px-4 py-3 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]"
        >
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--arca-ink-3)] font-medium">
            <card.icon
              className="w-3 h-3 shrink-0"
              style={{ color: card.color }}
              strokeWidth={2}
            />
            {card.label}
          </div>
          <div
            className="text-[18px] font-semibold tracking-tight text-[var(--arca-ink)]"
            style={{ fontFamily: 'var(--ff-display)' }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Transaction row ─── */
function TransactionItem({ tx }: { tx: TransactionRow }) {
  const isCredit = tx.direction === 'credit';
  return (
    <div className="px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
      {/* Match indicator */}
      <div className="shrink-0">
        {tx.matched ? (
          <CheckCircle2
            className="w-4 h-4"
            style={{ color: 'oklch(0.55 0.12 145)' }}
            strokeWidth={2}
          />
        ) : (
          <CircleDashed
            className="w-4 h-4 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        )}
      </div>

      {/* Date */}
      <div className="w-[90px] shrink-0 text-[12px] text-[var(--arca-ink-3)] font-mono">
        {fmtDate(tx.transactionDate)}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
          {tx.description ?? '—'}
        </div>
        {tx.counterpartyName && (
          <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
            {tx.counterpartyName}
            {tx.counterpartyIdentityNumber &&
              ` · ${tx.counterpartyIdentityNumber}`}
          </div>
        )}
      </div>

      {/* Match type badge */}
      {tx.matched && tx.matches[0] && (
        <span
          className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
          style={{
            background:
              tx.matches[0].matchType === 'manual'
                ? 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))'
                : 'var(--arca-surface-2)',
            color:
              tx.matches[0].matchType === 'manual'
                ? 'oklch(0.45 0.14 145)'
                : 'var(--arca-ink-3)',
          }}
        >
          {tx.matches[0].matchType === 'manual' ? 'Manual' : 'Auto'}
          {tx.matches[0].confidence &&
            ` ${Math.round(parseFloat(tx.matches[0].confidence))}%`}
        </span>
      )}

      {/* Amount */}
      <div
        className="w-[130px] text-right shrink-0 text-[13.5px] font-semibold tabular-nums"
        style={{
          color: isCredit
            ? 'oklch(0.45 0.14 145)'
            : 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
        }}
      >
        {fmtAmount(tx.amount, tx.direction)}
      </div>
    </div>
  );
}

/* ─── Create account dialog ─── */
function CreateAccountForm({
  clientId,
  onCreated,
}: {
  clientId: string;
  onCreated: () => void;
}) {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [alias, setAlias] = useState('');
  const [cbu, setCbu] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      createBankAccount({
        data: {
          clientId,
          bankName,
          accountNumber: accountNumber || undefined,
          alias: alias || undefined,
          cbu: cbu || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bankAccounts', clientId],
      });
      toast.success('Cuenta bancaria creada');
      setBankName('');
      setAccountNumber('');
      setAlias('');
      setCbu('');
      onCreated();
    },
    onError: () => toast.error('Error al crear cuenta'),
  });

  return (
    <div className="p-5 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
      <div className="text-[12.5px] font-semibold text-[var(--arca-ink)] mb-3">
        Nueva cuenta bancaria
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Banco *
          </label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Ej: Banco Nación"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            N° de cuenta
          </label>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">Alias</label>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">CBU</label>
          <input
            value={cbu}
            onChange={(e) => setCbu(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-44"
          />
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!bankName || createMutation.isPending}
          className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {createMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/* ─── Page ─── */
function BankPage() {
  const [clientId, setClientId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const queryClient = useQueryClient();

  /* Clients */
  const { data: clientsRaw = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getRepresentatives(),
    staleTime: 60_000,
  });
  const clients = clientsRaw as { id: string; name: string }[];

  /* Bank accounts */
  const { data: accountsRaw = [] } = useQuery({
    queryKey: ['bankAccounts', clientId],
    queryFn: () => listBankAccounts({ data: { clientId } }),
    enabled: !!clientId,
  });
  const accounts = accountsRaw as BankAccountRow[];

  /* Summary */
  const { data: summary } = useQuery({
    queryKey: ['bankSummary', clientId],
    queryFn: () => getReconciliationSummary({ data: { clientId } }),
    enabled: !!clientId,
  });

  /* Transactions */
  const { data: txsRaw = [], isFetching: txsFetching } = useQuery({
    queryKey: ['bankTransactions', accountId],
    queryFn: () =>
      listBankTransactions({ data: { bankAccountId: accountId, limit: 200 } }),
    enabled: !!accountId,
  });
  const transactions = txsRaw as TransactionRow[];

  /* Auto-match */
  const autoMatchMutation = useMutation({
    mutationFn: () =>
      autoMatchTransactions({ data: { bankAccountId: accountId } }),
    onSuccess: (result) => {
      const r = result as { matched: number };
      void queryClient.invalidateQueries({
        queryKey: ['bankTransactions', accountId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['bankSummary', clientId],
      });
      toast.success(
        `${r.matched} transacción${r.matched !== 1 ? 'es' : ''} conciliada${r.matched !== 1 ? 's' : ''} automáticamente`
      );
    },
    onError: () => toast.error('Error en la conciliación automática'),
  });

  /* When client changes, reset account selection */
  const handleClientChange = (id: string) => {
    setClientId(id);
    setAccountId('');
    setShowCreateAccount(false);
  };

  const unmatchedCount = transactions.filter((t) => !t.matched).length;
  const matchedCount = transactions.filter((t) => t.matched).length;

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        icon={Landmark}
        title="Banco"
        subtitle="Conciliación bancaria"
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        <select
          value={clientId}
          onChange={(e) => handleClientChange(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="">Seleccionar cliente...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {clientId && (
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Seleccionar cuenta...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName}
                {a.alias ? ` · ${a.alias}` : ''}
                {a.accountNumber ? ` (${a.accountNumber})` : ''}
              </option>
            ))}
          </select>
        )}

        {clientId && (
          <button
            onClick={() => setShowCreateAccount((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nueva cuenta
          </button>
        )}

        {accountId && (
          <button
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || unmatchedCount === 0}
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity ml-auto"
          >
            <Zap className="w-3.5 h-3.5" strokeWidth={2} />
            {autoMatchMutation.isPending
              ? 'Conciliando...'
              : `Auto-conciliar (${unmatchedCount})`}
          </button>
        )}
      </div>

      {/* Summary stats */}
      {clientId && summary && <SummaryCards summary={summary} />}

      {/* Create account form */}
      {showCreateAccount && clientId && (
        <div className="mb-4 rounded-[12px] border border-[var(--arca-border)] overflow-hidden">
          <CreateAccountForm
            clientId={clientId}
            onCreated={() => setShowCreateAccount(false)}
          />
        </div>
      )}

      {/* Transactions */}
      {accountId ? (
        <ArcaCard>
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3 border-b border-[var(--arca-border)]">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Transacciones
            </span>
            <span className="text-[11.5px] text-[var(--arca-ink-3)]">
              {transactions.length} total · {matchedCount} conciliadas ·{' '}
              {unmatchedCount} pendientes
            </span>
            {txsFetching && (
              <span className="text-[11px] text-[var(--arca-ink-3)] ml-auto">
                Cargando...
              </span>
            )}
          </div>

          {/* Column headers */}
          <div className="px-5 py-2 flex items-center gap-4 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-4 shrink-0" />
            <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Fecha
            </div>
            <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Descripción / Contraparte
            </div>
            <div className="w-[60px] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Match
            </div>
            <div className="w-[130px] text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Importe
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
              <ArrowLeftRight
                className="w-8 h-8 mb-2 opacity-40"
                strokeWidth={1.5}
              />
              <p className="text-[13px]">
                No hay transacciones para esta cuenta
              </p>
              <p className="text-[12px] mt-1 text-[var(--arca-ink-3)]">
                Importá movimientos para comenzar la conciliación
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--arca-border)]">
              {transactions.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} />
              ))}
            </div>
          )}
        </ArcaCard>
      ) : clientId ? (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <Landmark className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">
              Seleccioná una cuenta para ver transacciones
            </p>
          </div>
        </ArcaCard>
      ) : (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <Landmark className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">Seleccioná un cliente para comenzar</p>
          </div>
        </ArcaCard>
      )}
    </div>
  );
}
