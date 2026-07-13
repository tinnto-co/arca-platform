import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Loader2,
  Info,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { type DateRange } from 'react-day-picker';
import ExcelJSRaw from 'exceljs';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as DateRangeCalendar } from '@/components/ui/calendar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getInvoices,
  getInvoice,
  getInvoicesByProfile,
} from '@/actions/invoice';
import { scrapSingleJob } from '@/actions/client';
import { INVOICE_TYPE_LABELS } from '@/components/invoices-table';
import { cn } from '@/lib/utils';
import {
  getMonthBounds,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
} from './render-iva-resume';

const ExcelJS = ExcelJSRaw as unknown as {
  Workbook: new () => {
    addWorksheet(
      name: string,
      options?: { views?: { showGridLines?: boolean }[] }
    ): {
      getColumn(col: number): { width?: number };
      getRow(row: number): {
        getCell(col: number): {
          value: unknown;
          border?: unknown;
          font?: { bold?: boolean };
          numFmt?: string;
        };
      };
    };
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Buffer> };
  };
};

const TYPE_LABELS = INVOICE_TYPE_LABELS;
const DIRECTION_LABELS: Record<string, string> = {
  outbound: 'Emitida',
  inbound: 'Recibida',
  Outbound: 'Emitida',
  Inbound: 'Recibida',
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? `Tipo ${type}`;
}
function getDirectionLabel(direction: string): string {
  return (
    DIRECTION_LABELS[direction] ??
    DIRECTION_LABELS[direction?.toLowerCase()] ??
    (direction || '—')
  );
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'facturas'
  );
}

const formatLastUpdateAt = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatLocalYYYYMMDD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDateOnly = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const matchInvoiceType = (
  invType: string | null | undefined,
  typeFilter: string
): boolean => {
  if (!typeFilter || typeFilter === 'all') return true;
  const t = (invType ?? '').trim();
  if (t === typeFilter) return true;
  if (/^\d+$/.test(typeFilter) && new RegExp(`\\(${typeFilter}\\)$`).test(t))
    return true;
  return false;
};

interface InvoiceData {
  id: string;
  direction: string;
  emitionDate: Date | string;
  type: string;
  recipientName: string;
  recipientIdentityNumber: string;
  recipientIdentityType: string;
  emitterName: string;
  emitterIdentityNumber: string;
  emitterIdentityType: string;
  currency: string;
  currencyRate: string;
  salePoint: string;
  authorizationNumber: string;
  idFrom: string;
  idTo: string;
  amount: string;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  profileName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface FacturasTabProps {
  representativeId: string;
  selectedClientId?: string;
  lastComprobantesJob: {
    createdAt?: string | Date;
    success?: boolean;
    failedReason?: string | null;
  } | null | undefined;
  scrapingSection: string | null;
  setScrapingSection: (s: 'iva' | 'deudas' | 'vencimientos' | 'facturas' | 'notificaciones' | null) => void;
  allInvoicesData: { invoices: any[] } | undefined;
}

// ─── Chart helpers ───────────────────────────────────────────────────
function buildLast12MonthsChart(
  invoices: any[],
  selectedClientId: string | undefined,
  typeFilter: string,
  directionFilter: string
) {
  if (!invoices?.length) return [];
  const now = new Date();
  const buckets: Record<string, { ventas: number; compras: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = { ventas: 0, compras: 0 };
  }
  invoices.forEach((inv: any) => {
    if (selectedClientId && (inv.profileId ?? inv.profile) !== selectedClientId)
      return;
    if (!matchInvoiceType(inv.type, typeFilter)) return;
    if (directionFilter && directionFilter !== 'all') {
      const dir = (inv.direction ?? '').trim();
      if (dir.toLowerCase() !== directionFilter.toLowerCase()) return;
    }
    const d = new Date(inv.emitionDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets[key]) return;
    let amount = parseFloat(inv.amount || '0');
    if (inv.currency?.toUpperCase() === 'USD')
      amount *= parseFloat(inv.currencyRate || '1');
    const dir = inv.direction?.toLowerCase();
    if (dir === 'outbound') buckets[key].ventas += amount;
    else if (dir === 'inbound') buckets[key].compras += amount;
  });
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const [, m] = key.split('-').map(Number);
      return {
        label: `${MONTH_NAMES_SHORT[m - 1]}`,
        yearMonth: key,
        ventas: data.ventas,
        compras: data.compras,
      };
    });
}

