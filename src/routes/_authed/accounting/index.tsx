import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Scale,
  List,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ArcaCard } from '@/components/dashboard/shared';
import { getRepresentatives } from '@/actions/client';
import {
  listAccounts,
  createAccount,
  updateAccount,
  createJournalEntry,
  listJournalEntries,
  getJournalEntry,
  getLedger,
  getTrialBalance,
} from '@/actions/accounting';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authed/accounting/')({
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled =
      modules.find((m) => m.module === 'contabilidad')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: AccountingPage,
});

/* ─── Types ─── */
type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

interface AccountRow {
  id: string;
  clientId: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  active: boolean;
  createdAt: string | Date;
}

interface JournalEntryRow {
  id: string;
  clientId: string;
  entryDate: string | Date;
  description: string | null;
  status: string;
  createdAt: string | Date;
}

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

/* ─── Helpers ─── */
const SELECT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

const INPUT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Patrimonio',
  income: 'Ingresos',
  expense: 'Egresos',
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  asset: 'oklch(0.45 0.10 220)',
  liability: 'oklch(0.55 0.15 25)',
  equity: 'oklch(0.45 0.12 280)',
  income: 'oklch(0.45 0.14 145)',
  expense: 'oklch(0.50 0.13 50)',
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function fmtAmount(n: number | string) {
  const num = typeof n === 'string' ? parseFloat(n) : n;
  return num.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ─── Account type badge ─── */
function TypeBadge({ type }: { type: AccountType }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
      style={{
        background: `color-mix(in oklch, ${ACCOUNT_TYPE_COLORS[type]}, transparent 85%)`,
        color: ACCOUNT_TYPE_COLORS[type],
      }}
    >
      {ACCOUNT_TYPE_LABELS[type]}
    </span>
  );
}

