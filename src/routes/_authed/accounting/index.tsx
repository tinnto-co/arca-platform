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
  Workflow,
  Power,
  Upload,
  HelpCircle,
  Lightbulb,
  Zap,
  RefreshCw,
  CheckSquare,
  Square,
  Inbox,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  XCircle,
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
  getTrialBalance,
  getJournalBook,
  listMappingRules,
  getMappingRule,
  createMappingRule,
  updateMappingRule,
  setMappingRuleActive,
  importMappingRules,
  getInvoicePostingPreview,
  generateInvoiceEntries,
  regenerateInvoiceEntry,
  getPendingReviewEntries,
  getFixedAssetAccounts,
  createFixedAsset,
  listFixedAssets,
  disposeFixedAsset,
  getAnexoI,
  getYearEndChecklist,
  getClosingWizard,
  approveClosingStage,
  sealClosing,
  type ChartAccount,
  type PeriodView,
  type LedgerRow,
  type ConsolidatedAccount,
  type PendingReviewEntry,
  type FixedAssetRow,
  type YearEndCheck,
  type ClosingEntryPreview,
} from '@/actions/accounting';
import {
  exportMayorExcel,
  exportMayorPdf,
  exportBalanceExcel,
  exportBalancePdf,
  exportLibroDiarioPdf,
  exportAnexoIPdf,
  exportAnexoIExcel,
  type MayorExportData,
  type MayorSection,
  type AnexoIExportData,
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
  MAPPING_SOURCE_LABELS,
  MAPPING_RULE_TYPE_LABELS,
  MAPPING_SIDE_LABELS,
  MAPPING_AMOUNT_BASIS_LABELS,
  FIXED_ASSET_CATEGORY_LABELS,
  FIXED_ASSET_STATUS_LABELS,
  FIXED_ASSET_DISPOSAL_REASON_LABELS,
  type AccountGroup,
} from '@/lib/accounting-labels';
import { monthlyDepreciation } from '@/lib/accounting-depreciation';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
type Tab =
  | 'plan'
  | 'ejercicios'
  | 'asientos'
  | 'mayor'
  | 'balance'
  | 'reglas'
  | 'contabilizar'
  | 'pendientes'
  | 'bienes';

