import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Info,
  ListFilter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getCredencialDeudas,
  updateDeudaEstado,
  scrapSingleJob,
} from '@/actions/client';
import { cn } from '@/lib/utils';
import { periodoLegible } from '@/lib/periodo';

// ─── Helpers ─────────────────────────────────────────────────────────
const formatARS = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  if (isNaN(n)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
};

const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatLastUpdateAt = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// ─── Types ────────────────────────────────────────────────────────────
type DebtStatus = 'abierta' | 'plan_pago' | 'pagada' | 'prescripta';

/** Fila de `deuda` (aplanada) tal como la devuelve `getCredencialDeudas`. */
type Debt = Awaited<ReturnType<typeof getCredencialDeudas>>[number]['deuda'];

// ─── Status pill ─────────────────────────────────────────────────────
function StatusPill({
  status,
  isOverdue,
}: {
  status: DebtStatus;
  isOverdue: boolean;
}) {
  if (isOverdue && status === 'abierta') {
    return (
      <span className="inline-flex items-center px-[9px] py-[3px] rounded-full text-[12px] font-semibold bg-[#fce8e6] text-[#c0392b] whitespace-nowrap">
        Vencida
      </span>
    );
  }
  const map: Record<DebtStatus, { label: string; cls: string }> = {
    abierta: { label: 'Abierta', cls: 'bg-[#fef3cd] text-[#8a6d00]' },
    plan_pago: { label: 'En plan', cls: 'bg-[#F2F1EB] text-[#3E404A]' },
    pagada: { label: 'Pagada', cls: 'bg-[#E6EFE8] text-[#2f7d55]' },
    prescripta: { label: 'Prescripta', cls: 'bg-[#E7E8F2] text-[#3B3F6B]' },
  };
  const { label, cls } = map[status] ?? map.abierta;
  return (
    <span
      className={cn(
        'inline-flex items-center px-[9px] py-[3px] rounded-full text-[12px] font-semibold whitespace-nowrap',
        cls
      )}
    >
      {label}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────
interface DeudasTabProps {
  representativeId: string;
  selectedClientId?: string;
  scrapingSection: string | null;
  setScrapingSection: (
    s: 'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null
  ) => void;
  lastDeudaJob:
    | {
        createdAt?: string | Date;
        success?: boolean;
        failedReason?: string | null;
      }
    | null
    | undefined;
}

// ─── Main component ─────────────────────────────────────────────────
export function DeudasTab({
  representativeId,
  selectedClientId,
  scrapingSection,
  setScrapingSection,
  lastDeudaJob,
}: DeudasTabProps) {
  const queryClient = useQueryClient();

  // ── Pagination & filters ──
  const [currentPage, setCurrentPage] = useState(1);
  const [filterImpuesto, setFilterImpuesto] = useState('');
  const [filterConcepto, setFilterConcepto] = useState('');
  const [sortKey, setSortKey] = useState<
    'tax' | 'concept' | 'period' | 'dueDate' | 'detectedAt'
  >('detectedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const PAGE_SIZE = 10;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterImpuesto, filterConcepto, sortKey, sortDir, selectedClientId]);

  // ── Query ──
  // AFIP devuelve las deudas por login (credencial), no por cliente: se traen
  // todas las del login y se filtran acá por la empresa seleccionada.
  const { data: deudasDelLogin = [], isLoading } = useQuery({
    queryKey: ['representativeDebts', representativeId],
    queryFn: () =>
      getCredencialDeudas({ data: { credencialId: representativeId } }),
    enabled: !!representativeId,
  });

  const debts = useMemo(
    () =>
      deudasDelLogin
        .filter(
          (row) => !selectedClientId || row.deuda.clienteId === selectedClientId
        )
        .map((row) => row.deuda),
    [deudasDelLogin, selectedClientId]
  );

  // ── Mutation ──
  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      estado: DebtStatus;
      intimada: boolean;
    }) => updateDeudaEstado({ data: vars }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['representativeDebts', representativeId],
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : 'Error al actualizar la deuda'
      );
    },
  });

  // ── Today (for overdue logic) ──
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // ── Debt stats ──
  const debtStats = useMemo(() => {
    if (!debts.length) {
      return {
        totalBalance: 0,
        totalCompensatoryInterest: 0,
        totalPunitiveInterest: 0,
        totalDebt: 0,
        overdueCount: 0,
        totalDebts: 0,
      };
    }
    let totalBalance = 0;
    let totalCompensatoryInterest = 0;
    let totalPunitiveInterest = 0;
    let overdueCount = 0;

    for (const d of debts) {
      totalBalance += Number(d.saldo ?? 0);
      totalCompensatoryInterest += Number(d.interesResarcitorio ?? 0);
      totalPunitiveInterest += Number(d.interesPunitorio ?? 0);
      if (d.venceAt && new Date(d.venceAt) < today) overdueCount++;
    }

    return {
      totalBalance,
      totalCompensatoryInterest,
      totalPunitiveInterest,
      totalDebt:
        totalBalance + totalCompensatoryInterest + totalPunitiveInterest,
      overdueCount,
      totalDebts: debts.length,
    };
  }, [debts, today]);

  // ── Filter options ──
  const debtFilterOptions = useMemo(() => {
    const impuestos = new Set<string>();
    const conceptos = new Set<string>();
    for (const d of debts) {
      if (d.impuesto) impuestos.add(d.impuesto);
      if (d.concepto) conceptos.add(d.concepto);
    }
    return {
      impuestos: Array.from(impuestos).sort(),
      conceptos: Array.from(conceptos).sort(),
    };
  }, [debts]);

  // ── Filtered & sorted debts ──
  const filteredDebts = useMemo(() => {
    return debts.filter((d) => {
      if (filterImpuesto && d.impuesto !== filterImpuesto) return false;
      if (filterConcepto && d.concepto !== filterConcepto) return false;
      return true;
    });
  }, [debts, filterImpuesto, filterConcepto]);

  const sortedDebts = useMemo(() => {
    const copy = [...filteredDebts];
    copy.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortKey === 'tax') {
        av = a.impuesto ?? '';
        bv = b.impuesto ?? '';
      } else if (sortKey === 'concept') {
        av = a.concepto ?? '';
        bv = b.concepto ?? '';
      } else if (sortKey === 'period') {
        av = a.periodo ?? '';
        bv = b.periodo ?? '';
      } else if (sortKey === 'dueDate') {
        av = a.venceAt ? new Date(a.venceAt).getTime() : 0;
        bv = b.venceAt ? new Date(b.venceAt).getTime() : 0;
      } else if (sortKey === 'detectedAt') {
        av = a.detectadaAt ? new Date(a.detectadaAt).getTime() : 0;
        bv = b.detectadaAt ? new Date(b.detectadaAt).getTime() : 0;
      }
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    });
    return copy;
  }, [filteredDebts, sortKey, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sortedDebts.length / PAGE_SIZE));
  const paginated = sortedDebts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const getPaginationPages = () => {
    const maxVisible = 7;
    if (totalPages <= maxVisible) return { startPage: 1, endPage: totalPages };
    const half = Math.floor(maxVisible / 2);
    let startPage: number;
    let endPage: number;
    if (currentPage <= half) {
      startPage = 1;
      endPage = maxVisible;
    } else if (currentPage + half >= totalPages) {
      startPage = totalPages - maxVisible + 1;
      endPage = totalPages;
    } else {
      startPage = currentPage - half;
      endPage = currentPage + half;
    }
    return { startPage, endPage };
  };
  const { startPage, endPage } = getPaginationPages();
  const visiblePages = Array.from(
    { length: endPage - startPage + 1 },
    (_, i) => startPage + i
  );

  // ── Sort toggle ──
  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // ── Scraping ──
  const handleUpdateDeudas = async () => {
    setScrapingSection('deudas');
    try {
      await scrapSingleJob({
        data: { credencialId: representativeId, jobType: 'deuda' },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['representativeDebts'] }),
        queryClient.invalidateQueries({ queryKey: ['lastDeudaJob'] }),
      ]);
      toast.success('Deudas actualizadas correctamente');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al actualizar deudas'
      );
      queryClient.invalidateQueries({ queryKey: ['lastDeudaJob'] });
    } finally {
      setScrapingSection(null);
    }
  };

  // ── Column header ──
  const ColHeader = ({
    label,
    field,
    className,
  }: {
    label: string;
    field?: typeof sortKey;
    className?: string;
  }) => {
    const active = field && sortKey === field;
    return (
      <div className={className}>
        {field ? (
          <button
            className="inline-flex items-center gap-1 group"
            onClick={() => handleSort(field)}
          >
            {label}
            <span className="opacity-60 group-hover:opacity-100 transition-opacity text-[10px]">
              {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
            </span>
          </button>
        ) : (
          label
        )}
      </div>
    );
  };

  const GRID_COLS = '1.4fr 1.3fr 78px 108px 100px 128px 96px 96px 104px 150px';

  return (
    <div
      className="bg-[#F7F6F2] border border-[#DFDCD3] rounded-2xl overflow-hidden"
      style={{
        boxShadow:
          '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)',
      }}
    >
      {/* ── KPI band ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white">
        {/* 1. Total deudas */}
        <div className="px-[26px] py-[22px] border-r border-[#ECEAE3]">
          <div className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[14px]">
            TOTAL DEUDAS
          </div>
          <div className="font-[family-name:var(--ff-display)] font-bold text-[28px] tracking-[-0.025em] text-[#12131A] tabular-nums whitespace-nowrap leading-none">
            {formatARS(debtStats.totalBalance)}
          </div>
          <div className="mt-[10px] text-[12.5px] text-[#6E7079]">
            {debtStats.totalDebts} deudas ·{' '}
            <span className="text-[#c0392b] font-semibold">
              {debtStats.overdueCount} vencidas
            </span>
          </div>
        </div>

        {/* 2. Total con intereses */}
        <div className="px-[26px] py-[22px] border-r border-[#ECEAE3]">
          <div className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[14px]">
            TOTAL CON INTERESES
          </div>
          <div className="font-[family-name:var(--ff-display)] font-bold text-[28px] tracking-[-0.025em] text-[#12131A] tabular-nums whitespace-nowrap leading-none">
            {formatARS(debtStats.totalDebt)}
          </div>
          <div className="mt-[10px] text-[12.5px] text-[#6E7079]">
            +{' '}
            {formatARS(
              debtStats.totalCompensatoryInterest +
                debtStats.totalPunitiveInterest
            )}{' '}
            intereses
          </div>
        </div>

        {/* 3. Int. compensatorio */}
        <div className="px-[26px] py-[22px] border-r border-[#ECEAE3]">
          <div className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[14px]">
            INT. COMPENSATORIO
          </div>
          <div className="font-[family-name:var(--ff-display)] font-bold text-[28px] tracking-[-0.025em] text-[#12131A] tabular-nums whitespace-nowrap leading-none">
            {formatARS(debtStats.totalCompensatoryInterest)}
          </div>
        </div>

        {/* 4. Int. punitorio */}
        <div className="px-[26px] py-[22px]">
          <div className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[14px]">
            INT. PUNITORIO
          </div>
          <div className="font-[family-name:var(--ff-display)] font-bold text-[28px] tracking-[-0.025em] text-[#12131A] tabular-nums whitespace-nowrap leading-none">
            {formatARS(debtStats.totalPunitiveInterest)}
          </div>
        </div>
      </div>

      {/* ── Status / toolbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-b border-[#ECEAE3]">
        <div className="flex items-center gap-2">
          <p className="text-[12.5px] text-[#6E7079]">
            Últ. actualización{' '}
            {lastDeudaJob?.createdAt ? (
              <span
                className={cn(
                  'font-bold',
                  lastDeudaJob.success ? 'text-[#2f7d55]' : 'text-[#c0392b]'
                )}
              >
                {formatLastUpdateAt(lastDeudaJob.createdAt)}
              </span>
            ) : (
              '—'
            )}
          </p>
          {lastDeudaJob &&
            !lastDeudaJob.success &&
            lastDeudaJob.failedReason && (
              <span
                className="relative group flex items-center gap-1"
                title={lastDeudaJob.failedReason}
              >
                <AlertTriangle className="h-4 w-4 text-[#c0392b] cursor-help" />
                <span className="text-[12px] text-[#c0392b] max-w-[280px] truncate hidden sm:block">
                  {lastDeudaJob.failedReason}
                </span>
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 hidden group-hover:block w-max max-w-sm rounded-lg bg-[#12131A] text-white text-[11px] leading-snug px-3 py-2 shadow-lg pointer-events-none">
                  {lastDeudaJob.failedReason}
                </span>
              </span>
            )}
          {lastDeudaJob &&
            !lastDeudaJob.success &&
            !lastDeudaJob.failedReason && (
              <Info className="h-4 w-4 text-[#c0392b]" />
            )}
        </div>

        <button
          className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50"
          disabled={!!scrapingSection}
          onClick={handleUpdateDeudas}
        >
          {scrapingSection === 'deudas' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Actualizando…
            </>
          ) : (
            'Actualizar deudas'
          )}
        </button>
      </div>

      {/* ── Filter row ── */}
      <div className="flex items-center gap-3 px-6 py-[14px] bg-[#FBFAF6] border-b border-[#ECEAE3]">
        <div className="flex items-center gap-1.5 text-[13.5px] text-[#6E7079] shrink-0">
          <ListFilter className="h-3.5 w-3.5" />
          Filtrar
        </div>

        {/* Impuesto */}
        <Select
          value={filterImpuesto || '__all__'}
          onValueChange={(v) => setFilterImpuesto(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="bg-white border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[160px] gap-2 [&>svg]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[#9B9CA3]">Impuesto</span>
              <span className="font-bold text-[#12131A] truncate">
                {filterImpuesto || 'Todos'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[260px]">
            <SelectItem value="__all__">Todos</SelectItem>
            {debtFilterOptions.impuestos.map((imp) => (
              <SelectItem key={imp} value={imp}>
                {imp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Concepto */}
        <Select
          value={filterConcepto || '__all__'}
          onValueChange={(v) => setFilterConcepto(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="bg-white border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[160px] gap-2 [&>svg]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[#9B9CA3]">Concepto</span>
              <span className="font-bold text-[#12131A] truncate">
                {filterConcepto || 'Todos'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[260px]">
            <SelectItem value="__all__">Todos</SelectItem>
            {debtFilterOptions.conceptos.map((con) => (
              <SelectItem key={con} value={con}>
                {con}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table heading ── */}
      <div className="px-6 py-3 border-b border-[#ECEAE3] text-[13px] text-[#6E7079]">
        Deudas del cliente ·{' '}
        <span className="font-semibold text-[#12131A]">
          {filteredDebts.length} mostradas
        </span>{' '}
        · {(debts as Debt[]).length} totales
      </div>

      {/* ── Table ── */}
      <div className="border-t border-[#ECEAE3]">
        {/* Navy header */}
        <div
          className="grid items-center px-6 h-12 bg-[#0B1730] text-[#E7EAF2] text-[12px] font-semibold"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <ColHeader label="IMPUESTO" field="tax" />
          <ColHeader label="CONCEPTO" field="concept" />
          <ColHeader label="PERÍODO" field="period" />
          <ColHeader label="VENCIMIENTO" field="dueDate" />
          <ColHeader label="ACTUALIZ." field="detectedAt" />
          <div className="text-right">SALDO</div>
          <div className="text-right">INT. COMP.</div>
          <div className="text-right">INT. PUNIT.</div>
          <div>ESTADO</div>
          <div>GESTIÓN</div>
        </div>

        {/* Data rows */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 h-28 text-[13.5px] text-[#9B9CA3]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando deudas…
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex items-center justify-center h-28 text-[13.5px] text-[#9B9CA3]">
            {debts.length === 0
              ? 'No hay deudas registradas para este cliente.'
              : 'No hay deudas que coincidan con los filtros aplicados.'}
          </div>
        ) : (
          paginated.map((debt) => {
            const isOverdue = !!debt.venceAt && new Date(debt.venceAt) < today;
            const compInt = Number(debt.interesResarcitorio ?? 0);
            const punitInt = Number(debt.interesPunitorio ?? 0);

            return (
              <div
                key={debt.id}
                className={cn(
                  'grid items-center px-6 py-[13px] border-b border-[#ECEAE3] transition-colors duration-[120ms]',
                  isOverdue ? 'bg-[#fdf5f4]' : 'hover:bg-[#FBFAF6]'
                )}
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                {/* IMPUESTO */}
                <div className="text-[13.5px] font-semibold text-[#12131A] truncate pr-2">
                  {debt.impuesto || '—'}
                </div>

                {/* CONCEPTO */}
                <div className="text-[13.5px] text-[#3E404A] truncate pr-2">
                  {debt.concepto || '—'}
                </div>

                {/* PERÍODO */}
                <div className="text-[13px] text-[#3E404A] tabular-nums">
                  {periodoLegible(debt.periodo)}
                </div>

                {/* VENCIMIENTO */}
                <div className="text-[13px] text-[#3E404A] tabular-nums">
                  {debt.venceAt ? formatDate(debt.venceAt) : '—'}
                </div>

                {/* ACTUALIZ. */}
                <div className="text-[13px] text-[#9B9CA3] tabular-nums">
                  {debt.detectadaAt ? formatDate(debt.detectadaAt) : '—'}
                </div>

                {/* SALDO */}
                <div className="text-right text-[13.5px] font-bold text-[#12131A] tabular-nums">
                  {formatARS(debt.saldo)}
                </div>

                {/* INT. COMP. */}
                <div
                  className={cn(
                    'text-right text-[13px] tabular-nums',
                    compInt === 0 ? 'text-[#B4B3AC]' : 'text-[#12131A]'
                  )}
                >
                  {formatARS(compInt)}
                </div>

                {/* INT. PUNIT. */}
                <div
                  className={cn(
                    'text-right text-[13px] tabular-nums',
                    punitInt === 0 ? 'text-[#B4B3AC]' : 'text-[#12131A]'
                  )}
                >
                  {formatARS(punitInt)}
                </div>

                {/* ESTADO */}
                <div>
                  <StatusPill status={debt.estado} isOverdue={isOverdue} />
                </div>

                {/* GESTIÓN */}
                <div
                  className="flex flex-col gap-[6px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={debt.estado}
                    onValueChange={(v) =>
                      updateMutation.mutate({
                        id: debt.id,
                        estado: v as DebtStatus,
                        intimada: debt.intimada,
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-full text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="abierta">Abierta</SelectItem>
                      <SelectItem value="plan_pago">En plan</SelectItem>
                      <SelectItem value="pagada">Pagada</SelectItem>
                      <SelectItem value="prescripta">Prescripta</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    className={cn(
                      'text-[11.5px] font-semibold text-left underline underline-offset-2 transition-colors',
                      debt.intimada
                        ? 'text-[#c0392b] hover:text-[#a93226]'
                        : 'text-[#9B9CA3] hover:text-[#6E7079]'
                    )}
                    onClick={() =>
                      updateMutation.mutate({
                        id: debt.id,
                        estado: debt.estado,
                        intimada: !debt.intimada,
                      })
                    }
                  >
                    {debt.intimada ? 'Intimada' : 'No intimada'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Pagination footer ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-[6px] px-5 py-[22px] bg-[#FBFAF6]">
          {/* Anterior */}
          <button
            className={cn(
              'inline-flex items-center gap-1 text-[13.5px] text-[#6E7079] px-3 py-[7px] rounded-lg transition-colors',
              currentPage === 1
                ? 'opacity-50 pointer-events-none'
                : 'hover:bg-white cursor-pointer'
            )}
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>

          {startPage > 1 && (
            <>
              <button
                className="text-[13.5px] text-[#6E7079] px-3 py-[7px] rounded-lg hover:bg-white cursor-pointer"
                onClick={() => setCurrentPage(1)}
              >
                1
              </button>
              {startPage > 2 && (
                <span className="text-[13.5px] text-[#9B9CA3] px-2">…</span>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <button
              key={page}
              className={cn(
                'text-[13.5px] px-[13px] py-[7px] rounded-lg transition-colors cursor-pointer',
                currentPage === page
                  ? 'font-semibold text-[#12131A] bg-white border border-[#DFDCD3]'
                  : 'text-[#6E7079] hover:bg-white'
              )}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && (
                <span className="text-[13.5px] text-[#9B9CA3] px-2">…</span>
              )}
              <button
                className="text-[13.5px] text-[#6E7079] px-3 py-[7px] rounded-lg hover:bg-white cursor-pointer"
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}

          {/* Siguiente */}
          <button
            className={cn(
              'inline-flex items-center gap-1 text-[13.5px] text-[#6E7079] px-3 py-[7px] rounded-lg transition-colors',
              currentPage === totalPages
                ? 'opacity-50 pointer-events-none'
                : 'hover:bg-white cursor-pointer'
            )}
            onClick={() =>
              setCurrentPage(Math.min(totalPages, currentPage + 1))
            }
            disabled={currentPage === totalPages}
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
