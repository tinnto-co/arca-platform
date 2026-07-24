import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  X,
  ArrowUpDown,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getClientMultilateralSummary,
  getClientMultilateralInvoices,
  updateFiscalEntityProvince,
} from '@/actions/invoice';
import { scrapSingleJob } from '@/actions/client';
import { cn } from '@/lib/utils';
import {
  PROVINCE_LABELS,
  PROVINCE_SOURCE_LABELS,
  type ProvinceLabel,
} from '@/lib/provinces';
import {
  getMonthBounds,
  MONTH_NAMES_SHORT,
} from './render-iva-resume';

// ─── Helpers ─────────────────────────────────────────────────────────
const formatARS = (value: string | number | null | undefined): string => {
  if (value == null || value === '') return '$ 0,00';
  const n = Number(value);
  if (Number.isNaN(n)) return '$ 0,00';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(n);
};

const splitCurrency = (value: number) => {
  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const parts = formatted.split(',');
  return {
    integer: '$ ' + parts[0],
    decimals: ',' + (parts[1] ?? '00'),
  };
};

interface MultilateralAgg {
  provinces: number;
  invoices: number;
  totalIVA: number;
  totalBase: number;
}

const aggregateMultilateral = (rows: any[]): MultilateralAgg => {
  if (!rows?.length)
    return { provinces: 0, invoices: 0, totalIVA: 0, totalBase: 0 };
  let invoices = 0;
  let totalIVA = 0;
  let totalBase = 0;
  for (const row of rows) {
    invoices += Number(row.invoiceCount ?? 0);
    totalIVA += Number(row.totalIVA ?? 0);
    totalBase += Number(row.totalTaxed ?? 0);
  }
  return { provinces: rows.length, invoices, totalIVA, totalBase };
};