function TabBar({
  active,
  onChange,
  pendingCount = 0,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  pendingCount?: number;
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
    { id: 'balance', label: 'Balance', icon: Scale, ready: true },
    { id: 'reglas', label: 'Reglas', icon: Workflow, ready: true },
    { id: 'contabilizar', label: 'Contabilizar', icon: Zap, ready: true },
    { id: 'pendientes', label: 'Pendientes', icon: Inbox, ready: true },
    { id: 'bienes', label: 'Bienes de uso', icon: Boxes, ready: true },
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
          {tab.id === 'pendientes' && pendingCount > 0 && (
            <span className="text-[9px] font-semibold px-1.5 py-px rounded-full bg-amber-100 text-amber-700">
              {pendingCount}
            </span>
          )}
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

  const { data: pendingEntries = [] } = useQuery({
    queryKey: ['accounting', 'pending-review', effectiveClientId],
    queryFn: () =>
      getPendingReviewEntries({ data: { clientId: effectiveClientId } }),
    enabled: !!effectiveClientId,
  });

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

      <TabBar
        active={tab}
        onChange={setTab}
        pendingCount={pendingEntries.length}
      />

      {!effectiveClientId ? (
        <ArcaCard>
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay empresas fiscales cargadas en el estudio.
          </div>
        </ArcaCard>
      ) : tab === 'plan' ? (
        <PlanDeCuentas clientId={effectiveClientId} isOwner={isOwner} />
      ) : tab === 'ejercicios' ? (
        <Ejercicios
          clientId={effectiveClientId}
          isOwner={isOwner}
          onGoToPending={() => setTab('pendientes')}
        />
      ) : tab === 'asientos' ? (
        <Asientos
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          isOwner={isOwner}
        />
      ) : tab === 'mayor' ? (
        <Mayor
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
        />
      ) : tab === 'balance' ? (
        <Balance
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
        />
      ) : tab === 'reglas' ? (
        <Reglas
          clientId={effectiveClientId}
          isOwner={isOwner}
          clients={clients}
        />
      ) : tab === 'contabilizar' ? (
        <Contabilizar
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
        />
      ) : tab === 'pendientes' ? (
        <Pendientes
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          onGoToReglas={() => setTab('reglas')}
        />
      ) : tab === 'bienes' ? (
        <BienesDeUso
          clientId={effectiveClientId}
          canWrite={roleData?.role !== 'viewer'}
          clientName={
            clients.find((c) => c.id === effectiveClientId)?.name ?? ''
          }
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
  label: React.ReactNode;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'col-span-2' : ''}`}>
      <label className="text-[11px] text-[var(--arca-ink-3)] flex items-center gap-1">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Ícono de ayuda con tooltip nativo (?). */
function HelpTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="cursor-help text-[var(--arca-ink-3)] hover:text-[var(--arca-navy-900)] inline-flex transition-colors"
          aria-label="Ayuda"
        >
          <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
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

function Ejercicios({
  clientId,
  isOwner,
  onGoToPending,
}: {
  clientId: string;
  isOwner: boolean;
  onGoToPending: () => void;
}) {
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
    queryFn: () =>
      getFiscalYearDetail({ data: { fiscalYearId: effectiveFyId } }),
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
                background: active
                  ? 'var(--arca-surface-2)'
                  : 'var(--arca-surface)',
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
                onGoToPending={onGoToPending}
              />
            ))}
          </div>
        </ArcaCard>
      )}

      {/* Checklist de cierre de ejercicio (US 5.1.1) */}
      {detail && effectiveFyId && (
        <CierreChecklist
          clientId={clientId}
          fiscalYearId={effectiveFyId}
          isOwner={isOwner}
        />
      )}

      {/* Log auditable */}
      {log.length > 0 && (
        <ArcaCard className="mt-4">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--arca-border)]">
            <History
              className="w-4 h-4 text-[var(--arca-ink-3)]"
              strokeWidth={1.8}
            />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Historial de cierres y reaperturas
            </span>
          </div>
          <div className="divide-y divide-[var(--arca-border)]">
            {log.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-3 px-5 py-2.5 text-[12px]"
              >
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
                . Sus {closeTarget.entryCount} asiento(s) quedarán inmutables y
                se habilitará el período siguiente. Esta acción queda registrada
                en el log.
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
  onGoToPending,
}: {
  period: PeriodView;
  isOwner: boolean;
  onClose: () => void;
  onReopen: () => void;
  onGoToPending: () => void;
}) {
  const closed = period.status === 'closed';
  const hasPending = period.pendingCount > 0;
  const estado = closed
    ? { label: 'Cerrado', color: 'oklch(0.50 0.02 260)' }
    : period.isCurrent
      ? { label: 'Abierto · actual', color: 'oklch(0.45 0.14 145)' }
      : { label: 'Por abrir', color: 'oklch(0.55 0.02 260)' };

  return (
    <div
      className="rounded-[10px] border p-3 flex flex-col gap-2"
      style={{
        borderColor: period.isCurrent
          ? 'oklch(0.45 0.14 145)'
          : 'var(--arca-border)',
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

      {!closed && hasPending && (
        <button
          onClick={onGoToPending}
          className="flex items-center gap-1 text-[11px] text-amber-700 hover:underline text-left"
        >
          <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2} />
          {period.pendingCount} pendiente{period.pendingCount === 1 ? '' : 's'}{' '}
          de revisión · resolver
        </button>
      )}

      {isOwner && (
        <div className="mt-1">
          {period.isCurrent &&
            (hasPending ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: los botones disabled no disparan hover; el span sí. */}
                  <span className="block cursor-not-allowed">
                    <button
                      disabled
                      className="w-full h-7 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white opacity-40 cursor-not-allowed pointer-events-none"
                    >
                      Cerrar período (bloqueado)
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[240px] text-xs leading-snug"
                >
                  No se puede cerrar: hay {period.pendingCount} asiento(s) en
                  pendiente de revisión. Resolvelos en la bandeja de Pendientes.
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={onClose}
                className="w-full h-7 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
              >
                Cerrar período
              </button>
            ))}
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

/* ─── Checklist de cierre de ejercicio (US 5.1.1) ─── */
function CierreChecklist({
  clientId,
  fiscalYearId,
  isOwner,
}: {
  clientId: string;
  fiscalYearId: string;
  isOwner: boolean;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['accounting', 'year-end-checklist', clientId, fiscalYearId],
    queryFn: () => getYearEndChecklist({ data: { clientId, fiscalYearId } }),
  });
  if (!data) return null;

  if (data.fiscalYearStatus === 'closed') {
    return (
      <ArcaCard className="mt-4">
        <div className="flex items-center gap-2 px-5 py-4 text-[13px] text-[var(--arca-ink-2)]">
          <Lock
            className="w-4 h-4 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
          El Ejercicio N°{data.fiscalYearNumber} está <strong>cerrado</strong>.
        </div>
      </ArcaCard>
    );
  }

  return (
    <ArcaCard className="mt-4">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--arca-border)]">
        <Lock className="w-4 h-4 text-[var(--arca-ink-3)]" strokeWidth={1.8} />
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          Cierre del ejercicio · Chequeo previo
        </span>
      </div>

      <div className="divide-y divide-[var(--arca-border)]">
        {data.checks.map((c: YearEndCheck) => (
          <div key={c.key} className="flex items-start gap-3 px-5 py-2.5">
            {c.status === 'pass' ? (
              <CheckCircle2
                className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600"
                strokeWidth={2}
              />
            ) : (
              <XCircle
                className="w-4 h-4 shrink-0 mt-0.5 text-red-600"
                strokeWidth={2}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-[var(--arca-ink)]">
                {c.label}
              </div>
              <div
                className="text-[11.5px]"
                style={{
                  color:
                    c.status === 'pass'
                      ? 'var(--arca-ink-3)'
                      : 'oklch(0.55 0.18 25)',
                }}
              >
                {c.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--arca-border)]">
        <span className="text-[12px] text-[var(--arca-ink-3)]">
          {data.canClose
            ? 'Todas las validaciones pasan. Podés iniciar el cierre.'
            : 'Resolvé los puntos en rojo para habilitar el cierre.'}
        </span>
        {isOwner ? (
          <button
            disabled={!data.canClose}
            onClick={() => setWizardOpen(true)}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={data.canClose ? undefined : 'Hay validaciones sin cumplir'}
          >
            Iniciar cierre
          </button>
        ) : (
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            Solo el Owner puede cerrar
          </span>
        )}
      </div>

      {wizardOpen && (
        <ClosingWizard
          clientId={clientId}
          fiscalYearId={fiscalYearId}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </ArcaCard>
  );
}

/* ─── Wizard de cierre de ejercicio (US 5.3.x) ─── */

interface EditLine {
  accountId: string;
  code: string;
  name: string;
  debit: string;
  credit: string;
}

/** Tabla de asiento con montos editables; informa al padre líneas + si balancea. */
function EditableEntryTable({
  preview,
  readOnly,
  onChange,
}: {
  preview: ClosingEntryPreview;
  readOnly: boolean;
  onChange?: (lines: EditLine[], balanced: boolean) => void;
}) {
  const [lines, setLines] = useState<EditLine[]>(
    preview.lines.map((l) => ({
      accountId: l.accountId,
      code: l.code,
      name: l.name,
      debit: l.debit > 0 ? String(l.debit) : '',
      credit: l.credit > 0 ? String(l.credit) : '',
    }))
  );

  const totalD = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalC = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(totalD - totalC) < 0.005;

  const update = (i: number, field: 'debit' | 'credit', v: string) => {
    const next = lines.map((l, j) => (j === i ? { ...l, [field]: v } : l));
    setLines(next);
    onChange?.(
      next,
      Math.abs(
        next.reduce((s, l) => s + num(l.debit), 0) -
          next.reduce((s, l) => s + num(l.credit), 0)
      ) < 0.005
    );
  };

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
          <th className="py-1.5">Cuenta</th>
          <th className="py-1.5 text-right w-32">Debe</th>
          <th className="py-1.5 text-right w-32">Haber</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr
            key={l.accountId}
            className="border-b border-[var(--arca-border)] last:border-0"
          >
            <td className="py-1.5">
              <span className="text-[var(--arca-ink-3)]">{l.code}</span>{' '}
              {l.name}
            </td>
            <td className="py-1 text-right">
              {readOnly ? (
                <span className="tabular-nums">
                  {num(l.debit) > 0 ? `$ ${fmtMoney(num(l.debit))}` : ''}
                </span>
              ) : (
                <input
                  value={l.debit}
                  onChange={(e) => update(i, 'debit', e.target.value)}
                  disabled={num(l.credit) > 0}
                  className="w-28 h-7 px-2 text-[12px] text-right border border-[var(--arca-border)] rounded-[6px] disabled:opacity-40"
                />
              )}
            </td>
            <td className="py-1 text-right">
              {readOnly ? (
                <span className="tabular-nums">
                  {num(l.credit) > 0 ? `$ ${fmtMoney(num(l.credit))}` : ''}
                </span>
              ) : (
                <input
                  value={l.credit}
                  onChange={(e) => update(i, 'credit', e.target.value)}
                  disabled={num(l.debit) > 0}
                  className="w-28 h-7 px-2 text-[12px] text-right border border-[var(--arca-border)] rounded-[6px] disabled:opacity-40"
                />
              )}
            </td>
          </tr>
        ))}
        <tr className="font-semibold border-t border-[var(--arca-ink-3)]">
          <td className="py-1.5 text-right">
            {balanced ? (
              <span className="text-emerald-600">✓ Balanceado</span>
            ) : (
              <span className="text-red-600">Descuadrado</span>
            )}
          </td>
          <td className="py-1.5 text-right tabular-nums">
            $ {fmtMoney(totalD)}
          </td>
          <td className="py-1.5 text-right tabular-nums">
            $ {fmtMoney(totalC)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

type StageKey =
  | 'verificacion'
  | 'ajustes'
  | 'refundicion'
  | 'cierre'
  | 'apertura';
const STAGE_DEFS: { key: StageKey; label: string }[] = [
  { key: 'verificacion', label: 'Verificación' },
  { key: 'ajustes', label: 'Ajustes manuales' },
  { key: 'refundicion', label: 'Refundición' },
  { key: 'cierre', label: 'Cierre patrimonial' },
  { key: 'apertura', label: 'Apertura' },
];

function ClosingWizard({
  clientId,
  fiscalYearId,
  onClose,
}: {
  clientId: string;
  fiscalYearId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<StageKey>('verificacion');
  const [ajustesAck, setAjustesAck] = useState(false);
  const [aperturaWanted, setAperturaWanted] = useState(true);
  const [aperturaSkipped, setAperturaSkipped] = useState(false);

  const { data: checklist } = useQuery({
    queryKey: ['accounting', 'year-end-checklist', clientId, fiscalYearId],
    queryFn: () => getYearEndChecklist({ data: { clientId, fiscalYearId } }),
  });
  const { data: wiz } = useQuery({
    queryKey: ['accounting', 'closing-wizard', clientId, fiscalYearId],
    queryFn: () => getClosingWizard({ data: { clientId, fiscalYearId } }),
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const approveMut = useMutation({
    mutationFn: (v: { stage: StageKey; lines: EditLine[] }) =>
      approveClosingStage({
        data: {
          clientId,
          fiscalYearId,
          stage: v.stage as 'refundicion' | 'cierre' | 'apertura',
          lines: v.lines.map((l) => ({
            accountId: l.accountId,
            debit: num(l.debit),
            credit: num(l.credit),
          })),
        },
      }),
    onSuccess: (_r, v) => {
      toast.success(
        v.stage === 'apertura'
          ? 'Apertura registrada'
          : v.stage === 'refundicion'
            ? 'Refundición registrada'
            : 'Cierre patrimonial registrado'
      );
      // Invalidación dirigida: refrescar solo el wizard (no la lista de ejercicios,
      // para que crear el ejercicio siguiente en la apertura no desmonte el wizard).
      void qc.invalidateQueries({
        queryKey: ['accounting', 'closing-wizard', clientId, fiscalYearId],
      });
      const order: StageKey[] = ['refundicion', 'cierre', 'apertura'];
      const next = order[order.indexOf(v.stage) + 1];
      if (next) setStage(next);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sealMut = useMutation({
    mutationFn: () => sealClosing({ data: { clientId, fiscalYearId } }),
    onSuccess: () => {
      toast.success('Ejercicio sellado. Quedó cerrado.');
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!wiz || !checklist) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl">
          <div className="py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const done: Record<StageKey, boolean> = {
    verificacion: checklist.canClose,
    ajustes: ajustesAck,
    refundicion: wiz.refundicion.status === 'done',
    cierre: wiz.cierre.status === 'done',
    apertura: wiz.apertura.status === 'done' || aperturaSkipped,
  };
  const order = STAGE_DEFS.map((s) => s.key);
  const firstIncomplete = order.find((k) => !done[k]) ?? 'apertura';
  const activeIdx = order.indexOf(firstIncomplete);
  const allDone = order.every((k) => done[k]);

  const statusOf = (k: StageKey): 'completada' | 'en curso' | 'pendiente' => {
    if (done[k]) return 'completada';
    if (k === stage) return 'en curso';
    return 'pendiente';
  };

  const goStage = (k: StageKey) => {
    if (order.indexOf(k) <= activeIdx) setStage(k);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Cierre del Ejercicio N°{wiz.fiscalYearNumber}
          </DialogTitle>
          <DialogDescription>
            Seguí las etapas. Podés pausar (cerrá esta ventana) y retomar: lo
            aprobado queda guardado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 flex-wrap">
          {STAGE_DEFS.map((s, i) => {
            const st = statusOf(s.key);
            const navigable = i <= activeIdx;
            return (
              <button
                key={s.key}
                onClick={() => goStage(s.key)}
                disabled={!navigable}
                className="flex items-center gap-1.5 px-2.5 h-8 rounded-[8px] text-[12px] transition-colors disabled:cursor-not-allowed"
                style={{
                  background:
                    s.key === stage ? 'var(--arca-surface-2)' : 'transparent',
                  color: navigable ? 'var(--arca-ink)' : 'var(--arca-ink-3)',
                  border:
                    s.key === stage
                      ? '1px solid var(--arca-border)'
                      : '1px solid transparent',
                }}
              >
                {st === 'completada' ? (
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-emerald-600"
                    strokeWidth={2}
                  />
                ) : st === 'en curso' ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--arca-navy-900)] inline-block" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-[var(--arca-ink-3)] inline-block" />
                )}
                <span className="font-medium">
                  {i + 1}. {s.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 min-h-[200px]">
          {stage === 'verificacion' && (
            <div className="space-y-3">
              <p className="text-[12.5px] text-[var(--arca-ink-3)]">
                Precondiciones para cerrar el ejercicio.
              </p>
              <div className="divide-y divide-[var(--arca-border)] border border-[var(--arca-border)] rounded-[10px]">
                {checklist.checks.map((c: YearEndCheck) => (
                  <div key={c.key} className="flex items-start gap-2 px-3 py-2">
                    {c.status === 'pass' ? (
                      <CheckCircle2
                        className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0"
                        strokeWidth={2}
                      />
                    ) : (
                      <XCircle
                        className="w-4 h-4 mt-0.5 text-red-600 shrink-0"
                        strokeWidth={2}
                      />
                    )}
                    <div>
                      <div className="text-[12.5px]">{c.label}</div>
                      <div className="text-[11.5px] text-[var(--arca-ink-3)]">
                        {c.detail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  disabled={!checklist.canClose}
                  onClick={() => setStage('ajustes')}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-40"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {stage === 'ajustes' && (
            <div className="space-y-3">
              <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px] text-[var(--arca-ink-2)] leading-relaxed">
                Antes de refundir, cargá los <strong>ajustes manuales</strong>{' '}
                que falten (amortizaciones, provisiones, devengamientos) en la
                pestaña <strong>Asientos</strong>. La amortización sugerida del
                ejercicio está en <strong>Bienes de uso › Anexo I</strong>.
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setStage('verificacion')}
                  className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                >
                  Atrás
                </button>
                <button
                  onClick={() => {
                    setAjustesAck(true);
                    setStage('refundicion');
                  }}
                  className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white"
                >
                  Ya cargué los ajustes · Continuar
                </button>
              </div>
            </div>
          )}

          {stage === 'refundicion' && wiz.refundicion.preview && (
            <StageEntry
              title="Refundición de cuentas de resultado"
              subtitle={`Resultado del ejercicio: ${
                wiz.resultado.tipo === 'ganancia'
                  ? 'Ganancia'
                  : wiz.resultado.tipo === 'perdida'
                    ? 'Pérdida'
                    : 'Neutro'
              } $ ${fmtMoney(Math.abs(wiz.resultado.net))}`}
              preview={wiz.refundicion.preview}
              done={done.refundicion}
              doneLabel={
                wiz.refundicion.entryNumber
                  ? `Registrado · Asiento N°${wiz.refundicion.entryNumber}`
                  : 'Registrado'
              }
              pending={approveMut.isPending}
              onBack={() => setStage('ajustes')}
              onApprove={(lines) =>
                approveMut.mutate({ stage: 'refundicion', lines })
              }
              onContinue={() => setStage('cierre')}
            />
          )}

          {stage === 'cierre' && wiz.cierre.preview && (
            <StageEntry
              title="Asiento de cierre patrimonial"
              preview={wiz.cierre.preview}
              done={done.cierre}
              doneLabel={
                wiz.cierre.entryNumber
                  ? `Registrado · Asiento N°${wiz.cierre.entryNumber}`
                  : 'Registrado'
              }
              pending={approveMut.isPending}
              onBack={() => setStage('refundicion')}
              onApprove={(lines) =>
                approveMut.mutate({ stage: 'cierre', lines })
              }
              onContinue={() => setStage('apertura')}
            />
          )}

          {stage === 'apertura' && (
            <div className="space-y-3">
              {wiz.apertura.status === 'done' ? (
                <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px]">
                  ✓ Apertura registrada (Asiento N°{wiz.apertura.entryNumber}{' '}
                  del Ejercicio N°{wiz.apertura.nextFy?.number}).
                </div>
              ) : aperturaSkipped ? (
                <div className="rounded-[10px] bg-[var(--arca-surface-2)] px-4 py-3 text-[12.5px] text-[var(--arca-ink-3)]">
                  Apertura omitida. Podés crear el próximo ejercicio manualmente
                  más adelante.
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={aperturaWanted}
                      onChange={(e) => setAperturaWanted(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Crear el{' '}
                      <strong>Ejercicio N°{wiz.apertura.nextFy?.number}</strong>{' '}
                      ({fmtFecha(wiz.apertura.nextFy?.startDate ?? '')} –{' '}
                      {fmtFecha(wiz.apertura.nextFy?.endDate ?? '')}) con su
                      asiento de apertura (saldos invertidos).
                    </span>
                  </label>
                  {aperturaWanted && wiz.apertura.preview && (
                    <StageEntry
                      title="Asiento de apertura"
                      preview={wiz.apertura.preview}
                      done={false}
                      pending={approveMut.isPending}
                      onBack={() => setStage('cierre')}
                      onApprove={(lines) =>
                        approveMut.mutate({ stage: 'apertura', lines })
                      }
                      hideContinue
                    />
                  )}
                  {!aperturaWanted && (
                    <div className="flex justify-between">
                      <button
                        onClick={() => setStage('cierre')}
                        className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                      >
                        Atrás
                      </button>
                      <button
                        onClick={() => setAperturaSkipped(true)}
                        className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
                      >
                        Omitir apertura
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {done.cierre && (done.apertura || aperturaSkipped) && (
          <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3">
            <span className="text-[12.5px] text-[var(--arca-ink-2)]">
              {allDone
                ? 'Todo listo. Sellá el ejercicio para dejarlo inmutable.'
                : 'Completá las etapas para sellar.'}
            </span>
            <button
              onClick={() => sealMut.mutate()}
              disabled={sealMut.isPending || !done.cierre}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
            >
              {sealMut.isPending ? 'Sellando…' : 'Finalizar y sellar ejercicio'}
            </button>
          </div>
        )}

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Pausar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StageEntry({
  title,
  subtitle,
  preview,
  done,
  doneLabel,
  pending,
  onBack,
  onApprove,
  onContinue,
  hideContinue,
}: {
  title: string;
  subtitle?: string;
  preview: ClosingEntryPreview;
  done: boolean;
  doneLabel?: string;
  pending: boolean;
  onBack: () => void;
  onApprove: (lines: EditLine[]) => void;
  onContinue?: () => void;
  hideContinue?: boolean;
}) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [balanced, setBalanced] = useState(preview.balanced);

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-semibold text-[var(--arca-ink)]">
          {title}
        </div>
        {subtitle && (
          <div className="text-[12px] text-[var(--arca-ink-3)]">{subtitle}</div>
        )}
      </div>

      {done ? (
        <>
          <div className="rounded-[8px] bg-emerald-50 border border-emerald-200 px-3 py-2 text-[12px] text-emerald-700">
            ✓ {doneLabel ?? 'Registrado'}
          </div>
          <EditableEntryTable preview={preview} readOnly />
          {!hideContinue && onContinue && (
            <div className="flex justify-between">
              <button
                onClick={onBack}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
              >
                Atrás
              </button>
              <button
                onClick={onContinue}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white"
              >
                Continuar
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <EditableEntryTable
            preview={preview}
            readOnly={false}
            onChange={(l, b) => {
              setLines(l);
              setBalanced(b);
            }}
          />
          <div className="flex justify-between">
            <button
              onClick={onBack}
              className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
            >
              Atrás
            </button>
            <button
              onClick={() =>
                onApprove(lines.length ? lines : toEditLines(preview))
              }
              disabled={pending || !balanced}
              title={balanced ? undefined : 'El asiento no balancea'}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
            >
              {pending ? 'Registrando…' : 'Aprobar y registrar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function toEditLines(preview: ClosingEntryPreview): EditLine[] {
  return preview.lines.map((l) => ({
    accountId: l.accountId,
    code: l.code,
    name: l.name,
    debit: l.debit > 0 ? String(l.debit) : '',
    credit: l.credit > 0 ? String(l.credit) : '',
  }));
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
      createFiscalYear({
        data: { clientId, startDate: startFirst, endDate: end },
      }),
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
            Elegí el mes de inicio. El ejercicio dura exactamente 12 meses
            calendario y se crean automáticamente los 12 períodos mensuales.
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
                {fmtFecha(`${startFirst}T00:00:00Z`)} →{' '}
                {fmtFecha(`${end}T00:00:00Z`)}
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
    mutationFn: () =>
      reopenPeriod({ data: { periodId: period.id, reason: reason.trim() } }),
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
            El período vuelve a estado abierto y sus asientos se conservan. El
            motivo queda registrado en el log auditable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Motivo *
          </label>
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

function Asientos({
  clientId,
  canWrite,
  isOwner,
}: {
  clientId: string;
  canWrite: boolean;
  isOwner: boolean;
}) {
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

  const exportLibroDiario = () => {
    getJournalBook({
      data: { clientId, fiscalYearId: data?.fiscalYearId ?? undefined },
    })
      .then((book) => {
        if (!book || book.entries.length === 0) {
          toast.error('No hay asientos para exportar');
          return;
        }
        return exportLibroDiarioPdf({
          empresaName: book.empresaName,
          cuit: book.cuit,
          fiscalYearNumber: book.fiscalYear.number,
          from: book.fiscalYear.startDate,
          to: book.fiscalYear.endDate,
          entries: book.entries,
        });
      })
      .catch((e: Error) => toast.error(e.message));
  };

  function openEditorFromDetail(
    action: 'edit' | 'duplicate',
    d: EditorInitial
  ) {
    setDetailId(null);
    setEditor({ mode: action, initial: d });
  }

  return (
    <>
      <ArcaCard>
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Desde
            </label>
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
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Hasta
            </label>
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
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Cuenta
            </label>
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
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Origen
            </label>
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
            {isOwner && (
              <button
                onClick={exportLibroDiario}
                title="PDF del Libro Diario para rubricar"
                className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.8} />
                Libro Diario PDF
              </button>
            )}
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
                  <span className="text-[var(--arca-ink-3)] italic">
                    (sin descripción)
                  </span>
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
            <span>
              {total} asiento{total === 1 ? '' : 's'}
            </span>
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
    init?.lines && init.lines.length >= 2
      ? init.lines
      : [emptyLine(), emptyLine()]
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
    (l) => l.accountId && num(l.debit) > 0 !== num(l.credit) > 0
  );
  const canSave = !!entryDate && lines.length >= 2 && balanced && allLinesValid;

  const updateLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );

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
          data: {
            id: init.id,
            entryDate,
            description: description || undefined,
            lines: payloadLines,
          },
        });
      } else {
        await createJournalEntry({
          data: {
            clientId,
            entryDate,
            description: description || undefined,
            lines: payloadLines,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(
        state.mode === 'edit' ? 'Asiento actualizado' : 'Asiento guardado'
      );
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
            Debe = Haber para poder guardar. Solo cuentas imputables y activas.
            La fecha define el período (no puede estar en un período cerrado).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 w-44">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Fecha *
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className={`${INPUT_CLASS} w-full h-9`}
              />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-[11px] text-[var(--arca-ink-3)]">
                Descripción
              </label>
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
                  onChange={(e) =>
                    updateLine(i, { description: e.target.value })
                  }
                  placeholder="opcional"
                  className={`${INPUT_CLASS} w-40 h-8`}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.debit}
                  onChange={(e) =>
                    updateLine(i, { debit: e.target.value, credit: '' })
                  }
                  className={`${INPUT_CLASS} w-24 h-8 text-right`}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.credit}
                  onChange={(e) =>
                    updateLine(i, { credit: e.target.value, debit: '' })
                  }
                  className={`${INPUT_CLASS} w-24 h-8 text-right`}
                />
                <button
                  onClick={() =>
                    setLines((prev) => prev.filter((_, idx) => idx !== i))
                  }
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
              <div className="w-24 text-right text-[var(--arca-ink)]">
                $ {fmtMoney(totalDebit)}
              </div>
              <div className="w-24 text-right text-[var(--arca-ink)]">
                $ {fmtMoney(totalCredit)}
              </div>
              <div className="w-6" />
            </div>
          </div>

          <div className="flex items-center justify-end text-[12px]">
            {balanced ? (
              <span className="text-[oklch(0.40_0.14_145)]">
                ✓ Asiento balanceado
              </span>
            ) : (
              <span className="text-[oklch(0.55_0.18_25)]">
                Diferencia: $ {fmtMoney(Math.abs(totalDebit - totalCredit))} —
                Debe debe ser igual a Haber
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
    mutationFn: () =>
      voidJournalEntry({ data: { id: entryId, reason: reason.trim() } }),
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

  const editable =
    !!data && !data.entry.isVoided && data.entry.periodStatus === 'open';

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
                {JOURNAL_ORIGIN_LABELS[data.entry.origin] ?? data.entry.origin}{' '}
                · Ejercicio N°
                {data.entry.fyNumber}
                {data.entry.createdByName
                  ? ` · cargado por ${data.entry.createdByName}`
                  : ''}
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
                    <span className="text-[var(--arca-ink)]">
                      {l.accountName}
                    </span>
                    {l.description && (
                      <span className="text-[var(--arca-ink-3)]">
                        {' '}
                        · {l.description}
                      </span>
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
                    {e.eventType === 'journal_entry_voided'
                      ? 'Anulado'
                      : 'Editado'}{' '}
                    por {e.userName ?? e.userEmail ?? 'usuario'} ·{' '}
                    {new Date(e.createdAt).toLocaleString('es-AR')}
                    {e.eventData?.reason
                      ? ` · Motivo: ${e.eventData.reason}`
                      : ''}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="flex-wrap">
              {canWrite && (
                <button
                  onClick={() =>
                    onAction('duplicate', {
                      ...toInitial(),
                      id: undefined,
                      entryDate: '',
                    })
                  }
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
                    El asiento no se borra: queda marcado como anulado y
                    conserva su número. El motivo queda en el log.
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
      : (fiscalYears.find((y) => y.status === 'open')?.id ??
        fiscalYears[0]?.id ??
        '');

  const { data: chart } = useQuery({
    queryKey: ['accounting', 'chart', clientId],
    queryFn: () => getChartOfAccounts({ data: { clientId } }),
  });
  const imputables = (chart?.accounts ?? []).filter(
    (a) => a.type === 'imputable'
  );

  const originArg = (origin || undefined) as never;

  const { data: ledger, isLoading: loadingLedger } = useQuery({
    queryKey: [
      'accounting',
      'ledger-account',
      clientId,
      accountId,
      effectiveFyId,
      from,
      to,
      origin,
    ],
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
    queryKey: [
      'accounting',
      'ledger-consol',
      clientId,
      effectiveFyId,
      from,
      to,
      origin,
    ],
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
    exportMayorExcel(data, { sheetPerAccount }).catch((e: Error) =>
      toast.error(e.message)
    );
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
          Esta empresa no tiene ejercicios. Creá uno en la pestaña Ejercicios
          para ver el mayor.
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
                  background:
                    mode === m ? 'var(--arca-navy-900)' : 'transparent',
                  color: mode === m ? 'white' : 'var(--arca-ink-2)',
                }}
              >
                {m === 'cuenta' ? 'Por cuenta' : 'Consolidado'}
              </button>
            ))}
          </div>

          {fiscalYears.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--arca-ink-3)]">
                Ejercicio
              </label>
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
              <label className="text-[10px] text-[var(--arca-ink-3)]">
                Cuenta
              </label>
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
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${INPUT_CLASS} w-36`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${INPUT_CLASS} w-36`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Origen
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
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
              <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.8} />{' '}
              Excel
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
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Cargando…
            </div>
          ) : !ledger ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Sin datos.
            </div>
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
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
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
              <span className="w-28 text-right">
                $ {fmtMoney(consol.grandTotalDebit)}
              </span>
              <span className="w-28 text-right">
                $ {fmtMoney(consol.grandTotalCredit)}
              </span>
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
            <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">
              {fmtFecha(r.entryDate)}
            </div>
            <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">
              {r.number}
            </div>
            <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
              {r.description ?? r.lineDescription ?? ''}
            </div>
            <div className="w-24 shrink-0 text-right">
              {r.debit ? fmtMoney(r.debit) : ''}
            </div>
            <div className="w-24 shrink-0 text-right">
              {r.credit ? fmtMoney(r.credit) : ''}
            </div>
            <div className="w-28 shrink-0 text-right font-medium">
              {saldoLabel(r.balance)}
            </div>
          </button>
        ))
      )}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[12.5px] font-semibold">
        <div className="flex-1">Totales del período</div>
        <div className="w-24 shrink-0 text-right">$ {fmtMoney(totalDebit)}</div>
        <div className="w-24 shrink-0 text-right">
          $ {fmtMoney(totalCredit)}
        </div>
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
          <ChevronDown
            className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        ) : (
          <ChevronRight
            className="w-4 h-4 shrink-0 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        )}
        <span className="w-24 shrink-0 text-[12px] font-mono text-[var(--arca-ink-3)]">
          {acc.code}
        </span>
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium text-[var(--arca-ink)]">
          {acc.name}
        </span>
        <span className="w-24 shrink-0 text-right text-[12px]">
          $ {fmtMoney(acc.totalDebit)}
        </span>
        <span className="w-24 shrink-0 text-right text-[12px]">
          $ {fmtMoney(acc.totalCredit)}
        </span>
        <span className="w-28 shrink-0 text-right text-[12.5px] font-medium">
          {saldoLabel(acc.saldoFinal)}
        </span>
      </button>
      {expanded && (
        <div className="bg-[var(--arca-surface-2)] pl-6">
          <div className="flex items-center gap-3 px-4 py-1.5 text-[11.5px] italic text-[var(--arca-ink-3)]">
            <div className="flex-1">Saldo inicial</div>
            <div className="w-28 shrink-0 text-right not-italic">
              {saldoLabel(acc.saldoInicial)}
            </div>
          </div>
          {acc.movements.map((r, i) => (
            <button
              key={`${r.entryId}-${i}`}
              onClick={() => onRowClick(r.entryId)}
              className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-[var(--arca-surface)] transition-colors text-left text-[12px] border-t border-[var(--arca-border)]"
            >
              <div className="w-24 shrink-0 text-[var(--arca-ink-2)]">
                {fmtFecha(r.entryDate)}
              </div>
              <div className="w-12 shrink-0 font-mono text-[var(--arca-ink-3)]">
                {r.number}
              </div>
              <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
                {r.description ?? r.lineDescription ?? ''}
              </div>
              <div className="w-24 shrink-0 text-right">
                {r.debit ? fmtMoney(r.debit) : ''}
              </div>
              <div className="w-24 shrink-0 text-right">
                {r.credit ? fmtMoney(r.credit) : ''}
              </div>
              <div className="w-28 shrink-0 text-right">
                {saldoLabel(r.balance)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════ Balance de sumas y saldos (US 2.2.x) ════════════════════ */

function toISODate(d: string | Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

interface LedgerDrill {
  accountId: string;
  code: string;
  name: string;
  from: string;
  to: string;
}

function Balance({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const [fiscalYearId, setFiscalYearId] = useState('');
  const [asOf, setAsOf] = useState('');
  const [drill, setDrill] = useState<LedgerDrill | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    fiscalYearId !== ''
      ? fiscalYearId
      : (fiscalYears.find((y) => y.status === 'open')?.id ??
        fiscalYears[0]?.id ??
        '');

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'trial-balance', clientId, effectiveFyId, asOf],
    queryFn: () =>
      getTrialBalance({
        data: {
          clientId,
          fiscalYearId: effectiveFyId || undefined,
          asOf: asOf || undefined,
        },
      }),
    enabled: !!effectiveFyId,
  });

  function doExport(kind: 'xlsx' | 'pdf') {
    if (!data || data.rows.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }
    const payload = {
      empresaName: clientName,
      fiscalYearNumber: data.fiscalYear.number,
      asOf: data.asOf,
      rows: data.rows,
      totals: data.totals,
      balanced: data.balanced,
    };
    const p =
      kind === 'xlsx' ? exportBalanceExcel(payload) : exportBalancePdf(payload);
    p.catch((e: Error) => toast.error(e.message));
  }

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa no tiene ejercicios. Creá uno para generar el balance.
        </div>
      </ArcaCard>
    );
  }

  return (
    <>
      <ArcaCard>
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          {fiscalYears.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--arca-ink-3)]">
                Ejercicio
              </label>
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
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Fecha de corte
            </label>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className={`${INPUT_CLASS} w-40`}
            />
          </div>
          {data && (
            <span className="text-[12px] text-[var(--arca-ink-3)] self-end pb-1.5">
              al {fmtFecha(data.asOf)}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2 self-end">
            <button
              onClick={() => doExport('xlsx')}
              className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" strokeWidth={1.8} />{' '}
              Excel
            </button>
            <button
              onClick={() => doExport('pdf')}
              className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.8} /> PDF
            </button>
          </div>
        </div>

        {/* Alerta de descuadre */}
        {data && !data.balanced && (
          <div
            className="px-4 py-2.5 text-[12.5px] font-medium border-b border-[var(--arca-border)]"
            style={{
              background:
                'color-mix(in oklch, oklch(0.55 0.18 25), transparent 92%)',
              color: 'oklch(0.45 0.18 25)',
            }}
          >
            ⚠ El balance NO cuadra. Débitos $ {fmtMoney(data.totals.sumaDebe)}{' '}
            vs Créditos $ {fmtMoney(data.totals.sumaHaber)} (dif. ${' '}
            {fmtMoney(Math.abs(data.totals.sumaDebe - data.totals.sumaHaber))})
            · Saldos deudores $ {fmtMoney(data.totals.saldoDeudor)} vs
            acreedores $ {fmtMoney(data.totals.saldoAcreedor)}.
          </div>
        )}

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          <div className="w-24 shrink-0">Código</div>
          <div className="flex-1 min-w-0">Cuenta</div>
          <div className="w-28 shrink-0 text-right">Suma Debe</div>
          <div className="w-28 shrink-0 text-right">Suma Haber</div>
          <div className="w-28 shrink-0 text-right">Saldo Deudor</div>
          <div className="w-28 shrink-0 text-right">Saldo Acreedor</div>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay movimientos hasta la fecha de corte.
          </div>
        ) : (
          <>
            {data.rows.map((r) => (
              <button
                key={r.accountId}
                onClick={() =>
                  setDrill({
                    accountId: r.accountId,
                    code: r.code,
                    name: r.name,
                    from: toISODate(data.fiscalYearStart),
                    to: toISODate(data.asOf),
                  })
                }
                className="w-full flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-left text-[12.5px]"
              >
                <div className="w-24 shrink-0 font-mono text-[12px] text-[var(--arca-ink-3)]">
                  {r.code}
                </div>
                <div className="flex-1 min-w-0 truncate text-[var(--arca-ink)]">
                  {r.name}
                </div>
                <div className="w-28 shrink-0 text-right">
                  {fmtMoney(r.sumaDebe)}
                </div>
                <div className="w-28 shrink-0 text-right">
                  {fmtMoney(r.sumaHaber)}
                </div>
                <div className="w-28 shrink-0 text-right">
                  {r.saldoDeudor ? fmtMoney(r.saldoDeudor) : ''}
                </div>
                <div className="w-28 shrink-0 text-right">
                  {r.saldoAcreedor ? fmtMoney(r.saldoAcreedor) : ''}
                </div>
              </button>
            ))}
            <div
              className="flex items-center gap-3 px-4 py-2.5 border-t-2 text-[12.5px] font-semibold"
              style={{ borderColor: 'var(--arca-border)' }}
            >
              <div className="w-24 shrink-0" />
              <div className="flex-1 min-w-0">Totales</div>
              <div className="w-28 shrink-0 text-right">
                $ {fmtMoney(data.totals.sumaDebe)}
              </div>
              <div className="w-28 shrink-0 text-right">
                $ {fmtMoney(data.totals.sumaHaber)}
              </div>
              <div className="w-28 shrink-0 text-right">
                $ {fmtMoney(data.totals.saldoDeudor)}
              </div>
              <div className="w-28 shrink-0 text-right">
                $ {fmtMoney(data.totals.saldoAcreedor)}
              </div>
            </div>
            {data.balanced && (
              <div className="px-4 py-2 text-[11.5px] text-[oklch(0.40_0.14_145)] flex items-center gap-1.5">
                ✓ El balance cuadra (débitos = créditos y saldos deudores =
                acreedores).
              </div>
            )}
          </>
        )}
      </ArcaCard>

      {drill && (
        <LedgerDialog
          clientId={clientId}
          drill={drill}
          canWrite={canWrite}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}

function LedgerDialog({
  clientId,
  drill,
  canWrite,
  onClose,
}: {
  clientId: string;
  drill: LedgerDrill;
  canWrite: boolean;
  onClose: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: [
      'accounting',
      'ledger-account',
      clientId,
      drill.accountId,
      '',
      drill.from,
      drill.to,
      '',
    ],
    queryFn: () =>
      getLedgerAccount({
        data: {
          clientId,
          accountId: drill.accountId,
          from: drill.from,
          to: drill.to,
        },
      }),
  });

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>
              Mayor · {drill.code} · {drill.name}
            </DialogTitle>
            <DialogDescription>
              Movimientos del {fmtFecha(drill.from)} al {fmtFecha(drill.to)}.
              Click en un movimiento abre el asiento.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto border border-[var(--arca-border)] rounded-[10px]">
            {isLoading || !data ? (
              <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
                Cargando…
              </div>
            ) : (
              <LedgerTable
                saldoInicial={data.saldoInicial}
                rows={data.rows}
                totalDebit={data.totalDebit}
                totalCredit={data.totalCredit}
                saldoFinal={data.saldoFinal}
                onRowClick={(id) => setDetailId(id)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onAction={() => setDetailId(null)}
          onChanged={() => {
            /* no-op */
          }}
        />
      )}
    </>
  );
}

/* ════════════════════ Reglas de mapeo (US 3.1.x) ════════════════════ */

interface AccClient {
  id: string;
  name: string;
  identityNumber: string;
}
interface RuleLineDraft {
  accountId: string;
  side: 'debit' | 'credit';
  amountBasis: string;
  fixedAmount: string;
  description: string;
}
type RuleEditorState = { mode: 'create' } | { mode: 'edit'; ruleId: string };

const AMOUNT_BASES = [
  'total',
  'net',
  'vat',
  'other_taxes',
  'concept_value',
  'fixed',
];

function emptyRuleLine(side: 'debit' | 'credit'): RuleLineDraft {
  return {
    accountId: '',
    side,
    amountBasis: 'total',
    fixedAmount: '',
    description: '',
  };
}

function Reglas({
  clientId,
  isOwner,
  clients,
}: {
  clientId: string;
  isOwner: boolean;
  clients: AccClient[];
}) {
  const qc = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState('');
  const [editor, setEditor] = useState<RuleEditorState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const queryKey = ['accounting', 'rules', clientId, moduleFilter];
  const { data: rules = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      listMappingRules({
        data: { clientId, sourceModule: (moduleFilter || undefined) as never },
      }),
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting', 'rules'] });
  };

  const toggleMut = useMutation({
    mutationFn: (args: { id: string; isActive: boolean }) =>
      setMappingRuleActive({ data: args }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <ArcaCard>
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-[var(--arca-border)]">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-[var(--arca-ink-3)]">
              Módulo origen
            </label>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className={`${SELECT_CLASS} w-40`}
            >
              <option value="">Todos</option>
              <option value="invoice">Facturas</option>
              <option value="payroll">Sueldos</option>
            </select>
          </div>
          {isOwner && (
            <div className="ml-auto flex items-center gap-2 self-end">
              <button
                onClick={() => setImportOpen(true)}
                className="flex items-center gap-1.5 h-8 px-2.5 text-[12px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
              >
                <Upload className="w-3.5 h-3.5" strokeWidth={1.8} /> Importar de
                otra empresa
              </button>
              <button
                onClick={() => setEditor({ mode: 'create' })}
                className="flex items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
              >
                <Plus className="w-3 h-3" strokeWidth={2.5} /> Nueva regla
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
          <div className="w-14 shrink-0 text-center">Prior.</div>
          <div className="flex-1 min-w-0">Nombre</div>
          <div className="w-24 shrink-0">Módulo</div>
          <div className="w-28 shrink-0">Tipo</div>
          <div className="w-16 shrink-0 text-center">Líneas</div>
          <div className="w-24 shrink-0 text-center">Estado</div>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Workflow
              className="w-8 h-8 mx-auto mb-3 text-[var(--arca-ink-3)]"
              strokeWidth={1.5}
            />
            <p className="text-[13px] text-[var(--arca-ink-2)] mb-1">
              No hay reglas de mapeo configuradas.
            </p>
            <p className="text-[12px] text-[var(--arca-ink-3)]">
              Las reglas le enseñan al sistema cómo armar los asientos
              automáticos desde facturas y sueldos.
            </p>
          </div>
        ) : (
          rules.map((r) => (
            <div
              key={r.id}
              onClick={() => setDetailId(r.id)}
              role="button"
              tabIndex={0}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-colors text-[12.5px] cursor-pointer"
            >
              <div className="w-14 shrink-0 text-center font-mono text-[var(--arca-ink-3)]">
                {r.priority}
              </div>
              <div className="flex-1 min-w-0 truncate font-medium text-[var(--arca-ink)]">
                {r.name}
              </div>
              <div className="w-24 shrink-0">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                  {
                    MAPPING_SOURCE_LABELS[
                      r.sourceModule as 'invoice' | 'payroll'
                    ]
                  }
                </span>
              </div>
              <div className="w-28 shrink-0 text-[11.5px] text-[var(--arca-ink-3)]">
                {
                  MAPPING_RULE_TYPE_LABELS[
                    r.ruleType as 'default' | 'conditional'
                  ]
                }
              </div>
              <div className="w-16 shrink-0 text-center text-[var(--arca-ink-2)]">
                {r.lineCount}
              </div>
              <div className="w-24 shrink-0 flex justify-center">
                {isOwner ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMut.mutate({ id: r.id, isActive: !r.isActive });
                    }}
                    title={
                      r.isActive ? 'Clic para desactivar' : 'Clic para activar'
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium hover:opacity-80"
                    style={{
                      background: r.isActive
                        ? 'color-mix(in oklch, oklch(0.45 0.14 145), transparent 88%)'
                        : 'var(--arca-surface-2)',
                      color: r.isActive
                        ? 'oklch(0.40 0.14 145)'
                        : 'var(--arca-ink-3)',
                    }}
                  >
                    <Power className="w-2.5 h-2.5" strokeWidth={2} />
                    {r.isActive ? 'Activa' : 'Inactiva'}
                  </button>
                ) : (
                  <span className="text-[10.5px] text-[var(--arca-ink-3)]">
                    {r.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </ArcaCard>

      {editor && (
        <RuleEditorDialog
          clientId={clientId}
          state={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            invalidate();
          }}
        />
      )}
      {detailId && (
        <RuleDetailDialog
          ruleId={detailId}
          isOwner={isOwner}
          onClose={() => setDetailId(null)}
          onEdit={(id) => {
            setDetailId(null);
            setEditor({ mode: 'edit', ruleId: id });
          }}
          onChanged={invalidate}
        />
      )}
      {importOpen && (
        <ImportRulesDialog
          clientId={clientId}
          clients={clients}
          onClose={() => setImportOpen(false)}
          onDone={() => {
            setImportOpen(false);
            invalidate();
          }}
        />
      )}
    </>
  );
}

function RuleEditorDialog({
  clientId,
  state,
  onClose,
  onSaved,
}: {
  clientId: string;
  state: RuleEditorState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = state.mode === 'edit';
  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });
  const { data: existing } = useQuery({
    queryKey: ['accounting', 'rule', isEdit ? state.ruleId : 'new'],
    queryFn: () =>
      getMappingRule({ data: { id: (state as { ruleId: string }).ruleId } }),
    enabled: isEdit,
  });

  const [name, setName] = useState('');
  const [sourceModule, setSourceModule] = useState<'invoice' | 'payroll'>(
    'invoice'
  );
  const [ruleType, setRuleType] = useState<'default' | 'conditional'>(
    'default'
  );
  const [conditionText, setConditionText] = useState('');
  const [priority, setPriority] = useState('100');
  const [lines, setLines] = useState<RuleLineDraft[]>([
    emptyRuleLine('debit'),
    emptyRuleLine('credit'),
  ]);
  const [loaded, setLoaded] = useState(!isEdit);

  if (isEdit && existing && !loaded) {
    setName(existing.rule.name);
    setSourceModule(existing.rule.sourceModule);
    setRuleType(existing.rule.ruleType);
    setConditionText(
      existing.rule.condition
        ? JSON.stringify(existing.rule.condition, null, 2)
        : ''
    );
    setPriority(String(existing.rule.priority));
    setLines(
      existing.lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis,
        fixedAmount: l.fixedAmount != null ? String(l.fixedAmount) : '',
        description: l.description ?? '',
      }))
    );
    setLoaded(true);
  }

  const updateLine = (i: number, patch: Partial<RuleLineDraft>) =>
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
    );

  const hasDebit = lines.some((l) => l.side === 'debit');
  const hasCredit = lines.some((l) => l.side === 'credit');
  const linesOk =
    lines.length >= 2 &&
    hasDebit &&
    hasCredit &&
    lines.every(
      (l) =>
        l.accountId && (l.amountBasis !== 'fixed' || num(l.fixedAmount) > 0)
    );
  const canSave = !!name.trim() && linesOk;

  const mut = useMutation({
    mutationFn: async () => {
      let condition: unknown = undefined;
      if (ruleType === 'conditional' && conditionText.trim()) {
        try {
          condition = JSON.parse(conditionText) as unknown;
        } catch {
          throw new Error('La condición no es un JSON válido');
        }
      }
      const payloadLines = lines.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountBasis: l.amountBasis as never,
        fixedAmount: l.amountBasis === 'fixed' ? num(l.fixedAmount) : null,
        description: l.description || undefined,
      }));
      const base = {
        name,
        sourceModule,
        ruleType,
        condition,
        priority: parseInt(priority, 10) || 100,
        lines: payloadLines,
      };
      if (isEdit) {
        await updateMappingRule({ data: { id: state.ruleId, ...base } });
      } else {
        await createMappingRule({ data: { clientId, ...base } });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Regla actualizada' : 'Regla creada');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[780px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Editar regla de mapeo' : 'Nueva regla de mapeo'}
          </DialogTitle>
          <DialogDescription>
            Una regla le enseña al sistema cómo armar un asiento automático.
          </DialogDescription>
        </DialogHeader>

        {/* Recuadro de ayuda en criollo */}
        <div
          className="flex gap-2 text-[12px] rounded-[10px] px-3 py-2.5 leading-relaxed"
          style={{
            background:
              'color-mix(in oklch, var(--arca-navy-900), transparent 94%)',
            color: 'var(--arca-ink-2)',
          }}
        >
          <Lightbulb
            className="w-4 h-4 shrink-0 mt-0.5 text-[var(--arca-navy-900)]"
            strokeWidth={1.8}
          />
          <div>
            <strong>¿Cómo funciona?</strong> Cuando entra un comprobante del
            módulo elegido (una factura o una liquidación de sueldos), el
            sistema arma un asiento usando estas líneas. Cada línea define{' '}
            <strong>qué cuenta</strong> tocar, si va al{' '}
            <strong>Debe o Haber</strong>, y de{' '}
            <strong>qué monto del comprobante</strong> sale (el total, el neto,
            el IVA…).
            <br />
            <span className="text-[var(--arca-ink-3)]">
              Ejemplo (factura de venta): Deudores por ventas → Debe → Total ·
              Ventas → Haber → Neto · IVA débito → Haber → IVA.
            </span>
          </div>
        </div>

        {isEdit && existing && existing.generatedOpenCount > 0 && (
          <div
            className="text-[12px] rounded-[8px] px-3 py-2"
            style={{
              background:
                'color-mix(in oklch, oklch(0.55 0.15 50), transparent 90%)',
              color: 'oklch(0.45 0.15 50)',
            }}
          >
            ⚠ {existing.generatedOpenCount} asiento(s) del período abierto se
            generaron con la versión anterior. No se regenerarán
            automáticamente.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 py-1">
          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Factura de venta tipo A"
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>
          <Field
            label={
              <>
                Módulo origen *
                <HelpTip text="De qué módulo viene el comprobante que dispara la regla: Facturas o Sueldos." />
              </>
            }
          >
            <select
              value={sourceModule}
              onChange={(e) =>
                setSourceModule(e.target.value as 'invoice' | 'payroll')
              }
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="invoice">Facturas</option>
              <option value="payroll">Sueldos</option>
            </select>
          </Field>
          <Field
            label={
              <>
                Prioridad
                <HelpTip text="Orden de evaluación cuando varias reglas podrían aplicar: gana la de menor número (la más específica primero)." />
              </>
            }
          >
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${INPUT_CLASS} w-full h-9`}
            />
          </Field>
          <Field
            label={
              <>
                Tipo
                <HelpTip text="Default: se aplica como regla por defecto del módulo. Condicional: solo se aplica si el comprobante cumple la condición que definas abajo." />
              </>
            }
          >
            <select
              value={ruleType}
              onChange={(e) =>
                setRuleType(e.target.value as 'default' | 'conditional')
              }
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="default">Default (fallback)</option>
              <option value="conditional">Condicional</option>
            </select>
          </Field>
          {ruleType === 'conditional' && (
            <Field
              label={
                <>
                  Condición (JSON)
                  <HelpTip text='Claves soportadas para facturas: "direction" ("sale" venta / "purchase" compra) y "type" (letra del comprobante, ej. "A" o ["A","M"]). La regla aplica solo si el comprobante cumple TODAS las claves.' />
                </>
              }
              full
            >
              <textarea
                value={conditionText}
                onChange={(e) => setConditionText(e.target.value)}
                rows={3}
                placeholder='Ej: {"direction":"sale","type":"A"}'
                className="w-full px-2.5 py-2 text-[12px] font-mono border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none resize-none"
              />
              <p className="mt-1 text-[11px] text-[var(--arca-ink-3)]">
                Venta = <code>{'{"direction":"sale"}'}</code> · Compra ={' '}
                <code>{'{"direction":"purchase"}'}</code>
              </p>
            </Field>
          )}
        </div>

        {/* Líneas-plantilla */}
        <div className="border border-[var(--arca-border)] rounded-[10px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-surface-2)] text-[10px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
            <div className="flex-1">Cuenta</div>
            <div className="w-20 flex items-center gap-1">
              Lado
              <HelpTip text="Si el importe va al Debe o al Haber del asiento." />
            </div>
            <div className="w-44 flex items-center gap-1">
              Base del monto
              <HelpTip text="De qué importe del comprobante sale esta línea: Total, Neto (sin IVA), IVA, otros impuestos, el valor de un concepto (sueldos) o un monto fijo." />
            </div>
            <div className="w-24 flex items-center gap-1">
              Monto fijo
              <HelpTip text="Solo si la base es 'Monto fijo': el importe exacto a usar. En los demás casos queda deshabilitado." />
            </div>
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
                <option value="">— Cuenta —</option>
                {postable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </select>
              <select
                value={l.side}
                onChange={(e) =>
                  updateLine(i, { side: e.target.value as 'debit' | 'credit' })
                }
                className={`${SELECT_CLASS} w-20 h-8`}
              >
                <option value="debit">Debe</option>
                <option value="credit">Haber</option>
              </select>
              <select
                value={l.amountBasis}
                onChange={(e) => updateLine(i, { amountBasis: e.target.value })}
                className={`${SELECT_CLASS} w-44 h-8`}
              >
                {AMOUNT_BASES.map((b) => (
                  <option key={b} value={b}>
                    {MAPPING_AMOUNT_BASIS_LABELS[b]}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={l.fixedAmount}
                disabled={l.amountBasis !== 'fixed'}
                onChange={(e) => updateLine(i, { fixedAmount: e.target.value })}
                className={`${INPUT_CLASS} w-24 h-8 text-right disabled:opacity-40`}
              />
              <button
                onClick={() =>
                  setLines((prev) => prev.filter((_, idx) => idx !== i))
                }
                disabled={lines.length <= 2}
                className="w-6 h-6 flex items-center justify-center rounded-[6px] text-[var(--arca-ink-3)] hover:text-[oklch(0.55_0.18_25)] disabled:opacity-30"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-3 py-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <button
              onClick={() =>
                setLines((prev) => [...prev, emptyRuleLine('debit')])
              }
              className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} /> Agregar línea
            </button>
            <span className="ml-auto text-[11.5px]">
              {linesOk ? (
                <span className="text-[oklch(0.40_0.14_145)]">
                  ✓ Líneas válidas
                </span>
              ) : (
                <span className="text-[var(--arca-ink-3)]">
                  Requiere ≥2 líneas, al menos una al Debe y una al Haber
                </span>
              )}
            </span>
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
            {mut.isPending ? 'Guardando…' : 'Guardar regla'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDetailDialog({
  ruleId,
  isOwner,
  onClose,
  onEdit,
  onChanged,
}: {
  ruleId: string;
  isOwner: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onChanged: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'rule', ruleId],
    queryFn: () => getMappingRule({ data: { id: ruleId } }),
  });
  const toggleMut = useMutation({
    mutationFn: (isActive: boolean) =>
      setMappingRuleActive({ data: { id: ruleId, isActive } }),
    onSuccess: () => {
      toast.success('Estado actualizado');
      onChanged();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
                {data.rule.name}
                {!data.rule.isActive && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                    Inactiva
                  </span>
                )}
              </DialogTitle>
              <DialogDescription>
                Módulo: {MAPPING_SOURCE_LABELS[data.rule.sourceModule]} ·{' '}
                {MAPPING_RULE_TYPE_LABELS[data.rule.ruleType]} · Prioridad{' '}
                {data.rule.priority}
              </DialogDescription>
            </DialogHeader>

            {data.rule.ruleType === 'conditional' && data.rule.condition && (
              <div className="text-[11.5px] font-mono rounded-[8px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] px-3 py-2 text-[var(--arca-ink-2)]">
                {JSON.stringify(data.rule.condition)}
              </div>
            )}

            <div className="border border-[var(--arca-border)] rounded-[10px] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--arca-surface-2)] text-[10px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
                <div className="flex-1">Cuenta</div>
                <div className="w-16">Lado</div>
                <div className="w-48">Base del monto</div>
              </div>
              {data.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12.5px]"
                >
                  <div className="flex-1 min-w-0 truncate">
                    <span className="font-mono text-[11px] text-[var(--arca-ink-3)]">
                      {l.accountCode}
                    </span>{' '}
                    {l.accountName}
                  </div>
                  <div className="w-16 font-medium">
                    {MAPPING_SIDE_LABELS[l.side]}
                  </div>
                  <div className="w-48 text-[var(--arca-ink-2)]">
                    {MAPPING_AMOUNT_BASIS_LABELS[l.amountBasis]}
                    {l.amountBasis === 'fixed' && l.fixedAmount
                      ? ` ($ ${fmtMoney(l.fixedAmount)})`
                      : ''}
                  </div>
                </div>
              ))}
            </div>

            {isOwner && (
              <DialogFooter>
                <button
                  onClick={() => toggleMut.mutate(!data.rule.isActive)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)]"
                >
                  <Power className="w-3.5 h-3.5" strokeWidth={1.8} />
                  {data.rule.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => onEdit(ruleId)}
                  className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white hover:opacity-90"
                >
                  <Pencil className="w-3.5 h-3.5" strokeWidth={1.8} /> Editar
                </button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportRulesDialog({
  clientId,
  clients,
  onClose,
  onDone,
}: {
  clientId: string;
  clients: AccClient[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState('');
  const others = clients.filter((c) => c.id !== clientId);

  const { data: preview = [] } = useQuery({
    queryKey: ['accounting', 'rules', fromId, ''],
    queryFn: () => listMappingRules({ data: { clientId: fromId } }),
    enabled: !!fromId,
  });

  const mut = useMutation({
    mutationFn: () =>
      importMappingRules({
        data: { fromClientId: fromId, toClientId: clientId },
      }),
    onSuccess: (res) => {
      toast.success(
        `${res.created} regla(s) importada(s) (inactivas)${res.skipped.length ? ` · ${res.skipped.length} omitida(s) por cuentas faltantes` : ''}`
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Importar reglas de otra empresa</DialogTitle>
          <DialogDescription>
            Se copian las reglas a esta empresa como <strong>inactivas</strong>.
            Las cuentas se resuelven por código; las reglas con cuentas que no
            existan acá se omiten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[var(--arca-ink-3)]">
              Empresa origen
            </label>
            <select
              value={fromId}
              onChange={(e) => setFromId(e.target.value)}
              className={`${SELECT_CLASS} w-full h-9`}
            >
              <option value="">— Elegí la empresa origen —</option>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {fromId && (
            <div className="border border-[var(--arca-border)] rounded-[8px] max-h-[240px] overflow-y-auto">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--arca-ink-3)] bg-[var(--arca-surface-2)]">
                Reglas a copiar ({preview.length})
              </div>
              {preview.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-[var(--arca-ink-3)] text-center">
                  Esa empresa no tiene reglas.
                </div>
              ) : (
                preview.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 px-3 py-1.5 border-t border-[var(--arca-border)] text-[12px]"
                  >
                    <span className="flex-1 min-w-0 truncate">{r.name}</span>
                    <span className="text-[var(--arca-ink-3)]">
                      {
                        MAPPING_SOURCE_LABELS[
                          r.sourceModule as 'invoice' | 'payroll'
                        ]
                      }{' '}
                      · {r.lineCount} líneas
                    </span>
                  </div>
                ))
              )}
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
            disabled={!fromId || preview.length === 0 || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Importando…' : 'Importar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════ Contabilizar facturas (US 3.2.x) ════════════════════ */

type PostingInvoice = Awaited<
  ReturnType<typeof getInvoicePostingPreview>
>['invoices'][number];

function Contabilizar({
  clientId,
  canWrite,
}: {
  clientId: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'all' | 'sale' | 'purchase'>(
    'all'
  );
  const [includePosted, setIncludePosted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmReg, setConfirmReg] = useState<{
    invoiceId: string;
    number: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [
      'accounting',
      'posting-preview',
      clientId,
      direction,
      includePosted,
    ],
    queryFn: () =>
      getInvoicePostingPreview({
        data: { clientId, direction, includePosted },
      }),
  });

  const invoices = data?.invoices ?? [];
  const hasFy = data?.hasFiscalYear ?? true;

  // Solo se pueden contabilizar las pendientes con período abierto.
  const selectable = useMemo(
    () => invoices.filter((i) => !i.posted && i.periodStatus !== 'closed'),
    [invoices]
  );

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const genMut = useMutation({
    mutationFn: (ids: string[]) =>
      generateInvoiceEntries({ data: { clientId, invoiceIds: ids } }),
    onSuccess: (r) => {
      const parts = [`${r.created} asiento(s) generado(s)`];
      if (r.pendingReview > 0)
        parts.push(`${r.pendingReview} con pendiente de revisión`);
      const skipped =
        r.skippedExists +
        r.skippedNoFy +
        r.skippedClosed +
        r.skippedNonPositive;
      if (skipped > 0) parts.push(`${skipped} omitida(s)`);
      if (r.created > 0) toast.success(parts.join(' · '));
      else toast.message(parts.join(' · '));
      if (r.errors.length > 0)
        toast.error(`${r.errors.length} con error (revisá las reglas)`);
      setSelected(new Set());
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regMut = useMutation({
    mutationFn: (v: { invoiceId: string; number: number; force: boolean }) =>
      regenerateInvoiceEntry({
        data: { clientId, invoiceId: v.invoiceId, force: v.force },
      }),
    onSuccess: (r, v) => {
      if ('needsConfirmation' in r && r.needsConfirmation) {
        setConfirmReg({
          invoiceId: v.invoiceId,
          number: r.entryNumber ?? v.number,
        });
        return;
      }
      toast.success('Asiento regenerado');
      setConfirmReg(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected =
    selectable.length > 0 && selected.size === selectable.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((i) => i.id)));

  if (!hasFy) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Esta empresa todavía no tiene un ejercicio contable. Creá uno en la
          pestaña <strong>Ejercicios</strong> para poder contabilizar
          comprobantes.
        </div>
      </ArcaCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* Explicación */}
      <div className="flex gap-2 rounded-[10px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3 text-[12px] leading-relaxed text-[var(--arca-ink-2)]">
        <Lightbulb
          className="w-4 h-4 shrink-0 mt-0.5 text-[var(--arca-navy-900)]"
          strokeWidth={1.8}
        />
        <div>
          <strong>Contabilizar comprobantes.</strong> Acá generás los asientos
          automáticos de las facturas aplicando las{' '}
          <strong>reglas de mapeo</strong>. Revisá la regla que matchea cada
          comprobante y generá los que estén correctos. Si una factura no tiene
          regla (o tiene percepciones/otros impuestos sin mapear), el asiento se
          crea con la cuenta <strong>Pendiente de revisión</strong>, que bloquea
          el cierre hasta que la corrijas a mano.
        </div>
      </div>

      {/* Controles */}
      <ArcaCard>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--arca-border)]">
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as 'all' | 'sale' | 'purchase');
              setSelected(new Set());
            }}
            className="h-8 px-2 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] bg-white"
          >
            <option value="all">Ventas y compras</option>
            <option value="sale">Solo ventas</option>
            <option value="purchase">Solo compras</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--arca-ink-2)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePosted}
              onChange={(e) => setIncludePosted(e.target.checked)}
            />
            Mostrar ya contabilizadas
          </label>
          <div className="flex-1" />
          {canWrite && (
            <button
              onClick={() => genMut.mutate([...selected])}
              disabled={selected.size === 0 || genMut.isPending}
              className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" strokeWidth={2} />
              {genMut.isPending
                ? 'Generando…'
                : `Generar ${selected.size > 0 ? `(${selected.size})` : 'seleccionadas'}`}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando comprobantes…
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            {includePosted
              ? 'No hay comprobantes en el rango de los ejercicios.'
              : 'No hay comprobantes pendientes de contabilizar.'}
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
                <th className="w-9 py-2 pl-4">
                  {canWrite && selectable.length > 0 && (
                    <button
                      onClick={toggleAll}
                      className="inline-flex"
                      title="Seleccionar todo"
                    >
                      {allSelected ? (
                        <CheckSquare
                          className="w-4 h-4 text-[var(--arca-navy-900)]"
                          strokeWidth={2}
                        />
                      ) : (
                        <Square
                          className="w-4 h-4 text-[var(--arca-ink-3)]"
                          strokeWidth={2}
                        />
                      )}
                    </button>
                  )}
                </th>
                <th className="py-2">Fecha</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Contraparte</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 pl-4">Regla / Estado</th>
                <th className="py-2 pr-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <PostingRow
                  key={inv.id}
                  inv={inv}
                  canWrite={canWrite}
                  checked={selected.has(inv.id)}
                  onToggle={() => toggle(inv.id)}
                  onRegenerate={() =>
                    regMut.mutate({
                      invoiceId: inv.id,
                      number: inv.entryNumber ?? 0,
                      force: false,
                    })
                  }
                  regenerating={regMut.isPending}
                />
              ))}
            </tbody>
          </table>
        )}
      </ArcaCard>

      {/* Confirmación de sobreescritura de asiento editado a mano */}
      <AlertDialog
        open={!!confirmReg}
        onOpenChange={(o) => !o && setConfirmReg(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este asiento fue editado a mano</AlertDialogTitle>
            <AlertDialogDescription>
              El asiento N°{confirmReg?.number} se editó manualmente después de
              generarse. Si lo regenerás, se anulará y se reemplazará por uno
              nuevo según las reglas actuales, perdiendo los cambios manuales.
              ¿Querés sobreescribirlo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmReg(null)}>
              Mantener manual
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReg)
                  regMut.mutate({
                    invoiceId: confirmReg.invoiceId,
                    number: confirmReg.number,
                    force: true,
                  });
              }}
            >
              Sobreescribir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PostingRow({
  inv,
  canWrite,
  checked,
  onToggle,
  onRegenerate,
  regenerating,
}: {
  inv: PostingInvoice;
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const closed = inv.periodStatus === 'closed';
  const selectable = !inv.posted && !closed;
  const dirLabel =
    inv.direction === 'sale'
      ? 'Venta'
      : inv.direction === 'purchase'
        ? 'Compra'
        : '—';

  return (
    <tr className="border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]">
      <td className="py-2 pl-4">
        {canWrite && selectable && (
          <button onClick={onToggle} className="inline-flex">
            {checked ? (
              <CheckSquare
                className="w-4 h-4 text-[var(--arca-navy-900)]"
                strokeWidth={2}
              />
            ) : (
              <Square
                className="w-4 h-4 text-[var(--arca-ink-3)]"
                strokeWidth={2}
              />
            )}
          </button>
        )}
      </td>
      <td className="py-2 whitespace-nowrap">{fmtFecha(inv.emitionDate)}</td>
      <td className="py-2">
        <span className="text-[var(--arca-ink-3)]">{dirLabel}</span> {inv.type}
      </td>
      <td className="py-2 max-w-[220px] truncate" title={inv.counterparty}>
        {inv.counterparty}
      </td>
      <td className="py-2 text-right tabular-nums whitespace-nowrap">
        $ {fmtMoney(inv.total)}
      </td>
      <td className="py-2 pl-4">
        {inv.posted ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="px-1.5 py-px rounded-full text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200">
              Asiento N°{inv.entryNumber}
            </span>
            {inv.entryEdited && (
              <span className="px-1.5 py-px rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                editado
              </span>
            )}
          </span>
        ) : closed ? (
          <span className="text-[var(--arca-ink-3)]">Período cerrado</span>
        ) : inv.ruleName ? (
          <span className="inline-flex items-center gap-1.5">
            <span>{inv.ruleName}</span>
            {inv.willUsePendingReview && (
              <span
                className="px-1.5 py-px rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200"
                title="Tiene otros impuestos/percepciones sin mapear: la diferencia irá a Pendiente de revisión"
              >
                + pendiente
              </span>
            )}
          </span>
        ) : (
          <span className="px-1.5 py-px rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
            Sin regla → Pendiente de revisión
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        {inv.posted && canWrite && !closed && (
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1 text-[12px] text-[var(--arca-ink-2)] hover:text-[var(--arca-navy-900)] disabled:opacity-50"
            title="Anular el asiento actual y regenerarlo con las reglas vigentes"
          >
            <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
            Regenerar
          </button>
        )}
      </td>
    </tr>
  );
}

/* ════════════════ Bandeja de pendientes de revisión (US 3.4.x) ════════════════ */

function Pendientes({
  clientId,
  canWrite,
  onGoToReglas,
}: {
  clientId: string;
  canWrite: boolean;
  onGoToReglas: () => void;
}) {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['accounting', 'pending-review', clientId],
    queryFn: () => getPendingReviewEntries({ data: { clientId } }),
  });
  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting'] });
  };

  const openEditorFromDetail = (
    _action: 'edit' | 'duplicate',
    initial: EditorInitial
  ) => {
    setDetailId(null);
    setEditor({ mode: 'edit', initial });
  };

  return (
    <div className="space-y-4">
      {/* Explicación */}
      <div className="flex gap-2 rounded-[10px] border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12px] leading-relaxed text-[var(--arca-ink-2)]">
        <AlertTriangle
          className="w-4 h-4 shrink-0 mt-0.5 text-amber-600"
          strokeWidth={1.8}
        />
        <div>
          <strong>Pendientes de revisión.</strong> Asientos automáticos que el
          sistema no pudo imputar del todo a una cuenta concreta (falta una
          regla, o hay impuestos/conceptos sin mapear). Quedan en la cuenta{' '}
          <strong>Pendiente de revisión</strong> y{' '}
          <strong>bloquean el cierre</strong> del período hasta resolverlos.
          Abrí cada uno para corregir las cuentas, o configurá una regla para
          que se mapee bien la próxima vez.
        </div>
      </div>

      <ArcaCard>
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Cargando…
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay asientos pendientes de revisión.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
                <th className="py-2 pl-4">N°</th>
                <th className="py-2">Fecha</th>
                <th className="py-2">Período</th>
                <th className="py-2">Origen</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">A revisar</th>
                <th className="py-2 pl-4">Qué falta</th>
                <th className="py-2 pr-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <PendingRow
                  key={e.id}
                  entry={e}
                  canWrite={canWrite}
                  onOpen={() => setDetailId(e.id)}
                  onCreateRule={onGoToReglas}
                />
              ))}
            </tbody>
          </table>
        )}
      </ArcaCard>

      {detailId && (
        <AsientoDetail
          entryId={detailId}
          canWrite={canWrite}
          onClose={() => setDetailId(null)}
          onAction={openEditorFromDetail}
          onChanged={invalidate}
        />
      )}

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
    </div>
  );
}

