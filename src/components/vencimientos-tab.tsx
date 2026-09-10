import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CalendarX2,
  Clock,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Info,
  ListFilter,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyFailedReason } from '@/lib/job-error-classifier';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { getCredencialVencimientos, scrapSingleJob } from '@/actions/client';
import { cn } from '@/lib/utils';
import { periodoLegible } from '@/lib/periodo';

/** Fila de `vencimiento` tal como la devuelve `getCredencialVencimientos`. */
type VencimientoRow = Awaited<
  ReturnType<typeof getCredencialVencimientos>
>[number];

// ─── Helpers ─────────────────────────────────────────────────────────

const formatLastUpdateAt = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDueDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const getStatus = (
  dd: VencimientoRow
): 'completado' | 'vencido' | 'proximo' | 'futuro' => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dd.venceAt);
  dueDate.setHours(0, 0, 0, 0);
  const next7 = new Date(today);
  next7.setDate(today.getDate() + 7);
  if (dd.completadoAt) return 'completado';
  if (dueDate < today) return 'vencido';
  if (dueDate <= next7) return 'proximo';
  return 'futuro';
};

// ─── Props ───────────────────────────────────────────────────────────

interface VencimientosTabProps {
  representativeId: string;
  selectedClientId?: string;
  scrapingSection: string | null;
  setScrapingSection: (
    s: 'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null
  ) => void;
  lastVencimientosJob:
    | {
        createdAt?: string | Date;
        success?: boolean;
        failedReason?: string | null;
      }
    | null
    | undefined;
}

// ─── Main component ──────────────────────────────────────────────────

