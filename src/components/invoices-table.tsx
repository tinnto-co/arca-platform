import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Download,
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
import { getComprobantes, getComprobante } from '@/actions/comprobante';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import { Paginador } from '@/components/shared/paginador';
import { descargarComprobantePdf } from '@/components/comprobante-pdf';
import { cn } from '@/lib/utils';

/** Fila de la grilla, tal cual la devuelve `getComprobantes`. */
type ComprobanteRow = Awaited<
  ReturnType<typeof getComprobantes>
>['comprobantes'][number];
/** Detalle completo (incluye el desglose por alícuota). */
type ComprobanteDetalle = Awaited<ReturnType<typeof getComprobante>>;

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
/** `comprobante.direccion` es un enum de BD: sólo estos dos valores existen. */
const DIRECTION_LABELS: Record<ComprobanteRow['direccion'], string> = {
  emitido: 'Emitida',
  recibido: 'Recibida',
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? `Tipo ${type}`;
}
function getDirectionLabel(direction: ComprobanteRow['direccion']): string {
  return DIRECTION_LABELS[direction] ?? direction;
}

/** Número de comprobante formateado 0001-00000123. */
function formatNumero(puntoVenta: number, numero: number): string {
  return `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`;
}

interface InvoicesTableProps {
  /** Cliente (entidad fiscal) al que se acotan los comprobantes. */
  clienteId?: string;
  /** @deprecated Alias histórico de `clienteId` (antes era el id del perfil). */
  profileId?: string;
  /**
   * @deprecated Antes era el id del representante (login AFIP). Los comprobantes
   * ya no se filtran por login: sólo marca que la tabla está embebida en el
   * detalle de un cliente (oculta el selector y notifica filtros al padre).
   */
  clientId?: string;
  /** Cuando se pasan, el período lo controla el padre (ej. pestaña Facturas del detalle de cliente). */
  controlledDateFrom?: string;
  controlledDateTo?: string;
  /**
   * Filtros controlados por el padre (módulo Facturas): se ocultan los selects
   * de cliente/tipo/dirección en la tabla. `controlledProfileFilter` es el id
   * del cliente ('all' = sin filtro); `controlledDirectionFilter` es
   * 'emitido' | 'recibido' | 'all'.
   */
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
  /** Si se pasa, abre automáticamente el detalle de esa factura (deep-link). */
  openInvoiceId?: string;
}

export interface InvoicesTableRef {
  exportExcel: () => Promise<void>;
}

