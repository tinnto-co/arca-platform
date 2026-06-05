import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  Scale,
  List,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Building2,
  Layers,
  Lock,
  CalendarDays,
  CalendarPlus,
  LockOpen,
  History,
  Copy,
  Ban,
  ChevronLeft,
  X,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  listAccountingClients,
  getCurrentRole,
  getChartOfAccounts,
  getAccountMovementCounts,
  setAccountActive,
  createCustomAccount,
  renameBaseAccount,
  revertBaseAccountRename,
  createBaseAccount,
  updateBaseAccount,
  deleteBaseAccount,
  getFiscalYears,
  createFiscalYear,
  getFiscalYearDetail,
  closePeriod,
  reopenPeriod,
  getAccountingLog,
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  voidJournalEntry,
  getJournalEntry,
  getPostableAccounts,
  getLedgerAccount,
  getLedgerConsolidated,
  type ChartAccount,
  type PeriodView,
  type LedgerRow,
  type ConsolidatedAccount,
} from '@/actions/accounting';
import {
  exportMayorExcel,
  exportMayorPdf,
  type MayorExportData,
  type MayorSection,
} from '@/lib/mayor-export';
import {
  ACCOUNT_GROUP_LABELS,
  ACCOUNT_GROUP_SECTIONS,
  ACCOUNT_TYPE_LABELS,
  EXPECTED_BALANCE_LABELS,
  EXPENSE_FUNCTION_LABELS,
  CUSTOM_CODE_PREFIX,
  MONTH_NAMES,
  FISCAL_YEAR_STATUS_LABELS,
  JOURNAL_ORIGIN_LABELS,
  type AccountGroup,
} from '@/lib/accounting-labels';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

/* ─── Shared styles ─── */
const SELECT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';
const INPUT_CLASS =
  'h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none';

/* ─── Badges ─── */
function TypeBadge({ type }: { type: 'imputable' | 'group' }) {
  const color =
    type === 'imputable' ? 'oklch(0.45 0.10 220)' : 'oklch(0.50 0.02 260)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 88%)`,
        color,
      }}
    >
      {ACCOUNT_TYPE_LABELS[type]}
    </span>
  );
}