// ─── Inline SVG grouped bar chart ────────────────────────────────────
function GroupedBarChart({
  data,
  formatY,
}: {
  data: { label: string; current: number; previous: number }[];
  formatY?: (v: number) => string;
}) {
  if (!data.length) return null;
  const W = 520;
  const H = 280;
  const plotLeft = 55;
  const plotRight = 495;
  const plotTop = 30;
  const plotBottom = 240;
  const labelY = 260;

  const maxVal = Math.max(...data.flatMap((d) => [d.current, d.previous]), 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / magnitude) * magnitude;
  const gridLines = 4;
  const gridStep = niceMax / gridLines;
  const pxPerUnit = (plotBottom - plotTop) / niceMax;
  const plotW = plotRight - plotLeft;
  const groupW = plotW / data.length;
  const barW = 34;

  const defaultFormatY = (v: number) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(v);
  };
  const fmtY = formatY ?? defaultFormatY;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {/* Gridlines */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const val = gridStep * i;
        const y = plotBottom - val * pxPerUnit;
        return (
          <g key={i}>
            {i > 0 ? (
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="#ECEAE3" strokeDasharray="3 4" />
            ) : (
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} stroke="#DFDCD3" />
            )}
            <text x={47} y={y + 4} textAnchor="end" fill="#9B9CA3" fontSize={11}>{fmtY(val)}</text>
          </g>
        );
      })}
      {/* Bar groups */}
      {data.map((d, i) => {
        const cx = plotLeft + groupW * i + groupW / 2;
        const curH = d.current * pxPerUnit;
        const prevH = d.previous * pxPerUnit;
        return (
          <g key={i}>
            <rect x={cx - barW - 2} y={plotBottom - curH} width={barW} height={Math.max(curH, 0)} rx={3} fill="#142A4E" />
            <rect x={cx + 2} y={plotBottom - prevH} width={barW} height={Math.max(prevH, 0)} rx={3} fill="#90ACD0" />
            <text x={cx} y={labelY} textAnchor="middle" fill="#6E7079" fontSize={12}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Delta pill ──────────────────────────────────────────────────────
function DeltaPill({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <span className="text-[12px] text-[#9B9CA3] mt-[14px] inline-block">vs mes anterior: sin cambios</span>;
  }
  if (previous === 0 && current !== 0) {
    return (
      <div className="flex items-center gap-2 mt-[14px]">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2f7d55] bg-[#E6EFE8] rounded-full px-[9px] py-[3px]">
          <TrendArrow up /> nuevo
        </span>
        <span className="text-[12px] text-[#9B9CA3]">vs mes anterior</span>
      </div>
    );
  }
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const sign = isPositive ? '+' : '';
  const formatted = `${sign}${pct.toFixed(1).replace('.', ',')}%`;

  return (
    <div className="flex items-center gap-2 mt-[14px]">
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[12px] font-semibold rounded-full px-[9px] py-[3px]',
          isPositive && 'text-[#2f7d55] bg-[#E6EFE8]',
          isNegative && 'text-[#c0392b] bg-[#fce8e6]',
          !isPositive && !isNegative && 'text-[#9B9CA3] bg-[#F2F1EB]'
        )}
      >
        <TrendArrow up={isPositive} />
        {formatted}
      </span>
      <span className="text-[12px] text-[#9B9CA3]">vs mes anterior</span>
    </div>
  );
}

function TrendArrow({ up = true }: { up?: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
      <path d="M2 7L5 3L8 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Invoice type label (from AFIP code) ─────────────────────────────
const INVOICE_TYPES_MAP: Record<string, string> = {
  '1': 'Factura A', '2': 'ND A', '3': 'NC A', '4': 'Recibo A',
  '6': 'Factura B', '7': 'ND B', '8': 'NC B', '9': 'Recibo B',
  '11': 'Factura C', '12': 'ND C', '13': 'NC C', '15': 'Recibo C',
  '19': 'Factura E', '20': 'ND E', '21': 'NC E',
  '51': 'Factura M', '52': 'ND M', '53': 'NC M',
  '201': 'FCE MiPyME A', '206': 'FCE MiPyME B', '211': 'FCE MiPyME C',
};
const getInvoiceTypeLabel = (code: string | number | null | undefined) => {
  if (code == null || code === '') return '—';
  return INVOICE_TYPES_MAP[String(code)] ?? String(code);
};

// ─── Provincia del receptor: fuente + corrección manual ──────────────
interface ProvinceSourceInvoice {
  recipientIdentityNumber: string | null;
  recipientName: string | null;
  receiptProvince: string | null;
  provinceSource: string | null;
  provinceFetchedAt: string | Date | null;
}

export function ProvinceSourceCell({ inv }: { inv: ProvinceSourceInvoice }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [province, setProvince] = useState<string>('');

  const mutation = useMutation({
    mutationFn: () =>
      updateFiscalEntityProvince({
        data: {
          cuit: inv.recipientIdentityNumber ?? '',
          province: province as ProvinceLabel,
        },
      }),
    onSuccess: async (res) => {
      setOpen(false);
      toast.success(
        `Provincia corregida a ${res.province} (${res.invoicesUpdated} comprobante${res.invoicesUpdated !== 1 ? 's' : ''} actualizado${res.invoicesUpdated !== 1 ? 's' : ''})`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clientMultilateralInvoices'] }),
        queryClient.invalidateQueries({ queryKey: ['clientMultilateralSummary'] }),
        queryClient.invalidateQueries({ queryKey: ['clientMultilateralSummaryPrev'] }),
      ]);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Error al corregir la provincia'),
  });

  const sourceLabel = inv.provinceSource
    ? (PROVINCE_SOURCE_LABELS[inv.provinceSource] ?? inv.provinceSource)
    : '—';
  const fetchedAt = inv.provinceFetchedAt
    ? new Date(inv.provinceFetchedAt).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      <span
        className="text-[11px] text-muted-foreground whitespace-nowrap"
        title={fetchedAt ? `Dato obtenido el ${fetchedAt}` : undefined}
      >
        {sourceLabel}
        {fetchedAt ? ` · ${fetchedAt}` : ''}
      </span>
      {inv.recipientIdentityNumber ? (
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) setProvince(inv.receiptProvince ?? '');
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Corregir provincia"
              aria-label="Corregir provincia"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3 space-y-3" align="end">
            <p className="text-xs text-muted-foreground">
              Corregir provincia de{' '}
              <span className="font-medium text-foreground">
                {inv.recipientName?.trim()
                  ? inv.recipientName
                  : inv.recipientIdentityNumber}
              </span>
              . Se aplica a todas sus facturas emitidas y no será pisada por el
              proceso automático.
            </p>
            <Select value={province} onValueChange={setProvince}>
              <SelectTrigger className="w-full h-8 text-xs">
                <SelectValue placeholder="Provincia" />
              </SelectTrigger>
              <SelectContent>
                {PROVINCE_LABELS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="w-full h-8"
              disabled={!province || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                'Guardar'
              )}
            </Button>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────
interface ConvenioMultilateralTabProps {
  representativeId: string;
  selectedClientId?: string;
  scrapingSection: string | null;
  setScrapingSection: (s: 'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null) => void;
}

// ─── Main component ─────────────────────────────────────────────────
export function ConvenioMultilateralTab({
  representativeId,
  selectedClientId,
  scrapingSection,
  setScrapingSection,
}: ConvenioMultilateralTabProps) {
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  // ── Period state ──
  const [period, setPeriod] = useState(() => getMonthBounds(now.getFullYear(), now.getMonth()));
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  const selectedYear = period.from.getFullYear();
  const selectedMonth = period.from.getMonth();
  const dateFrom = period.from.toISOString().slice(0, 10);
  const dateTo = period.to.toISOString().slice(0, 10);

  const prevPeriod = useMemo(() => {
    let y = selectedYear;
    let m = selectedMonth - 1;
    if (m < 0) { m = 11; y--; }
    return getMonthBounds(y, m);
  }, [selectedYear, selectedMonth]);

  const prevDateFrom = prevPeriod.from.toISOString().slice(0, 10);
  const prevDateTo = prevPeriod.to.toISOString().slice(0, 10);

  // ── Sort state ──
  const [sortKey, setSortKey] = useState<'count' | 'iva' | 'base' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: 'count' | 'iva' | 'base') => {
    setSortKey((prev) => {
      if (prev !== key) { setSortDir('asc'); return key; }
      if (sortDir === 'asc') { setSortDir('desc'); return key; }
      setSortDir('asc');
      return null;
    });
  };

  // ── Drill-down modal ──
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProvince, setDetailProvince] = useState<string | null>(null);
  const [detailProvinceLabel, setDetailProvinceLabel] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Queries ──
  const profileId = selectedClientId ?? undefined;

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ['clientMultilateralSummary', representativeId, profileId, dateFrom, dateTo],
    queryFn: () => getClientMultilateralSummary({ data: { clientId: representativeId, profileId, dateFrom, dateTo } }),
    enabled: !!representativeId,
  });

  const { data: summaryPrev = [] } = useQuery({
    queryKey: ['clientMultilateralSummaryPrev', representativeId, profileId, prevDateFrom, prevDateTo],
    queryFn: () => getClientMultilateralSummary({ data: { clientId: representativeId, profileId, dateFrom: prevDateFrom, dateTo: prevDateTo } }),
    enabled: !!representativeId,
  });

  const { data: detailInvoices = [], isLoading: loadingDetail } = useQuery({
    queryKey: ['clientMultilateralInvoices', representativeId, profileId, dateFrom, dateTo, detailProvince],
    queryFn: () => getClientMultilateralInvoices({ data: { clientId: representativeId, profileId, receiptProvince: detailProvince, dateFrom, dateTo } }),
    enabled: !!representativeId && detailOpen,
  });

  // ── Aggregations ──
  const aggCurrent = useMemo(() => aggregateMultilateral(summary as any[]), [summary]);
  const aggPrev = useMemo(() => aggregateMultilateral(summaryPrev as any[]), [summaryPrev]);

  // ── Chart data ──
  const actividadData = useMemo(() => [
    { label: 'Provincias', current: aggCurrent.provinces, previous: aggPrev.provinces },
    { label: 'Comprobantes', current: aggCurrent.invoices, previous: aggPrev.invoices },
  ], [aggCurrent, aggPrev]);

  const montosData = useMemo(() => [
    { label: 'Total IVA', current: aggCurrent.totalIVA, previous: aggPrev.totalIVA },
    { label: 'Base imponible', current: aggCurrent.totalBase, previous: aggPrev.totalBase },
  ], [aggCurrent, aggPrev]);

  // ── Sorted summary ──
  const sortedSummary = useMemo(() => {
    if (!sortKey) return summary;
    const copy = [...summary];
    copy.sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      let av = 0, bv = 0;
      if (sortKey === 'count') { av = Number(a.invoiceCount ?? 0); bv = Number(b.invoiceCount ?? 0); }
      else if (sortKey === 'iva') { av = Number(a.totalIVA ?? 0); bv = Number(b.totalIVA ?? 0); }
      else if (sortKey === 'base') { av = Number(a.totalTaxed ?? 0); bv = Number(b.totalTaxed ?? 0); }
      return av === bv ? 0 : av > bv ? dir : -dir;
    });
    return copy;
  }, [summary, sortKey, sortDir]);

  // ── Participación ──
  const totalBase = aggCurrent.totalBase;
  const maxParticipation = useMemo(() => {
    if (!summary.length || totalBase === 0) return 0;
    return Math.max(...summary.map((r: any) => Number(r.totalTaxed ?? 0)));
  }, [summary, totalBase]);

  // ── Detail totals ──
  const detailTotals = useMemo(() => {
    if (!detailInvoices?.length) return { base: 0, iva: 0, total: 0 };
    return detailInvoices.reduce(
      (acc: { base: number; iva: number; total: number }, inv: any) => {
        acc.base += Number(inv.baseImponible ?? inv.amountTaxed ?? 0);
        acc.iva += Number(inv.totalIVA ?? 0);
        acc.total += Number(inv.amount ?? 0);
        return acc;
      },
      { base: 0, iva: 0, total: 0 }
    );
  }, [detailInvoices]);

  // ── Month labels ──
  const currentMonthLabel = MONTH_NAMES_SHORT[selectedMonth];
  const prevMonthLabel = MONTH_NAMES_SHORT[selectedMonth === 0 ? 11 : selectedMonth - 1];

  // ── Period picker helpers ──
  const maxMonth = selectedYear === now.getFullYear() ? now.getMonth() : 11;
  const availableMonths = Array.from({ length: maxMonth + 1 }, (_, i) => i);

  const changePeriod = (y: number, m: number) => {
    const range = getMonthBounds(y, m);
    setPeriod(range);
  };

  // ── Sort icon helper ──
  const SortIcon = ({ field }: { field: 'count' | 'iva' | 'base' }) => {
    if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  return (
    <>
      <div
        className="bg-[#F7F6F2] border border-[#DFDCD3] rounded-2xl overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)' }}
      >
        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEAE3]">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="font-[family-name:var(--ff-display)] text-[16px] font-semibold text-[#12131A]">
              Ventas por provincia
            </h2>

            {/* Period pill */}
            <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
              <PopoverTrigger asChild>
                <button className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] font-semibold text-[#12131A]">
                  <CalendarIcon className="h-3.5 w-3.5 stroke-[#9B9CA3]" />
                  {MONTH_NAMES_SHORT[selectedMonth]} {selectedYear}
                  <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3]" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="start">
                <div className="space-y-3">
                  <Select
                    value={String(selectedYear)}
                    onValueChange={(v) => {
                      const y = Number(v);
                      const newMax = y === now.getFullYear() ? now.getMonth() : 11;
                      changePeriod(y, Math.min(selectedMonth, newMax));
                    }}
                  >
                    <SelectTrigger className="w-full h-9"><SelectValue placeholder="Año" /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 8 }, (_, i) => now.getFullYear() - i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-3 gap-1.5">
                    {availableMonths.map((i) => (
                      <Button
                        key={i}
                        variant={selectedMonth === i ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => { changePeriod(selectedYear, i); setPeriodPickerOpen(false); }}
                      >
                        {MONTH_NAMES_SHORT[i]}
                      </Button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50"
              disabled={!!scrapingSection}
              onClick={async () => {
                setScrapingSection('facturas');
                try {
                  await scrapSingleJob({ data: { representativeId, jobType: 'comprobantes' } });
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['clientMultilateralSummary'] }),
                    queryClient.invalidateQueries({ queryKey: ['clientMultilateralSummaryPrev'] }),
                    queryClient.invalidateQueries({ queryKey: ['clientAllInvoices', representativeId] }),
                  ]);
                  toast.success('Datos actualizados correctamente');
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Error al actualizar');
                } finally {
                  setScrapingSection(null);
                }
              }}
            >
              {scrapingSection ? <><Loader2 className="h-4 w-4 animate-spin" />Actualizando…</> : 'Actualizar'}
            </button>
            <button
              className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] text-[13.5px] font-semibold text-[#3E404A] rounded-[10px] px-[15px] py-[9px] hover:bg-[#FBFAF6] transition-colors"
              onClick={() => {
                if (!summary.length) { toast.info('No hay datos para exportar.'); return; }
                const rows = (summary as any[]).map((r: any) => {
                  const base = Number(r.totalTaxed ?? 0);
                  const pct = totalBase > 0 ? ((base / totalBase) * 100).toFixed(1) : '0';
                  return `${r.receiptProvince || 'Capital Federal'}\t${r.invoiceCount}\t${base}\t${Number(r.totalIVA ?? 0)}\t${pct}%`;
                });
                const header = 'Provincia\tComprobantes\tBase imponible\tTotal IVA\tParticipación';
                const csv = [header, ...rows].join('\n');
                const blob = new Blob([csv], { type: 'text/tab-separated-values' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `convenio_multilateral_${dateFrom}_${dateTo}.tsv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Datos exportados.');
              }}
            >
              <Download className="h-3.5 w-3.5 stroke-[#3E404A]" />
              Descargar Excel
            </button>
          </div>
        </div>

        {/* ── KPI band ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 bg-white">
          {[
            { label: 'PROVINCIAS CON ACTIVIDAD', value: aggCurrent.provinces, prev: aggPrev.provinces, isCurrency: false },
            { label: 'CANTIDAD DE COMPROBANTES', value: aggCurrent.invoices, prev: aggPrev.invoices, isCurrency: false },
            { label: 'TOTAL IVA DEL PERÍODO', value: aggCurrent.totalIVA, prev: aggPrev.totalIVA, isCurrency: true },
            { label: 'BASE IMPONIBLE DEL PERÍODO', value: aggCurrent.totalBase, prev: aggPrev.totalBase, isCurrency: true },
          ].map((kpi, i) => (
            <div
              key={i}
              className={cn(
                'px-[26px] py-6',
                i < 3 && 'lg:border-r border-[#ECEAE3]',
                i < 2 && 'md:border-r',
                i === 2 && 'md:border-r-0 lg:border-r'
              )}
            >
              <div className="text-[11.5px] font-bold tracking-[0.07em] uppercase text-[#9B9CA3] mb-[14px]">
                {kpi.label}
              </div>
              {kpi.isCurrency ? (
                <div className="font-[family-name:var(--ff-display)] font-semibold text-[27px] tracking-[-0.025em] text-[#12131A] tabular-nums whitespace-nowrap leading-none">
                  {splitCurrency(kpi.value).integer}
                  <span className="text-[17px] text-[#9B9CA3]">{splitCurrency(kpi.value).decimals}</span>
                </div>
              ) : (
                <div className="font-[family-name:var(--ff-display)] font-semibold text-[30px] tracking-[-0.02em] text-[#12131A] tabular-nums leading-none">
                  {kpi.value}
                </div>
              )}
              <DeltaPill current={kpi.value} previous={kpi.prev} />
            </div>
          ))}
        </div>

        {/* ── Charts band ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 border-t border-[#ECEAE3] bg-white">
          {/* Left chart: Actividad */}
          <div className="px-7 py-[22px] lg:border-r border-[#ECEAE3]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A]">
                Actividad · actual vs anterior
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#142A4E]" />
                  <span className="text-[11.5px] text-[#6E7079]">{currentMonthLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#90ACD0]" />
                  <span className="text-[11.5px] text-[#6E7079]">{prevMonthLabel}</span>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-[#9B9CA3] mb-3">Provincias con actividad y cantidad de comprobantes</p>
            <GroupedBarChart data={actividadData} />
          </div>

          {/* Right chart: Montos */}
          <div className="px-7 py-[22px]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A]">
                Montos · actual vs anterior
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#142A4E]" />
                  <span className="text-[11.5px] text-[#6E7079]">{currentMonthLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#90ACD0]" />
                  <span className="text-[11.5px] text-[#6E7079]">{prevMonthLabel}</span>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-[#9B9CA3] mb-3">Total IVA y base imponible (ARS)</p>
            <GroupedBarChart
              data={montosData}
              formatY={(v) => {
                if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
                if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
                return String(v);
              }}
            />
          </div>
        </div>

        {/* ── Province table ── */}
        <div className="border-t border-[#ECEAE3]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-[#9B9CA3] gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando ventas por provincia…
            </div>
          ) : summary.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[#9B9CA3]">
              No hay facturas emitidas registradas para este cliente
            </div>
          ) : (
            <>
              {/* Header */}
              <div
                className="grid items-center px-6 h-12 bg-[#0B1730] text-[#E7EAF2] text-[12px] font-semibold"
                style={{ gridTemplateColumns: '1.4fr 120px 1fr 1fr 220px' }}
              >
                <div>Provincia</div>
                <div className="text-right">
                  <button className="inline-flex items-center gap-1 group" onClick={() => toggleSort('count')}>
                    Comprobantes <SortIcon field="count" />
                  </button>
                </div>
                <div className="text-right">
                  <button className="inline-flex items-center gap-1 group" onClick={() => toggleSort('base')}>
                    Base imponible <SortIcon field="base" />
                  </button>
                </div>
                <div className="text-right">
                  <button className="inline-flex items-center gap-1 group" onClick={() => toggleSort('iva')}>
                    Total IVA <SortIcon field="iva" />
                  </button>
                </div>
                <div className="text-right">Participación</div>
              </div>

              {/* Data rows */}
              {sortedSummary.map((row: any) => {
                const provinceLabel = row.receiptProvince || 'Capital Federal';
                const provinceValue = row.receiptProvince ?? null;
                const base = Number(row.totalTaxed ?? 0);
                const pct = totalBase > 0 ? (base / totalBase) * 100 : 0;
                const barWidth = maxParticipation > 0 ? (base / maxParticipation) * 100 : 0;
                return (
                  <div
                    key={provinceLabel}
                    className="grid items-center px-6 py-[14px] border-b border-[#ECEAE3] cursor-pointer hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
                    style={{ gridTemplateColumns: '1.4fr 120px 1fr 1fr 220px' }}
                    onClick={() => {
                      setDetailProvince(provinceValue);
                      setDetailProvinceLabel(provinceLabel);
                      setDetailOpen(true);
                    }}
                  >
                    <div className="text-[14px] font-semibold text-[#12131A]">{provinceLabel}</div>
                    <div className="text-right text-[14px] text-[#3E404A] tabular-nums">{row.invoiceCount}</div>
                    <div className="text-right text-[14px] text-[#12131A] tabular-nums">{formatARS(base)}</div>
                    <div className="text-right text-[14px] text-[#12131A] tabular-nums">{formatARS(row.totalIVA)}</div>
                    <div className="flex items-center justify-end gap-3">
                      <div className="flex-1 max-w-[130px] h-[7px] bg-[#F0EEE8] rounded-full overflow-hidden">
                        <div className="h-full bg-[#142A4E] rounded-full" style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="text-[13px] font-semibold text-[#3E404A] tabular-nums w-[44px] text-right">
                        {pct.toFixed(1).replace('.', ',')}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Totals row */}
              <div
                className="grid items-center px-6 py-[15px] bg-[#FBFAF6] border-t border-[#ECEAE3]"
                style={{ gridTemplateColumns: '1.4fr 120px 1fr 1fr 220px' }}
              >
                <div className="text-[13px] font-bold tracking-[0.03em] uppercase text-[#6E7079]">TOTAL PERÍODO</div>
                <div className="text-right text-[14px] font-bold text-[#12131A] tabular-nums">{aggCurrent.invoices}</div>
                <div className="text-right text-[14px] font-bold text-[#12131A] tabular-nums">{formatARS(aggCurrent.totalBase)}</div>
                <div className="text-right text-[14px] font-bold text-[#12131A] tabular-nums">{formatARS(aggCurrent.totalIVA)}</div>
                <div className="text-right text-[14px] font-bold text-[#12131A] tabular-nums">100%</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Province drill-down modal ── */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) { setDetailProvince(null); setDetailProvinceLabel(null); }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="!max-w-none !w-[calc(100vw-1rem)] sm:!w-[calc(100vw-2rem)] lg:!w-[calc(100vw-3rem)] xl:!w-[calc(100vw-4rem)] max-h-[88vh] overflow-y-auto rounded-xl border bg-background shadow-xl p-4 sm:p-5 md:p-6"
        >
          <DialogHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="pr-2">
                <DialogTitle className="text-lg sm:text-xl font-semibold">
                  Facturas outbound - {detailProvinceLabel ?? 'Provincia'}
                </DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detalle de comprobantes utilizados para el Convenio Multilateral.
                </p>
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-muted hover:bg-muted/80" aria-label="Cerrar detalle">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">Cargando facturas...</div>
          ) : detailInvoices.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">No hay facturas para este filtro.</div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-muted-foreground">
                <span>{detailInvoices.length} comprobante{detailInvoices.length !== 1 && 's'} outbound</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
                  <span>Base imponible: <span className="font-medium text-foreground">{formatARS(detailTotals.base)}</span></span>
                  <span>IVA total: <span className="font-medium text-foreground">{formatARS(detailTotals.iva)}</span></span>
                  <span>Total facturado: <span className="font-medium text-foreground">{formatARS(detailTotals.total)}</span></span>
                </div>
              </div>
              {isDesktop ? (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="w-full text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Fecha emisión</TableHead>
                        <TableHead className="whitespace-nowrap">Tipo</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Pto. venta</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Nro. desde</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Nro. hasta</TableHead>
                        <TableHead className="whitespace-nowrap min-w-[180px]">Emisor</TableHead>
                        <TableHead className="whitespace-nowrap min-w-[180px]">Destinatario</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Fuente provincia</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Moneda</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Base imponible</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total IVA</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailInvoices.map((inv: any) => (
                        <TableRow key={inv.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell className="text-[11px]">{inv.emitionDate ? new Date(inv.emitionDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</TableCell>
                          <TableCell className="text-[11px]">{getInvoiceTypeLabel(inv.type)}</TableCell>
                          <TableCell className="text-right text-[11px]">{inv.salePoint || '—'}</TableCell>
                          <TableCell className="text-right text-[11px]">{inv.numberFrom || '—'}</TableCell>
                          <TableCell className="text-right text-[11px]">{inv.numberTo || '—'}</TableCell>
                          <TableCell className="max-w-[220px]"><div className="truncate" title={inv.emitterName}>{inv.emitterName || '—'}</div></TableCell>
                          <TableCell className="max-w-[220px]"><div className="truncate" title={inv.recipientName}>{inv.recipientName || '—'}</div></TableCell>
                          <TableCell className="text-right"><ProvinceSourceCell inv={inv} /></TableCell>
                          <TableCell className="text-right text-[11px]">{inv.currency || 'ARS'}</TableCell>
                          <TableCell className="text-right text-[11px]">{formatARS(inv.baseImponible ?? inv.amountTaxed)}</TableCell>
                          <TableCell className="text-right text-[11px]">{formatARS(inv.totalIVA)}</TableCell>
                          <TableCell className="text-right text-[11px]">{formatARS(inv.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {detailInvoices.map((inv: any) => (
                    <div key={inv.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{getInvoiceTypeLabel(inv.type)}</span>
                        <span className="text-muted-foreground">{inv.emitionDate ? new Date(inv.emitionDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Pto. venta</span><span className="text-right">{inv.salePoint || '—'}</span>
                        <span className="text-muted-foreground">Nro. desde/hasta</span><span className="text-right">{inv.numberFrom || '—'} / {inv.numberTo || '—'}</span>
                        <span className="text-muted-foreground">Emisor</span><span className="text-right truncate" title={inv.emitterName}>{inv.emitterName || '—'}</span>
                        <span className="text-muted-foreground">Destinatario</span><span className="text-right truncate" title={inv.recipientName}>{inv.recipientName || '—'}</span>
                        <span className="text-muted-foreground">Fuente provincia</span><ProvinceSourceCell inv={inv} />
                        <span className="text-muted-foreground">Moneda</span><span className="text-right">{inv.currency || 'ARS'}</span>
                        <span className="text-muted-foreground">Base imponible</span><span className="text-right">{formatARS(inv.baseImponible ?? inv.amountTaxed)}</span>
                        <span className="text-muted-foreground">Total IVA</span><span className="text-right">{formatARS(inv.totalIVA)}</span>
                        <span className="text-muted-foreground font-medium">Total</span><span className="text-right font-medium">{formatARS(inv.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