const InvoicesTableComponent = forwardRef<InvoicesTableRef, InvoicesTableProps>(
  function InvoicesTable(
    {
      clienteId: clienteIdProp,
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
      openInvoiceId,
    }: InvoicesTableProps = {},
    ref
  ) {
    /** Cliente fijado por el padre (prop nueva o cualquiera de sus alias). */
    const fixedClienteId = clienteIdProp ?? profileId;
    /** La tabla está embebida en el detalle de un cliente. */
    const isEmbedded = fixedClienteId !== undefined || clientId !== undefined;

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    // En la página de Facturas el filtro de cliente es el selector global de
    // empresa del header (patrón de Contabilidad/Sueldos/IVA); embebida en la
    // ficha de un cliente, el cliente ya viene fijo por prop.
    const [clienteGlobal] = useClienteSeleccionado();
    const clientFilter = isEmbedded ? 'all' : (clienteGlobal ?? 'all');
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
    const [sortBy, setSortBy] = useState<'total' | 'fechaEmision' | undefined>(
      'fechaEmision'
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
    const [invoiceDetails, setInvoiceDetails] =
      useState<ComprobanteDetalle | null>(null);
    const [exportingExcel, setExportingExcel] = useState(false);

    const pageSize = 10;

    useEffect(() => {
      setCurrentPage(1);
    }, [fixedClienteId]);

    useEffect(() => {
      setCurrentPage(1);
    }, [clientFilter]);

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
      if (isEmbedded && onFiltersChange) {
        onFiltersChange({ profileFilter, typeFilter, directionFilter });
      }
    }, [
      isEmbedded,
      onFiltersChange,
      profileFilter,
      typeFilter,
      directionFilter,
    ]);

    const effectiveSearchTerm =
      controlledSearchTerm !== undefined
        ? controlledSearchTerm
        : debouncedSearchTerm;

    /**
     * Cliente por el que se filtra: prop del padre > filtro controlado >
     * selector propio. Los comprobantes cuelgan del cliente, así que sin
     * cliente resuelto en modo embebido no se consulta nada (mostrar los
     * comprobantes de toda la organización sería incorrecto).
     */
    const clienteFiltro =
      fixedClienteId ??
      (profileFilter !== 'all' ? profileFilter : undefined) ??
      (clientFilter !== 'all' ? clientFilter : undefined);

    /** Sólo los dos valores del enum de BD llegan al server function. */
    const direccionFiltro =
      directionFilter === 'emitido' || directionFilter === 'recibido'
        ? directionFilter
        : undefined;
    const tipoFiltro =
      typeFilter !== 'all' && Number.isFinite(Number(typeFilter))
        ? Number(typeFilter)
        : undefined;

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
      queryKey: [
        'comprobantes',
        currentPage,
        clienteFiltro ?? 'all',
        dateFrom,
        dateTo,
        tipoFiltro ?? 'all',
        direccionFiltro ?? 'all',
        effectiveSearchTerm,
        sortBy,
        sortOrder,
      ],
      queryFn: () =>
        getComprobantes({
          data: {
            page: currentPage,
            limit: pageSize,
            clienteId: clienteFiltro,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            tipo: tipoFiltro,
            direccion: direccionFiltro,
            search: effectiveSearchTerm || undefined,
            sortBy: sortBy,
            sortOrder: sortBy ? sortOrder : undefined,
          },
        }),
      enabled: !isEmbedded || !!clienteFiltro,
    });

    const handleViewInvoice = async (invoice: ComprobanteRow) => {
      setInvoiceDetails(null);
      setViewDialogOpen(true);
      try {
        const details = await getComprobante({ data: { id: invoice.id } });
        setInvoiceDetails(details);
      } catch (error) {
        toast.error('Error al cargar los detalles del comprobante');
        console.error(error);
      }
    };

    // Deep-link: si viene openInvoiceId, abrir el detalle de ese comprobante al montar.
    useEffect(() => {
      if (!openInvoiceId) return;
      let cancelled = false;
      void (async () => {
        try {
          const details = await getComprobante({ data: { id: openInvoiceId } });
          if (cancelled || !details) return;
          setInvoiceDetails(details);
          setViewDialogOpen(true);
        } catch {
          toast.error('No se pudo abrir el comprobante');
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [openInvoiceId]);

    const handleExportExcel = async () => {
      setExportingExcel(true);
      try {
        const exportLimit = 50000;
        const data = await getComprobantes({
          data: {
            page: 1,
            limit: exportLimit,
            clienteId: clienteFiltro,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            tipo: tipoFiltro,
            direccion: direccionFiltro,
            search: effectiveSearchTerm || undefined,
            sortBy: sortBy ?? undefined,
            sortOrder: sortBy ? (sortOrder ?? undefined) : undefined,
          },
        });
        // La selección manda cuando hay algo tildado; si no, va todo lo que
        // los filtros dejan a la vista. Se filtra sobre el traído completo y
        // no sobre la página actual, para no perder lo tildado en otras.
        const todas = data.comprobantes ?? [];
        const invoices =
          selectedIds.size > 0
            ? todas.filter((c) => selectedIds.has(c.id))
            : todas;
        if (invoices.length === 0) {
          toast.info(
            selectedIds.size > 0
              ? 'Las facturas seleccionadas no entran en los filtros actuales.'
              : 'No hay facturas para exportar con los filtros actuales.'
          );
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
          'Número',
          'Cliente',
          'Contraparte',
          'Doc. contraparte',
          'Provincia contraparte',
          'Neto gravado',
          'IVA',
          'Moneda',
          'Cotización',
          'Total',
          'CAE',
        ];
        const widths = [
          28, 12, 12, 12, 10, 14, 22, 28, 18, 20, 16, 16, 8, 12, 16, 18,
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
            inv.tipoDescripcion ?? getTypeLabel(String(inv.tipo)),
            String(inv.tipo),
            getDirectionLabel(inv.direccion),
            formatDateOnlyString(inv.fechaEmision),
            inv.puntoVenta,
            formatNumero(inv.puntoVenta, inv.numero),
            inv.clienteRazonSocial ?? '—',
            inv.contraparteNombre ?? '—',
            `${inv.contraparteDocTipo} ${inv.contraparteDocNro}`.trim(),
            inv.contraparteProvincia ?? '—',
            formatCurrency(inv.netoGravado, inv.moneda),
            formatCurrency(inv.ivaTotal, inv.moneda),
            inv.moneda ?? '—',
            inv.cotizacion ?? '—',
            formatCurrency(inv.total, inv.moneda),
            inv.cae ?? '—',
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
        a.download = `comprobantes_${sanitizeFilename(clienteFiltro ?? 'todos')}_${dateStr}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exportados ${invoices.length} comprobante(s).`);
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
      if (sortBy === 'fechaEmision') {
        setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
      } else {
        setSortBy('fechaEmision');
        setSortOrder('desc');
      }
    };

    const handleSortByAmount = () => {
      if (sortBy === 'total') {
        if (sortOrder === 'desc') {
          setSortOrder('asc');
        } else if (sortOrder === 'asc') {
          setSortBy(undefined);
          setSortOrder(undefined);
        }
      } else {
        setSortBy('total');
        setSortOrder('desc');
      }
    };

    const getDirectionBadge = (direccion: ComprobanteRow['direccion']) => (
      <Badge variant="secondary">{getDirectionLabel(direccion)}</Badge>
    );

    const totalPages = invoicesData?.totalPages || 1;

    return (
      <div className="w-full min-w-0 flex flex-col h-full gap-4">
        {/* Filters */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between flex-shrink-0">
          <div className="flex flex-col gap-2 md:flex-row md:items-center flex-wrap">
            {!isFiltersControlled && isEmbedded && (
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--arca-ink-3)]" />
                <Input
                  placeholder="Buscar por contraparte (nombre o CUIT)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full md:w-80"
                />
              </div>
            )}

            {!isFiltersControlled && (
              <SearchableSelect
                value={typeFilter}
                onValueChange={setTypeFilter}
                placeholder="Tipo"
                searchPlaceholder="Buscar tipo..."
                options={[
                  { value: 'all', label: 'Todas las facturas' },
                  ...Object.entries(INVOICE_TYPE_LABELS).map(
                    ([code, label]) => ({
                      value: code,
                      label,
                    })
                  ),
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
                  { value: 'emitido', label: 'Emitida' },
                  { value: 'recibido', label: 'Recibida' },
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
                <span>
                  {selectedIds.size > 0
                    ? `Excel · ${selectedIds.size} seleccionada${selectedIds.size === 1 ? '' : 's'}`
                    : 'Excel'}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Que haya algo tildado tiene que ser visible aunque la fila quedó
            fuera de la página: si no, el botón exporta "3 seleccionadas" y no
            se ve cuáles. */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] px-3 py-2 text-[12.5px]">
            <span className="text-[var(--arca-ink-2)]">
              {selectedIds.size} factura{selectedIds.size === 1 ? '' : 's'}{' '}
              seleccionada{selectedIds.size === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="font-medium text-[var(--arca-navy-700)] hover:underline"
            >
              Limpiar selección
            </button>
          </div>
        )}

        {/* Table */}
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 px-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-navy-900)]"
                  checked={
                    (invoicesData?.comprobantes ?? []).length > 0 &&
                    (invoicesData?.comprobantes ?? []).every((inv) =>
                      selectedIds.has(inv.id)
                    )
                  }
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        (invoicesData?.comprobantes ?? []).some((inv) =>
                          selectedIds.has(inv.id)
                        ) &&
                        !(invoicesData?.comprobantes ?? []).every((inv) =>
                          selectedIds.has(inv.id)
                        );
                  }}
                  onChange={() =>
                    toggleAllInvoices(
                      (invoicesData?.comprobantes ?? []).map((inv) => inv.id)
                    )
                  }
                />
              </TableHead>
              <TableHead className="w-[10%] px-2 py-2 align-top">
                Tipo
              </TableHead>
              <TableHead className="w-[16%] px-2 py-2 align-top">
                Cliente
              </TableHead>
              <TableHead className="w-[20%] px-2 py-2 align-top">
                Contraparte
              </TableHead>
              <TableHead className="w-[12%] px-2 py-2 align-top">
                Comprobante
              </TableHead>
              <TableHead className="w-[9%] px-2 py-2 align-middle">
                <button
                  className="flex items-center gap-1 group text-white text-[11px] font-semibold"
                  onClick={handleSortByDate}
                >
                  Fecha
                  {sortBy === 'fechaEmision' && sortOrder === 'asc' ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : sortBy === 'fechaEmision' && sortOrder === 'desc' ? (
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
                  {sortBy === 'total' && sortOrder === 'asc' ? (
                    <ArrowUp className="ml-1 h-3 w-3" />
                  ) : sortBy === 'total' && sortOrder === 'desc' ? (
                    <ArrowDown className="ml-1 h-3 w-3" />
                  ) : (
                    <ArrowUpDown className="ml-1 h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[12%] px-2 py-2 align-middle">
                Dirección
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Cargando comprobantes...
                </TableCell>
              </TableRow>
            ) : (invoicesData?.comprobantes.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No se encontraron comprobantes.
                </TableCell>
              </TableRow>
            ) : (
              invoicesData?.comprobantes.map((invoice) => (
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
                    <div className="truncate">
                      {getTypeBadge(String(invoice.tipo))}
                    </div>
                  </TableCell>
                  <TableCell className="w-[16%] px-2 py-2 align-top">
                    {invoice.clienteRazonSocial ? (
                      <div
                        className="font-medium truncate text-xs"
                        title={invoice.clienteRazonSocial}
                      >
                        {invoice.clienteRazonSocial}
                      </div>
                    ) : (
                      <span className="text-[var(--arca-ink-3)] text-xs">
                        Sin cliente
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="w-[20%] px-2 py-2 align-top">
                    <div className="space-y-0.5">
                      <div
                        className="font-medium truncate text-xs"
                        title={invoice.contraparteNombre ?? ''}
                      >
                        {invoice.contraparteNombre ?? 'Sin identificar'}
                      </div>
                      <div
                        className="text-xs text-[var(--arca-ink-3)] truncate"
                        title={`${invoice.contraparteDocTipo}: ${invoice.contraparteDocNro}`}
                      >
                        {invoice.contraparteDocTipo}:{' '}
                        {invoice.contraparteDocNro}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="w-[12%] px-2 py-2 align-top whitespace-nowrap tabular-nums">
                    {formatNumero(invoice.puntoVenta, invoice.numero)}
                  </TableCell>
                  <TableCell className="w-[9%] px-2 py-2 align-middle whitespace-nowrap">
                    {formatDateOnlyString(invoice.fechaEmision)}
                  </TableCell>
                  <TableCell className="w-[14%] px-2 py-2 align-middle whitespace-nowrap font-medium">
                    {formatCurrency(invoice.total, invoice.moneda)}
                  </TableCell>
                  <TableCell className="w-[12%] px-2 py-2 align-middle whitespace-nowrap">
                    {getDirectionBadge(invoice.direccion)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center w-full min-w-0">
            <Paginador
              pagina={currentPage}
              totalPaginas={totalPages}
              onPagina={setCurrentPage}
            />
          </div>
        )}

        {/* View Invoice Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl">Comprobante</DialogTitle>
            </DialogHeader>

            {!invoiceDetails ? (
              <div className="flex items-center gap-2 py-8 text-sm text-[var(--arca-ink-3)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando detalles…
              </div>
            ) : (
              (() => {
                const d = invoiceDetails;
                // Emitida: la empresa factura. Recibida: la contraparte.
                const emitida = d.direccion === 'emitido';
                const emisor = emitida
                  ? d.clienteRazonSocial
                  : d.contraparteNombre;
                const receptor = emitida
                  ? d.contraparteNombre
                  : d.clienteRazonSocial;
                const numero = `${String(d.puntoVenta ?? 0).padStart(4, '0')}-${String(d.numero ?? 0).padStart(8, '0')}`;
                const monto = (v: string | null) =>
                  Number(v ?? 0).toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });

                return (
                  <div className="space-y-4">
                    {/* La disposición imita a la del comprobante: emisor a la
                        izquierda, letra al medio, tipo y número a la derecha. */}
                    <div className="relative flex rounded-[var(--arca-r-lg)] border border-[var(--arca-border-strong)] bg-white">
                      <div className="flex-1 p-5">
                        <p className="text-[15px] font-semibold text-[var(--arca-ink)]">
                          {emisor ?? 'Sin datos'}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--arca-ink-3)] [font-family:var(--ff-mono)]">
                          {emitida
                            ? ''
                            : d.contraparteDocNro
                              ? `${d.contraparteDocTipo ?? 'CUIT'} ${d.contraparteDocNro}`
                              : ''}
                        </p>
                      </div>
                      <div className="flex-1 border-l border-[var(--arca-border-strong)] p-5 text-right">
                        <p className="text-[14px] font-semibold text-[var(--arca-ink)]">
                          {d.tipoDescripcion ?? 'Comprobante'}
                        </p>
                        <p className="mt-1 text-[13px] tabular-nums text-[var(--arca-ink-2)] [font-family:var(--ff-mono)]">
                          N° {numero}
                        </p>
                        <p className="mt-1 text-[12px] text-[var(--arca-ink-3)]">
                          {d.fechaEmision
                            ? new Date(d.fechaEmision).toLocaleDateString(
                                'es-AR'
                              )
                            : '—'}
                        </p>
                      </div>
                      <div className="absolute left-1/2 top-0 -ml-[22px] flex h-[52px] w-[44px] flex-col items-center justify-center border border-[var(--arca-border-strong)] bg-white">
                        <span className="text-[22px] font-bold leading-none text-[var(--arca-ink)] [font-family:var(--ff-display)]">
                          {d.letra ?? '—'}
                        </span>
                        <span className="mt-0.5 text-[8px] uppercase tracking-wider text-[var(--arca-ink-4)]">
                          {d.direccion ?? ''}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      {[
                        ['Receptor', receptor ?? 'Sin datos'],
                        ['Provincia', d.contraparteProvincia ?? 'Sin datos'],
                        ['CAE', d.cae ?? 'Sin datos'],
                      ].map(([label, valor]) => (
                        <div
                          key={label}
                          className="rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2"
                        >
                          <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
                            {label}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-[var(--arca-ink)]">
                            {valor}
                          </p>
                        </div>
                      ))}
                    </div>

                    {d.alicuotas.length > 0 && (
                      <div className="overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)]">
                        <table className="w-full text-[12.5px]">
                          <thead className="bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)]">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">
                                Alícuota IVA
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">
                                Neto
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">
                                IVA
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.alicuotas.map((a, i) => (
                              <tr
                                key={i}
                                className="border-t border-[var(--arca-border)]"
                              >
                                <td className="px-3 py-2 tabular-nums">
                                  {a.alicuota ? `${a.alicuota}%` : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {monto(a.neto)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                  {monto(a.iva)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex flex-col items-end gap-1 rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3">
                      {(
                        [
                          ['Neto gravado', d.netoGravado],
                          ['Neto no gravado', d.netoNoGravado],
                          ['Exento', d.exento],
                          ['Otros tributos', d.otrosTributos],
                          ['IVA', d.ivaTotal],
                        ] as [string, string | null][]
                      )
                        .filter(([, v]) => Number(v ?? 0) !== 0)
                        .map(([label, v]) => (
                          <div
                            key={label}
                            className="flex w-full max-w-[280px] justify-between text-[12.5px] text-[var(--arca-ink-2)]"
                          >
                            <span>{label}</span>
                            <span className="tabular-nums">{monto(v)}</span>
                          </div>
                        ))}
                      <div className="mt-1 flex w-full max-w-[280px] justify-between border-t border-[var(--arca-border-strong)] pt-2">
                        <span className="text-[14px] font-semibold text-[var(--arca-ink)]">
                          Total
                        </span>
                        <span className="text-[15px] font-bold tabular-nums text-[var(--arca-ink)] [font-family:var(--ff-display)]">
                          {monto(d.total)} {d.moneda ?? 'ARS'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-[var(--arca-border)] pt-3">
                      <p className="text-[11.5px] text-[var(--arca-ink-4)]">
                        ARCA entrega los datos del comprobante, no el archivo.
                        El PDF es una representación armada con esos datos.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5"
                        onClick={() => {
                          void descargarComprobantePdf({
                            ...d,
                            clienteCuit: null,
                          }).catch(() =>
                            toast.error('No se pudo generar el PDF')
                          );
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Descargar PDF
                      </Button>
                    </div>
                  </div>
                );
              })()
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

export const InvoicesTable = InvoicesTableComponent;