function OriginBadge({ scope }: { scope: 'base' | 'custom' }) {
  const color =
    scope === 'custom' ? 'oklch(0.50 0.13 50)' : 'oklch(0.45 0.04 250)';
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 88%)`,
        color,
      }}
    >
      {scope === 'custom' ? 'Propia' : 'Base'}
    </span>
  );
}

/* ─── Tab bar ─── */
type Tab = 'plan' | 'ejercicios' | 'asientos' | 'mayor' | 'balance';

function TabBar({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: {
    id: Tab;
    label: string;
    icon: React.ElementType;
    ready: boolean;
  }[] = [
    { id: 'plan', label: 'Plan de cuentas', icon: List, ready: true },
    { id: 'ejercicios', label: 'Ejercicios', icon: CalendarDays, ready: true },
    { id: 'asientos', label: 'Asientos', icon: FileText, ready: true },
    { id: 'mayor', label: 'Mayor', icon: BookOpen, ready: true },
    { id: 'balance', label: 'Balance', icon: Scale, ready: false },
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
          {!tab.ready && (
            <span className="text-[9px] px-1 py-px rounded-full bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
              pronto
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ─── Page ─── */
function AccountingPage() {
  const [tab, setTab] = useState<Tab>('plan');
  const [clientId, setClientId] = useState<string>('');

  const { data: clients = [] } = useQuery({
    queryKey: ['accounting', 'clients'],
    queryFn: () => listAccountingClients(),
  });
  const { data: roleData } = useQuery({
    queryKey: ['accounting', 'role'],
    queryFn: () => getCurrentRole(),
  });
  const isOwner = roleData?.role === 'owner';

  const effectiveClientId = clientId || clients[0]?.id || '';

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Scale}
        title="Balances y Estados Contables"
        subtitle="Plan de cuentas, libro diario, mayor y Estados Contables"
        actions={
          <div className="flex items-center gap-2">
            <Building2
              className="w-4 h-4 text-[var(--arca-ink-3)]"
              strokeWidth={1.8}
            />
            <select
              value={effectiveClientId}
              onChange={(e) => setClientId(e.target.value)}
              className={`${SELECT_CLASS} max-w-[260px]`}
            >
              {clients.length === 0 && <option value="">Sin empresas</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.identityNumber}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <TabBar active={tab} onChange={setTab} />

      {!effectiveClientId ? (
        <ArcaCard>
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay empresas fiscales cargadas en el estudio.
          </div>
        </ArcaCard>
      ) : tab === 'plan' ? (
        <PlanDeCuentas clientId={effectiveClientId} isOwner={isOwner} />
      ) : tab === 'ejercicios' ? (
        <Ejercicios clientId={effectiveClientId} isOwner={isOwner} />
      ) : tab === 'asientos' ? (
        <Asientos clientId={effectiveClientId} canWrite={roleData?.role !== 'viewer'} />
      ) : tab === 'mayor' ? (
        <Mayor
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={clients.find((c) => c.id === effectiveClientId)?.name ?? ''}
        />
      ) : (
        <ArcaCard>
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Esta sección se construye en una fase próxima del módulo.
          </div>
        </ArcaCard>
      )}
    </div>
  );
}

/* ─── Plan de cuentas ─── */
type FormMode =
  | { kind: 'custom' }
  | { kind: 'base-create' }
  | { kind: 'base-edit'; account: ChartAccount };

function PlanDeCuentas({
  clientId,
  isOwner,
}: {
  clientId: string;
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [rubro, setRubro] = useState<string>('');
  const [onlyActive, setOnlyActive] = useState(false);
  const [origin, setOrigin] = useState<'all' | 'base' | 'custom'>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [renameTarget, setRenameTarget] = useState<ChartAccount | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ChartAccount | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<ChartAccount | null>(null);

  const queryKey = ['accounting', 'chart', clientId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey });
  };

  const accounts = data?.accounts ?? [];

  const setActiveMut = useMutation({
    mutationFn: (args: { accountId: string; isActive: boolean }) =>
      setAccountActive({ data: { clientId, ...args } }),
    onSuccess: () => {
      invalidate();
      setDeactivateTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* Build hierarchy maps */
  const childrenByParent = useMemo(() => {
    const m = new Map<string | null, ChartAccount[]>();
    for (const a of accounts) {
      const key = a.parentId;
      const list = m.get(key) ?? [];
      list.push(a);
      m.set(key, list);
    }
    return m;
  }, [accounts]);

  const byId = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  const filterActive =
    !!search.trim() || !!rubro || onlyActive || origin !== 'all';

  /* Compute which accounts are visible under the active filters (matches + ancestors) */
  const visibleIds = useMemo(() => {
    if (!filterActive) return null; // null = show all
    const q = search.trim().toLowerCase();
    const matches = accounts.filter((a) => {
      if (
        q &&
        !a.code.toLowerCase().includes(q) &&
        !a.name.toLowerCase().includes(q)
      )
        return false;
      if (rubro && a.accountGroup !== rubro) return false;
      if (onlyActive && !a.isActive) return false;
      if (origin !== 'all' && a.scope !== origin) return false;
      return true;
    });
    const ids = new Set<string>();
    for (const m of matches) {
      ids.add(m.id);
      let p = m.parentId;
      while (p && !ids.has(p)) {
        ids.add(p);
        p = byId.get(p)?.parentId ?? null;
      }
    }
    return ids;
  }, [accounts, search, rubro, onlyActive, origin, filterActive, byId]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const expandAll = () => setExpanded(new Set(accounts.map((a) => a.id)));
  const collapseAll = () => setExpanded(new Set());

  function onToggleActive(account: ChartAccount) {
    if (account.isActive) {
      // Desactivar → confirmación con conteo de movimientos.
      setDeactivateTarget(account);
    } else {
      setActiveMut.mutate({ accountId: account.id, isActive: true });
    }
  }

  /* Recursive row renderer */
  function renderNode(account: ChartAccount, depth: number): React.ReactNode {
    if (visibleIds && !visibleIds.has(account.id)) return null;
    const children = childrenByParent.get(account.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded =
      expanded.has(account.id) || (filterActive && visibleIds?.has(account.id));

    return (
      <div key={account.id}>
        <div
          className="group flex items-center gap-2.5 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[100ms]"
          style={{ paddingLeft: `${16 + depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(account.id)}
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

          <span className="w-24 shrink-0 text-[11.5px] font-mono text-[var(--arca-ink-3)]">
            {account.code}
          </span>

          <span
            className={`flex-1 min-w-0 truncate text-[13px] ${account.type === 'group' ? 'font-semibold' : 'font-medium'} ${
              account.isActive
                ? 'text-[var(--arca-ink)]'
                : 'text-[var(--arca-ink-3)] line-through'
            }`}
            title={
              account.isRenamed ? `Nombre base: ${account.baseName}` : undefined
            }
          >
            {account.name}
            {account.isRenamed && (
              <span className="ml-1.5 text-[10px] text-[var(--arca-ink-3)] font-normal">
                (renombrada)
              </span>
            )}
            {account.isSystemAccount && (
              <Lock
                className="inline-block ml-1.5 w-3 h-3 text-[var(--arca-ink-3)] align-[-1px]"
                strokeWidth={1.8}
              />
            )}
          </span>

          {/* Rubro — columna fija */}
          <span className="hidden md:block w-[156px] shrink-0 truncate text-right text-[10.5px] text-[var(--arca-ink-3)]">
            {account.accountGroup
              ? ACCOUNT_GROUP_LABELS[account.accountGroup as AccountGroup]
              : ''}
          </span>

          {/* Movimientos — columna fija */}
          <span className="w-[60px] shrink-0 flex justify-center">
            {account.hasMovements && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{
                  background:
                    'color-mix(in oklch, oklch(0.45 0.14 145), transparent 88%)',
                  color: 'oklch(0.40 0.14 145)',
                }}
                title="Tiene movimientos en el ejercicio actual"
              >
                con mov.
              </span>
            )}
          </span>

          {/* Tipo — columna fija */}
          <span className="w-[88px] shrink-0 flex justify-start">
            <TypeBadge type={account.type} />
          </span>

          {/* Origen — columna fija */}
          <span className="w-[52px] shrink-0 flex justify-start">
            <OriginBadge scope={account.scope} />
          </span>

          {isOwner && (
            <div className="w-[176px] shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Renombrar (solo cuentas base no-sistema) */}
              {account.scope === 'base' && !account.isSystemAccount && (
                <>
                  <IconBtn
                    title="Renombrar para esta empresa"
                    onClick={() => setRenameTarget(account)}
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} />
                  </IconBtn>
                  {account.isRenamed && (
                    <IconBtn
                      title="Revertir al nombre base"
                      onClick={() =>
                        revertBaseAccountRename({
                          data: { clientId, accountId: account.id },
                        })
                          .then(invalidate)
                          .catch((e: Error) => toast.error(e.message))
                      }
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.8} />
                    </IconBtn>
                  )}
                </>
              )}
              {/* Editar / borrar cuenta base (plan del estudio) */}
              {account.scope === 'base' && !account.isSystemAccount && (
                <IconBtn
                  title="Editar en el plan base del estudio"
                  onClick={() => setFormMode({ kind: 'base-edit', account })}
                >
                  <Layers className="w-3.5 h-3.5" strokeWidth={1.8} />
                </IconBtn>
              )}
              {account.scope === 'custom' && (
                <IconBtn
                  title="Borrar cuenta propia"
                  onClick={() => setDeleteTarget(account)}
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                </IconBtn>
              )}
              {/* Activar / desactivar */}
              {!account.isSystemAccount && (
                <button
                  onClick={() => onToggleActive(account)}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
                >
                  {account.isActive ? 'Desactivar' : 'Activar'}
                </button>
              )}
            </div>
          )}
        </div>

        {isExpanded && children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  }

  const roots = childrenByParent.get(null) ?? [];

  return (
    <>
      <ArcaCard>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--arca-ink-3)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar código o nombre…"
              className={`${INPUT_CLASS} pl-7 w-56`}
            />
          </div>

          <select
            value={rubro}
            onChange={(e) => setRubro(e.target.value)}
            className={`${SELECT_CLASS} w-52`}
          >
            <option value="">Todos los rubros</option>
            {ACCOUNT_GROUP_SECTIONS.map((sec) => (
              <optgroup key={sec.section} label={sec.section}>
                {sec.groups.map((g) => (
                  <option key={g} value={g}>
                    {ACCOUNT_GROUP_LABELS[g]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <select
            value={origin}
            onChange={(e) =>
              setOrigin(e.target.value as 'all' | 'base' | 'custom')
            }
            className={`${SELECT_CLASS} w-32`}
          >
            <option value="all">Base y propias</option>
            <option value="base">Solo base</option>
            <option value="custom">Solo propias</option>
          </select>

          <label className="flex items-center gap-1.5 text-[12px] text-[var(--arca-ink-2)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="accent-[var(--arca-navy-900)]"
            />
            Solo activas
          </label>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={expandAll}
              className="h-7 px-2.5 text-[11.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
            >
              Expandir
            </button>
            <button
              onClick={collapseAll}
              className="h-7 px-2.5 text-[11.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors"
            >
              Colapsar
            </button>
            {isOwner && (
              <>
                <button
                  onClick={() => setFormMode({ kind: 'base-create' })}
                  className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
                >
                  <Layers className="w-3 h-3" strokeWidth={2} />
                  Plan base
                </button>
                <button
                  onClick={() => setFormMode({ kind: 'custom' })}
                  className="flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                  Nueva cuenta propia
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando plan de cuentas…
          </div>
        ) : roots.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            El plan de cuentas base aún no está sembrado para este estudio.
          </div>
        ) : (
          <div>{roots.map((r) => renderNode(r, 0))}</div>
        )}
      </ArcaCard>

      {/* Crear/editar cuenta */}
      {formMode && (
        <AccountFormDialog
          mode={formMode}
          clientId={clientId}
          accounts={accounts}
          onClose={() => setFormMode(null)}
          onSaved={() => {
            setFormMode(null);
            invalidate();
          }}
        />
      )}

      {/* Renombrar */}
      {renameTarget && (
        <RenameDialog
          clientId={clientId}
          account={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={() => {
            setRenameTarget(null);
            invalidate();
          }}
        />
      )}

      {/* Confirmar desactivación */}
      {deactivateTarget && (
        <DeactivateDialog
          clientId={clientId}
          account={deactivateTarget}
          pending={setActiveMut.isPending}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() =>
            setActiveMut.mutate({
              accountId: deactivateTarget.id,
              isActive: false,
            })
          }
        />
      )}

      {/* Confirmar borrado de cuenta propia */}
      {deleteTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Borrar cuenta propia</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Borrar la cuenta{' '}
                <strong>
                  {deleteTarget.code} · {deleteTarget.name}
                </strong>
                ? No se puede borrar si tiene movimientos o subcuentas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deleteBaseAccount({ data: { id: deleteTarget.id } })
                    .then(() => {
                      toast.success('Cuenta borrada');
                      setDeleteTarget(null);
                      invalidate();
                    })
                    .catch((e: Error) => toast.error(e.message))
                }
              >
                Borrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] hover:bg-[var(--arca-surface)] transition-colors"
    >
      {children}
    </button>
  );
}

/* ─── Rename dialog (US 1.1.4) ─── */
function RenameDialog({
  clientId,
  account,
  onClose,
  onSaved,
}: {
  clientId: string;
  account: ChartAccount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account.name);
  const mut = useMutation({
    mutationFn: () =>
      renameBaseAccount({
        data: { clientId, accountId: account.id, customName: name.trim() },
      }),
    onSuccess: () => {
      toast.success('Cuenta renombrada para esta empresa');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Renombrar cuenta</DialogTitle>
          <DialogDescription>
            El nuevo nombre aplica solo a esta empresa. El plan base del estudio
            y las demás empresas no se modifican.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <p className="text-[12px] text-[var(--arca-ink-3)]">
            Nombre base: <span className="font-medium">{account.baseName}</span>
          </p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${INPUT_CLASS} w-full h-9`}
            placeholder="Nombre para esta empresa"
          />
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Deactivate confirmation (US 1.1.2) ─── */
function DeactivateDialog({
  clientId,
  account,
  pending,
  onCancel,
  onConfirm,
}: {
  clientId: string;
  account: ChartAccount;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'movement-counts', clientId, account.id],
    queryFn: () =>
      getAccountMovementCounts({ data: { clientId, accountId: account.id } }),
  });
  const blocked = (data?.currentYear ?? 0) > 0;

  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar cuenta</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Cuenta{' '}
                <strong>
                  {account.code} · {account.name}
                </strong>
                .
              </p>
              {isLoading ? (
                <p>Calculando movimientos…</p>
              ) : blocked ? (
                <p className="text-[var(--arca-danger,oklch(0.55_0.18_25))]">
                  No se puede desactivar: tiene {data?.currentYear}{' '}
                  movimiento(s) en el ejercicio actual.
                </p>
              ) : (
                <p>
                  Movimientos pasados (ejercicios anteriores):{' '}
                  <strong>{data?.past ?? 0}</strong>. La cuenta dejará de estar
                  disponible para esta empresa, sin afectar a las demás.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked || pending || isLoading}
            onClick={onConfirm}
          >
            Desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Create / edit account dialog (US 1.1.3 custom, US 1.1.5 base) ─── */
function AccountFormDialog({
  mode,
  clientId,
  accounts,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  clientId: string;
  accounts: ChartAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = mode.kind === 'base-edit' ? mode.account : null;
  const isCustom = mode.kind === 'custom';

  const [code, setCode] = useState(
    editing?.code ?? (isCustom ? CUSTOM_CODE_PREFIX : '')
  );
  const [name, setName] = useState(editing?.name ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [type, setType] = useState<'imputable' | 'group'>(
    editing?.type ?? 'imputable'
  );
  const [accountGroup, setAccountGroup] = useState<string>(
    editing?.accountGroup ?? ''
  );
  const [expectedBalance, setExpectedBalance] = useState<string>(
    editing?.expectedBalance ?? ''
  );
  const [expenseFunction, setExpenseFunction] = useState<string>(
    editing?.expenseFunction ?? ''
  );
  const [parentId, setParentId] = useState<string>(editing?.parentId ?? '');

  const title =
    mode.kind === 'custom'
      ? 'Nueva cuenta propia'
      : mode.kind === 'base-create'
        ? 'Nueva cuenta del plan base'
        : 'Editar cuenta del plan base';

  const isExpenseGroup =
    accountGroup === 'gastos_administracion' ||
    accountGroup === 'gastos_comercializacion' ||
    accountGroup === 'gastos_financieros' ||
    accountGroup === 'costo_ventas' ||
    accountGroup === 'otros_resultados_neg';

  const mut = useMutation({
    mutationFn: () => {
      const groupVal = accountGroup || undefined;
      const balVal = (expectedBalance || undefined) as
        | 'debit'
        | 'credit'
        | 'both'
        | undefined;
      const expVal = (expenseFunction || undefined) as
        | 'administration'
        | 'sales'
        | 'financial'
        | 'other'
        | undefined;
      if (mode.kind === 'custom') {
        return createCustomAccount({
          data: {
            clientId,
            code,
            name,
            type,
            accountGroup: groupVal,
            expectedBalance: balVal,
            expenseFunction: expVal,
            description: description || undefined,
            parentId: parentId || undefined,
          },
        });
      }
      if (mode.kind === 'base-create') {
        return createBaseAccount({
          data: {
            code,
            name,
            type,
            accountGroup: groupVal,
            expectedBalance: balVal,
            expenseFunction: expVal,
            description: description || undefined,
            parentId: parentId || undefined,
          },
        });
      }
      return updateBaseAccount({
        data: {
          id: editing!.id,
          name,
          description: description || null,
          type,
          accountGroup: groupVal,
          expectedBalance: balVal,
          expenseFunction: expVal ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success('Guardado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const parentOptions = accounts.filter(
    (a) => a.type === 'group' && a.id !== editing?.id
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode.kind === 'base-create' && (
            <DialogDescription>
              Se agrega al plan del estudio y aparece{' '}
              <strong>inactiva por default</strong> en todas las empresas.
            </DialogDescription>
          )}
          {mode.kind === 'custom' && (
            <DialogDescription>
              Cuenta propia de esta empresa. El código debe estar en el rango
              reservado (empieza con &quot;{CUSTOM_CODE_PREFIX}&quot;).
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1">
          <Field label="Código *">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={mode.kind === 'base-edit'}
              placeholder={isCustom ? '9.1.01' : '1.1.07'}
              className={`${INPUT_CLASS} w-full h-9 disabled:opacity-60`}
            />
          </Field>
          <Field label="Tipo *">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'imputable' | 'group')}
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="imputable">Imputable (admite movimientos)</option>
              <option value="group">Agrupación (solo suma)</option>
            </select>
          </Field>

          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la cuenta"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>

          <Field label="Rubro de exposición" full>
            <select
              value={accountGroup}
              onChange={(e) => setAccountGroup(e.target.value)}
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="">— Sin rubro (solo agrupaciones) —</option>
              {ACCOUNT_GROUP_SECTIONS.map((sec) => (
                <optgroup key={sec.section} label={sec.section}>
                  {sec.groups.map((g) => (
                    <option key={g} value={g}>
                      {ACCOUNT_GROUP_LABELS[g]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Saldo esperado">
            <select
              value={expectedBalance}
              onChange={(e) => setExpectedBalance(e.target.value)}
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="">—</option>
              {(['debit', 'credit', 'both'] as const).map((b) => (
                <option key={b} value={b}>
                  {EXPECTED_BALANCE_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>

          {isExpenseGroup && (
            <Field label="Clasificación de gasto">
              <select
                value={expenseFunction}
                onChange={(e) => setExpenseFunction(e.target.value)}
                className={`${SELECT_CLASS} w-full h-9`}
              >
                <option value="">—</option>
                {(
                  ['administration', 'sales', 'financial', 'other'] as const
                ).map((f) => (
                  <option key={f} value={f}>
                    {EXPENSE_FUNCTION_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {mode.kind !== 'base-edit' && (
            <Field label="Cuenta padre" full>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className={`${SELECT_CLASS} w-full h-9`}
              >
                <option value="">— Ninguna —</option>
                {parentOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Descripción" full>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={
              !name.trim() ||
              (mode.kind !== 'base-edit' && !code.trim()) ||
              (type === 'imputable' && (!accountGroup || !expectedBalance)) ||
              mut.isPending
            }
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'col-span-2' : ''}`}>
      <label className="text-[11px] text-[var(--arca-ink-3)]">{label}</label>
      {children}
    </div>
  );
}

/* ════════════════════ Ejercicios y períodos (US 1.2.x) ════════════════════ */

function fmtFecha(d: string | Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function fmtMoney(n: number) {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Primer día del mes (YYYY-MM-01) de una fecha YYYY-MM-DD. */
function firstOfMonth(dateStr: string): string {
  if (!dateStr) return '';
  return `${dateStr.slice(0, 7)}-01`;
}

/** Último día del mes 12 del ejercicio que empieza en startStr (día 1). */
function computeEnd(startStr: string): string {
  const first = firstOfMonth(startStr);
  if (!first) return '';
  const d = new Date(`${first}T00:00:00Z`);
  if (isNaN(d.getTime())) return '';
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 12, 0));
  return end.toISOString().slice(0, 10);
}

function Ejercicios({ clientId, isOwner }: { clientId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const [selectedFyId, setSelectedFyId] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<PeriodView | null>(null);
  const [closeTarget, setCloseTarget] = useState<PeriodView | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });

  const effectiveFyId =
    selectedFyId !== ''
      ? selectedFyId
      : (fiscalYears.find((y) => y.status === 'open')?.id ??
        fiscalYears[0]?.id ??
        '');

  const { data: detail } = useQuery({
    queryKey: ['accounting', 'fy-detail', effectiveFyId],
    queryFn: () => getFiscalYearDetail({ data: { fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const { data: log = [] } = useQuery({
    queryKey: ['accounting', 'fy-log', effectiveFyId],
    queryFn: () => getAccountingLog({ data: { fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const closeMut = useMutation({
    mutationFn: (periodId: string) => closePeriod({ data: { periodId } }),
    onSuccess: () => {
      toast.success('Período cerrado');
      setCloseTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (fiscalYears.length === 0) {
    return (
      <>
        <ArcaCard>
          <div className="px-5 py-12 text-center">
            <CalendarDays
              className="w-8 h-8 mx-auto mb-3 text-[var(--arca-ink-3)]"
              strokeWidth={1.5}
            />
            <p className="text-[13px] text-[var(--arca-ink-2)] mb-1">
              Esta empresa todavía no tiene ningún ejercicio contable.
            </p>
            <p className="text-[12px] text-[var(--arca-ink-3)] mb-4">
              Creá el primer ejercicio para empezar a cargar asientos.
            </p>
            {isOwner && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
              >
                <CalendarPlus className="w-3.5 h-3.5" strokeWidth={2} />
                Crear ejercicio
              </button>
            )}
          </div>
        </ArcaCard>
        {showCreate && (
          <CreateFiscalYearDialog
            clientId={clientId}
            onClose={() => setShowCreate(false)}
            onSaved={() => {
              setShowCreate(false);
              invalidate();
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {/* Selector de ejercicios */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {fiscalYears.map((y) => {
          const active = y.id === effectiveFyId;
          return (
            <button
              key={y.id}
              onClick={() => setSelectedFyId(y.id)}
              className="flex items-center gap-2 h-9 px-3 rounded-[10px] border transition-colors text-[12.5px]"
              style={{
                borderColor: active ? 'var(--arca-ink)' : 'var(--arca-border)',
                background: active ? 'var(--arca-surface-2)' : 'var(--arca-surface)',
                color: active ? 'var(--arca-ink)' : 'var(--arca-ink-2)',
              }}
            >
              <span className="font-semibold">Ejercicio N°{y.number}</span>
              <span className="text-[var(--arca-ink-3)]">
                {fmtFecha(y.startDate)} – {fmtFecha(y.endDate)}
              </span>
              <FyStatusBadge status={y.status} />
              <span className="text-[11px] text-[var(--arca-ink-3)]">
                {y.periodsClosed}/{y.periodsTotal} cerrados
              </span>
            </button>
          );
        })}
        {isOwner && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 h-9 px-3 text-[12.5px] font-medium rounded-[10px] border border-dashed border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
          >
            <CalendarPlus className="w-3.5 h-3.5" strokeWidth={2} />
            Nuevo ejercicio
          </button>
        )}
      </div>

      {/* Períodos del ejercicio seleccionado */}
      {detail && (
        <ArcaCard>
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--arca-border)]">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Períodos · Ejercicio N°{detail.fiscalYear.number}
            </span>
            <FyStatusBadge status={detail.fiscalYear.status} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {detail.periods.map((p) => (
              <PeriodCard
                key={p.id}
                period={p}
                isOwner={isOwner}
                onClose={() => setCloseTarget(p)}
                onReopen={() => setReopenTarget(p)}
              />
            ))}
          </div>
        </ArcaCard>
      )}

      {/* Log auditable */}
      {log.length > 0 && (
        <ArcaCard className="mt-4">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--arca-border)]">
            <History className="w-4 h-4 text-[var(--arca-ink-3)]" strokeWidth={1.8} />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Historial de cierres y reaperturas
            </span>
          </div>
          <div className="divide-y divide-[var(--arca-border)]">
            {log.map((e) => (
              <div key={e.id} className="flex items-start gap-3 px-5 py-2.5 text-[12px]">
                <span
                  className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
                  style={{
                    background:
                      e.eventType === 'period_reopened'
                        ? 'color-mix(in oklch, oklch(0.55 0.15 50), transparent 88%)'
                        : 'color-mix(in oklch, oklch(0.45 0.04 250), transparent 88%)',
                    color:
                      e.eventType === 'period_reopened'
                        ? 'oklch(0.45 0.15 50)'
                        : 'oklch(0.40 0.04 250)',
                  }}
                >
                  {e.eventType === 'period_reopened' ? 'Reapertura' : 'Cierre'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-[var(--arca-ink)]">
                    {e.eventData?.month
                      ? `${MONTH_NAMES[e.eventData.month]} ${e.eventData.year}`
                      : 'Período'}
                  </span>
                  {e.eventData?.reason && (
                    <span className="text-[var(--arca-ink-3)]">
                      {' '}
                      · Motivo: {e.eventData.reason}
                    </span>
                  )}
                  <span className="text-[var(--arca-ink-3)]">
                    {' '}
                    — {e.userName ?? e.userEmail ?? 'usuario'} ·{' '}
                    {new Date(e.createdAt).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ArcaCard>
      )}

      {showCreate && (
        <CreateFiscalYearDialog
          clientId={clientId}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            invalidate();
          }}
        />
      )}

      {/* Confirmar cierre */}
      {closeTarget && (
        <AlertDialog open onOpenChange={(o) => !o && setCloseTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cerrar período</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a cerrar{' '}
                <strong>
                  {MONTH_NAMES[closeTarget.month]} {closeTarget.year}
                </strong>
                . Sus {closeTarget.entryCount} asiento(s) quedarán inmutables y se
                habilitará el período siguiente. Esta acción queda registrada en el log.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={closeMut.isPending}
                onClick={() => closeMut.mutate(closeTarget.id)}
              >
                Cerrar período
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reabrir período */}
      {reopenTarget && (
        <ReopenPeriodDialog
          period={reopenTarget}
          onClose={() => setReopenTarget(null)}
          onSaved={() => {
            setReopenTarget(null);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function FyStatusBadge({ status }: { status: 'open' | 'closing' | 'closed' }) {
  const color =
    status === 'open'
      ? 'oklch(0.45 0.14 145)'
      : status === 'closing'
        ? 'oklch(0.55 0.15 50)'
        : 'oklch(0.50 0.02 260)';
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 86%)`,
        color,
      }}
    >
      {FISCAL_YEAR_STATUS_LABELS[status]}
    </span>
  );
}

function PeriodCard({
  period,
  isOwner,
  onClose,
  onReopen,
}: {
  period: PeriodView;
  isOwner: boolean;
  onClose: () => void;
  onReopen: () => void;
}) {
  const closed = period.status === 'closed';
  const estado = closed
    ? { label: 'Cerrado', color: 'oklch(0.50 0.02 260)' }
    : period.isCurrent
      ? { label: 'Abierto · actual', color: 'oklch(0.45 0.14 145)' }
      : { label: 'Por abrir', color: 'oklch(0.55 0.02 260)' };

  return (
    <div
      className="rounded-[10px] border p-3 flex flex-col gap-2"
      style={{
        borderColor: period.isCurrent ? 'oklch(0.45 0.14 145)' : 'var(--arca-border)',
        background: period.isCurrent
          ? 'color-mix(in oklch, oklch(0.45 0.14 145), transparent 95%)'
          : 'var(--arca-surface)',
        boxShadow: period.isCurrent
          ? '0 0 0 1px color-mix(in oklch, oklch(0.45 0.14 145), transparent 70%)'
          : 'none',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          {MONTH_NAMES[period.month]} {period.year}
        </span>
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
          style={{
            background: `color-mix(in oklch, ${estado.color}, transparent 86%)`,
            color: estado.color,
          }}
        >
          {closed ? (
            <Lock className="w-2.5 h-2.5" strokeWidth={2} />
          ) : (
            <LockOpen className="w-2.5 h-2.5" strokeWidth={2} />
          )}
          {estado.label}
        </span>
      </div>

      <div className="text-[11.5px] text-[var(--arca-ink-3)]">
        {period.entryCount} asiento{period.entryCount === 1 ? '' : 's'} · ${' '}
        {fmtMoney(period.totalAmount)}
      </div>

      {isOwner && (
        <div className="mt-1">
          {period.isCurrent && (
            <button
              onClick={onClose}
              className="w-full h-7 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
            >
              Cerrar período
            </button>
          )}
          {closed && (
            <button
              onClick={onReopen}
              className="w-full h-7 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              Reabrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateFiscalYearDialog({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState('');
  const startFirst = firstOfMonth(start);
  const end = computeEnd(start);

  const mut = useMutation({
    mutationFn: () =>
      createFiscalYear({ data: { clientId, startDate: startFirst, endDate: end } }),
    onSuccess: () => {
      toast.success('Ejercicio creado con sus 12 períodos');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Nuevo ejercicio</DialogTitle>
          <DialogDescription>
            Elegí el mes de inicio. El ejercicio dura exactamente 12 meses calendario y se
            crean automáticamente los 12 períodos mensuales.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--arca-ink-3)]">
              Mes de inicio *
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </div>

          {startFirst && end && (
            <div className="rounded-[8px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-3 py-2.5 text-[12.5px]">
              <span className="text-[var(--arca-ink-3)]">Ejercicio: </span>
              <span className="font-medium text-[var(--arca-ink)]">
                {fmtFecha(`${startFirst}T00:00:00Z`)} → {fmtFecha(`${end}T00:00:00Z`)}
              </span>
              <span className="text-[var(--arca-ink-3)]"> (12 meses)</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!startFirst || !end || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Creando…' : 'Crear ejercicio'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenPeriodDialog({
  period,
  onClose,
  onSaved,
}: {
  period: PeriodView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => reopenPeriod({ data: { periodId: period.id, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Período reabierto');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            Reabrir {MONTH_NAMES[period.month]} {period.year}
          </DialogTitle>
          <DialogDescription>
            El período vuelve a estado abierto y sus asientos se conservan. El motivo queda
            registrado en el log auditable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">Motivo *</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Ej: corrección de un asiento mal imputado…"
            className="w-full px-2.5 py-2 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none resize-none"
          />
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!reason.trim() || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Reabriendo…' : 'Reabrir período'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════ Asientos / Libro diario (US 1.3.x) ════════════════════ */

interface PostableAccount {
  id: string;
  code: string;
  name: string;
  accountGroup: string | null;
}
interface LineDraft {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

/** parseFloat seguro: NaN/'' → 0. */
function num(v: string): number {
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

interface EditorInitial {
  id?: string;
  entryDate?: string;
  description?: string;
  lines: LineDraft[];
}
type EditorState =
  | { mode: 'create'; initial?: EditorInitial }
  | { mode: 'edit'; initial: EditorInitial }
  | { mode: 'duplicate'; initial: EditorInitial };

function Asientos({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountId, setAccountId] = useState('');
  const [origin, setOrigin] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [sortBy, setSortBy] = useState<'number' | 'date'>('number');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  const filters = {
    clientId,
    from: from || undefined,
    to: to || undefined,
    accountId: accountId || undefined,
    origin: (origin || undefined) as never,
    includeVoided,
    sortBy,
    sortDir,
    page,
    pageSize,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'entries', filters],
    queryFn: () => listJournalEntries({ data: filters }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function openEditorFromDetail(action: 'edit' | 'duplicate', d: EditorInitial) {
    setDetailId(null);
    setEditor({ mode: action, initial: d });
  }

  return (
    <>
      <ArcaCard>
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className={`${INPUT_CLASS} w-36`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className={`${INPUT_CLASS} w-36`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Cuenta</label>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPage(1);
              }}
              className={`${SELECT_CLASS} w-52`}
            >
              <option value="">Todas las cuentas</option>
              {postable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Origen</label>
            <select
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setPage(1);
              }}
              className={`${SELECT_CLASS} w-36`}
            >
              <option value="">Todos</option>
              {Object.entries(JOURNAL_ORIGIN_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-[var(--arca-ink-2)] cursor-pointer select-none h-8">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(e) => {
                setIncludeVoided(e.target.checked);
                setPage(1);
              }}
              className="accent-[var(--arca-navy-900)]"
            />
            Incluir anulados
          </label>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [b, d2] = e.target.value.split(':');
                setSortBy(b as 'number' | 'date');
                setSortDir(d2 as 'asc' | 'desc');
              }}
              className={`${SELECT_CLASS} w-44`}
            >
              <option value="number:desc">N° (desc)</option>
              <option value="number:asc">N° (asc)</option>
              <option value="date:desc">Fecha (desc)</option>
              <option value="date:asc">Fecha (asc)</option>
            </select>
            {canWrite && (
              <button
                onClick={() => setEditor({ mode: 'create' })}
                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} />
                Nuevo asiento
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          <div className="w-12 shrink-0">N°</div>
          <div className="w-24 shrink-0">Fecha</div>
          <div className="flex-1 min-w-0">Descripción</div>
          <div className="w-28 shrink-0 text-right">Total</div>
          <div className="w-28 shrink-0">Origen</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando asientos…
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay asientos para los filtros seleccionados.
          </div>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setDetailId(r.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-left"
            >
              <div className="w-12 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
                {r.number}
              </div>
              <div className="w-24 shrink-0 text-[12px] text-[var(--arca-ink-2)]">
                {fmtFecha(r.entryDate)}
              </div>
              <div
                className={`flex-1 min-w-0 truncate text-[13px] ${
                  r.isVoided
                    ? 'line-through text-[var(--arca-ink-3)]'
                    : 'text-[var(--arca-ink)]'
                }`}
              >
                {r.description?.trim() ? (
                  r.description
                ) : (
                  <span className="text-[var(--arca-ink-3)] italic">(sin descripción)</span>
                )}
                {r.isVoided && (
                  <span className="ml-2 text-[10px] not-italic no-underline text-[oklch(0.55_0.18_25)]">
                    ANULADO
                  </span>
                )}
              </div>
              <div className="w-28 shrink-0 text-right text-[12.5px] font-medium text-[var(--arca-ink)]">
                $ {fmtMoney(r.total)}
              </div>
              <div className="w-28 shrink-0">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                  {JOURNAL_ORIGIN_LABELS[r.origin] ?? r.origin}
                </span>
              </div>
            </button>
          ))
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 text-[12px] text-[var(--arca-ink-3)]">
            <span>{total} asiento{total === 1 ? '' : 's'}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 w-7 flex items-center justify-center rounded-[8px] border border-[var(--arca-border)] disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
              </button>
              <span>
                Página {page} de {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 w-7 flex items-center justify-center rounded-[8px] border border-[var(--arca-border)] disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}
      </ArcaCard>

      {editor && (
        <AsientoEditor
          clientId={clientId}
          state={editor}
          postable={postable}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}

      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onAction={openEditorFromDetail}
          onChanged={invalidate}
        />
      )}
    </>
  );
}

function emptyLine(): LineDraft {
  return { accountId: '', debit: '', credit: '', description: '' };
}

function AsientoEditor({
  clientId,
  state,
  postable,
  onClose,
  onSaved,
}: {
  clientId: string;
  state: EditorState;
  postable: PostableAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const init = state.initial;
  const [entryDate, setEntryDate] = useState(init?.entryDate ?? '');
  const [description, setDescription] = useState(init?.description ?? '');
  const [lines, setLines] = useState<LineDraft[]>(
    init?.lines && init.lines.length >= 2 ? init.lines : [emptyLine(), emptyLine()]
  );

  const title =
    state.mode === 'edit'
      ? `Editar asiento`
      : state.mode === 'duplicate'
        ? 'Duplicar asiento'
        : 'Nuevo asiento';

  const totalDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;
  const allLinesValid = lines.every(
    (l) => l.accountId && (num(l.debit) > 0) !== (num(l.credit) > 0)
  );
  const canSave = !!entryDate && lines.length >= 2 && balanced && allLinesValid;

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const mut = useMutation({
    mutationFn: async () => {
      const payloadLines = lines.map((l) => ({
        accountId: l.accountId,
        debit: num(l.debit),
        credit: num(l.credit),
        description: l.description || undefined,
      }));
      if (state.mode === 'edit' && init?.id) {
        await updateJournalEntry({
          data: { id: init.id, entryDate, description: description || undefined, lines: payloadLines },
        });
      } else {
        await createJournalEntry({
          data: { clientId, entryDate, description: description || undefined, lines: payloadLines },
        });
      }
    },
    onSuccess: () => {
      toast.success(state.mode === 'edit' ? 'Asiento actualizado' : 'Asiento guardado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Debe = Haber para poder guardar. Solo cuentas imputables y activas. La fecha define
            el período (no puede estar en un período cerrado).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 w-44">
              <label className="text-[11px] text-[var(--arca-ink-3)]">Fecha *</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className={`${INPUT_CLASS} w-full h-9`}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">Descripción</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Cobro factura A-0001 cliente X"
                className={`${INPUT_CLASS} w-full h-9`}
              />
            </div>
          </div>

          {/* Líneas */}
          <div className="border border-[var(--arca-border)] rounded-[10px] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-surface-2)] text-[10px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              <div className="flex-1">Cuenta</div>
              <div className="w-40">Detalle</div>
              <div className="w-24 text-right">Debe</div>
              <div className="w-24 text-right">Haber</div>
              <div className="w-6" />
            </div>
            {lines.map((l, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)]"
              >
                <select
                  value={l.accountId}
                  onChange={(e) => updateLine(i, { accountId: e.target.value })}
                  className={`${SELECT_CLASS} flex-1 min-w-0 w-0 h-8`}
                >
                  <option value="">— Elegí cuenta —</option>
                  {postable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
                <input
                  value={l.description}
                  onChange={(e) => updateLine(i, { description: e.target.value })}
                  placeholder="opcional"
                  className={`${INPUT_CLASS} w-40 h-8`}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.debit}
                  onChange={(e) => updateLine(i, { debit: e.target.value, credit: '' })}
                  className={`${INPUT_CLASS} w-24 h-8 text-right`}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.credit}
                  onChange={(e) => updateLine(i, { credit: e.target.value, debit: '' })}
                  className={`${INPUT_CLASS} w-24 h-8 text-right`}
                />
                <button
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={lines.length <= 2}
                  className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[oklch(0.55_0.18_25)] disabled:opacity-30"
                  title="Eliminar línea"
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
                </button>
              </div>
            ))}
            {/* Totales */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[12px] font-semibold">
              <button
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
                className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} /> Agregar línea
              </button>
              <div className="flex-1" />
              <div className="w-40" />
              <div className="w-24 text-right text-[var(--arca-ink)]">$ {fmtMoney(totalDebit)}</div>
              <div className="w-24 text-right text-[var(--arca-ink)]">$ {fmtMoney(totalCredit)}</div>
              <div className="w-6" />
            </div>
          </div>

          <div className="flex items-center justify-end text-[12px]">
            {balanced ? (
              <span className="text-[oklch(0.40_0.14_145)]">✓ Asiento balanceado</span>
            ) : (
              <span className="text-[oklch(0.55_0.18_25)]">
                Diferencia: $ {fmtMoney(Math.abs(totalDebit - totalCredit))} — Debe debe ser igual a Haber
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!canSave || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Guardar asiento'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AsientoDetail({
  entryId,
  canWrite,
  onClose,
  onAction,
  onChanged,
}: {
  entryId: string;
  canWrite: boolean;
  onClose: () => void;
  onAction: (action: 'edit' | 'duplicate', initial: EditorInitial) => void;
  onChanged: () => void;
}) {
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'entry', entryId],
    queryFn: () => getJournalEntry({ data: { id: entryId } }),
  });

  const voidMut = useMutation({
    mutationFn: () => voidJournalEntry({ data: { id: entryId, reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Asiento anulado');
      setVoidOpen(false);
      onChanged();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toInitial = (): EditorInitial => ({
    id: data!.entry.id,
    entryDate: new Date(data!.entry.entryDate).toISOString().slice(0, 10),
    description: data!.entry.description ?? '',
    lines: data!.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.debit > 0 ? String(l.debit) : '',
      credit: l.credit > 0 ? String(l.credit) : '',
      description: l.description ?? '',
    })),
  });

  const editable = !!data && !data.entry.isVoided && data.entry.periodStatus === 'open';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[680px]">
        {isLoading || !data ? (
          <div className="py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Asiento N°{data.entry.number}
                {data.entry.isVoided && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_88%)] text-[oklch(0.50_0.18_25)]">
                    Anulado
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                {fmtFecha(data.entry.entryDate)} ·{' '}
                {JOURNAL_ORIGIN_LABELS[data.entry.origin] ?? data.entry.origin} · Ejercicio N°
                {data.entry.fyNumber}
                {data.entry.createdByName ? ` · cargado por ${data.entry.createdByName}` : ''}
              </DialogDescription>
            </DialogHeader>

            {data.entry.description && (
              <p className="text-[13px] text-[var(--arca-ink)] -mt-1">
                {data.entry.description}
              </p>
            )}

            {data.entry.isVoided && data.entry.voidReason && (
              <div className="text-[12px] rounded-[8px] bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_92%)] text-[oklch(0.45_0.16_25)] px-3 py-2">
                Motivo de anulación: {data.entry.voidReason}
              </div>
            )}

            {/* Líneas */}
            <div className="border border-[var(--arca-border)] rounded-[10px] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-surface-2)] text-[10px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
                <div className="flex-1">Cuenta</div>
                <div className="w-28 text-right">Debe</div>
                <div className="w-28 text-right">Haber</div>
              </div>
              {data.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12.5px]"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-[11px] text-[var(--arca-ink-3)]">
                      {l.accountCode}
                    </span>{' '}
                    <span className="text-[var(--arca-ink)]">{l.accountName}</span>
                    {l.description && (
                      <span className="text-[var(--arca-ink-3)]"> · {l.description}</span>
                    )}
                  </div>
                  <div className="w-28 text-right text-[var(--arca-ink)]">
                    {l.debit > 0 ? `$ ${fmtMoney(l.debit)}` : ''}
                  </div>
                  <div className="w-28 text-right text-[var(--arca-ink)]">
                    {l.credit > 0 ? `$ ${fmtMoney(l.credit)}` : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* Log adjunto */}
            {data.log.length > 0 && (
              <div className="text-[11.5px] text-[var(--arca-ink-3)] space-y-1">
                {data.log.map((e) => (
                  <div key={e.id}>
                    {e.eventType === 'journal_entry_voided' ? 'Anulado' : 'Editado'} por{' '}
                    {e.userName ?? e.userEmail ?? 'usuario'} ·{' '}
                    {new Date(e.createdAt).toLocaleString('es-AR')}
                    {e.eventData?.reason ? ` · Motivo: ${e.eventData.reason}` : ''}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="flex-wrap">
              {canWrite && (
                <button
                  onClick={() => onAction('duplicate', { ...toInitial(), id: undefined, entryDate: '' })}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
                >
                  <Copy className="w-3.5 h-3.5" strokeWidth={1.8} /> Duplicar
                </button>
              )}
              {canWrite && editable && (
                <>
                  <button
                    onClick={() => setVoidOpen(true)}
                    className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[oklch(0.50_0.16_25)] hover:bg-[color-mix(in_oklch,oklch(0.55_0.18_25),transparent_92%)]"
                  >
                    <Ban className="w-3.5 h-3.5" strokeWidth={1.8} /> Anular
                  </button>
                  <button
                    onClick={() => onAction('edit', toInitial())}
                    className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} /> Editar
                  </button>
                </>
              )}
            </DialogFooter>

            {/* Sub-diálogo de anulación */}
            {voidOpen && (
              <div className="absolute inset-0 bg-[var(--arca-surface)]/95 rounded-[14px] flex items-center justify-center p-6">
                <div className="w-full max-w-[420px] space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[14px] font-semibold text-[var(--arca-ink)]">
                      Anular asiento N°{data.entry.number}
                    </h3>
                    <button onClick={() => setVoidOpen(false)}>
                      <X className="w-4 h-4 text-[var(--arca-ink-3)]" />
                    </button>
                  </div>
                  <p className="text-[12px] text-[var(--arca-ink-3)]">
                    El asiento no se borra: queda marcado como anulado y conserva su número. El
                    motivo queda en el log.
                  </p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Motivo de la anulación…"
                    className="w-full px-2.5 py-2 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setVoidOpen(false)}
                      className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-3)]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => voidMut.mutate()}
                      disabled={!reason.trim() || voidMut.isPending}
                      className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[oklch(0.50_0.16_25)] text-white disabled:opacity-50"
                    >
                      Anular asiento
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════ Mayor / Libro Mayor (US 2.1.x) ════════════════════════ */

function saldoLabel(n: number): string {
  if (Math.abs(n) < 0.005) return '$ 0,00';
  return `$ ${fmtMoney(Math.abs(n))} ${n >= 0 ? 'D' : 'H'}`;
}

function Mayor({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const [mode, setMode] = useState<'cuenta' | 'consolidado'>('consolidado');
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [origin, setOrigin] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sheetPerAccount, setSheetPerAccount] = useState(false);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    fiscalYearId !== ''
      ? fiscalYearId
      : (fiscalYears.find((y) => y.status === 'open')?.id ?? fiscalYears[0]?.id ?? '');

  const { data: chart } = useQuery({
    queryKey: ['accounting', 'chart', clientId],
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });
  const imputables = (chart?.accounts ?? []).filter((a) => a.type === 'imputable');

  const originArg = (origin || undefined) as never;

  const { data: ledger, isLoading: loadingLedger } = useQuery({
    queryKey: ['accounting', 'ledger-account', clientId, accountId, effectiveFyId, from, to, origin],
    queryFn: () =>
      getLedgerAccount({
        data: {
          clientId,
          accountId,
          fiscalYearId: effectiveFyId || undefined,
          from: from || undefined,
          to: to || undefined,
          origin: originArg,
        },
      }),
    enabled: mode === 'cuenta' && !!accountId && !!effectiveFyId,
  });

  const { data: consol, isLoading: loadingConsol } = useQuery({
    queryKey: ['accounting', 'ledger-consol', clientId, effectiveFyId, from, to, origin],
    queryFn: () =>
      getLedgerConsolidated({
        data: {
          clientId,
          fiscalYearId: effectiveFyId || undefined,
          from: from || undefined,
          to: to || undefined,
          origin: originArg,
        },
      }),
    enabled: mode === 'consolidado' && !!effectiveFyId,
  });

  function buildExportData(): MayorExportData | null {
    if (mode === 'cuenta') {
      if (!ledger) return null;
      const section: MayorSection = {
        code: ledger.account.code,
        name: ledger.account.name,
        saldoInicial: ledger.saldoInicial,
        rows: ledger.rows,
        totalDebit: ledger.totalDebit,
        totalCredit: ledger.totalCredit,
        saldoFinal: ledger.saldoFinal,
      };
      return {
        empresaName: clientName,
        fiscalYearNumber: ledger.fiscalYear.number,
        from: ledger.from,
        to: ledger.to,
        sections: [section],
      };
    }
    if (!consol?.fiscalYear) return null;
    return {
      empresaName: clientName,
      fiscalYearNumber: consol.fiscalYear.number,
      from: consol.from,
      to: consol.to,
      sections: consol.accounts.map((a) => ({
        code: a.code,
        name: a.name,
        saldoInicial: a.saldoInicial,
        rows: a.movements,
        totalDebit: a.totalDebit,
        totalCredit: a.totalCredit,
        saldoFinal: a.saldoFinal,
      })),
    };
  }

  const exportXlsx = () => {
    const data = buildExportData();
    if (!data || data.sections.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportMayorExcel(data, { sheetPerAccount }).catch((e: Error) => toast.error(e.message));
  };
  const exportPdf = () => {
    const data = buildExportData();
    if (!data || data.sections.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    exportMayorPdf(data).catch((e: Error) => toast.error(e.message));
  };

  const toggleAcc = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa no tiene ejercicios. Creá uno en la pestaña Ejercicios para ver el mayor.
        </div>
      </ArcaCard>
    );
  }

  return (
    <>
      <ArcaCard>
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          <div className="flex rounded-[8px] border border-[var(--arca-border)] overflow-hidden h-8 self-end">
            {(['cuenta', 'consolidado'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 text-[12px] font-medium transition-colors"
                style={{
                  background: mode === m ? 'var(--arca-navy-900)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--arca-ink-2)',
                }}
              >
                {m === 'cuenta' ? 'Por cuenta' : 'Consolidado'}
              </button>
            ))}
          </div>

          {fiscalYears.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--arca-ink-3)]">Ejercicio</label>
              <select
                value={effectiveFyId}
                onChange={(e) => setFiscalYearId(e.target.value)}
                className={`${SELECT_CLASS} w-36`}
              >
                {fiscalYears.map((y) => (
                  <option key={y.id} value={y.id}>
                    N°{y.number}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === 'cuenta' && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--arca-ink-3)]">Cuenta</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={`${SELECT_CLASS} w-72`}
              >
                <option value="">— Elegí una cuenta —</option>
                {imputables.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${INPUT_CLASS} w-36`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${INPUT_CLASS} w-36`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">Origen</label>
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={`${SELECT_CLASS} w-36`}>
              <option value="">Todos</option>
              {Object.entries(JOURNAL_ORIGIN_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2 self-end">
            {mode === 'consolidado' && (
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--arca-ink-2)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sheetPerAccount}
                  onChange={(e) => setSheetPerAccount(e.target.checked)}
                  className="accent-[var(--arca-navy-900)]"
                />
                Excel: hoja por cuenta
              </label>
            )}
            <button
              onClick={exportXlsx}
              className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.8} /> Excel
            </button>
            <button
              onClick={exportPdf}
              className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.8} /> PDF
            </button>
          </div>
        </div>

        {/* Body */}
        {mode === 'cuenta' ? (
          !accountId ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Elegí una cuenta para ver su mayor.
            </div>
          ) : loadingLedger ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">Cargando…</div>
          ) : !ledger ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">Sin datos.</div>
          ) : (
            <LedgerTable
              saldoInicial={ledger.saldoInicial}
              rows={ledger.rows}
              totalDebit={ledger.totalDebit}
              totalCredit={ledger.totalCredit}
              saldoFinal={ledger.saldoFinal}
              onRowClick={(id) => setDetailId(id)}
            />
          )
        ) : loadingConsol ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">Cargando…</div>
        ) : !consol || consol.accounts.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay movimientos en el rango seleccionado.
          </div>
        ) : (
          <div>
            {consol.accounts.map((a) => (
              <ConsolidatedAccountRow
                key={a.accountId}
                acc={a}
                expanded={expanded.has(a.accountId)}
                onToggle={() => toggleAcc(a.accountId)}
                onRowClick={(id) => setDetailId(id)}
              />
            ))}
            <div className="flex items-center gap-3 px-4 py-3 border-t-2 border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[13px] font-semibold">
              <span className="flex-1">Totales generales</span>
              <span className="w-28 text-right">$ {fmtMoney(consol.grandTotalDebit)}</span>
              <span className="w-28 text-right">$ {fmtMoney(consol.grandTotalCredit)}</span>
              <span className="w-28" />
            </div>
          </div>
        )}
      </ArcaCard>

      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onAction={() => setDetailId(null)}
          onChanged={() => {
            /* el mayor se recalcula al cerrar por invalidación de queries */
          }}
        />
      )}
    </>
  );
}

function LedgerTable({
  saldoInicial,
  rows,
  totalDebit,
  totalCredit,
  saldoFinal,
  onRowClick,
}: {
  saldoInicial: number;
  rows: LedgerRow[];
  totalDebit: number;
  totalCredit: number;
  saldoFinal: number;
  onRowClick: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
        <div className="w-24 shrink-0">Fecha</div>
        <div className="w-12 shrink-0">N°</div>
        <div className="flex-1 min-w-0">Descripción</div>
        <div className="w-24 shrink-0 text-right">Debe</div>
        <div className="w-24 shrink-0 text-right">Haber</div>
        <div className="w-28 shrink-0 text-right">Saldo</div>
      </div>
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] text-[12.5px] italic text-[var(--arca-ink-3)]">
        <div className="flex-1">Saldo inicial</div>
        <div className="w-28 shrink-0 text-right not-italic font-medium text-[var(--arca-ink)]">
          {saldoLabel(saldoInicial)}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
          Sin movimientos en el rango.
        </div>
      ) : (
        rows.map((r, i) => (
          <button
            key={`${r.entryId}-${i}`}
            onClick={() => onRowClick(r.entryId)}
            className="w-full flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-left text-[12.5px]"
          >
            <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">{fmtFecha(r.entryDate)}</div>
            <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">{r.number}</div>
            <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
              {r.description ?? r.lineDescription ?? ''}
            </div>
            <div className="w-24 shrink-0 text-right">{r.debit ? fmtMoney(r.debit) : ''}</div>
            <div className="w-24 shrink-0 text-right">{r.credit ? fmtMoney(r.credit) : ''}</div>
            <div className="w-28 shrink-0 text-right font-medium">{saldoLabel(r.balance)}</div>
          </button>
        ))
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[12.5px] font-semibold">
        <div className="flex-1">Totales del período</div>
        <div className="w-24 shrink-0 text-right">$ {fmtMoney(totalDebit)}</div>
        <div className="w-24 shrink-0 text-right">$ {fmtMoney(totalCredit)}</div>
        <div className="w-28 shrink-0 text-right">{saldoLabel(saldoFinal)}</div>
      </div>
    </div>
  );
}

function ConsolidatedAccountRow({
  acc,
  expanded,
  onToggle,
  onRowClick,
}: {
  acc: ConsolidatedAccount;
  expanded: boolean;
  onToggle: () => void;
  onRowClick: (id: string) => void;
}) {
  return (
    <div className="border-b border-[var(--arca-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--arca-surface-2)] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]" strokeWidth={1.8} />
        )}
        <span className="w-24 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">{acc.code}</span>
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[var(--arca-ink)]">
          {acc.name}
        </span>
        <span className="w-24 shrink-0 text-right text-[12px]">$ {fmtMoney(acc.totalDebit)}</span>
        <span className="w-24 shrink-0 text-right text-[12px]">$ {fmtMoney(acc.totalCredit)}</span>
        <span className="w-28 shrink-0 text-right text-[12.5px] font-medium">{saldoLabel(acc.saldoFinal)}</span>
      </button>
      {expanded && (
        <div className="bg-[var(--arca-surface-2)] pl-6">
          <div className="flex items-center gap-3 px-4 py-1.5 text-[11.5px] italic text-[var(--arca-ink-3)]">
            <div className="flex-1">Saldo inicial</div>
            <div className="w-28 shrink-0 text-right not-italic">{saldoLabel(acc.saldoInicial)}</div>
          </div>
          {acc.movements.map((r, i) => (
            <button
              key={`${r.entryId}-${i}`}
              onClick={() => onRowClick(r.entryId)}
              className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-[var(--arca-surface)] transition-colors text-left text-[12px] border-t border-[var(--arca-border)]"
            >
              <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">{fmtFecha(r.entryDate)}</div>
              <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">{r.number}</div>
              <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
                {r.description ?? r.lineDescription ?? ''}
              </div>
              <div className="w-24 shrink-0 text-right">{r.debit ? fmtMoney(r.debit) : ''}</div>
              <div className="w-24 shrink-0 text-right">{r.credit ? fmtMoney(r.credit) : ''}</div>
              <div className="w-28 shrink-0 text-right">{saldoLabel(r.balance)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