/* ─── Tab bar ─── */
type Tab = 'plan' | 'asientos' | 'mayor' | 'balance';

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'plan', label: 'Plan de cuentas', icon: List },
    { id: 'asientos', label: 'Asientos', icon: FileText },
    { id: 'mayor', label: 'Mayor', icon: BookOpen },
    { id: 'balance', label: 'Balance', icon: Scale },
  ];

  return (
    <div className="flex gap-1 mb-5 border-b border-[var(--arca-border)]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition-colors duration-[120ms] border-b-2 -mb-px"
          style={{
            color: active === tab.id ? 'var(--arca-ink)' : 'var(--arca-ink-3)',
            borderBottomColor:
              active === tab.id ? 'var(--arca-ink)' : 'transparent',
          }}
        >
          <tab.icon className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Plan de cuentas tab ─── */
function PlanDeCuentas({
  clientId,
  accounts,
  onRefresh,
}: {
  clientId: string;
  accounts: AccountRow[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('asset');
  const [parentId, setParentId] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const createMut = useMutation({
    mutationFn: () =>
      createAccount({
        data: {
          clientId,
          code,
          name,
          type,
          parentId: parentId || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Cuenta creada');
      setCode('');
      setName('');
      setType('asset');
      setParentId('');
      setShowForm(false);
      onRefresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (args: { id: string; active: boolean }) =>
      updateAccount({ data: { id: args.id, active: args.active } }),
    onSuccess: () => {
      onRefresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rootAccounts = accounts.filter((a) => !a.parentId);

  function AccountRow({
    account,
    depth,
  }: {
    account: AccountRow;
    depth: number;
  }) {
    const children = accounts.filter((a) => a.parentId === account.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(account.id);

    return (
      <>
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(account.id)) next.delete(account.id);
                  else next.add(account.id);
                  return next;
                })
              }
              className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" strokeWidth={1.8} />
              ) : (
                <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
              )}
            </button>
          ) : (
            <div className="w-4 shrink-0" />
          )}

          <span className="w-20 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
            {account.code}
          </span>

          <span
            className={`flex-1 text-[13px] font-medium ${account.active ? 'text-[var(--arca-ink)]' : 'text-[var(--arca-ink-3)] line-through'}`}
          >
            {account.name}
          </span>

          <TypeBadge type={account.type} />

          <button
            onClick={() =>
              updateMut.mutate({ id: account.id, active: !account.active })
            }
            className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors ml-2"
          >
            {account.active ? 'Desactivar' : 'Activar'}
          </button>
        </div>

        {isExpanded &&
          children.map((child) => (
            <AccountRow key={child.id} account={child} depth={depth + 1} />
          ))}
      </>
    );
  }

  return (
    <ArcaCard>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Plan de cuentas
        </span>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3 h-3" strokeWidth={2.5} />
          Nueva cuenta
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="px-5 py-4 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Código *
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ej: 1.1.01"
                className={`${INPUT_CLASS} w-24`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Nombre *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la cuenta"
                className={`${INPUT_CLASS} w-56`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Tipo *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className={`${SELECT_CLASS} w-36`}
              >
                {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Cuenta padre
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className={`${SELECT_CLASS} w-48`}
              >
                <option value="">— Ninguna —</option>
                {accounts
                  .filter((a) => a.active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={() => createMut.mutate()}
              disabled={!code || !name || createMut.isPending}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createMut.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
        <div className="w-4 shrink-0" />
        <div className="w-20 shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Código
        </div>
        <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Nombre
        </div>
        <div className="text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Tipo
        </div>
        <div className="w-20 shrink-0" />
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <BookOpen className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">No hay cuentas contables</p>
          <p className="text-[12px] mt-1">
            Creá una cuenta para comenzar el plan de cuentas
          </p>
        </div>
      ) : (
        <div>
          {rootAccounts.map((acct) => (
            <AccountRow key={acct.id} account={acct} depth={0} />
          ))}
        </div>
      )}
    </ArcaCard>
  );
}

/* ─── Journal entry form ─── */
function JournalEntryForm({
  clientId,
  accounts,
  onCreated,
  onCancel,
}: {
  clientId: string;
  accounts: AccountRow[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { accountId: '', debit: 0, credit: 0, description: '' },
    { accountId: '', debit: 0, credit: 0, description: '' },
  ]);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

  const createMut = useMutation({
    mutationFn: () =>
      createJournalEntry({
        data: {
          clientId,
          entryDate,
          description: description || undefined,
          lines: lines
            .filter((l) => l.accountId)
            .map((l) => ({
              accountId: l.accountId,
              debit: l.debit,
              credit: l.credit,
              description: l.description,
            })),
        },
      }),
    onSuccess: () => {
      toast.success('Asiento creado');
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateLine = (
    index: number,
    field: keyof JournalLine,
    value: string | number
  ) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { accountId: '', debit: 0, credit: 0, description: '' },
    ]);

  const removeLine = (index: number) =>
    setLines((prev) => prev.filter((_, i) => i !== index));

  const activeAccounts = accounts.filter((a) => a.active);

  return (
    <div className="px-5 py-4 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
      <div className="text-[13px] font-semibold text-[var(--arca-ink)] mb-4">
        Nuevo asiento contable
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Fecha *
          </label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className={`${INPUT_CLASS} w-36`}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Descripción
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del asiento"
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="mb-3 rounded-[8px] border border-[var(--arca-border)] overflow-hidden">
        {/* Column headers */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)]">
          <div className="flex-1 text-[10.5px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
            Cuenta
          </div>
          <div className="w-28 text-[10.5px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
            Debe
          </div>
          <div className="w-28 text-[10.5px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
            Haber
          </div>
          <div className="w-36 text-[10.5px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
            Descripción
          </div>
          <div className="w-6 shrink-0" />
        </div>

        {lines.map((line, index) => (
          <div
            key={index}
            className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--arca-border)] last:border-b-0 bg-[var(--arca-surface)]"
          >
            <select
              value={line.accountId}
              onChange={(e) => updateLine(index, 'accountId', e.target.value)}
              className={`${SELECT_CLASS} flex-1`}
            >
              <option value="">Seleccionar cuenta...</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.debit || ''}
              onChange={(e) =>
                updateLine(index, 'debit', parseFloat(e.target.value) || 0)
              }
              placeholder="0,00"
              className={`${INPUT_CLASS} w-28 text-right`}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.credit || ''}
              onChange={(e) =>
                updateLine(index, 'credit', parseFloat(e.target.value) || 0)
              }
              placeholder="0,00"
              className={`${INPUT_CLASS} w-28 text-right`}
            />
            <input
              value={line.description ?? ''}
              onChange={(e) => updateLine(index, 'description', e.target.value)}
              placeholder="Glosa"
              className={`${INPUT_CLASS} w-36`}
            />
            <button
              onClick={() => removeLine(index)}
              disabled={lines.length <= 2}
              className="w-6 h-6 flex items-center justify-center text-[var(--arca-ink-3)] hover:text-[var(--arca-accent-neg)] disabled:opacity-30 transition-colors"
            >
              ×
            </button>
          </div>
        ))}

        {/* Totals row */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--arca-surface-2)] border-t border-[var(--arca-border)]">
          <div className="flex-1 text-[11.5px] font-semibold text-[var(--arca-ink-3)]">
            Totales
          </div>
          <div
            className="w-28 text-right text-[12px] font-semibold tabular-nums"
            style={{ color: 'var(--arca-ink)' }}
          >
            {fmtAmount(totalDebit)}
          </div>
          <div
            className="w-28 text-right text-[12px] font-semibold tabular-nums"
            style={{ color: 'var(--arca-ink)' }}
          >
            {fmtAmount(totalCredit)}
          </div>
          <div className="w-36" />
          <div className="w-6 shrink-0">
            {isBalanced && totalDebit > 0 ? (
              <span className="text-[10px] text-[oklch(0.45_0.14_145)]">✓</span>
            ) : !isBalanced && (totalDebit > 0 || totalCredit > 0) ? (
              <span className="text-[10px] text-[var(--arca-accent-neg)]">
                ✗
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Balance warning */}
      {!isBalanced && (totalDebit > 0 || totalCredit > 0) && (
        <p
          className="text-[11.5px] mb-3"
          style={{ color: 'var(--arca-accent-neg)' }}
        >
          El asiento no está balanceado: debe {fmtAmount(totalDebit)} ≠ haber{' '}
          {fmtAmount(totalCredit)}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={addLine}
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] rounded-[7px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
          Agregar línea
        </button>
        <div className="flex-1" />
        <button
          onClick={onCancel}
          className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => createMut.mutate()}
          disabled={
            !isBalanced ||
            totalDebit === 0 ||
            lines.filter((l) => l.accountId).length < 2 ||
            createMut.isPending
          }
          className="h-8 px-4 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {createMut.isPending ? 'Guardando...' : 'Guardar asiento'}
        </button>
      </div>
    </div>
  );
}

/* ─── Asientos tab ─── */
function AsientosTab({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: AccountRow[];
}) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const { data: entriesRaw = [], isFetching } = useQuery({
    queryKey: ['journalEntries', clientId],
    queryFn: () => listJournalEntries({ data: { clientId, limit: 100 } }),
    enabled: !!clientId,
  });
  const entries = entriesRaw as JournalEntryRow[];

  const { data: entryDetailRaw } = useQuery({
    queryKey: ['journalEntry', expandedEntryId],
    queryFn: () => getJournalEntry({ data: { id: expandedEntryId! } }),
    enabled: !!expandedEntryId,
  });
  const entryDetail = entryDetailRaw as
    | (JournalEntryRow & {
        lines: {
          id: string;
          accountCode: string;
          accountName: string;
          accountType: string;
          debit: string;
          credit: string;
          description: string | null;
        }[];
      })
    | undefined;

  const handleCreated = () => {
    void queryClient.invalidateQueries({
      queryKey: ['journalEntries', clientId],
    });
    setShowForm(false);
  };

  return (
    <ArcaCard>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Asientos contables
          {isFetching && (
            <span className="ml-2 text-[11px] text-[var(--arca-ink-3)] font-normal">
              Cargando...
            </span>
          )}
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3 h-3" strokeWidth={2.5} />
            Nuevo asiento
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <JournalEntryForm
          clientId={clientId}
          accounts={accounts}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Column headers */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
        <div className="w-4 shrink-0" />
        <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Fecha
        </div>
        <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Descripción
        </div>
        <div className="w-[80px] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          Estado
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <FileText className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">No hay asientos contables</p>
          <p className="text-[12px] mt-1">
            Creá un asiento para registrar movimientos
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[var(--arca-border)]">
          {entries.map((entry) => {
            const isOpen = expandedEntryId === entry.id;
            return (
              <div key={entry.id}>
                <div
                  className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--arca-surface-2)] cursor-pointer transition-colors duration-[100ms]"
                  onClick={() => setExpandedEntryId(isOpen ? null : entry.id)}
                >
                  <div className="w-4 shrink-0 text-[var(--arca-ink-3)]">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4" strokeWidth={1.8} />
                    ) : (
                      <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                    )}
                  </div>
                  <div className="w-[90px] shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
                    {fmtDate(entry.entryDate)}
                  </div>
                  <div className="flex-1 text-[13px] font-medium text-[var(--arca-ink)]">
                    {entry.description ?? '—'}
                  </div>
                  <div className="w-[80px]">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
                      style={{
                        background:
                          entry.status === 'posted'
                            ? 'color-mix(in oklch, oklch(0.45 0.14 145), transparent 85%)'
                            : 'var(--arca-surface-2)',
                        color:
                          entry.status === 'posted'
                            ? 'oklch(0.45 0.14 145)'
                            : 'var(--arca-ink-3)',
                      }}
                    >
                      {entry.status === 'posted' ? 'Confirmado' : 'Borrador'}
                    </span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="px-5 pb-4 bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)]">
                    {!entryDetail || entryDetail.id !== entry.id ? (
                      <p className="text-[12px] text-[var(--arca-ink-3)] py-2">
                        Cargando líneas...
                      </p>
                    ) : (
                      <table className="w-full text-[12px] mt-2">
                        <thead>
                          <tr className="text-[10.5px] text-[var(--arca-ink-3)] uppercase tracking-wide">
                            <th className="text-left pb-2 font-semibold">
                              Cuenta
                            </th>
                            <th className="text-left pb-2 font-semibold w-40">
                              Descripción
                            </th>
                            <th className="text-right pb-2 font-semibold w-28">
                              Debe
                            </th>
                            <th className="text-right pb-2 font-semibold w-28">
                              Haber
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {entryDetail.lines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-[var(--arca-border)]"
                            >
                              <td className="py-1.5 text-[var(--arca-ink)]">
                                <span className="font-mono text-[11px] text-[var(--arca-ink-3)] mr-2">
                                  {line.accountCode}
                                </span>
                                {line.accountName}
                              </td>
                              <td className="py-1.5 text-[var(--arca-ink-3)]">
                                {line.description ?? '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums font-medium text-[var(--arca-ink)]">
                                {parseFloat(line.debit) > 0
                                  ? fmtAmount(line.debit)
                                  : '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums font-medium text-[var(--arca-ink)]">
                                {parseFloat(line.credit) > 0
                                  ? fmtAmount(line.credit)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t-2 border-[var(--arca-border)]">
                            <td
                              colSpan={2}
                              className="py-1.5 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase"
                            >
                              Total
                            </td>
                            <td className="py-1.5 text-right tabular-nums font-semibold text-[var(--arca-ink)]">
                              {fmtAmount(
                                entryDetail.lines.reduce(
                                  (s, l) => s + parseFloat(l.debit),
                                  0
                                )
                              )}
                            </td>
                            <td className="py-1.5 text-right tabular-nums font-semibold text-[var(--arca-ink)]">
                              {fmtAmount(
                                entryDetail.lines.reduce(
                                  (s, l) => s + parseFloat(l.credit),
                                  0
                                )
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ArcaCard>
  );
}

/* ─── Mayor (Ledger) tab ─── */
function MayorTab({
  clientId,
  accounts,
}: {
  clientId: string;
  accounts: AccountRow[];
}) {
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: ledgerRaw, isFetching } = useQuery({
    queryKey: ['ledger', clientId, accountId, from, to],
    queryFn: () =>
      getLedger({
        data: {
          clientId,
          accountId,
          from: from || undefined,
          to: to || undefined,
        },
      }),
    enabled: !!clientId && !!accountId,
  });

  const ledger = ledgerRaw as
    | {
        accountId: string;
        totalDebit: number;
        totalCredit: number;
        rows: {
          entryId: string;
          entryDate: string | Date;
          entryDescription: string | null;
          lineId: string;
          debit: string;
          credit: string;
          lineDescription: string | null;
        }[];
      }
    | undefined;

  const activeAccounts = accounts.filter((a) => a.active);

  return (
    <ArcaCard>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)] mr-2">
          Mayor
        </span>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={`${SELECT_CLASS} w-56`}
        >
          <option value="">Seleccionar cuenta...</option>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={`${INPUT_CLASS} w-32`}
        />
        <span className="text-[11.5px] text-[var(--arca-ink-3)]">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={`${INPUT_CLASS} w-32`}
        />
        {isFetching && (
          <span className="text-[11px] text-[var(--arca-ink-3)]">
            Cargando...
          </span>
        )}
      </div>

      {!accountId ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <BookOpen className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">Seleccioná una cuenta para ver el mayor</p>
        </div>
      ) : !ledger || ledger.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <FileText className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">Sin movimientos para esta cuenta</p>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-4 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Fecha
            </div>
            <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Descripción
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Debe
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Haber
            </div>
          </div>

          <div className="divide-y divide-[var(--arca-border)]">
            {ledger.rows.map((row) => (
              <div
                key={row.lineId}
                className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
              >
                <div className="w-[90px] shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
                  {fmtDate(row.entryDate)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
                    {row.entryDescription ?? '—'}
                  </div>
                  {row.lineDescription && (
                    <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
                      {row.lineDescription}
                    </div>
                  )}
                </div>
                <div className="w-28 text-right tabular-nums text-[13px] font-medium text-[var(--arca-ink)]">
                  {parseFloat(row.debit) > 0 ? fmtAmount(row.debit) : '—'}
                </div>
                <div className="w-28 text-right tabular-nums text-[13px] font-medium text-[var(--arca-ink)]">
                  {parseFloat(row.credit) > 0 ? fmtAmount(row.credit) : '—'}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="flex items-center gap-4 px-5 py-3 border-t-2 border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-[90px] shrink-0" />
            <div className="flex-1 text-[11.5px] font-semibold text-[var(--arca-ink-3)] uppercase">
              Total
            </div>
            <div className="w-28 text-right tabular-nums text-[13px] font-semibold text-[var(--arca-ink)]">
              {fmtAmount(ledger.totalDebit)}
            </div>
            <div className="w-28 text-right tabular-nums text-[13px] font-semibold text-[var(--arca-ink)]">
              {fmtAmount(ledger.totalCredit)}
            </div>
          </div>
        </>
      )}
    </ArcaCard>
  );
}

/* ─── Balance (Trial Balance) tab ─── */
function BalanceTab({ clientId }: { clientId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);

  const {
    data: balanceRaw,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['trialBalance', clientId, from, to],
    queryFn: () => getTrialBalance({ data: { clientId, from, to } }),
    enabled: false,
  });

  const balance = balanceRaw as
    | {
        grandTotalDebit: number;
        grandTotalCredit: number;
        rows: {
          accountId: string;
          accountCode: string;
          accountName: string;
          accountType: AccountType;
          totalDebit: string;
          totalCredit: string;
        }[];
      }
    | undefined;

  const ACCOUNT_TYPE_ORDER: AccountType[] = [
    'asset',
    'liability',
    'equity',
    'income',
    'expense',
  ];

  const groupedRows = balance
    ? ACCOUNT_TYPE_ORDER.map((type) => ({
        type,
        rows: balance.rows.filter((r) => r.accountType === type),
      })).filter((g) => g.rows.length > 0)
    : [];

  return (
    <ArcaCard>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center px-5 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)] mr-2">
          Balance de sumas y saldos
        </span>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={`${INPUT_CLASS} w-32`}
        />
        <span className="text-[11.5px] text-[var(--arca-ink-3)]">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className={`${INPUT_CLASS} w-32`}
        />
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isFetching ? 'Calculando...' : 'Calcular'}
        </button>
      </div>

      {!balance ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <Scale className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">
            Seleccioná un período y presioná Calcular
          </p>
        </div>
      ) : balance.rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
          <Scale className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
          <p className="text-[13px]">
            Sin movimientos en el período seleccionado
          </p>
        </div>
      ) : (
        <>
          {/* Column headers */}
          <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-20 shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Código
            </div>
            <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Cuenta
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Sumas Debe
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Sumas Haber
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Saldo Deudor
            </div>
            <div className="w-28 text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Saldo Acreedor
            </div>
          </div>

          {groupedRows.map((group) => {
            const groupDebit = group.rows.reduce(
              (s, r) => s + parseFloat(r.totalDebit),
              0
            );
            const groupCredit = group.rows.reduce(
              (s, r) => s + parseFloat(r.totalCredit),
              0
            );

            return (
              <div key={group.type}>
                {/* Group header */}
                <div className="flex items-center gap-3 px-5 py-1.5 bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)]">
                  <TypeBadge type={group.type} />
                  <span className="text-[11.5px] font-semibold text-[var(--arca-ink-3)]">
                    {ACCOUNT_TYPE_LABELS[group.type]}
                  </span>
                </div>

                {group.rows.map((row) => {
                  const debit = parseFloat(row.totalDebit);
                  const credit = parseFloat(row.totalCredit);
                  const saldoDeudor = debit > credit ? debit - credit : 0;
                  const saldoAcreedor = credit > debit ? credit - debit : 0;

                  return (
                    <div
                      key={row.accountId}
                      className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
                    >
                      <div className="w-20 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
                        {row.accountCode}
                      </div>
                      <div className="flex-1 text-[13px] font-medium text-[var(--arca-ink)]">
                        {row.accountName}
                      </div>
                      <div className="w-28 text-right tabular-nums text-[12.5px] text-[var(--arca-ink)]">
                        {debit > 0 ? fmtAmount(debit) : '—'}
                      </div>
                      <div className="w-28 text-right tabular-nums text-[12.5px] text-[var(--arca-ink)]">
                        {credit > 0 ? fmtAmount(credit) : '—'}
                      </div>
                      <div className="w-28 text-right tabular-nums text-[12.5px] font-medium text-[var(--arca-ink)]">
                        {saldoDeudor > 0 ? fmtAmount(saldoDeudor) : '—'}
                      </div>
                      <div className="w-28 text-right tabular-nums text-[12.5px] font-medium text-[var(--arca-ink)]">
                        {saldoAcreedor > 0 ? fmtAmount(saldoAcreedor) : '—'}
                      </div>
                    </div>
                  );
                })}

                {/* Group subtotal */}
                <div className="flex items-center gap-3 px-5 py-2 bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)]">
                  <div className="w-20 shrink-0" />
                  <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase">
                    Subtotal
                  </div>
                  <div className="w-28 text-right tabular-nums text-[12px] font-semibold text-[var(--arca-ink)]">
                    {fmtAmount(groupDebit)}
                  </div>
                  <div className="w-28 text-right tabular-nums text-[12px] font-semibold text-[var(--arca-ink)]">
                    {fmtAmount(groupCredit)}
                  </div>
                  <div className="w-28" />
                  <div className="w-28" />
                </div>
              </div>
            );
          })}

          {/* Grand totals */}
          <div className="flex items-center gap-3 px-5 py-3 border-t-2 border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-20 shrink-0" />
            <div className="flex-1 text-[12px] font-bold text-[var(--arca-ink)] uppercase tracking-wide">
              Total general
            </div>
            <div className="w-28 text-right tabular-nums text-[13px] font-bold text-[var(--arca-ink)]">
              {fmtAmount(balance.grandTotalDebit)}
            </div>
            <div className="w-28 text-right tabular-nums text-[13px] font-bold text-[var(--arca-ink)]">
              {fmtAmount(balance.grandTotalCredit)}
            </div>
            <div className="w-28" />
            <div className="w-28" />
          </div>
        </>
      )}
    </ArcaCard>
  );
}

/* ─── Page ─── */
function AccountingPage() {
  const [clientId, setClientId] = useState('');
  const [tab, setTab] = useState<Tab>('plan');
  const queryClient = useQueryClient();

  /* Clients */
  const { data: clientsRaw = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => getRepresentatives(),
    staleTime: 60_000,
  });
  const clients = clientsRaw as { id: string; name: string }[];

  /* Accounts (shared across tabs) */
  const { data: accountsRaw = [], refetch: refetchAccounts } = useQuery({
    queryKey: ['accountingAccounts', clientId],
    queryFn: () => listAccounts({ data: { clientId } }),
    enabled: !!clientId,
  });
  const accounts = accountsRaw as AccountRow[];

  const handleClientChange = (id: string) => {
    setClientId(id);
    void queryClient.removeQueries({
      queryKey: ['accountingAccounts', clientId],
    });
    void queryClient.removeQueries({ queryKey: ['journalEntries', clientId] });
  };

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        icon={BookOpen}
        title="Contabilidad"
        subtitle="Plan de cuentas, asientos y reportes"
      />

      {/* Client selector */}
      <div className="flex items-center gap-2 mb-5">
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
      </div>

      {!clientId ? (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <BookOpen className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">Seleccioná un cliente para comenzar</p>
          </div>
        </ArcaCard>
      ) : (
        <>
          <TabBar active={tab} onChange={setTab} />

          {tab === 'plan' && (
            <PlanDeCuentas
              clientId={clientId}
              accounts={accounts}
              onRefresh={() => void refetchAccounts()}
            />
          )}
          {tab === 'asientos' && (
            <AsientosTab clientId={clientId} accounts={accounts} />
          )}
          {tab === 'mayor' && (
            <MayorTab clientId={clientId} accounts={accounts} />
          )}
          {tab === 'balance' && <BalanceTab clientId={clientId} />}
        </>
      )}
    </div>
  );
}