export function VencimientosTab({
  representativeId,
  selectedClientId,
  scrapingSection,
  setScrapingSection,
  lastVencimientosJob,
}: VencimientosTabProps) {
  const queryClient = useQueryClient();

  // ── State ──
  const [currentPage, setCurrentPage] = useState(1);
  const [filterImpuesto, setFilterImpuesto] = useState('__all__');
  const [filterEstado, setFilterEstado] = useState('__all__');

  const pageSize = 10;

  // ── Query ──
  const { data: dueDates = [], isLoading } = useQuery({
    queryKey: ['representativeDueDates', representativeId, selectedClientId],
    queryFn: () =>
      getCredencialVencimientos({
        data: {
          credencialId: representativeId,
          clienteId: selectedClientId || undefined,
        },
      }),
    enabled: !!representativeId,
  });

  // Reset page when filters or selection changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterImpuesto, filterEstado, selectedClientId]);

  // ── Computed stats ──
  const dueDateStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30Days = new Date(today);
    next30Days.setDate(today.getDate() + 30);

    let futureCount = 0;
    let overdueCount = 0;
    let next30Count = 0;
    let nextDueDateValue: Date | null = null;
    let nextDueDateTax = '';

    for (const dd of dueDates) {
      const due = new Date(dd.venceAt);
      due.setHours(0, 0, 0, 0);

      if (due >= today) {
        futureCount++;
        if (due <= next30Days) next30Count++;
        if (nextDueDateValue === null || due < nextDueDateValue) {
          nextDueDateValue = due;
          nextDueDateTax = dd.impuesto ?? '';
        }
      } else if (!dd.completadoAt) {
        overdueCount++;
      }
    }

    return {
      futureCount,
      overdueCount,
      next30Count,
      nextDueDateValue,
      nextDueDateTax,
    };
  }, [dueDates]);

  // ── Unique impuesto options ──
  const impuestoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const dd of dueDates) {
      if (dd.impuesto) set.add(dd.impuesto);
    }
    return Array.from(set).sort();
  }, [dueDates]);

  // ── Filtered list ──
  const filteredDueDates = useMemo(() => {
    return dueDates.filter((dd) => {
      if (filterImpuesto !== '__all__' && dd.impuesto !== filterImpuesto)
        return false;
      if (filterEstado !== '__all__') {
        const status = getStatus(dd);
        if (status === 'completado') return false; // completado is not filterable by the estado dropdown
        if (filterEstado !== status) return false;
      }
      return true;
    });
  }, [dueDates, filterImpuesto, filterEstado]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredDueDates.length / pageSize));
  const paginatedDueDates = filteredDueDates.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
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

  // ── Scraping ──
  const handleUpdateVencimientos = async () => {
    setScrapingSection('vencimientos');
    try {
      await scrapSingleJob({
        data: { credencialId: representativeId, jobType: 'vencimientos' },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['representativeDueDates'] }),
        queryClient.invalidateQueries({ queryKey: ['lastVencimientosJob'] }),
      ]);
      toast.success('Vencimientos actualizados correctamente');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al actualizar vencimientos'
      );
      queryClient.invalidateQueries({ queryKey: ['lastVencimientosJob'] });
    } finally {
      setScrapingSection(null);
    }
  };

  // ── Status pill ──
  const StatusPill = ({ status }: { status: ReturnType<typeof getStatus> }) => {
    if (status === 'vencido') {
      return (
        <span className="inline-flex items-center gap-[5px] text-[12px] font-semibold text-[var(--arca-accent-neg)] bg-[#fce8e6] rounded-full px-[10px] py-[3px]">
          <span className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--arca-accent-neg)]" />
          Vencido
        </span>
      );
    }
    if (status === 'proximo') {
      return (
        <span className="inline-flex items-center gap-[5px] text-[12px] font-semibold text-[var(--arca-accent-warn-fg)] bg-[var(--arca-accent-warn-bg)] rounded-full px-[10px] py-[3px]">
          <span className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--arca-accent-warn-fg)]" />
          Próximo
        </span>
      );
    }
    if (status === 'completado') {
      return (
        <span className="inline-flex items-center gap-[5px] text-[12px] font-semibold text-[var(--arca-accent-pos-fg)] bg-[#E6EFE8] rounded-full px-[10px] py-[3px]">
          <span className="inline-block w-[6px] h-[6px] rounded-full bg-[var(--arca-accent-pos-fg)]" />
          Completado
        </span>
      );
    }
    // futuro
    return (
      <span className="inline-flex items-center gap-[5px] text-[12px] font-semibold text-[#5B6270] bg-[var(--arca-surface-2)] rounded-full px-[10px] py-[3px]">
        <span className="inline-block w-[6px] h-[6px] rounded-full bg-[#5B6270]" />
        Futuro
      </span>
    );
  };

  // ── Due date color ──
  const getDueDateColor = (dd: VencimientoRow): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(dd.venceAt);
    dueDate.setHours(0, 0, 0, 0);
    const next7 = new Date(today);
    next7.setDate(today.getDate() + 7);
    if (!dd.completadoAt && dueDate < today)
      return 'text-[var(--arca-accent-neg)]';
    if (!dd.completadoAt && dueDate <= next7) return 'text-[var(--arca-ink)]';
    return 'text-[var(--arca-ink-2)]';
  };

  return (
    <div
      className="bg-[var(--arca-bg)] border border-[var(--arca-border-strong)] rounded-2xl overflow-hidden"
      style={{
        boxShadow:
          '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)',
      }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--arca-border)]">
        <div className="flex items-center gap-2">
          <p className="text-[12.5px] text-[var(--arca-ink-3)]">
            Últ. actualización{' '}
            {lastVencimientosJob?.createdAt ? (
              <span
                className={cn(
                  'font-bold',
                  lastVencimientosJob.success
                    ? 'text-[var(--arca-accent-pos-fg)]'
                    : 'text-destructive'
                )}
              >
                {formatLastUpdateAt(lastVencimientosJob.createdAt)}
              </span>
            ) : (
              '—'
            )}
          </p>
          {lastVencimientosJob &&
            !lastVencimientosJob.success &&
            lastVencimientosJob.failedReason && (
              <span
                className="relative group"
                title={
                  friendlyFailedReason(lastVencimientosJob.failedReason) ??
                  undefined
                }
              >
                <Info className="h-4 w-4 text-destructive cursor-help" />
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 hidden group-hover:block w-max max-w-sm rounded-lg bg-[var(--arca-ink)] text-white text-[11px] leading-snug px-3 py-2 shadow-lg pointer-events-none">
                  {friendlyFailedReason(lastVencimientosJob.failedReason)}
                </span>
              </span>
            )}
        </div>

        <button
          className="inline-flex items-center gap-2 bg-[var(--arca-accent)] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-[var(--arca-accent-hover)] transition-colors disabled:opacity-50"
          disabled={!!scrapingSection}
          onClick={handleUpdateVencimientos}
        >
          {scrapingSection === 'vencimientos' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Actualizando…
            </>
          ) : (
            'Actualizar vencimientos'
          )}
        </button>
      </div>

      {/* ── KPI band ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white">
        {/* 1. Vencimientos futuros */}
        <div className="px-[26px] py-[22px] lg:border-r border-[var(--arca-border)]">
          <div className="flex items-center gap-[7px] mb-[14px]">
            <Calendar
              className="shrink-0"
              style={{
                width: 15,
                height: 15,
                stroke: 'var(--arca-ink-2)',
                strokeWidth: 1.8,
              }}
            />
            <span className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[var(--arca-ink-4)]">
              Vencimientos Futuros
            </span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-bold tabular-nums leading-none text-[var(--arca-ink)]"
            style={{ fontSize: 30 }}
          >
            {isLoading ? '—' : dueDateStats.futureCount}
          </div>
          <div className="text-[12px] text-[var(--arca-ink-4)] mt-[6px]">
            Próximos vencimientos
          </div>
        </div>

        {/* 2. Vencimientos vencidos */}
        <div className="px-[26px] py-[22px] sm:border-r lg:border-r border-[var(--arca-border)]">
          <div className="flex items-center gap-[7px] mb-[14px]">
            <CalendarX2
              className="shrink-0"
              style={{
                width: 15,
                height: 15,
                stroke: 'var(--arca-ink-2)',
                strokeWidth: 1.8,
              }}
            />
            <span className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[var(--arca-ink-4)]">
              Vencimientos Vencidos
            </span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-bold tabular-nums leading-none text-[var(--arca-accent-neg)]"
            style={{ fontSize: 30 }}
          >
            {isLoading ? '—' : dueDateStats.overdueCount}
          </div>
          <div className="text-[12px] text-[var(--arca-accent-neg)] mt-[6px]">
            Requieren atención
          </div>
        </div>

        {/* 3. Próximo vencimiento */}
        <div className="px-[26px] py-[22px] lg:border-r border-[var(--arca-border)]">
          <div className="flex items-center gap-[7px] mb-[14px]">
            <Clock
              className="shrink-0"
              style={{
                width: 15,
                height: 15,
                stroke: 'var(--arca-ink-2)',
                strokeWidth: 1.8,
              }}
            />
            <span className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[var(--arca-ink-4)]">
              Próximo Vencimiento
            </span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-bold tabular-nums leading-none text-[var(--arca-ink)]"
            style={{ fontSize: 22 }}
          >
            {isLoading
              ? '—'
              : dueDateStats.nextDueDateValue
                ? formatDueDate(dueDateStats.nextDueDateValue)
                : '—'}
          </div>
          <div className="text-[12px] text-[var(--arca-ink-4)] mt-[6px] truncate">
            {dueDateStats.nextDueDateTax || 'Sin vencimientos futuros'}
          </div>
        </div>

        {/* 4. Próximos 30 días */}
        <div className="px-[26px] py-[22px]">
          <div className="flex items-center gap-[7px] mb-[14px]">
            <Activity
              className="shrink-0"
              style={{
                width: 15,
                height: 15,
                stroke: 'var(--arca-ink-2)',
                strokeWidth: 1.8,
              }}
            />
            <span className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[var(--arca-ink-4)]">
              Próximos 30 Días
            </span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-bold tabular-nums leading-none text-[var(--arca-ink)]"
            style={{ fontSize: 30 }}
          >
            {isLoading ? '—' : dueDateStats.next30Count}
          </div>
          <div className="text-[12px] text-[var(--arca-ink-4)] mt-[6px]">
            Vencimientos del mes
          </div>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="flex items-center gap-3 px-6 py-[14px] bg-[var(--arca-surface-2)] border-b border-[var(--arca-border)] border-t border-t-[var(--arca-border)]">
        <span className="inline-flex items-center gap-[6px] text-[13.5px] text-[var(--arca-ink-3)] shrink-0">
          <ListFilter className="h-[14px] w-[14px] stroke-[var(--arca-ink-3)]" />
          Filtrar
        </span>

        {/* Impuesto filter */}
        <Select value={filterImpuesto} onValueChange={setFilterImpuesto}>
          <SelectTrigger className="bg-white border-[var(--arca-border-strong)] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[180px] gap-2 [&>svg]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[var(--arca-ink-4)]">Impuesto</span>
              <span className="font-bold text-[var(--arca-ink)] truncate">
                {filterImpuesto === '__all__' ? 'Todos' : filterImpuesto}
              </span>
              <ChevronDown className="h-3.5 w-3.5 stroke-[var(--arca-ink-4)] shrink-0" />
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-[280px]">
            <SelectItem value="__all__">Todos</SelectItem>
            {impuestoOptions.map((imp) => (
              <SelectItem key={imp} value={imp}>
                {imp}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Estado filter */}
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="bg-white border-[var(--arca-border-strong)] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[150px] gap-2 [&>svg]:hidden">
            <div className="flex items-center gap-2">
              <span className="text-[var(--arca-ink-4)]">Estado</span>
              <span className="font-bold text-[var(--arca-ink)]">
                {filterEstado === '__all__'
                  ? 'Todos'
                  : filterEstado === 'vencido'
                    ? 'Vencido'
                    : filterEstado === 'proximo'
                      ? 'Próximo'
                      : 'Futuro'}
              </span>
              <ChevronDown className="h-3.5 w-3.5 stroke-[var(--arca-ink-4)] shrink-0" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="proximo">Próximo</SelectItem>
            <SelectItem value="futuro">Futuro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Table heading ── */}
      <div className="px-6 py-3 border-b border-[var(--arca-border)]">
        <span className="text-[13.5px] text-[var(--arca-ink-3)]">
          Vencimientos del cliente{' '}
          <span className="text-[var(--arca-ink-2)] font-medium">·</span>{' '}
          {filteredDueDates.length} mostrados{' '}
          <span className="text-[var(--arca-ink-2)] font-medium">·</span>{' '}
          {dueDates.length} totales
        </span>
      </div>

      {/* ── Table ── */}
      <div>
        {/* Navy header row */}
        <div
          className="grid items-center px-6 h-12 bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] text-[12px] font-semibold tracking-[0.04em] uppercase"
          style={{
            gridTemplateColumns:
              '150px 1.1fr 130px 96px 70px 118px 1.5fr 110px',
          }}
        >
          <div>Impuesto</div>
          <div>Concepto</div>
          <div>Subconcepto</div>
          <div>Período</div>
          <div className="text-center">Cuota</div>
          <div>Vencimiento</div>
          <div>Detalle</div>
          <div>Estado</div>
        </div>

        {/* Data rows */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 h-24 text-[13.5px] text-[var(--arca-ink-4)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando vencimientos…
          </div>
        ) : filteredDueDates.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-[13.5px] text-[var(--arca-ink-4)]">
            No se encontraron vencimientos.
          </div>
        ) : (
          paginatedDueDates.map((dd) => {
            const status = getStatus(dd);
            return (
              <div
                key={dd.id}
                className="grid items-center px-6 py-[13px] border-b border-[var(--arca-border)] hover:bg-[var(--arca-surface-2)] transition-[background] duration-[120ms]"
                style={{
                  gridTemplateColumns:
                    '150px 1.1fr 130px 96px 70px 118px 1.5fr 110px',
                }}
              >
                {/* Impuesto */}
                <div className="text-[14px] font-semibold text-[var(--arca-ink)] truncate pr-2">
                  {dd.impuesto || '—'}
                </div>

                {/* Concepto */}
                <div className="text-[14px] text-[var(--arca-ink-2)] truncate pr-2">
                  {dd.concepto || '—'}
                </div>

                {/* Subconcepto */}
                <div className="font-[family-name:var(--ff-mono)] text-[13px] text-[var(--arca-ink-3)] truncate pr-2">
                  {dd.subConcepto || '—'}
                </div>

                {/* Período */}
                <div className="text-[13.5px] text-[var(--arca-ink-2)] tabular-nums truncate pr-2">
                  {periodoLegible(dd.periodo)}
                </div>

                {/* Cuota */}
                <div className="text-[13.5px] text-[var(--arca-ink-2)] tabular-nums text-center">
                  {dd.cuota ?? '—'}
                </div>

                {/* Vencimiento */}
                <div
                  className={cn(
                    'text-[13.5px] tabular-nums truncate pr-2',
                    getDueDateColor(dd)
                  )}
                >
                  {formatDueDate(dd.venceAt)}
                </div>

                {/* Detalle */}
                <div className="text-[13px] text-[var(--arca-ink-3)] truncate pr-2">
                  {dd.detalle || '—'}
                </div>

                {/* Estado */}
                <div>
                  <StatusPill status={status} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-[6px] px-5 py-[22px] bg-[var(--arca-surface-2)]">
          {/* Anterior */}
          <button
            className={cn(
              'inline-flex items-center gap-1 text-[13.5px] text-[var(--arca-ink-3)] px-3 py-[7px] rounded-lg transition-colors',
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

          {/* Page numbers */}
          {startPage > 1 && (
            <>
              <button
                className="text-[13.5px] text-[var(--arca-ink-3)] px-3 py-[7px] rounded-lg hover:bg-white cursor-pointer"
                onClick={() => setCurrentPage(1)}
              >
                1
              </button>
              {startPage > 2 && (
                <span className="text-[13.5px] text-[var(--arca-ink-4)] px-2">
                  …
                </span>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <button
              key={page}
              className={cn(
                'text-[13.5px] px-[13px] py-[7px] rounded-lg transition-colors cursor-pointer',
                currentPage === page
                  ? 'font-semibold text-[var(--arca-ink)] bg-white border border-[var(--arca-border-strong)]'
                  : 'text-[var(--arca-ink-3)] hover:bg-white'
              )}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && (
                <span className="text-[13.5px] text-[var(--arca-ink-4)] px-2">
                  …
                </span>
              )}
              <button
                className="text-[13.5px] text-[var(--arca-ink-3)] px-3 py-[7px] rounded-lg hover:bg-white cursor-pointer"
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}

          {/* Siguiente */}
          <button
            className={cn(
              'inline-flex items-center gap-1 text-[13.5px] text-[var(--arca-ink-3)] px-3 py-[7px] rounded-lg transition-colors',
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
