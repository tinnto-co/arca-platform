import {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Download,
  FileText,
  Calendar as CalendarIcon,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { type DateRange } from 'react-day-picker';
import ExcelJSRaw from 'exceljs';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  getInvoices,
  getInvoice,
  getInvoicesByProfile,
} from '@/actions/invoice';
import { getRepresentatives, getRepresentativeClients } from '@/actions/client';
import { cn } from '@/lib/utils';

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

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'facturas'
  );
}

/** Mapa código AFIP → etiqueta; exportado para usar en filtros del módulo Facturas (client-detail-page). */
export const INVOICE_TYPE_LABELS: Record<string, string> = {
  '1': 'Factura A',
  '2': 'Nota de Débito A',
  '3': 'Nota de Crédito A',
  '4': 'Recibo A',
  '5': 'Nota de Venta al Contado A',
  '6': 'Factura B',
  '7': 'Nota de Débito B',
  '8': 'Nota de Crédito B',
  '9': 'Recibo B',
  '10': 'Nota de Venta al Contado B',
  '11': 'Factura C',
  '12': 'Nota de Débito C',
  '13': 'Nota de Crédito C',
  '15': 'Recibo C',
  '16': 'Nota de Venta al Contado C',
  '17': 'Liquidación',
  '18': 'Liquidación A',
  '19': 'Factura E',
  '20': 'Nota de Débito E',
  '21': 'Nota de Crédito E',
  '22': 'Factura – Crédito Fiscal',
  '34': 'Comprobante A del Sector Público',
  '35': 'Nota de Débito A del Sector Público',
  '36': 'Nota de Crédito A del Sector Público',
  '37': 'Recibo A del Sector Público',
  '38': 'Comprobante B del Sector Público',
  '39': 'Nota de Débito B del Sector Público',
  '40': 'Nota de Crédito B del Sector Público',
  '41': 'Recibo B del Sector Público',
  '51': 'Factura M',
  '52': 'Nota de Débito M',
  '53': 'Nota de Crédito M',
  '54': 'Recibo M',
  '81': 'Ticket Factura A',
  '82': 'Ticket Factura B',
  '83': 'Ticket',
  '110': 'Ticket Nota de Crédito',
  '201': 'Factura de Crédito Electrónica MiPyME A',
  '202': 'Nota de Débito Electrónica MiPyME A',
  '203': 'Nota de Crédito Electrónica MiPyME A',
  '206': 'Factura de Crédito Electrónica MiPyME B',
  '207': 'Nota de Débito Electrónica MiPyME B',
  '208': 'Nota de Crédito Electrónica MiPyME B',
  '211': 'Factura de Crédito Electrónica MiPyME C',
  '212': 'Nota de Débito Electrónica MiPyME C',
  '213': 'Nota de Crédito Electrónica MiPyME C',
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

interface InvoicesTableProps {
  clientId?: string;
  profileId?: string;
  /** Cuando se pasan, el período lo controla el padre (ej. pestaña Facturas del detalle de cliente). */
  controlledDateFrom?: string;
  controlledDateTo?: string;
  /** Filtros controlados por el padre (módulo Facturas): se ocultan los selects de perfil/tipo/dirección en la tabla. */
  controlledProfileFilter?: string;
  controlledTypeFilter?: string;
  controlledDirectionFilter?: string;
  /** Búsqueda controlada por el padre (se muestra la barra de búsqueda arriba de las cards). */
  controlledSearchTerm?: string;
  /** Contenido extra para la barra de filtros (ej. selector de período), se muestra al lado del botón Excel. */
  toolbarExtra?: React.ReactNode;
  /** Callback cuando cambian perfil, tipo o dirección (para que el padre actualice los totales Ventas/Compras). */
  onFiltersChange?: (filters: {
    profileFilter: string;
    typeFilter: string;
    directionFilter: string;
  }) => void;
}

export interface InvoicesTableRef {
  exportExcel: () => Promise<void>;
}

const InvoicesTableComponent = forwardRef<InvoicesTableRef, InvoicesTableProps>(
  function InvoicesTable(
    {
      clientId,
      profileId,
      controlledDateFrom,
      controlledDateTo,
      controlledProfileFilter,
      controlledTypeFilter,
      controlledDirectionFilter,
      controlledSearchTerm,
      toolbarExtra,
      onFiltersChange,
    }: InvoicesTableProps = {},
    ref
  ) {
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [clientFilter, setClientFilter] = useState<string>(clientId || 'all');
    const [profileFilter, setProfileFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>(
      undefined
    );
    /** Padre controla fechas cuando hay valores definidos; si estamos en modo filtros controlados, undefined/undefined = Sin período = sin filtro de fecha. */
    const isDateControlled =
      controlledDateFrom !== undefined && controlledDateTo !== undefined;
    const isFiltersControlled =
      controlledProfileFilter !== undefined &&
      controlledTypeFilter !== undefined &&
      controlledDirectionFilter !== undefined;
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [directionFilter, setDirectionFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'amount' | 'emitionDate' | undefined>(
      'emitionDate'
    );
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
      'desc'
    );
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(
      null
    );
    const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
    const [exportingExcel, setExportingExcel] = useState(false);

    const pageSize = 10;

    useEffect(() => {
      if (clientId) {
        setClientFilter(clientId);
        setCurrentPage(1);
      }
    }, [clientId]);

    useEffect(() => {
      if (profileId) {
        setCurrentPage(1);
      }
    }, [profileId]);

    // When client changes, reset profile filter
    useEffect(() => {
      setProfileFilter('all');
      setCurrentPage(1);
    }, [clientFilter, clientId]);

    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedSearchTerm(searchTerm);
        if (searchTerm !== debouncedSearchTerm) {
          setCurrentPage(1);
        }
      }, 500);
      return () => clearTimeout(timer);
    }, [searchTerm, debouncedSearchTerm]);

    // Sincronizar rango de fechas cuando el padre controla el período (p. ej. pestaña Facturas). Sin período = undefined/undefined → limpiamos.
    useEffect(() => {
      if (controlledDateFrom && controlledDateTo) {
        setDateRange({
          from: new Date(controlledDateFrom),
          to: new Date(controlledDateTo),
        });
      } else if (
        isFiltersControlled &&
        controlledDateFrom === undefined &&
        controlledDateTo === undefined
      ) {
        setDateRange(undefined);
      }
    }, [controlledDateFrom, controlledDateTo, isFiltersControlled]);

    // Sincronizar filtros cuando el padre los controla (módulo Facturas: filtros arriba de las cards)
    useEffect(() => {
      if (isFiltersControlled && controlledProfileFilter !== undefined) {
        setProfileFilter(controlledProfileFilter);
      }
    }, [isFiltersControlled, controlledProfileFilter]);
    useEffect(() => {
      if (isFiltersControlled && controlledTypeFilter !== undefined) {
        setTypeFilter(controlledTypeFilter);
      }
    }, [isFiltersControlled, controlledTypeFilter]);
    useEffect(() => {
      if (isFiltersControlled && controlledDirectionFilter !== undefined) {
        setDirectionFilter(controlledDirectionFilter);
      }
    }, [isFiltersControlled, controlledDirectionFilter]);

    useEffect(() => {
      if (controlledSearchTerm !== undefined) {
        setSearchTerm(controlledSearchTerm);
        setDebouncedSearchTerm(controlledSearchTerm);
      }
    }, [controlledSearchTerm]);

    // Notificar al padre (módulo Facturas) cuando cambian los filtros para actualizar totales Ventas/Compras
    useEffect(() => {
      if (clientId && onFiltersChange) {
        onFiltersChange({ profileFilter, typeFilter, directionFilter });
      }
    }, [clientId, onFiltersChange, profileFilter, typeFilter, directionFilter]);

    const effectiveSearchTerm =
      controlledSearchTerm !== undefined
        ? controlledSearchTerm
        : debouncedSearchTerm;

    const { data: representatives = [] } = useQuery({
      queryKey: ['representatives'],
      queryFn: () => getRepresentatives(),
    });

    const representativeForClients =
      clientId ?? (clientFilter !== 'all' ? clientFilter : undefined);
    const { data: representativeClients = [] } = useQuery({
      queryKey: ['representativeClients', representativeForClients],
      queryFn: () =>
        getRepresentativeClients({ data: { representativeId: representativeForClients! } }),
      enabled: !!representativeForClients,
    });

    /** Con filtros controlados por el padre, undefined = Sin período = sin filtro (todas las facturas). */
    const dateFrom = isFiltersControlled
      ? (controlledDateFrom ?? '')
      : isDateControlled
        ? (controlledDateFrom ?? '')
        : dateRange?.from
          ? format(dateRange.from, 'yyyy-MM-dd')
          : '';
    const dateTo = isFiltersControlled
      ? (controlledDateTo ?? '')
      : isDateControlled
        ? (controlledDateTo ?? '')
        : dateRange?.to
          ? format(dateRange.to, 'yyyy-MM-dd')
          : '';

    const { data: invoicesData, isLoading } = useQuery({
      queryKey: profileId
        ? [
            'profileInvoices',
            profileId,
            currentPage,
            dateFrom,
            dateTo,
            typeFilter,
            directionFilter,
            effectiveSearchTerm,
            sortBy,
            sortOrder,
          ]
        : [
            'invoices',
            currentPage,
            clientFilter,
            profileFilter,
            dateFrom,
            dateTo,
            typeFilter,
            directionFilter,
            effectiveSearchTerm,
            sortBy,
            sortOrder,
          ],
      queryFn: () =>
        profileId
          ? getInvoicesByProfile({
              data: {
                profileId,
                page: currentPage,
                limit: pageSize,
              },
            })
          : getInvoices({
              data: {
                page: currentPage,
                limit: pageSize,
                clientFilter: clientFilter === 'all' ? undefined : clientFilter,
                profileFilter:
                  profileFilter === 'all' ? undefined : profileFilter,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                typeFilter: typeFilter === 'all' ? undefined : typeFilter,
                directionFilter:
                  directionFilter === 'all' ? undefined : directionFilter,
                search: effectiveSearchTerm || undefined,
                sortBy: sortBy,
                sortOrder: sortBy ? sortOrder : undefined,
              },
            }),
      enabled: !profileId || !!profileId,
    });

    const handleViewInvoice = async (invoice: InvoiceData) => {
      setSelectedInvoice(invoice);
      setViewDialogOpen(true);
      try {
        const details = await getInvoice({ data: { id: invoice.id } });
        setInvoiceDetails(details);
      } catch (error) {
        toast.error('Error al cargar los detalles de la factura');
        console.error(error);
      }
    };

    const handleDownloadAttachment = (url: string, filename: string) => {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handleExportExcel = async () => {
      setExportingExcel(true);
      try {
        const exportLimit = 50000;
        const data = profileId
          ? await getInvoicesByProfile({
              data: { profileId, page: 1, limit: exportLimit },
            })
          : await getInvoices({
              data: {
                page: 1,
                limit: exportLimit,
                clientFilter: clientFilter === 'all' ? undefined : clientFilter,
                profileFilter:
                  profileFilter === 'all' ? undefined : profileFilter,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                typeFilter: typeFilter === 'all' ? undefined : typeFilter,
                directionFilter:
                  directionFilter === 'all' ? undefined : directionFilter,
                search: effectiveSearchTerm || undefined,
                sortBy: sortBy ?? undefined,
                sortOrder: sortBy ? (sortOrder ?? undefined) : undefined,
              },
            });
        const invoices: InvoiceData[] = data.invoices ?? [];
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
          'Tipo',
          'Tipo (código)',
          'Dirección',
          'Fecha',
          'Pto.Vta',
          'Número desde',
          'Número hasta',
          'Cliente',
          'Email cliente',
          'Perfil',
          'Emisor',
          'CUIT/DNI emisor',
          'Destinatario',
          'CUIT/DNI destinatario',
          'Moneda',
          'Cotización',
          'Monto',
          'Nº autorización',
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
            getTypeLabel(inv.type),
            inv.type,
            getDirectionLabel(inv.direction),
            formatDate(inv.emitionDate),
            inv.salePoint ?? '—',
            inv.idFrom ?? '—',
            inv.idTo ?? '—',
            inv.clientName ?? '—',
            inv.clientEmail ?? '—',
            inv.profileName ?? '—',
            inv.emitterName ?? '—',
            inv.emitterIdentityNumber
              ? `${inv.emitterIdentityType ?? ''} ${inv.emitterIdentityNumber}`.trim()
              : '—',
            inv.recipientName ?? '—',
            inv.recipientIdentityNumber
              ? `${inv.recipientIdentityType ?? ''} ${inv.recipientIdentityNumber}`.trim()
              : '—',
            inv.currency ?? '—',
            inv.currencyRate ?? '—',
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
          dateFrom && dateTo
            ? `${dateFrom}_${dateTo}`
            : new Date().toISOString().slice(0, 10);
        a.download = `facturas_${sanitizeFilename(profileId ? 'perfil' : clientFilter === 'all' ? 'todas' : clientFilter)}_${dateStr}.xlsx`;
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

    useImperativeHandle(ref, () => ({ exportExcel: handleExportExcel }), [
      handleExportExcel,
    ]);

    /** Formatea YYYY-MM-DD a dd/MM/yyyy sin pasar por UTC (evita desfase de día en otras zonas horarias). */
    const formatDateOnlyString = (isoDate: string): string => {
      const [y, m, d] = isoDate.split('-');
      return d && m && y ? `${d}/${m}/${y}` : isoDate;
    };

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

    const getTypeBadge = (type: string) => {
      const typeMap: Record<
        string,
        {
          variant: 'default' | 'secondary' | 'destructive' | 'outline';
          label: string;
        }
      > = {
        '1': { variant: 'default', label: 'Factura A' },
        '2': { variant: 'default', label: 'Nota de Débito A' },
        '3': { variant: 'default', label: 'Nota de Crédito A' },
        '4': { variant: 'default', label: 'Recibo A' },
        '5': { variant: 'default', label: 'Nota de Venta al Contado A' },
        '6': { variant: 'secondary', label: 'Factura B' },
        '7': { variant: 'secondary', label: 'Nota de Débito B' },
        '8': { variant: 'secondary', label: 'Nota de Crédito B' },
        '9': { variant: 'secondary', label: 'Recibo B' },
        '10': { variant: 'secondary', label: 'Nota de Venta al Contado B' },
        '11': { variant: 'outline', label: 'Factura C' },
        '12': { variant: 'outline', label: 'Nota de Débito C' },
        '13': { variant: 'outline', label: 'Nota de Crédito C' },
        '15': { variant: 'outline', label: 'Recibo C' },
        '16': { variant: 'outline', label: 'Nota de Venta al Contado C' },
        '17': { variant: 'default', label: 'Liquidación' },
        '18': { variant: 'default', label: 'Liquidación A' },
        '19': { variant: 'destructive', label: 'Factura E' },
        '20': { variant: 'destructive', label: 'Nota de Débito E' },
        '21': { variant: 'destructive', label: 'Nota de Crédito E' },
        '22': { variant: 'default', label: 'Factura – Crédito Fiscal' },
        '34': { variant: 'default', label: 'Comprobante A del Sector Público' },
        '35': {
          variant: 'default',
          label: 'Nota de Débito A del Sector Público',
        },
        '36': {
          variant: 'default',
          label: 'Nota de Crédito A del Sector Público',
        },
        '37': { variant: 'default', label: 'Recibo A del Sector Público' },
        '38': {
          variant: 'secondary',
          label: 'Comprobante B del Sector Público',
        },
        '39': {
          variant: 'secondary',
          label: 'Nota de Débito B del Sector Público',
        },
        '40': {
          variant: 'secondary',
          label: 'Nota de Crédito B del Sector Público',
        },
        '41': { variant: 'secondary', label: 'Recibo B del Sector Público' },
        '51': { variant: 'default', label: 'Factura M' },
        '52': { variant: 'default', label: 'Nota de Débito M' },
        '53': { variant: 'default', label: 'Nota de Crédito M' },
        '54': { variant: 'default', label: 'Recibo M' },
        '81': { variant: 'outline', label: 'Ticket Factura A' },
        '82': { variant: 'outline', label: 'Ticket Factura B' },
        '83': { variant: 'outline', label: 'Ticket' },
        '110': { variant: 'outline', label: 'Ticket Nota de Crédito' },
        '201': {
          variant: 'default',
          label: 'Factura de Crédito Electrónica MiPyME A',
        },
        '202': {
          variant: 'default',
          label: 'Nota de Débito Electrónica MiPyME A',
        },
        '203': {
          variant: 'default',
          label: 'Nota de Crédito Electrónica MiPyME A',
        },
        '206': {
          variant: 'secondary',
          label: 'Factura de Crédito Electrónica MiPyME B',
        },
        '207': {
          variant: 'secondary',
          label: 'Nota de Débito Electrónica MiPyME B',
        },
        '208': {
          variant: 'secondary',
          label: 'Nota de Crédito Electrónica MiPyME B',
        },
        '211': {
          variant: 'outline',
          label: 'Factura de Crédito Electrónica MiPyME C',
        },
        '212': {
          variant: 'outline',
          label: 'Nota de Débito Electrónica MiPyME C',
        },
        '213': {
          variant: 'outline',
          label: 'Nota de Crédito Electrónica MiPyME C',
        },
      };

      const typeInfo = typeMap[type] || {
        variant: 'outline' as const,
        label: `Tipo ${type}`,
      };
      return (
        <Badge
          variant={typeInfo.variant}
          className="!whitespace-normal break-words text-[10px] px-1.5 py-0.5 inline-block max-w-full leading-tight"
        >
          {typeInfo.label}
        </Badge>
      );
    };

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
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else if (sortOrder === 'asc') {
          setSortBy(undefined);
          setSortOrder(undefined);
        }
      } else {
        setSortBy('amount');
        setSortOrder('desc');
      }
    };

    const getDirectionBadge = (direction: string) => {
      const directionMap: Record<
        string,
        {
          variant: 'default' | 'secondary' | 'destructive' | 'outline';
          label: string;
        }
      > = {
        outbound: { variant: 'secondary', label: 'Emitida' },
        inbound: { variant: 'secondary', label: 'Recibida' },
      };

      const directionKey = direction || '';
      const directionInfo = directionMap[directionKey] ||
        directionMap[directionKey.toLowerCase()] || {
          variant: 'outline' as const,
          label: direction || 'Desconocida',
        };
      return (
        <Badge variant={directionInfo.variant}>{directionInfo.label}</Badge>
      );
    };

    const totalPages = invoicesData?.totalPages || 1;

    // Calculate pagination pages to display (max 7)
    const getPaginationPages = () => {
      const maxVisiblePages = 7;
      if (totalPages <= maxVisiblePages) {
        return { startPage: 1, endPage: totalPages };
      }

      const halfVisible = Math.floor(maxVisiblePages / 2);
      let startPage: number;
      let endPage: number;

      if (currentPage <= halfVisible) {
        startPage = 1;
        endPage = maxVisiblePages;
      } else if (currentPage + halfVisible >= totalPages) {
        startPage = totalPages - maxVisiblePages + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - halfVisible;
        endPage = currentPage + halfVisible;
      }

      return { startPage, endPage };
    };

    const { startPage, endPage } = getPaginationPages();
    const visiblePages = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i
    );

    return (
      <div className="w-full min-w-0 flex flex-col h-full gap-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between flex-shrink-0">
          <div className="flex flex-col gap-2 md:flex-row md:items-center flex-wrap">
            {!isFiltersControlled && (
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--arca-ink-3)]" />
                <Input
                  placeholder="Buscar mediante emisor o receptor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full md:w-80"
                />
              </div>
            )}

            {!clientId && !profileId && (
              <SearchableSelect
                value={clientFilter}
                onValueChange={setClientFilter}
                placeholder="Filtrar por cliente"
                searchPlaceholder="Buscar cliente..."
                options={[
                  { value: 'all', label: 'Todos los clientes' },
                  ...representatives.map((rep) => ({
                    value: rep.id,
                    label: rep.name,
                  })),
                ]}
                width={192}
              />
            )}

            {!isFiltersControlled && !profileId && representativeForClients && (
              <SearchableSelect
                value={profileFilter}
                onValueChange={(v) => {
                  setProfileFilter(v);
                  setCurrentPage(1);
                }}
                placeholder="Perfil"
                searchPlaceholder="Buscar perfil..."
                options={[
                  { value: 'all', label: 'Todos los perfiles' },
                  ...representativeClients.map(
                    (p: {
                      id: string;
                      name?: string;
                      identityNumber?: string;
                    }) => ({
                      value: p.id,
                      label: p.name || p.identityNumber || p.id,
                    })
                  ),
                ]}
                width={192}
              />
            )}

            {!isFiltersControlled && (
              <SearchableSelect
                value={typeFilter}
                onValueChange={setTypeFilter}
                placeholder="Tipo"
                searchPlaceholder="Buscar tipo..."
                options={[
                  { value: 'all', label: 'Todas las facturas' },
                  ...Object.entries(INVOICE_TYPE_LABELS).map(([code, label]) => ({
                    value: code,
                    label,
                  })),
                ]}
                width={256}
              />
            )}

            {!isFiltersControlled && (
              <SearchableSelect
                value={directionFilter}
                onValueChange={setDirectionFilter}
                placeholder="Dirección"
                searchPlaceholder="Buscar dirección..."
                options={[
                  { value: 'all', label: 'Todas las direcciones' },
                  { value: 'Outbound', label: 'Emitida' },
                  { value: 'Inbound', label: 'Recibida' },
                ]}
                width={224}
              />
            )}

            {!isFiltersControlled &&
              !toolbarExtra &&
              (isDateControlled ? (
                <div
                  className={cn(
                    'flex items-center gap-2 h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm',
                    !dateFrom && !dateTo && 'text-[var(--arca-ink-3)]'
                  )}
                >
                  <CalendarIcon className="h-4 w-4 shrink-0 text-[var(--arca-ink-3)]" />
                  {dateFrom && dateTo ? (
                    <>
                      {formatDateOnlyString(dateFrom)} –{' '}
                      {formatDateOnlyString(dateTo)}
                    </>
                  ) : (
                    <span>Sin período seleccionado</span>
                  )}
                </div>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="date"
                      variant="outline"
                      className={cn(
                        'w-full md:w-[300px] justify-start text-left font-normal',
                        !dateRange && 'text-[var(--arca-ink-3)]'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'dd/MM/yyyy', {
                              locale: es,
                            })}{' '}
                            -{' '}
                            {format(dateRange.to, 'dd/MM/yyyy', { locale: es })}
                          </>
                        ) : (
                          format(dateRange.from, 'dd/MM/yyyy', { locale: es })
                        )
                      ) : (
                        <span>Seleccionar rango de fechas</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      locale={es}
                    />
                  </PopoverContent>
                </Popover>
              ))}
            {toolbarExtra && (
              <div className="flex flex-wrap items-center gap-2">
                {toolbarExtra}
              </div>
            )}
            {!isFiltersControlled && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={exportingExcel}
                className="h-9 gap-1.5 w-full md:w-auto shrink-0 font-normal"
              >
                {exportingExcel ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Excel</span>
              </Button>
            )}
          </div>
        </div>

        {/* Table */}
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
                  checked={
                    (invoicesData?.invoices ?? []).length > 0 &&
                    (invoicesData?.invoices ?? []).every((inv) =>
                      selectedIds.has(inv.id)
                    )
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        (invoicesData?.invoices ?? []).some((inv) =>
                          selectedIds.has(inv.id)
                        ) &&
                        !(invoicesData?.invoices ?? []).every((inv) =>
                          selectedIds.has(inv.id)
                        );
                  }}
                  onChange={() =>
                    toggleAllInvoices(
                      (invoicesData?.invoices ?? []).map((inv) => inv.id)
                    )
                  }
                />
              </TableHead>
              <TableHead className="w-[10%] px-2 py-2 align-top">
                Tipo
              </TableHead>
              <TableHead className="w-[14%] px-2 py-2 align-top">
                Cliente
              </TableHead>
              <TableHead className="w-[17%] px-2 py-2 align-top">
                Emisor
              </TableHead>
              <TableHead className="w-[17%] px-2 py-2 align-top">
                Destinatario
              </TableHead>
              <TableHead className="w-[9%] px-2 py-2 align-middle">
                <button
                  className="flex items-center gap-1 group text-white text-[11px] font-semibold"
                  onClick={handleSortByDate}
                >
                  Fecha
                  {sortBy === 'emitionDate' && sortOrder === 'asc' ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : sortBy === 'emitionDate' && sortOrder === 'desc' ? (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="ml-1 h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[14%] px-2 py-2 align-middle">
                <button
                  className="flex items-center gap-1 group text-white text-[11px] font-semibold"
                  onClick={handleSortByAmount}
                >
                  Monto
                  {sortBy === 'amount' && sortOrder === 'asc' ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : sortBy === 'amount' && sortOrder === 'desc' ? (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="ml-1 h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[14%] px-2 py-2 align-middle">
                Dirección
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Cargando facturas...
                </TableCell>
              </TableRow>
            ) : invoicesData?.invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No se encontraron facturas.
                </TableCell>
              </TableRow>
            ) : (
              invoicesData?.invoices.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  onClick={() => handleViewInvoice(invoice)}
                  className="cursor-pointer"
                  data-state={
                    selectedIds.has(invoice.id) ? 'selected' : undefined
                  }
                >
                  <TableCell
                    className="w-10 px-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
                      checked={selectedIds.has(invoice.id)}
                      onChange={() => toggleInvoiceRow(invoice.id)}
                    />
                  </TableCell>
                  <TableCell className="w-[10%] px-2 py-2 align-top">
                    <div className="truncate">{getTypeBadge(invoice.type)}</div>
                  </TableCell>
                  <TableCell className="w-[15%] px-2 py-2 align-top">
                    {invoice.clientName || invoice.profileName ? (
                      <div className="space-y-0.5">
                        <div
                          className="font-medium truncate text-xs"
                          title={invoice.clientName ?? undefined}
                        >
                          {invoice.clientName ?? '—'}
                        </div>
                        {invoice.profileName && (
                          <div
                            className="text-xs text-[var(--arca-ink-3)] truncate"
                            title={invoice.profileName}
                          >
                            {invoice.profileName}
                          </div>
                        )}
                        {invoice.clientEmail && (
                          <div
                            className="text-xs text-[var(--arca-ink-3)] truncate"
                            title={invoice.clientEmail}
                          >
                            {invoice.clientEmail}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--arca-ink-3)] text-xs">
                        Sin cliente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-[18%] px-2 py-2 align-top">
                    <div className="space-y-0.5">
                      <div
                        className="font-medium truncate text-xs"
                        title={invoice.emitterName}
                      >
                        {invoice.emitterName}
                      </div>
                      <div
                        className="text-xs text-[var(--arca-ink-3)] truncate"
                        title={`${invoice.emitterIdentityType}: ${invoice.emitterIdentityNumber}`}
                      >
                        {invoice.emitterIdentityType}:{' '}
                        {invoice.emitterIdentityNumber}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="w-[18%] px-2 py-2 align-top">
                    <div className="space-y-0.5">
                      <div
                        className="font-medium truncate text-xs"
                        title={invoice.recipientName}
                      >
                        {invoice.recipientName}
                      </div>
                      <div
                        className="text-xs text-[var(--arca-ink-3)] truncate"
                        title={`${invoice.recipientIdentityType}: ${invoice.recipientIdentityNumber}`}
                      >
                        {invoice.recipientIdentityType}:{' '}
                        {invoice.recipientIdentityNumber}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="w-[9%] px-2 py-2 align-middle whitespace-nowrap">
                    {formatDate(invoice.emitionDate)}
                  </TableCell>
                  <TableCell className="w-[15%] px-2 py-2 align-middle whitespace-nowrap font-medium">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </TableCell>
                  <TableCell className="w-[15%] px-2 py-2 align-middle whitespace-nowrap">
                    {getDirectionBadge(invoice.direction.toLowerCase())}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center w-full min-w-0">
            <Pagination>
              <PaginationContent className="flex-wrap justify-center">
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={
                      currentPage === 1
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>

                {startPage > 1 && (
                  <>
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => setCurrentPage(1)}
                        className="cursor-pointer"
                      >
                        1
                      </PaginationLink>
                    </PaginationItem>
                    {startPage > 2 && (
                      <PaginationItem>
                        <span className="px-2">...</span>
                      </PaginationItem>
                    )}
                  </>
                )}

                {visiblePages.map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                {endPage < totalPages && (
                  <>
                    {endPage < totalPages - 1 && (
                      <PaginationItem>
                        <span className="px-2">...</span>
                      </PaginationItem>
                    )}
                    <PaginationItem>
                      <PaginationLink
                        onClick={() => setCurrentPage(totalPages)}
                        className="cursor-pointer"
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  </>
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {/* View Invoice Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">
                Detalles de la Factura
              </DialogTitle>
            </DialogHeader>

            {selectedInvoice && (
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="min-w-0 overflow-hidden">
                    <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                      Tipo
                    </label>
                    <div className="mt-1 w-full overflow-hidden">
                      {getTypeBadge(selectedInvoice.type)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                      Dirección
                    </label>
                    <div className="mt-1">
                      {getDirectionBadge(
                        selectedInvoice.direction.toLowerCase()
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                      Fecha de Emisión
                    </label>
                    <p className="text-sm font-medium">
                      {formatDate(selectedInvoice.emitionDate)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                      Monto Total
                    </label>
                    <p className="text-lg font-bold break-words">
                      {formatCurrency(
                        selectedInvoice.amount,
                        selectedInvoice.currency
                      )}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                      Provincia (Convenio Multilateral)
                    </label>
                    <p className="text-sm font-medium">
                      {console.log(invoiceDetails)}
                      {invoiceDetails?.receiptProvince
                        ? invoiceDetails.receiptProvince
                        : 'sin datos'}
                    </p>
                  </div>
                </div>

                {/* Emitter Info */}
                <div className="p-4 border rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">
                    Información del Emisor
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                        Nombre
                      </label>
                      <p className="text-sm font-medium">
                        {selectedInvoice.emitterName}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                        Identificación
                      </label>
                      <p className="text-sm font-medium">
                        {selectedInvoice.emitterIdentityType}:{' '}
                        {selectedInvoice.emitterIdentityNumber}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recipient Info */}
                <div className="p-4 border rounded-lg">
                  <h3 className="text-lg font-semibold mb-4">
                    Información del Destinatario
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                        Nombre
                      </label>
                      <p className="text-sm font-medium">
                        {selectedInvoice.recipientName}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                        Identificación
                      </label>
                      <p className="text-sm font-medium">
                        {selectedInvoice.recipientIdentityType}:{' '}
                        {selectedInvoice.recipientIdentityNumber}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Client Info */}
                {(selectedInvoice.clientName ||
                  selectedInvoice.profileName) && (
                  <div className="p-4 border rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">
                      Cliente / Perfil
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedInvoice.clientName && (
                        <div>
                          <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                            Cliente
                          </label>
                          <p className="text-sm font-medium">
                            {selectedInvoice.clientName}
                          </p>
                        </div>
                      )}
                      {selectedInvoice.profileName && (
                        <div>
                          <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                            Perfil
                          </label>
                          <p className="text-sm font-medium">
                            {selectedInvoice.profileName}
                          </p>
                        </div>
                      )}
                      {selectedInvoice.clientEmail && (
                        <div>
                          <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                            Email
                          </label>
                          <p className="text-sm font-medium">
                            {selectedInvoice.clientEmail}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Invoice Details */}
                {invoiceDetails && (
                  <div className="p-4 border rounded-lg">
                    <h3 className="text-lg font-semibold mb-4">
                      Detalles de la Factura
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                          Número de Autorización
                        </label>
                        <p className="text-sm font-medium">
                          {invoiceDetails.authorizationNumber}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                          Punto de Venta
                        </label>
                        <p className="text-sm font-medium">
                          {invoiceDetails.salePoint}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                          Rango de IDs
                        </label>
                        <p className="text-sm font-medium">
                          {invoiceDetails.idFrom} - {invoiceDetails.idTo}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-[var(--arca-ink-3)] mb-1 block">
                          Moneda
                        </label>
                        <p className="text-sm font-medium">
                          {invoiceDetails.currency} (Tasa:{' '}
                          {invoiceDetails.currencyRate})
                        </p>
                      </div>
                    </div>

                    {/* Tax Breakdown */}
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="text-md font-semibold mb-3">
                        Desglose de Impuestos
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 0%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA0,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            IVA 2.5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.IVA25,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 2.5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA25,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            IVA 5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.IVA5,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA5,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            IVA 10.5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.IVA105,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 10.5%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA105,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            IVA 21%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.IVA21,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 21%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA21,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            IVA 27%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.IVA27,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto IVA 27%:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountIVA27,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b font-semibold">
                          <span>Total IVA:</span>
                          <span>
                            {formatCurrency(
                              invoiceDetails.totalIVA,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto Gravado:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountTaxed,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto No Gravado:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountNoTaxed,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-2">
                          <span className="text-[var(--arca-ink-3)]">
                            Monto Exento:
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              invoiceDetails.amountExempt,
                              invoiceDetails.currency
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attachments */}
                {invoiceDetails?.attachments &&
                  invoiceDetails.attachments.length > 0 && (
                    <div className="p-4 border rounded-lg">
                      <h3 className="text-lg font-semibold mb-4">
                        Archivos Adjuntos
                      </h3>
                      <div className="space-y-2">
                        {invoiceDetails.attachments.map((attachment: any) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 border rounded-md"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-[var(--arca-ink-3)]" />
                              <div>
                                <p className="text-sm font-medium">
                                  {attachment.documentName}
                                </p>
                                <p className="text-xs text-[var(--arca-ink-3)]">
                                  {attachment.documentType}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleDownloadAttachment(
                                  attachment.documentUrl,
                                  attachment.documentName
                                )
                              }
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Descargar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

export const InvoicesTable = InvoicesTableComponent;