function PendingRow({
  entry,
  canWrite,
  onOpen,
  onCreateRule,
}: {
  entry: PendingReviewEntry;
  canWrite: boolean;
  onOpen: () => void;
  onCreateRule: () => void;
}) {
  const closed = entry.periodStatus === 'closed';
  return (
    <tr className="border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]">
      <td className="py-2 pl-4 tabular-nums">{entry.number}</td>
      <td className="py-2 whitespace-nowrap">{fmtFecha(entry.entryDate)}</td>
      <td className="py-2 whitespace-nowrap">
        {MONTH_NAMES[entry.periodMonth]} {entry.periodYear}
        {closed && (
          <span className="ml-1 text-[10px] text-[var(--arca-ink-3)]">
            (cerrado)
          </span>
        )}
      </td>
      <td className="py-2">
        {JOURNAL_ORIGIN_LABELS[entry.origin] ?? entry.origin}
      </td>
      <td className="py-2 text-right tabular-nums whitespace-nowrap">
        $ {fmtMoney(entry.total)}
      </td>
      <td className="py-2 text-right tabular-nums whitespace-nowrap text-amber-700 font-medium">
        $ {fmtMoney(entry.pendingAmount)}
      </td>
      <td className="py-2 pl-4 max-w-[280px]">
        <span className="text-[var(--arca-ink-2)]">
          {entry.motivos.length > 0 ? entry.motivos.join(' · ') : 'Sin detalle'}
        </span>
      </td>
      <td className="py-2 pr-4 text-right whitespace-nowrap">
        <button
          onClick={onOpen}
          className="text-[12px] text-[var(--arca-navy-900)] hover:underline"
        >
          {canWrite ? 'Resolver' : 'Ver'}
        </button>
        {canWrite && (
          <button
            onClick={onCreateRule}
            className="ml-3 text-[12px] text-[var(--arca-ink-2)] hover:text-[var(--arca-navy-900)]"
            title="Ir a Reglas para configurar el mapeo y evitar que vuelva a pasar"
          >
            Crear regla
          </button>
        )}
      </td>
    </tr>
  );
}

