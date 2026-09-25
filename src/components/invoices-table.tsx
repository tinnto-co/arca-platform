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
import { format, parseISO } from 'date-fns';
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
import { LimpiarFiltros } from '@/components/shared/filtros';
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
  getComprobantes,
  getComprobante,
  getResumenComprobantes,
} from '@/actions/comprobante';
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

/**
 * Los filtros de la página de Facturas, tal como van en la URL. Todos son
 * opcionales: sin valor, no filtra (y el orden es por fecha, más nueva primero).
 */
export interface FiltrosFacturas {
  /** Código AFIP del tipo de comprobante. */
  tipo?: string;
  direccion?: 'emitido' | 'recibido';
  /** 'YYYY-MM-DD' */
  desde?: string;
  /** 'YYYY-MM-DD' */
  hasta?: string;
  /** Contraparte, por nombre o CUIT. */
  q?: string;
  pagina?: number;
  orden?: 'fecha_asc' | 'monto_desc' | 'monto_asc' | 'sin_orden';
}

/** Formatea YYYY-MM-DD a dd/MM/yyyy sin pasar por UTC (evita desfase de día en otras zonas horarias). */
function formatDateOnlyString(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return d && m && y ? `${d}/${m}/${y}` : isoDate;
}

function formatCurrency(amount: string, currency: string) {
  const numAmount = parseFloat(amount);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency || 'ARS',
  }).format(numAmount);
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
  /**
   * Página de Facturas: los filtros viven en la URL (al recargar no se
   * pierden y el link se puede compartir). La tabla los lee de `valor` y
   * pide cada cambio con `onChange`. Sin esto, los guarda ella misma.
   */
  filtrosUrl?: {
    valor: FiltrosFacturas;
    onChange: (cambio: Partial<FiltrosFacturas>) => void;
  };
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
      filtrosUrl,
    }: InvoicesTableProps = {},
    ref
  ) {
    /** Cliente fijado por el padre (prop nueva o cualquiera de sus alias). */
    const fixedClienteId = clienteIdProp ?? profileId;
    /** La tabla está embebida en el detalle de un cliente. */
    const isEmbedded = fixedClienteId !== undefined || clientId !== undefined;

    const url = filtrosUrl?.valor;
    /** Pide un cambio de filtros a la URL; cualquiera vuelve a la página 1. */
    const cambiarUrl = (cambio: Partial<FiltrosFacturas>) =>
      filtrosUrl?.onChange({ pagina: undefined, ...cambio });

    const [searchTerm, setSearchTerm] = useState(url?.q ?? '');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(
      url?.q ?? ''
    );
    // En la página de Facturas el filtro de cliente es el selector global de
    // empresa del header (patrón de Contabilidad/Sueldos/IVA); embebida en la
    // ficha de un cliente, el cliente ya viene fijo por prop.
    const [clienteGlobal] = useClienteSeleccionado();
    const clientFilter = isEmbedded ? 'all' : (clienteGlobal ?? 'all');
    const [profileFilter, setProfileFilter] = useState<string>('all');
    const [calendarioAbierto, setCalendarioAbierto] = useState(false);
    /** Inicio del rango elegido en el calendario, mientras falta el fin. */
    const [primerDia, setPrimerDia] = useState<Date | undefined>();
    const [dateRangeLocal, setDateRangeLocal] = useState<DateRange | undefined>(
      undefined
    );
    const dateRange: DateRange | undefined = url
      ? url.desde
        ? {
            from: parseISO(url.desde),
            to: url.hasta ? parseISO(url.hasta) : undefined,
          }
        : undefined
      : dateRangeLocal;
    const setDateRange = (r: DateRange | undefined) => {
      if (!url) {
        setDateRangeLocal(r);
        setCurrentPage(1);
        return;
      }
      cambiarUrl({
        desde: r?.from ? format(r.from, 'yyyy-MM-dd') : undefined,
        hasta: r?.to ? format(r.to, 'yyyy-MM-dd') : undefined,
      });
    };
    /** Padre controla fechas cuando hay valores definidos; si estamos en modo filtros controlados, undefined/undefined = Sin período = sin filtro de fecha. */
    const isDateControlled =
      controlledDateFrom !== undefined && controlledDateTo !== undefined;
    const isFiltersControlled =
      controlledProfileFilter !== undefined &&
      controlledTypeFilter !== undefined &&
      controlledDirectionFilter !== undefined;
    const [typeFilterLocal, setTypeFilterLocal] = useState<string>('all');
    const typeFilter = url ? (url.tipo ?? 'all') : typeFilterLocal;
    const setTypeFilter = (v: string) => {
      if (url) cambiarUrl({ tipo: v === 'all' ? undefined : v });
      else {
        setTypeFilterLocal(v);
        setCurrentPage(1);
      }
    };
    const [directionFilterLocal, setDirectionFilterLocal] =
      useState<string>('all');
    const directionFilter = url
      ? (url.direccion ?? 'all')
      : directionFilterLocal;
    const setDirectionFilter = (v: string) => {
      if (url)
        cambiarUrl({
          direccion: v === 'emitido' || v === 'recibido' ? v : undefined,
        });
      else {
        setDirectionFilterLocal(v);
        setCurrentPage(1);
      }
    };
    const [sortByLocal, setSortByLocal] = useState<
      'total' | 'fechaEmision' | undefined
    >('fechaEmision');
    const [sortOrderLocal, setSortOrderLocal] = useState<
      'asc' | 'desc' | undefined
    >('desc');
    const sortBy: 'total' | 'fechaEmision' | undefined = url
      ? url.orden === 'sin_orden'
        ? undefined
        : url.orden?.startsWith('monto')
          ? 'total'
          : 'fechaEmision'
      : sortByLocal;
    const sortOrder: 'asc' | 'desc' | undefined = url
      ? url.orden === 'sin_orden'
        ? undefined
        : url.orden?.endsWith('asc')
          ? 'asc'
          : 'desc'
      : sortOrderLocal;
    const setOrden = (
      by: 'total' | 'fechaEmision' | undefined,
      order: 'asc' | 'desc' | undefined
    ) => {
      if (!url) {
        setSortByLocal(by);
        setSortOrderLocal(order);
        return;
      }
      const orden = !by
        ? 'sin_orden'
        : by === 'total'
          ? order === 'asc'
            ? 'monto_asc'
            : 'monto_desc'
          : order === 'asc'
            ? 'fecha_asc'
            : undefined;
      cambiarUrl({ orden });
    };
    const [currentPageLocal, setCurrentPageLocal] = useState(1);
    const currentPage = url ? (url.pagina ?? 1) : currentPageLocal;
    function setCurrentPage(p: number) {
      if (url) filtrosUrl?.onChange({ pagina: p > 1 ? p : undefined });
      else setCurrentPageLocal(p);
    }
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    /**
     * El tilde del encabezado manda sobre la página que se está viendo, y sólo
     * sobre ella: suma o quita esos ids conservando lo tildado en las otras.
     *
     * Antes reemplazaba el conjunto entero, así que tildar todo en la página 2
     * borraba la selección de la página 1 —y destildar ahí borraba todo—. La
     * exportación siempre supo cruzar ids de varias páginas; lo que no dejaba
     * era juntarlos.
     */
    const toggleAllInvoices = (ids: string[]) => {
      const yaEstabanTodas =
        ids.length > 0 && ids.every((id) => selectedIds.has(id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) {
          if (yaEstabanTodas) next.delete(id);
          else next.add(id);
        }
        return next;
      });
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

    // Con los filtros en la URL, el cambio de empresa ya vuelve a la página
    // 1 desde la ruta; acá solo la página local.
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
      setCurrentPageLocal(1);
    }, [fixedClienteId]);

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
      setCurrentPageLocal(1);
    }, [clientFilter]);

    useEffect(() => {
      const timer = setTimeout(() => {
        setDebouncedSearchTerm(searchTerm);
        if (searchTerm !== debouncedSearchTerm) {
          if (url) cambiarUrl({ q: searchTerm || undefined });
          else setCurrentPageLocal(1);
        }
      }, 500);
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, debouncedSearchTerm]);

    // La búsqueda de la URL cambió desde afuera (atrás del navegador, un
    // link): el campo la sigue.
    useEffect(() => {
      if (!url) return;
      const q = url.q ?? '';
      if (q !== debouncedSearchTerm) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
        setSearchTerm(q);
        setDebouncedSearchTerm(q);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [url?.q]);

    // Sincronizar rango de fechas cuando el padre controla el período (p. ej. pestaña Facturas). Sin período = undefined/undefined → limpiamos.
    useEffect(() => {
      if (controlledDateFrom && controlledDateTo) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
        setDateRangeLocal({
          from: new Date(controlledDateFrom),
          to: new Date(controlledDateTo),
        });
      } else if (
        isFiltersControlled &&
        controlledDateFrom === undefined &&
        controlledDateTo === undefined
      ) {
        setDateRangeLocal(undefined);
      }
    }, [controlledDateFrom, controlledDateTo, isFiltersControlled]);

    // Sincronizar filtros cuando el padre los controla (módulo Facturas: filtros arriba de las cards)
    useEffect(() => {
      if (isFiltersControlled && controlledProfileFilter !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
        setProfileFilter(controlledProfileFilter);
      }
    }, [isFiltersControlled, controlledProfileFilter]);
    useEffect(() => {
      if (isFiltersControlled && controlledTypeFilter !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
        setTypeFilterLocal(controlledTypeFilter);
      }
    }, [isFiltersControlled, controlledTypeFilter]);
    useEffect(() => {
      if (isFiltersControlled && controlledDirectionFilter !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
        setDirectionFilterLocal(controlledDirectionFilter);
      }
    }, [isFiltersControlled, controlledDirectionFilter]);

    useEffect(() => {
      if (controlledSearchTerm !== undefined) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con la URL o con el padre
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

    const effectiveSearchTerm = controlledSearchTerm ?? debouncedSearchTerm;

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
    const direccionFiltro: 'emitido' | 'recibido' | undefined =
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

    /** Filtros de la consulta, sin página ni orden: los usa el resumen. */
    const filtrosConsulta = {
      clienteId: clienteFiltro,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      tipo: tipoFiltro,
      direccion: direccionFiltro,
      search: effectiveSearchTerm || undefined,
    };
    // Solo en la página de Facturas: embebida en la ficha del cliente, el
    // padre ya muestra sus totales de ventas y compras.
    const { data: resumen } = useQuery({
      queryKey: ['comprobantes-resumen', filtrosConsulta],
      queryFn: () => getResumenComprobantes({ data: filtrosConsulta }),
      enabled: !isEmbedded,
      placeholderData: (previo) => previo,
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
          // Se queda con el `inline-flex items-center justify-center` de la
          // variante base: con `inline-block` el texto se apoyaba arriba de la
          // caja de `h-6` y dejaba el aire abajo. Lo que sí hay que soltar es
          // esa altura fija, porque "Ticket Factura A" necesita dos líneas y
          // la base recorta con `overflow-hidden`.
          className="!h-auto !whitespace-normal break-words text-[10px] px-1.5 py-1 max-w-full leading-tight text-center"
        >
          {typeInfo.label}
        </Badge>
      );
    };

    const handleSortByDate = () => {
      if (sortBy === 'fechaEmision') {
        setOrden('fechaEmision', sortOrder === 'desc' ? 'asc' : 'desc');
      } else {
        setOrden('fechaEmision', 'desc');
      }
    };

    const handleSortByAmount = () => {
      if (sortBy === 'total') {
        if (sortOrder === 'desc') {
          setOrden('total', 'asc');
        } else if (sortOrder === 'asc') {
          setOrden(undefined, undefined);
        }
      } else {
        setOrden('total', 'desc');
      }
    };

    const getDirectionBadge = (direccion: ComprobanteRow['direccion']) => (
      <Badge variant="secondary">{getDirectionLabel(direccion)}</Badge>
    );

    const totalPages = invoicesData?.totalPages || 1;

    /** Cuántos filtros propios están puestos: si hay alguno, se puede limpiar. */
    const filtrosPuestos =
      (searchTerm ? 1 : 0) +
      (typeFilter !== 'all' ? 1 : 0) +
      (directionFilter !== 'all' ? 1 : 0) +
      (dateRange?.from ? 1 : 0);

    return (
      <div className="flex h-full w-full min-w-0 flex-col gap-[10px]">
        {/* Los filtros van afuera de la card, como en la ficha del cliente:
          una fila de controles, y debajo la tabla con su paginado. */}
        {(!isFiltersControlled || toolbarExtra) && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {!isFiltersControlled && (isEmbedded || url) && (
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--arca-ink-3)]" />
                  <Input
                    placeholder="Buscar por contraparte (nombre o CUIT)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 w-full pl-8 text-[12.5px] md:w-64"
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
                  width={160}
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
                  width={150}
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
                  <Popover
                    open={calendarioAbierto}
                    onOpenChange={(abierto) => {
                      setCalendarioAbierto(abierto);
                      setPrimerDia(undefined);
                    }}
                  >
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
                              {format(dateRange.to, 'dd/MM/yyyy', {
                                locale: es,
                              })}
                            </>
                          ) : (
                            format(dateRange.from, 'dd/MM/yyyy', {
                              locale: es,
                            })
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
                        selected={
                          primerDia
                            ? { from: primerDia, to: undefined }
                            : dateRange
                        }
                        onSelect={(_, dia) => {
                          // El primer clic marca el inicio y no filtra; el
                          // segundo cierra el rango (en cualquier orden) y
                          // recién ahí se aplica. Antes, el primer clic ya
                          // filtraba por ese solo día y la tabla quedaba
                          // vacía a mitad de la elección.
                          if (!primerDia) {
                            setPrimerDia(dia);
                            return;
                          }
                          const [from, to] =
                            primerDia <= dia
                              ? [primerDia, dia]
                              : [dia, primerDia];
                          setDateRange({ from, to });
                          setPrimerDia(undefined);
                          setCalendarioAbierto(false);
                        }}
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
              {!isFiltersControlled && filtrosPuestos > 0 && (
                <LimpiarFiltros
                  onLimpiar={() => {
                    setSearchTerm('');
                    setDebouncedSearchTerm('');
                    if (url) {
                      cambiarUrl({
                        tipo: undefined,
                        direccion: undefined,
                        desde: undefined,
                        hasta: undefined,
                        q: undefined,
                      });
                      return;
                    }
                    setTypeFilter('all');
                    setDirectionFilter('all');
                    setDateRange(undefined);
                  }}
                />
              )}
            </div>
          </div>
        )}

        {!isEmbedded && resumen && (
          <ResumenFacturas
            resumen={resumen}
            direccion={direccionFiltro}
            cargando={isLoading}
          />
        )}

        <div className="overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] shadow-[var(--arca-shadow-card)]">
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
                className="font-medium text-[var(--arca-accent)] hover:underline"
              >
                Limpiar selección
              </button>
            </div>
          )}

          {/* Table. El contenedor propio del `Table` sobra: la card ya es el
            marco, y dejarlo suma un segundo borde. */}
          <div className="[&_[data-slot=table-container]]:rounded-none [&_[data-slot=table-container]]:border-0">
            <Table className="table-fixed text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-accent)]"
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
                          (invoicesData?.comprobantes ?? []).map(
                            (inv) => inv.id
                          )
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-[10%] px-2 align-middle">
                    Tipo
                  </TableHead>
                  <TableHead className="w-[16%] px-2 align-middle">
                    Cliente
                  </TableHead>
                  <TableHead className="w-[20%] px-2 align-middle">
                    Contraparte
                  </TableHead>
                  <TableHead className="w-[12%] px-2 align-middle">
                    Comprobante
                  </TableHead>
                  <TableHead className="w-[9%] px-2 align-middle">
                    <button
                      className="group flex items-center gap-1 text-[10.5px] font-semibold tracking-[0.06em] uppercase"
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
                  <TableHead className="w-[14%] px-2 align-middle">
                    <button
                      className="group flex items-center gap-1 text-[10.5px] font-semibold tracking-[0.06em] uppercase"
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
                  <TableHead className="w-[12%] px-2 align-middle">
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
                          className="h-3.5 w-3.5 rounded cursor-pointer accent-[var(--arca-accent)]"
                          checked={selectedIds.has(invoice.id)}
                          onChange={() => toggleInvoiceRow(invoice.id)}
                        />
                      </TableCell>
                      <TableCell className="w-[10%] px-2 align-middle">
                        <div className="truncate">
                          {getTypeBadge(String(invoice.tipo))}
                        </div>
                      </TableCell>
                      <TableCell className="w-[16%] px-2 align-middle">
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
                      <TableCell className="w-[20%] px-2 align-middle">
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
                      <TableCell className="w-[12%] px-2 align-middle whitespace-nowrap tabular-nums [font-family:var(--ff-mono)]">
                        {formatNumero(invoice.puntoVenta, invoice.numero)}
                      </TableCell>
                      <TableCell className="w-[9%] px-2 align-middle whitespace-nowrap">
                        {formatDateOnlyString(invoice.fechaEmision)}
                      </TableCell>
                      <TableCell className="w-[14%] px-2 align-middle whitespace-nowrap font-medium">
                        {formatCurrency(invoice.total, invoice.moneda)}
                      </TableCell>
                      <TableCell className="w-[12%] px-2 align-middle whitespace-nowrap">
                        {getDirectionBadge(invoice.direccion)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination, dentro de la card y pegada a la última fila. */}
          {totalPages > 1 && (
            <Paginador
              pagina={currentPage}
              totalPaginas={totalPages}
              onPagina={setCurrentPage}
              className="w-full min-w-0 border-t border-[var(--arca-border)] px-[18px] py-[11px]"
            />
          )}
        </div>

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
                const desglose = (
                  [
                    ['Neto gravado', d.netoGravado],
                    ['Neto no gravado', d.netoNoGravado],
                    ['Exento', d.exento],
                    ['Otros tributos', d.otrosTributos],
                    ['IVA', d.ivaTotal],
                  ] as [string, string | null][]
                ).filter(([, v]) => Number(v ?? 0) !== 0);
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
                      <div className="flex-1 p-5 pr-8">
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
                      <div className="flex-1 border-l border-[var(--arca-border-strong)] p-5 pl-8 text-right">
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
                          <thead className="bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em]">
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
                          <tbody className="bg-[var(--arca-surface)]">
                            {d.alicuotas.map((a, i) => (
                              <tr
                                key={i}
                                className="border-t border-[var(--arca-border)]"
                              >
                                <td className="px-3 py-2 tabular-nums [font-family:var(--ff-mono)]">
                                  {a.alicuota ? `${a.alicuota}%` : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums [font-family:var(--ff-mono)]">
                                  {monto(a.neto)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums [font-family:var(--ff-mono)]">
                                  {monto(a.iva)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex flex-col items-end gap-1 rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-4 py-3">
                      {/* Sin ninguna línea, el Total quedaba flotando solo y
                          parecía un error de la pantalla. Los comprobantes C
                          nunca discriminan IVA —va dentro del precio— y en el
                          resto pasa cuando ARCA no publicó el desglose: en
                          esta base, el 100% de las C y el 5% de las B. */}
                      {desglose.length === 0 && (
                        <p className="w-full max-w-[280px] text-[11.5px] text-[var(--arca-ink-4)]">
                          {d.letra === 'C'
                            ? 'Los comprobantes C no discriminan IVA: está incluido en el total.'
                            : 'ARCA no publicó el desglose de este comprobante.'}
                        </p>
                      )}
                      {desglose.map(([label, v]) => (
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

type Resumen = Awaited<ReturnType<typeof getResumenComprobantes>>;

const pesos = (n: number) =>
  n.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  });

/**
 * Lo que dejan los filtros, en dos bloques: emitidas (ventas) y recibidas
 * (compras). Si se filtra por una sola dirección, solo esa.
 */
function ResumenFacturas({
  resumen,
  direccion,
  cargando,
}: {
  resumen: Resumen;
  direccion?: 'emitido' | 'recibido';
  cargando: boolean;
}) {
  const bloques = (
    [
      ['emitido', 'Emitidas', resumen.emitidos],
      ['recibido', 'Recibidas', resumen.recibidos],
    ] as const
  ).filter(([d]) => !direccion || d === direccion);
  const hayNotas = bloques.some(([, , b]) => b.notasDeCredito > 0);
  return (
    <div className={cn('flex flex-col gap-1.5', cargando && 'opacity-60')}>
      <div
        className={cn(
          'grid gap-[10px]',
          bloques.length > 1 && 'md:grid-cols-2'
        )}
      >
        {bloques.map(([d, titulo, b]) => (
          <div
            key={d}
            className="rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-4 py-3 shadow-[var(--arca-shadow-card)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-3)]">
                {titulo}
              </p>
              <p className="text-[12px] text-[var(--arca-ink-3)]">
                {b.cantidad.toLocaleString('es-AR')} comprobante
                {b.cantidad === 1 ? '' : 's'}
              </p>
            </div>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-[var(--arca-ink)] [font-family:var(--ff-display)]">
              {pesos(b.total)}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 text-[12px] tabular-nums text-[var(--arca-ink-2)]">
              <span>Neto gravado {pesos(b.netoGravado)}</span>
              <span>IVA {pesos(b.iva)}</span>
            </div>
          </div>
        ))}
      </div>
      {hayNotas && (
        <p className="text-[11.5px] text-[var(--arca-ink-4)]">
          En pesos. Las notas de crédito restan (
          {bloques
            .filter(([, , b]) => b.notasDeCredito > 0)
            .map(
              ([, titulo, b]) =>
                `${b.notasDeCredito} ${titulo.toLowerCase().slice(0, -1)}${b.notasDeCredito === 1 ? '' : 's'}`
            )
            .join(', ')}
          ).
        </p>
      )}
    </div>
  );
}