function InlineSVGChart({
  data,
}: {
  data: { label: string; ventas: number; compras: number }[];
}) {
  if (!data.length) return null;

  const W = 860;
  const H = 320;
  const plotLeft = 55;
  const plotRight = 835;
  const plotTop = 40;
  const plotBottom = 280;
  const labelY = 300;

  const maxVal =
    Math.max(...data.flatMap((d) => [d.ventas, d.compras]), 1);
  // Round up to nice number
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / magnitude) * magnitude;
  const gridLines = 4;
  const gridStep = niceMax / gridLines;

  const plotW = plotRight - plotLeft;
  const groupW = plotW / data.length;
  const barW = 14;
  const pxPerUnit = (plotBottom - plotTop) / niceMax;

  const isLastMonth = (i: number) => i === data.length - 1;

  const formatYLabel = (v: number) => {
    if (v >= 1e9) return `${(v / 1e9).toFixed(0)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(v);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfico de ventas y compras">
      {/* Gridlines */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const val = gridStep * i;
        const y = plotBottom - val * pxPerUnit;
        return (
          <g key={i}>
            {i > 0 ? (
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="#ECEAE3"
                strokeDasharray="3 4"
              />
            ) : (
              <line
                x1={plotLeft}
                x2={plotRight}
                y1={y}
                y2={y}
                stroke="#DFDCD3"
              />
            )}
            <text
              x={47}
              y={y + 4}
              textAnchor="end"
              fill="#9B9CA3"
              fontSize={11}
            >
              {formatYLabel(val)}
            </text>
          </g>
        );
      })}

      {/* Bars + labels */}
      {data.map((d, i) => {
        const cx = plotLeft + groupW * i + groupW / 2;
        const ventasH = d.ventas * pxPerUnit;
        const comprasH = d.compras * pxPerUnit;
        const opacity = isLastMonth(i) ? 0.65 : 1;
        return (
          <g key={i}>
            {/* Ventas bar */}
            <rect
              x={cx - barW - 1}
              y={plotBottom - ventasH}
              width={barW}
              height={Math.max(ventasH, 0)}
              rx={2}
              fill="#142A4E"
              fillOpacity={opacity}
            />
            {/* Compras bar */}
            <rect
              x={cx + 1}
              y={plotBottom - comprasH}
              width={barW}
              height={Math.max(comprasH, 0)}
              rx={2}
              fill="#90ACD0"
              fillOpacity={opacity}
            />
            {/* Month label */}
            <text
              x={cx}
              y={labelY}
              textAnchor="middle"
              fill="#9B9CA3"
              fontSize={10.5}
            >
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Formatting helpers ──────────────────────────────────────────────
const formatDate = (date: Date | string) => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const formatCurrency = (amount: string, currency: string) => {
  const numAmount = parseFloat(amount);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'ARS',
  }).format(numAmount);
};

const formatTotalARS = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

// ─── Main component ─────────────────────────────────────────────────
export function FacturasTab({
  representativeId,
  selectedClientId,
  lastComprobantesJob,
  scrapingSection,
  setScrapingSection,
  allInvoicesData,
}: FacturasTabProps) {
  const queryClient = useQueryClient();
  const now = useMemo(() => new Date(), []);

  // ── Filters ──
  const [periodType, setPeriodType] = useState<
    'none' | 'year' | 'month' | 'range'
  >('none');
  const [periodYear, setPeriodYear] = useState(() => now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState(now.getMonth());
  const [periodDateRange, setPeriodDateRange] = useState<
    DateRange | undefined
  >(undefined);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Table state ──
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'amount' | 'emitionDate' | undefined>(
    'emitionDate'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
    'desc'
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingExcel, setExportingExcel] = useState(false);

  // ── Invoice detail ──
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(
    null
  );
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);

  const pageSize = 10;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    periodType,
    periodYear,
    periodMonth,
    periodDateRange,
    typeFilter,
    directionFilter,
    debouncedSearch,
    selectedClientId,
  ]);

  // ── Period bounds ──
  const periodBounds = useMemo((): {
    dateFrom: string | undefined;
    dateTo: string | undefined;
  } => {
    if (periodType === 'none')
      return { dateFrom: undefined, dateTo: undefined };
    if (periodType === 'year') {
      const from = new Date(periodYear, 0, 1);
      const to = new Date(periodYear, 11, 31);
      return {
        dateFrom: formatLocalYYYYMMDD(from),
        dateTo: formatLocalYYYYMMDD(to),
      };
    }
    if (periodType === 'month') {
      const { from, to } = getMonthBounds(periodYear, periodMonth);
      return {
        dateFrom: formatLocalYYYYMMDD(from),
        dateTo: formatLocalYYYYMMDD(to),
      };
    }
    if (periodType === 'range' && periodDateRange?.from && periodDateRange?.to) {
      return {
        dateFrom: format(periodDateRange.from, 'yyyy-MM-dd'),
        dateTo: format(periodDateRange.to, 'yyyy-MM-dd'),
      };
    }
    return { dateFrom: undefined, dateTo: undefined };
  }, [periodType, periodYear, periodMonth, periodDateRange]);

  // ── Invoice query ──
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: [
      'invoices',
      currentPage,
      representativeId,
      selectedClientId ?? 'all',
      periodBounds.dateFrom ?? '',
      periodBounds.dateTo ?? '',
      typeFilter,
      directionFilter,
      debouncedSearch,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      selectedClientId
        ? getInvoicesByProfile({
            data: {
              profileId: selectedClientId,
              page: currentPage,
              limit: pageSize,
            },
          })
        : getInvoices({
            data: {
              page: currentPage,
              limit: pageSize,
              clientFilter: representativeId,
              profileFilter: undefined,
              dateFrom: periodBounds.dateFrom || undefined,
              dateTo: periodBounds.dateTo || undefined,
              typeFilter: typeFilter === 'all' ? undefined : typeFilter,
              directionFilter:
                directionFilter === 'all' ? undefined : directionFilter,
              search: debouncedSearch || undefined,
              sortBy,
              sortOrder: sortBy ? sortOrder : undefined,
            },
          }),
  });

  // ── Totals ──
  const invoicePassesFilters = useCallback(
    (inv: any): boolean => {
      if (selectedClientId) {
        if ((inv.profileId ?? inv.profile) !== selectedClientId) return false;
      }
      if (typeFilter && typeFilter !== 'all') {
        if (!matchInvoiceType(inv.type, typeFilter)) return false;
      }
      if (directionFilter && directionFilter !== 'all') {
        const dir = (inv.direction ?? '').trim();
        if (dir.toLowerCase() !== directionFilter.toLowerCase()) return false;
      }
      return true;
    },
    [selectedClientId, typeFilter, directionFilter]
  );

  const totals = useMemo(() => {
    const invoices = allInvoicesData?.invoices;
    if (!invoices?.length) return { totalSales: 0, totalPurchases: 0 };

    let totalSales = 0;
    let totalPurchases = 0;

    const hasBounds = periodBounds.dateFrom && periodBounds.dateTo;
    const from = hasBounds
      ? parseLocalDateOnly(periodBounds.dateFrom!)
      : undefined;
    const to = hasBounds
      ? parseLocalDateOnly(periodBounds.dateTo!)
      : undefined;
    if (to) to.setHours(23, 59, 59, 999);

    invoices.forEach((inv: any) => {
      if (!invoicePassesFilters(inv)) return;
      if (from && to) {
        const invDate = new Date(inv.emitionDate);
        if (invDate < from || invDate > to) return;
      }
      let amount = parseFloat(inv.amount || '0');
      if (inv.currency?.toUpperCase() === 'USD')
        amount *= parseFloat(inv.currencyRate || '1');
      const dir = inv.direction?.toLowerCase();
      if (dir === 'outbound') totalSales += amount;
      else if (dir === 'inbound') totalPurchases += amount;
    });
    return { totalSales, totalPurchases };
  }, [allInvoicesData, periodBounds, invoicePassesFilters]);

  // ── Chart data (always last 12 months) ──
  const chartData = useMemo(
    () =>
      buildLast12MonthsChart(
        allInvoicesData?.invoices ?? [],
        selectedClientId,
        typeFilter,
        directionFilter
      ),
    [allInvoicesData, selectedClientId, typeFilter, directionFilter]
  );

  // ── Sorting ──
  const handleSortByDate = () => {
    if (sortBy === 'emitionDate') {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy('emitionDate');
      setSortOrder('desc');
    }
  };
  const handleSortByAmount = () => {
    if (sortBy === 'amount') {
      if (sortOrder === 'desc') setSortOrder('asc');
      else {
        setSortBy(undefined);
        setSortOrder(undefined);
      }
    } else {
      setSortBy('amount');
      setSortOrder('desc');
    }
  };

  // ── Checkbox ──
  const toggleAllInvoices = (ids: string[]) => {
    const allSel = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(allSel ? new Set() : new Set(ids));
  };
  const toggleInvoiceRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Invoice detail ──
  const handleViewInvoice = async (invoice: InvoiceData) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);
    try {
      const details = await getInvoice({ data: { id: invoice.id } });
      setInvoiceDetails(details);
    } catch {
      toast.error('Error al cargar los detalles de la factura');
    }
  };

  // ── Excel export ──
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const exportLimit = 50000;
      const data = selectedClientId
        ? await getInvoicesByProfile({
            data: { profileId: selectedClientId, page: 1, limit: exportLimit },
          })
        : await getInvoices({
            data: {
              page: 1,
              limit: exportLimit,
              clientFilter: representativeId,
              dateFrom: periodBounds.dateFrom || undefined,
              dateTo: periodBounds.dateTo || undefined,
              typeFilter: typeFilter === 'all' ? undefined : typeFilter,
              directionFilter:
                directionFilter === 'all' ? undefined : directionFilter,
              search: debouncedSearch || undefined,
              sortBy: sortBy ?? undefined,
              sortOrder: sortBy ? (sortOrder ?? undefined) : undefined,
            },
          });
      const invoices = (data.invoices ?? []) as unknown as InvoiceData[];
      if (invoices.length === 0) {
        toast.info('No hay facturas para exportar con los filtros actuales.');
        return;
      }
      const blackBorder = {
        top: { style: 'thin' as const, color: { argb: 'FF000000' } },
        left: { style: 'thin' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
        right: { style: 'thin' as const, color: { argb: 'FF000000' } },
      };
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Facturas', {
        views: [{ showGridLines: true }],
      });
      const headers = [
        'Tipo', 'Tipo (código)', 'Dirección', 'Fecha', 'Pto.Vta',
        'Número desde', 'Número hasta', 'Cliente', 'Email cliente', 'Perfil',
        'Emisor', 'CUIT/DNI emisor', 'Destinatario', 'CUIT/DNI destinatario',
        'Moneda', 'Cotización', 'Monto', 'Nº autorización',
      ];
      const widths = [
        28, 12, 12, 12, 10, 14, 14, 22, 22, 22, 28, 16, 28, 16, 8, 12, 16, 18,
      ];
      headers.forEach((h, i) => {
        const col = i + 1;
        ws.getColumn(col).width = widths[i] ?? 14;
        const cell = ws.getRow(1).getCell(col);
        cell.value = h;
        cell.border = blackBorder;
        cell.font = { bold: true };
      });
      invoices.forEach((inv, idx) => {
        const row = ws.getRow(idx + 2);
        const cells = [
          getTypeLabel(inv.type), inv.type, getDirectionLabel(inv.direction),
          formatDate(inv.emitionDate), inv.salePoint ?? '—', inv.idFrom ?? '—',
          inv.idTo ?? '—', inv.clientName ?? '—', inv.clientEmail ?? '—',
          inv.profileName ?? '—', inv.emitterName ?? '—',
          inv.emitterIdentityNumber
            ? `${inv.emitterIdentityType ?? ''} ${inv.emitterIdentityNumber}`.trim()
            : '—',
          inv.recipientName ?? '—',
          inv.recipientIdentityNumber
            ? `${inv.recipientIdentityType ?? ''} ${inv.recipientIdentityNumber}`.trim()
            : '—',
          inv.currency ?? '—', inv.currencyRate ?? '—',
          formatCurrency(inv.amount, inv.currency),
          inv.authorizationNumber ?? '—',
        ];
        cells.forEach((val, i) => {
          const cell = row.getCell(i + 1);
          cell.value = val;
          cell.border = blackBorder;
        });
      });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr =
        periodBounds.dateFrom && periodBounds.dateTo
          ? `${periodBounds.dateFrom}_${periodBounds.dateTo}`
          : new Date().toISOString().slice(0, 10);
      a.download = `facturas_${sanitizeFilename(selectedClientId ? 'perfil' : 'todas')}_${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exportadas ${invoices.length} factura(s).`);
    } catch (e) {
      console.error(e);
      toast.error('Error al exportar Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Scraping ──
  const handleUpdateFacturas = async () => {
    setScrapingSection('facturas');
    try {
      await scrapSingleJob({
        data: { representativeId, jobType: 'comprobantes' },
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['clientAllInvoices', representativeId],
        }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({
          queryKey: ['lastComprobantesFullJob', representativeId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['lastComprobantesJob', representativeId],
        }),
      ]);
      toast.success('Facturas (comprobantes) actualizadas correctamente');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error al actualizar facturas'
      );
      queryClient.invalidateQueries({
        queryKey: ['lastComprobantesJob', representativeId],
      });
    } finally {
      setScrapingSection(null);
    }
  };

  // ── Pagination ──
  const totalPages = invoicesData?.totalPages || 1;
  const getPaginationPages = () => {
    const maxVisible = 7;
    if (totalPages <= maxVisible)
      return { startPage: 1, endPage: totalPages };
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

  const invoices = (invoicesData?.invoices ?? []) as unknown as InvoiceData[];
  const allPageIds = invoices.map((inv) => inv.id);
  const allSelected =
    allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const someSelected =
    allPageIds.some((id) => selectedIds.has(id)) && !allSelected;

  const diff = totals.totalSales - totals.totalPurchases;

  // ── Period label for filter pill ──
  const periodLabel = useMemo(() => {
    if (periodType === 'none') return 'Sin período';
    if (periodType === 'year') return String(periodYear);
    if (periodType === 'month')
      return `${MONTH_NAMES[periodMonth]} ${periodYear}`;
    if (
      periodType === 'range' &&
      periodDateRange?.from &&
      periodDateRange?.to
    )
      return `${format(periodDateRange.from, 'dd/MM/yyyy', { locale: es })} – ${format(periodDateRange.to, 'dd/MM/yyyy', { locale: es })}`;
    return 'Sin período';
  }, [periodType, periodYear, periodMonth, periodDateRange]);

  // ── Format amount for table row ──
  const formatRowAmount = (amount: string, currency: string) => {
    const num = parseFloat(amount);
    const formatted = new Intl.NumberFormat('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    const suffix = currency?.toUpperCase() === 'USD' ? ' US$' : ' ARS';
    return `${formatted}${suffix}`;
  };

  // ── Split formatted total into integer + decimals ──
  const splitTotal = (value: number) => {
    const formatted = formatTotalARS(Math.abs(value));
    const parts = formatted.split(',');
    return {
      integer: (value < 0 ? '-' : '') + '$ ' + parts[0],
      decimals: parts[1] ? `,${parts[1]}` : ',00',
    };
  };

  return (
    <>
      {/* ── Single panel container ── */}
      <div
        className="bg-[#F7F6F2] border border-[#DFDCD3] rounded-2xl overflow-hidden"
        style={{
          boxShadow:
            '0 1px 3px rgba(18,19,26,.04), 0 8px 24px rgba(18,19,26,.05)',
        }}
      >
        {/* ── Section 1: Toolbar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEAE3]">
          <div className="flex items-center gap-2">
            <p className="text-[12.5px] text-[#6E7079]">
              Últ. actualización{' '}
              {lastComprobantesJob?.createdAt ? (
                <span
                  className={cn(
                    'font-bold',
                    lastComprobantesJob.success
                      ? 'text-[#2f7d55]'
                      : 'text-destructive'
                  )}
                >
                  {formatLastUpdateAt(lastComprobantesJob.createdAt)}
                </span>
              ) : (
                '—'
              )}
            </p>
            {lastComprobantesJob &&
              !lastComprobantesJob.success &&
              lastComprobantesJob.failedReason && (
                <span
                  className="relative group"
                  title={lastComprobantesJob.failedReason}
                >
                  <Info className="h-4 w-4 text-destructive cursor-help" />
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 hidden group-hover:block w-max max-w-sm rounded-lg bg-[#12131A] text-white text-[11px] leading-snug px-3 py-2 shadow-lg pointer-events-none">
                    {lastComprobantesJob.failedReason}
                  </span>
                </span>
              )}
          </div>
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors disabled:opacity-50"
              disabled={!!scrapingSection}
              onClick={handleUpdateFacturas}
            >
              {scrapingSection === 'facturas' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Actualizando…
                </>
              ) : (
                'Actualizar facturas'
              )}
            </button>
            <button
              className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] text-[13.5px] font-semibold text-[#3E404A] rounded-[10px] px-[15px] py-[9px] hover:bg-[#FBFAF6] transition-colors disabled:opacity-50"
              disabled={exportingExcel}
              onClick={handleExportExcel}
            >
              {exportingExcel ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin stroke-[#3E404A]" />
              ) : (
                <Download className="h-3.5 w-3.5 stroke-[#3E404A]" />
              )}
              Descargar Excel
            </button>
          </div>
        </div>

        {/* ── Section 2: Filter row ── */}
        <div className="flex items-center gap-3 px-6 py-[14px] bg-[#FBFAF6] border-b border-[#ECEAE3]">
          {/* Período dropdown */}
          <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] min-w-0 shrink-0">
                <span className="text-[#9B9CA3]">Período</span>
                <span className="font-bold text-[#12131A] truncate">
                  {periodLabel}
                </span>
                <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="space-y-3">
                <Select
                  value={periodType}
                  onValueChange={(v) => {
                    setPeriodType(v as 'none' | 'year' | 'month' | 'range');
                    if (v === 'none') setPeriodPickerOpen(false);
                  }}
                >
                  <SelectTrigger className="w-full h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin período</SelectItem>
                    <SelectItem value="year">Por año</SelectItem>
                    <SelectItem value="month">Por mes</SelectItem>
                    <SelectItem value="range">Rango de días</SelectItem>
                  </SelectContent>
                </Select>

                {periodType === 'year' && (
                  <Select
                    value={String(periodYear)}
                    onValueChange={(v) => {
                      setPeriodYear(Number(v));
                      setPeriodPickerOpen(false);
                    }}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Año" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(
                        { length: 8 },
                        (_, i) => now.getFullYear() - i
                      ).map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {periodType === 'month' && (
                  <>
                    <Select
                      value={String(periodYear)}
                      onValueChange={(v) => {
                        const y = Number(v);
                        const newMax =
                          y === now.getFullYear() ? now.getMonth() : 11;
                        setPeriodYear(y);
                        setPeriodMonth((m) => Math.min(m, newMax));
                      }}
                    >
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Año" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: 8 },
                          (_, i) => now.getFullYear() - i
                        ).map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Array.from(
                        {
                          length:
                            periodYear === now.getFullYear()
                              ? now.getMonth() + 1
                              : 12,
                        },
                        (_, i) => i
                      ).map((i) => (
                        <Button
                          key={i}
                          variant={periodMonth === i ? 'default' : 'outline'}
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => {
                            setPeriodMonth(i);
                            setPeriodPickerOpen(false);
                          }}
                        >
                          {MONTH_NAMES_SHORT[i]}
                        </Button>
                      ))}
                    </div>
                  </>
                )}

                {periodType === 'range' && (
                  <DateRangeCalendar
                    mode="range"
                    defaultMonth={periodDateRange?.from}
                    selected={periodDateRange}
                    onSelect={(range) => {
                      setPeriodDateRange(range);
                      if (range?.from && range?.to) setPeriodPickerOpen(false);
                    }}
                    numberOfMonths={2}
                    locale={es}
                  />
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Tipo dropdown */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="bg-white border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[180px] gap-2 [&>svg]:hidden">
              <div className="flex items-center gap-2">
                <span className="text-[#9B9CA3]">Tipo</span>
                <span className="font-bold text-[#12131A] truncate">
                  {typeFilter === 'all'
                    ? 'Todas las facturas'
                    : (TYPE_LABELS[typeFilter] ?? typeFilter)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">Todas las facturas</SelectItem>
              {Object.entries(INVOICE_TYPE_LABELS)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Dirección dropdown */}
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="bg-white border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-auto min-w-[120px] gap-2 [&>svg]:hidden">
              <div className="flex items-center gap-2">
                <span className="text-[#9B9CA3]">Dirección</span>
                <span className="font-bold text-[#12131A]">
                  {directionFilter === 'all'
                    ? 'Todas'
                    : getDirectionLabel(directionFilter)}
                </span>
                <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="Outbound">Emitida</SelectItem>
              <SelectItem value="Inbound">Recibida</SelectItem>
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-[13px] top-1/2 -translate-y-1/2 h-3.5 w-3.5 stroke-[#9B9CA3]" />
            <input
              type="text"
              placeholder="Buscar mediante emisor o receptor…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] pl-9 text-[13.5px] text-[#12131A] placeholder:text-[#9B9CA3] outline-none focus:border-[#9B9CA3] transition-colors"
            />
          </div>
        </div>

        {/* ── Section 3: Totals + Chart band ── */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2.3fr] bg-white">
          {/* Left: Totals */}
          <div className="flex flex-col justify-center px-7 py-[26px] md:border-r border-[#ECEAE3]">
            {/* Total Ventas */}
            <div className="py-[14px]">
              <div className="text-[11.5px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3]">
                TOTAL VENTAS
              </div>
              <div className="font-[family-name:var(--ff-display)] font-semibold text-[26px] text-[#12131A]">
                {splitTotal(totals.totalSales).integer}
                <span className="text-[16px] text-[#9B9CA3]">
                  {splitTotal(totals.totalSales).decimals}
                </span>
              </div>
            </div>
            <div className="border-t border-[#F0EEE8]" />
            {/* Total Compras */}
            <div className="py-[14px]">
              <div className="text-[11.5px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3]">
                TOTAL COMPRAS
              </div>
              <div className="font-[family-name:var(--ff-display)] font-semibold text-[26px] text-[#12131A]">
                {splitTotal(totals.totalPurchases).integer}
                <span className="text-[16px] text-[#9B9CA3]">
                  {splitTotal(totals.totalPurchases).decimals}
                </span>
              </div>
            </div>
            <div className="border-t border-[#F0EEE8]" />
            {/* Ventas - Compras */}
            <div className="py-[14px]">
              <div className="text-[11.5px] font-bold tracking-[0.08em] uppercase text-[#9B9CA3]">
                VENTAS − COMPRAS
              </div>
              <div
                className={cn(
                  'font-[family-name:var(--ff-display)] font-bold text-[30px] tracking-[-0.025em]',
                  diff >= 0 ? 'text-[#2f7d55]' : 'text-[var(--arca-accent-neg-fg)]'
                )}
              >
                {diff < 0 ? '-' : ''}$ {formatTotalARS(Math.abs(diff)).split(',')[0]}
                <span
                  className="text-[18px]"
                  style={{ opacity: 0.6 }}
                >
                  ,{formatTotalARS(Math.abs(diff)).split(',')[1] ?? '00'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Chart */}
          <div className="px-7 pt-6 pb-[18px]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A]">
                Ventas y compras · últimos 12 meses
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#142A4E]" />
                  <span className="text-[12px] text-[#6E7079]">Ventas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-[10px] h-[10px] rounded-sm bg-[#90ACD0]" />
                  <span className="text-[12px] text-[#6E7079]">Compras</span>
                </div>
              </div>
            </div>
            <InlineSVGChart data={chartData} />
          </div>
        </div>

        {/* ── Section 4: Invoices table ── */}
        <div className="border-t border-[#ECEAE3]">
          {/* Header row */}
          <div
            className="grid items-center px-5 h-12 bg-[#0B1730] text-[#E7EAF2] text-[12px] font-semibold"
            style={{
              gridTemplateColumns:
                '44px 132px 1.05fr 1.2fr 1.2fr 108px 152px 108px',
            }}
          >
            {/* Checkbox */}
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                className="h-4 w-4 rounded cursor-pointer accent-white appearance-none border-[1.5px] border-[#6C7690] checked:bg-white checked:border-white"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={() => toggleAllInvoices(allPageIds)}
              />
            </div>
            <div>Tipo</div>
            <div>Cliente</div>
            <div>Emisor</div>
            <div>Destinatario</div>
            <div>
              <button
                className="flex items-center gap-1 group"
                onClick={handleSortByDate}
              >
                Fecha
                {sortBy === 'emitionDate' && sortOrder === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : sortBy === 'emitionDate' && sortOrder === 'desc' ? (
                  <ArrowDown className="h-3 w-3 stroke-[#9AA3BC]" />
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity stroke-[#9AA3BC]" />
                )}
              </button>
            </div>
            <div className="text-right">
              <button
                className="inline-flex items-center gap-1 group ml-auto"
                onClick={handleSortByAmount}
              >
                Monto
                {sortBy === 'amount' && sortOrder === 'asc' ? (
                  <ArrowUp className="h-3 w-3" />
                ) : sortBy === 'amount' && sortOrder === 'desc' ? (
                  <ArrowDown className="h-3 w-3 stroke-[#9AA3BC]" />
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity stroke-[#9AA3BC]" />
                )}
              </button>
            </div>
            <div>Dirección</div>
          </div>

          {/* Data rows */}
          {isLoading ? (
            <div className="flex items-center justify-center h-24 text-[13.5px] text-[#9B9CA3]">
              Cargando facturas...
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[13.5px] text-[#9B9CA3]">
              No se encontraron facturas.
            </div>
          ) : (
            invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="grid items-center px-5 py-[14px] border-b border-[#ECEAE3] cursor-pointer hover:bg-[#FBFAF6] transition-[background] duration-[120ms]"
                style={{
                  gridTemplateColumns:
                    '44px 132px 1.05fr 1.2fr 1.2fr 108px 152px 108px',
                }}
                onClick={() => handleViewInvoice(invoice)}
              >
                {/* Checkbox */}
                <div
                  className="flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded cursor-pointer accent-[#12131A] appearance-none border-[1.5px] border-[#C9C6BC] checked:bg-[#12131A] checked:border-[#12131A]"
                    checked={selectedIds.has(invoice.id)}
                    onChange={() => toggleInvoiceRow(invoice.id)}
                  />
                </div>

                {/* Tipo pill */}
                <div>
                  <span className="inline-block text-[12.5px] font-medium text-[#3E404A] bg-[#F2F1EB] border border-[#E4E1D9] rounded-full px-[11px] py-[3px] truncate max-w-full">
                    {getTypeLabel(invoice.type)}
                  </span>
                </div>

                {/* Cliente */}
                <div className="min-w-0 pr-3">
                  {(() => {
                    const name = invoice.profileName || (invoice.clientName && invoice.clientName !== '—' ? invoice.clientName : null);
                    return (
                      <>
                        <div className="text-[14px] text-[#12131A] truncate">
                          {name || '—'}
                        </div>
                        {invoice.clientEmail && (
                          <div className="text-[12px] text-[#B4B3AC] font-[family-name:var(--ff-mono)] truncate">
                            {invoice.clientEmail}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Emisor */}
                <div className="min-w-0 pr-3">
                  <div className="text-[14px] font-semibold text-[#12131A] truncate">
                    {invoice.emitterName}
                  </div>
                  <div className="text-[12px] text-[#9B9CA3] font-[family-name:var(--ff-mono)] tabular-nums">
                    CUIT: {invoice.emitterIdentityNumber}
                  </div>
                </div>

                {/* Destinatario */}
                <div className="min-w-0 pr-3">
                  <div className="text-[14px] font-semibold text-[#12131A] truncate">
                    {invoice.recipientName}
                  </div>
                  <div className="text-[12px] text-[#9B9CA3] font-[family-name:var(--ff-mono)] tabular-nums">
                    CUIT: {invoice.recipientIdentityNumber}
                  </div>
                </div>

                {/* Fecha */}
                <div className="text-[13.5px] text-[#3E404A] tabular-nums">
                  {formatDate(invoice.emitionDate)}
                </div>

                {/* Monto */}
                <div className="text-right text-[14px] font-semibold text-[#12131A] tabular-nums">
                  {formatRowAmount(invoice.amount, invoice.currency)}
                </div>

                {/* Dirección pill */}
                <div>
                  <span className="inline-block text-[12.5px] font-semibold text-[#3B3F6B] bg-[#E7E8F2] rounded-full px-3 py-1">
                    {getDirectionLabel(invoice.direction)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Section 5: Pagination ── */}
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

            {/* Page numbers */}
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

      {/* ── Invoice detail modal ── */}
      {viewDialogOpen && selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          style={{ background: 'rgba(18,19,26,.45)', padding: '56px 24px' }}
          onClick={() => setViewDialogOpen(false)}
        >
          <div
            className="w-[820px] max-w-full bg-white border border-[#DFDCD3] rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 12px 40px rgba(18,19,26,.22)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-7 py-5 border-b border-[#ECEAE3] bg-white">
              <div className="flex items-center gap-3">
                <h2 className="font-[family-name:var(--ff-display)] text-[20px] font-semibold tracking-[-0.01em] text-[#12131A]">
                  Detalles de la factura
                </h2>
                {selectedInvoice.idFrom && (
                  <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[#3E404A] bg-[#F2F1EB] border border-[#ECEAE3] rounded-[6px] px-2 py-[3px]">
                    #{selectedInvoice.idFrom}{selectedInvoice.idTo && selectedInvoice.idTo !== selectedInvoice.idFrom ? `–${selectedInvoice.idTo}` : ''}
                  </span>
                )}
              </div>
              <button
                className="flex items-center justify-center w-[34px] h-[34px] bg-white border border-[#DFDCD3] rounded-[10px] hover:bg-[#FBFAF6] transition-colors"
                onClick={() => setViewDialogOpen(false)}
              >
                <X className="h-4 w-4 stroke-[#3E404A]" />
              </button>
            </div>

            {/* Summary section */}
            <div className="px-7 py-6 border-b border-[#ECEAE3]">
              <div className="grid grid-cols-2 gap-x-8 gap-y-[22px]">
                {/* Tipo */}
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">TIPO</div>
                  <span className="inline-block text-[12.5px] font-medium text-[#3E404A] bg-[#F2F1EB] border border-[#E4E1D9] rounded-full px-[11px] py-[3px]">
                    {getTypeLabel(selectedInvoice.type)}
                  </span>
                </div>
                {/* Dirección */}
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">DIRECCIÓN</div>
                  <span className="inline-block text-[12.5px] font-semibold text-[#3B3F6B] bg-[#E7E8F2] rounded-full px-3 py-1">
                    {getDirectionLabel(selectedInvoice.direction)}
                  </span>
                </div>
                {/* Fecha */}
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">FECHA DE EMISIÓN</div>
                  <p className="text-[15px] text-[#12131A] tabular-nums">{formatDate(selectedInvoice.emitionDate)}</p>
                </div>
                {/* Monto */}
                <div>
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">MONTO TOTAL</div>
                  <p className="font-[family-name:var(--ff-display)] text-[26px] font-bold tracking-[-0.025em] text-[#12131A] tabular-nums">
                    {formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}
                  </p>
                </div>
                {/* Provincia */}
                <div className="col-span-2">
                  <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">PROVINCIA · CONVENIO MULTILATERAL</div>
                  <p className="text-[14px] text-[#8A8B92]">
                    {invoiceDetails?.receiptProvince || 'Sin datos'}
                  </p>
                </div>
              </div>
            </div>

            {/* Emisor / Destinatario */}
            <div className="grid grid-cols-2 border-b border-[#ECEAE3]">
              {/* Emisor */}
              <div className="px-7 py-6 border-r border-[#ECEAE3]">
                <h3 className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A] mb-4">Emisor</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">NOMBRE</div>
                    <p className="text-[14.5px] font-semibold text-[#12131A]">{selectedInvoice.emitterName}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">IDENTIFICACIÓN</div>
                    <p className="font-[family-name:var(--ff-mono)] text-[13.5px] text-[#3E404A] tabular-nums">
                      CUIT: {selectedInvoice.emitterIdentityNumber}
                    </p>
                  </div>
                </div>
              </div>
              {/* Destinatario */}
              <div className="px-7 py-6">
                <h3 className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A] mb-4">Destinatario</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">NOMBRE</div>
                    <p className="text-[14.5px] font-semibold text-[#12131A]">{selectedInvoice.recipientName}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">IDENTIFICACIÓN</div>
                    <p className="font-[family-name:var(--ff-mono)] text-[13.5px] text-[#3E404A] tabular-nums">
                      CUIT: {selectedInvoice.recipientIdentityNumber}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Comprobante fiscal */}
            {invoiceDetails && (
              <div className="px-7 py-6 border-b border-[#ECEAE3]">
                <div className="flex items-baseline gap-3 mb-4">
                  <h3 className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A]">Comprobante fiscal</h3>
                  {(selectedInvoice.clientName || selectedInvoice.profileName) && (
                    <span className="text-[13px] text-[#9B9CA3]">
                      Cliente · {selectedInvoice.profileName || selectedInvoice.clientName}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-[22px]">
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">NÚMERO DE AUTORIZACIÓN</div>
                    <p className="font-[family-name:var(--ff-mono)] text-[13.5px] text-[#12131A] tabular-nums">
                      {invoiceDetails.authorizationNumber || '—'}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">PUNTO DE VENTA</div>
                    <p className="text-[14px] text-[#12131A]">{invoiceDetails.salePoint || '—'}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">RANGO DE IDS</div>
                    <p className="font-[family-name:var(--ff-mono)] text-[13.5px] text-[#12131A] tabular-nums">
                      {invoiceDetails.idFrom || '—'} – {invoiceDetails.idTo || '—'}
                    </p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold tracking-[0.07em] uppercase text-[#B4B3AC] mb-[6px]">MONEDA</div>
                    <p className="text-[14px] text-[#12131A]">
                      {invoiceDetails.currency || '—'} · tasa {invoiceDetails.currencyRate ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Desglose de impuestos */}
            {invoiceDetails && (
              <div className="px-7 py-6 border-b border-[#ECEAE3]">
                <h3 className="font-[family-name:var(--ff-display)] text-[15px] font-semibold text-[#12131A] mb-4">Desglose de impuestos</h3>
                <div className="grid grid-cols-2 gap-x-10">
                  {[
                    ['IVA 0%', 'amountIVA0'],
                    ['IVA 2,5%', 'amountIVA25'],
                    ['IVA 5%', 'amountIVA5'],
                    ['IVA 10,5%', 'amountIVA105'],
                    ['IVA 21%', 'amountIVA21'],
                    ['IVA 27%', 'amountIVA27'],
                    ['Monto gravado', 'amountTaxed'],
                    ['Monto no gravado', 'amountNoTaxed'],
                    ['Monto exento', 'amountExempt'],
                  ].map(([label, key]) => (
                    <div
                      key={key}
                      className="flex justify-between items-center py-[10px] border-b border-[#F4F2EC]"
                    >
                      <span className="text-[14px] text-[#6E7079]">{label}</span>
                      <span className="text-[14px] text-[#12131A] tabular-nums">
                        {formatCurrency(invoiceDetails[key] ?? '0', invoiceDetails.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-7 py-4 bg-[#FBFAF6] border-t border-[#ECEAE3]">
              <span className="text-[13.5px] text-[#6E7079]">
                Total IVA · <span className="font-semibold text-[#12131A] tabular-nums">
                  {invoiceDetails ? formatCurrency(invoiceDetails.totalIVA ?? '0', invoiceDetails.currency) : '$ 0,00'}
                </span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] text-[13.5px] font-semibold text-[#3E404A] rounded-[10px] px-[15px] py-[9px] hover:bg-[#FBFAF6] transition-colors"
                  onClick={() => setViewDialogOpen(false)}
                >
                  Cerrar
                </button>
                <button
                  className="inline-flex items-center gap-2 bg-[#12131A] text-white text-[13.5px] font-semibold rounded-[10px] px-[15px] py-[9px] hover:bg-black transition-colors"
                  onClick={() => {
                    if (invoiceDetails?.attachments?.[0]?.documentUrl) {
                      const link = document.createElement('a');
                      link.href = invoiceDetails.attachments[0].documentUrl;
                      link.download = invoiceDetails.attachments[0].documentName || 'factura.pdf';
                      link.target = '_blank';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    } else {
                      toast.info('No hay PDF disponible para esta factura.');
                    }
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