/* ════════════════════════ Bienes de uso (US 4.1.x) ════════════════════════ */

function BienesDeUso({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<'inventario' | 'anexo'>('inventario');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('active');
  const [showEditor, setShowEditor] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<FixedAssetRow | null>(
    null
  );

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['accounting', 'fixed-assets', clientId, category, status],
    queryFn: () =>
      listFixedAssets({
        data: {
          clientId,
          category: category || undefined,
          status: (status || undefined) as never,
        },
      }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['accounting', 'fixed-assets'] });
  };

  return (
    <div className="space-y-4">
      {/* Sub-toggle Inventario | Anexo I */}
      <div className="inline-flex rounded-[8px] border border-[var(--arca-border)] p-0.5 bg-[var(--arca-surface-2)]">
        {(['inventario', 'anexo'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="px-3 h-7 text-[12.5px] font-medium rounded-[6px] transition-colors"
            style={{
              background: view === v ? 'var(--arca-surface)' : 'transparent',
              color: view === v ? 'var(--arca-ink)' : 'var(--arca-ink-3)',
              boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {v === 'inventario' ? 'Inventario' : 'Anexo I'}
          </button>
        ))}
      </div>

      {view === 'anexo' ? (
        <AnexoIView
          clientId={clientId}
          canWrite={canWrite}
          clientName={clientName}
        />
      ) : (
        <ArcaCard>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--arca-border)]">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Todas las categorías</option>
              {Object.entries(FIXED_ASSET_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="sold">Vendidos</option>
              <option value="discarded">Dados de baja</option>
            </select>
            <div className="flex-1" />
            {canWrite && (
              <button
                onClick={() => setShowEditor(true)}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white inline-flex items-center gap-1.5"
              >
                <Boxes className="w-3.5 h-3.5" strokeWidth={2} />
                Nuevo bien
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              Cargando…
            </div>
          ) : assets.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
              No hay bienes de uso para este filtro.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
                  <th className="py-2 pl-4">Nombre</th>
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Fecha adq.</th>
                  <th className="py-2 text-right">Valor origen</th>
                  <th className="py-2 text-right">Amort. acum.</th>
                  <th className="py-2 text-right">Valor residual</th>
                  <th className="py-2 pl-3">Estado</th>
                  <th className="py-2 pr-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--arca-border)] last:border-0 hover:bg-[var(--arca-surface-2)]"
                  >
                    <td className="py-2 pl-4 font-medium text-[var(--arca-ink)]">
                      {a.name}
                    </td>
                    <td className="py-2">
                      {FIXED_ASSET_CATEGORY_LABELS[a.category] ?? a.category}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {fmtFecha(a.acquisitionDate)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap">
                      $ {fmtMoney(a.originalValue)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap text-[var(--arca-ink-3)]">
                      $ {fmtMoney(a.accumulatedDepreciation)}
                    </td>
                    <td className="py-2 text-right tabular-nums whitespace-nowrap font-medium">
                      $ {fmtMoney(a.bookValue)}
                    </td>
                    <td className="py-2 pl-3">
                      <FixedAssetStatusBadge
                        status={a.status}
                        reason={a.disposalReason}
                      />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {canWrite && a.status === 'active' && (
                        <button
                          onClick={() => setDisposeTarget(a)}
                          className="text-[12px] text-[var(--arca-ink-2)] hover:text-red-600"
                        >
                          Dar de baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ArcaCard>
      )}

      {showEditor && (
        <FixedAssetEditor
          clientId={clientId}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            invalidate();
          }}
        />
      )}

      {disposeTarget && (
        <DisposeAssetDialog
          asset={disposeTarget}
          onClose={() => setDisposeTarget(null)}
          onSaved={() => {
            setDisposeTarget(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function FixedAssetStatusBadge({
  status,
  reason,
}: {
  status: string;
  reason: string | null;
}) {
  const color =
    status === 'active' ? 'oklch(0.45 0.14 145)' : 'oklch(0.50 0.02 260)';
  const label = FIXED_ASSET_STATUS_LABELS[status] ?? status;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
      style={{
        background: `color-mix(in oklch, ${color}, transparent 86%)`,
        color,
      }}
      title={reason ? FIXED_ASSET_DISPOSAL_REASON_LABELS[reason] : undefined}
    >
      {label}
      {reason ? ` · ${FIXED_ASSET_DISPOSAL_REASON_LABELS[reason]}` : ''}
    </span>
  );
}

function FixedAssetEditor({
  clientId,
  onClose,
  onSaved,
}: {
  clientId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('rodados');
  const [assetAccountId, setAssetAccountId] = useState('');
  const [accumDeprAccountId, setAccumDeprAccountId] = useState('');
  const [deprExpenseAccountId, setDeprExpenseAccountId] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [usefulLifeYears, setUsefulLifeYears] = useState('');
  const [residualValue, setResidualValue] = useState('0');

  const { data: accounts } = useQuery({
    queryKey: ['accounting', 'fixed-asset-accounts', clientId],
    queryFn: () => getFixedAssetAccounts({ data: { clientId } }),
  });

  const ov = num(originalValue);
  const rv = num(residualValue);
  const life = parseInt(usefulLifeYears, 10);
  const monthly =
    ov > 0 && life > 0 && rv < ov
      ? monthlyDepreciation({
          acquisitionDate: acquisitionDate || '2000-01-01',
          originalValue: ov,
          usefulLifeYears: life,
          residualValue: rv,
          status: 'active',
        })
      : 0;

  const mut = useMutation({
    mutationFn: async () => {
      await createFixedAsset({
        data: {
          clientId,
          name: name.trim(),
          category: category as 'rodados',
          assetAccountId,
          accumDeprAccountId,
          deprExpenseAccountId,
          acquisitionDate,
          originalValue: ov,
          usefulLifeYears: life,
          residualValue: rv,
        },
      });
    },
    onSuccess: () => {
      toast.success('Bien de uso registrado');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid =
    name.trim() &&
    assetAccountId &&
    accumDeprAccountId &&
    deprExpenseAccountId &&
    acquisitionDate &&
    ov > 0 &&
    life > 0 &&
    rv < ov;

  const accSelect = (
    value: string,
    onChange: (v: string) => void,
    opts: { id: string; code: string; name: string }[] | undefined,
    placeholder: string
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${SELECT_CLASS} w-0 min-w-0 flex-1`}
    >
      <option value="">{placeholder}</option>
      {(opts ?? []).map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo bien de uso</DialogTitle>
          <DialogDescription>
            El sistema calculará la amortización lineal automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre *" full>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Toyota Hilux 2024"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Categoría *">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={SELECT_CLASS}
            >
              {Object.entries(FIXED_ASSET_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fecha de adquisición *">
            <input
              type="date"
              value={acquisitionDate}
              onChange={(e) => setAcquisitionDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            label={
              <>
                Cuenta del activo *
                <HelpTip text="Dónde se registra el bien en el activo. Solo cuentas de Bienes de uso (saldo deudor)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                assetAccountId,
                setAssetAccountId,
                accounts?.assetAccounts,
                'Elegí la cuenta del activo…'
              )}
            </div>
          </Field>

          <Field
            label={
              <>
                Cuenta de amortización acumulada *
                <HelpTip text="Regularizadora del activo. Solo cuentas '(-) Amortización acumulada…' (saldo acreedor)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                accumDeprAccountId,
                setAccumDeprAccountId,
                accounts?.accumAccounts,
                'Elegí la cuenta de amort. acumulada…'
              )}
            </div>
          </Field>

          <Field
            label={
              <>
                Cuenta de gasto de amortización *
                <HelpTip text="A qué gasto impacta la amortización del período. Solo cuentas de resultado negativo (gastos)." />
              </>
            }
            full
          >
            <div className="flex">
              {accSelect(
                deprExpenseAccountId,
                setDeprExpenseAccountId,
                accounts?.expenseAccounts,
                'Elegí la cuenta de gasto…'
              )}
            </div>
          </Field>

          <Field label="Valor de origen *">
            <input
              type="number"
              value={originalValue}
              onChange={(e) => setOriginalValue(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Valor residual">
            <input
              type="number"
              value={residualValue}
              onChange={(e) => setResidualValue(e.target.value)}
              placeholder="0.00"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Vida útil (años) *">
            <input
              type="number"
              value={usefulLifeYears}
              onChange={(e) => setUsefulLifeYears(e.target.value)}
              placeholder="Ej: 5"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Método">
            <input
              value="Lineal"
              disabled
              className={`${INPUT_CLASS} opacity-60`}
            />
          </Field>
        </div>

        {/* Preview de amortización mensual */}
        <div className="mt-1 flex items-center justify-between rounded-[8px] bg-[var(--arca-surface-2)] px-4 py-2.5 text-[12.5px]">
          <span className="text-[var(--arca-ink-2)]">
            Amortización mensual (lineal)
          </span>
          <span className="font-semibold tabular-nums text-[var(--arca-ink)]">
            $ {fmtMoney(monthly)}
            <span className="ml-2 text-[11px] font-normal text-[var(--arca-ink-3)]">
              {life > 0 ? `· $ ${fmtMoney(monthly * 12)} / año` : ''}
            </span>
          </span>
        </div>
        {rv >= ov && ov > 0 && (
          <p className="text-[11px] text-red-600">
            El valor residual debe ser menor al valor de origen.
          </p>
        )}

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!valid || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Guardando…' : 'Registrar bien'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeAssetDialog({
  asset,
  onClose,
  onSaved,
}: {
  asset: FixedAssetRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [disposalDate, setDisposalDate] = useState('');
  const [reason, setReason] = useState<'sale' | 'disuse' | 'destruction'>(
    'sale'
  );

  const mut = useMutation({
    mutationFn: async () => {
      await disposeFixedAsset({ data: { id: asset.id, disposalDate, reason } });
    },
    onSuccess: () => {
      toast.success('Bien dado de baja');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dar de baja: {asset.name}</DialogTitle>
          <DialogDescription>
            A partir de la fecha de baja deja de amortizarse. No se borra el
            historial.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha de baja *">
            <input
              type="date"
              value={disposalDate}
              onChange={(e) => setDisposalDate(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Motivo *">
            <select
              value={reason}
              onChange={(e) =>
                setReason(e.target.value as 'sale' | 'disuse' | 'destruction')
              }
              className={SELECT_CLASS}
            >
              {Object.entries(FIXED_ASSET_DISPOSAL_REASON_LABELS).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                )
              )}
            </select>
          </Field>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!disposalDate || mut.isPending}
            className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-red-600 text-white disabled:opacity-50"
          >
            {mut.isPending ? 'Procesando…' : 'Confirmar baja'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ════════════════════════ Anexo I (US 4.2.x) ════════════════════════ */

function AnexoIView({
  clientId,
  canWrite,
  clientName,
}: {
  clientId: string;
  canWrite: boolean;
  clientName: string;
}) {
  const [selectedFyId, setSelectedFyId] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);

  const { data: fiscalYears = [] } = useQuery({
    queryKey: ['accounting', 'fiscal-years', clientId],
    queryFn: () => getFiscalYears({ data: { clientId } }),
  });
  const effectiveFyId =
    selectedFyId ||
    fiscalYears.find((y) => y.status === 'open')?.id ||
    fiscalYears[0]?.id ||
    '';

  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'anexo-i', clientId, effectiveFyId],
    queryFn: () =>
      getAnexoI({ data: { clientId, fiscalYearId: effectiveFyId } }),
    enabled: !!effectiveFyId,
  });

  const { data: postable = [] } = useQuery({
    queryKey: ['accounting', 'postable', clientId],
    queryFn: () => getPostableAccounts({ data: { clientId } }),
  });

  if (fiscalYears.length === 0) {
    return (
      <ArcaCard>
        <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
          Creá un ejercicio en la pestaña <strong>Ejercicios</strong> para
          generar el Anexo I.
        </div>
      </ArcaCard>
    );
  }

  const periodLabel = data
    ? `${fmtFecha(data.fiscalYear.startDate)} – ${fmtFecha(data.fiscalYear.endDate)}`
    : '';

  const buildExportData = (): AnexoIExportData => ({
    empresaName: clientName,
    fiscalYearNumber: data!.fiscalYear.number,
    periodLabel,
    categories: data!.categories.map((c) => ({
      category: FIXED_ASSET_CATEGORY_LABELS[c.category] ?? c.category,
      assets: c.assets.map((a) => ({
        name: a.name,
        originalValue: a.originalValue,
        accumStart: a.accumStart,
        amortYear: a.amortYear,
        accumEnd: a.accumEnd,
        residualEnd: a.residualEnd,
      })),
      totals: c.totals,
    })),
    grandTotals: data!.grandTotals,
    priorResidualEnd: data!.prior?.grandTotals.residualEnd ?? null,
    priorNumber: data!.prior?.number ?? null,
  });

  const copyToEditor = () => {
    if (!data) return;
    const lines: LineDraft[] = data.suggestion.lines.map((l) => ({
      accountId: l.accountId,
      debit: l.side === 'debit' ? String(l.amount) : '',
      credit: l.side === 'credit' ? String(l.amount) : '',
      description: 'Amortización del ejercicio',
    }));
    setEditor({
      mode: 'create',
      initial: {
        entryDate: new Date(data.fiscalYear.endDate).toISOString().slice(0, 10),
        description: `Amortización del ejercicio N°${data.fiscalYear.number}`,
        lines,
      },
    });
  };

  return (
    <div className="space-y-4">
      <ArcaCard>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[var(--arca-border)]">
          <span className="text-[12px] text-[var(--arca-ink-3)]">
            Ejercicio
          </span>
          <select
            value={effectiveFyId}
            onChange={(e) => setSelectedFyId(e.target.value)}
            className={SELECT_CLASS}
          >
            {fiscalYears.map((y) => (
              <option key={y.id} value={y.id}>
                N°{y.number} ({y.status === 'open' ? 'abierto' : 'cerrado'})
              </option>
            ))}
          </select>
          <div className="flex-1" />
          {data && data.categories.length > 0 && (
            <>
              <button
                onClick={() => void exportAnexoIExcel(buildExportData())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> Excel
              </button>
              <button
                onClick={() => void exportAnexoIPdf(buildExportData())}
                className="h-8 px-3 text-[12.5px] rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={2} /> PDF
              </button>
            </>
          )}
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            Calculando…
          </div>
        ) : !data || data.categories.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--arca-ink-3)]">
            No hay bienes de uso en este ejercicio.
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
                <th className="py-2 pl-4">Bien</th>
                <th className="py-2 text-right">Valor origen</th>
                <th className="py-2 text-right">Am. acum. inicio</th>
                <th className="py-2 text-right">Am. ejercicio</th>
                <th className="py-2 text-right">Am. acum. cierre</th>
                <th className="py-2 pr-4 text-right">Valor resid. cierre</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((cat) => (
                <AnexoICategoryRows key={cat.category} cat={cat} />
              ))}
              <tr className="border-t-2 border-[var(--arca-ink-2)] font-semibold">
                <td className="py-2 pl-4">TOTAL GENERAL</td>
                <td className="py-2 text-right tabular-nums">
                  $ {fmtMoney(data.grandTotals.originalValue)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  $ {fmtMoney(data.grandTotals.accumStart)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  $ {fmtMoney(data.grandTotals.amortYear)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  $ {fmtMoney(data.grandTotals.accumEnd)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  $ {fmtMoney(data.grandTotals.residualEnd)}
                </td>
              </tr>
              {data.prior && (
                <tr className="text-[var(--arca-ink-3)] text-[11.5px]">
                  <td className="py-1.5 pl-4 italic" colSpan={5}>
                    Valor residual al cierre · Ejercicio anterior (N°
                    {data.prior.number})
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums italic">
                    $ {fmtMoney(data.prior.grandTotals.residualEnd)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </ArcaCard>

      {/* Sugerencia de asiento de amortización (US 4.2.2) */}
      {data && data.suggestion.lines.length > 0 && (
        <ArcaCard>
          <div className="px-4 py-3 border-b border-[var(--arca-border)] flex items-center gap-2">
            <Lightbulb
              className="w-4 h-4 text-[var(--arca-navy-900)]"
              strokeWidth={1.8}
            />
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Sugerencia de asiento de amortización del ejercicio
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="text-[12px] text-[var(--arca-ink-3)] mb-3">
              Cálculo sugerido para que lo cargues como asiento manual al
              cierre. El asiento no se genera automáticamente en esta versión.
            </p>
            <table className="w-full text-[12.5px] mb-3">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--arca-ink-3)] border-b border-[var(--arca-border)]">
                  <th className="py-1.5">Cuenta</th>
                  <th className="py-1.5 text-right">Debe</th>
                  <th className="py-1.5 text-right">Haber</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestion.lines.map((l, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--arca-border)] last:border-0"
                  >
                    <td className="py-1.5">
                      <span className="text-[var(--arca-ink-3)]">{l.code}</span>{' '}
                      {l.name}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.side === 'debit' ? `$ ${fmtMoney(l.amount)}` : ''}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.side === 'credit' ? `$ ${fmtMoney(l.amount)}` : ''}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold border-t border-[var(--arca-ink-3)]">
                  <td className="py-1.5 text-right">Total</td>
                  <td className="py-1.5 text-right tabular-nums">
                    $ {fmtMoney(data.suggestion.total)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    $ {fmtMoney(data.suggestion.total)}
                  </td>
                </tr>
              </tbody>
            </table>
            {canWrite && (
              <button
                onClick={copyToEditor}
                className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-navy-900)] text-white inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" strokeWidth={2} />
                Copiar al editor de asientos
              </button>
            )}
          </div>
        </ArcaCard>
      )}

      {editor && (
        <AsientoEditor
          clientId={clientId}
          state={editor}
          postable={postable}
          onClose={() => setEditor(null)}
          onSaved={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function AnexoICategoryRows({
  cat,
}: {
  cat: Awaited<ReturnType<typeof getAnexoI>>['categories'][number];
}) {
  return (
    <>
      <tr className="bg-[var(--arca-surface-2)]">
        <td
          className="py-1.5 pl-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--arca-ink-2)]"
          colSpan={6}
        >
          {FIXED_ASSET_CATEGORY_LABELS[cat.category] ?? cat.category}
        </td>
      </tr>
      {cat.assets.map((a) => (
        <tr
          key={a.id}
          className="border-b border-[var(--arca-border)] last:border-0"
        >
          <td className="py-2 pl-4">
            {a.name}
            {a.disposed && (
              <span className="ml-1 text-[10px] text-[var(--arca-ink-3)]">
                (baja)
              </span>
            )}
          </td>
          <td className="py-2 text-right tabular-nums">
            $ {fmtMoney(a.originalValue)}
          </td>
          <td className="py-2 text-right tabular-nums text-[var(--arca-ink-3)]">
            $ {fmtMoney(a.accumStart)}
          </td>
          <td className="py-2 text-right tabular-nums">
            $ {fmtMoney(a.amortYear)}
          </td>
          <td className="py-2 text-right tabular-nums text-[var(--arca-ink-3)]">
            $ {fmtMoney(a.accumEnd)}
          </td>
          <td className="py-2 pr-4 text-right tabular-nums font-medium">
            $ {fmtMoney(a.residualEnd)}
          </td>
        </tr>
      ))}
      <tr className="border-b border-[var(--arca-border)] text-[12px] font-medium">
        <td className="py-1.5 pl-4 text-[var(--arca-ink-2)]">
          Subtotal {FIXED_ASSET_CATEGORY_LABELS[cat.category] ?? cat.category}
        </td>
        <td className="py-1.5 text-right tabular-nums">
          $ {fmtMoney(cat.totals.originalValue)}
        </td>
        <td className="py-1.5 text-right tabular-nums">
          $ {fmtMoney(cat.totals.accumStart)}
        </td>
        <td className="py-1.5 text-right tabular-nums">
          $ {fmtMoney(cat.totals.amortYear)}
        </td>
        <td className="py-1.5 text-right tabular-nums">
          $ {fmtMoney(cat.totals.accumEnd)}
        </td>
        <td className="py-1.5 pr-4 text-right tabular-nums">
          $ {fmtMoney(cat.totals.residualEnd)}
        </td>
      </tr>
    </>
  );
}
