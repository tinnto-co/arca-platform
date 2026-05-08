'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import ExcelJSRaw from 'exceljs';
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

import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import {
  getInvoicesByProfileInRange,
  getInvoiceStatsByProfile,
} from '@/actions/invoice';
import { getLastComprobantesFullJob } from '@/actions/client';

const currencyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const mockData = {
  debito: {
    'Neto A 21%': 0,
    'Neto A 10,5%': 0,
    'Total B 10,50%': 0,
    'Total B 21%': 0,
    'Total B 27%': 0,
  },
  resumenDebito: {
    'Neto Gravado': 0,
    'Débito Fiscal': 0,
  },
  credito: {
    'Compras 21%': 0,
    'Compras 10,50%': 0,
    'Compras 27%': 0,
    'Compras 5% (4,93%)': 0,
    'Compras 2,5%': 0,
    Ajuste: 0,
  },
  resumenCredito: {
    'Neto Gravado Compras': 0,
    'Crédito Fiscal': 0,
  },
  saldosYRetenciones: {
    'Saldo a Favor Per. Ant.': 0,
    'Saldo Técnico': 0, // Se calcula: Débito Fiscal - Crédito Fiscal - Saldo a Favor Per. Ant.
    'Saldo Libre Disp.': 0,
    Compensaciones: 0,
    Retenciones: 0,
    Percepciones: 0,
    'Percepciones Aduaneras': 0,
    'Saldo 2° Párrafo': 0,
    Exento: 0,
    'IVA 0%': 0,
    'No gravado': 0,
    Ajuste: 0,
  },
  resultado: {
    'Saldo Final': 0,
  },
};

function sumValues(record: Record<string, number>) {
  return Object.values(record).reduce((acc, value) => acc + value, 0);
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function formatIvaValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : currencyFormatter.format(n);
}

function SectionRow({
  label,
  value,
  emphasize = false,
  valueClassName = '',
}: {
  label: string;
  value: number;
  emphasize?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 text-sm ${
        emphasize ? 'font-semibold' : ''
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums text-right ${
          emphasize ? 'text-foreground' : ''
        } ${valueClassName}`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

function AjusteRow({
  value,
  onChange,
  isNegative = false,
}: {
  value: number;
  onChange: (value: number) => void;
  isNegative?: boolean;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const isActive = value !== 0;

  const handleAdd = () => {
    setInputValue('');
    setIsEditing(true);
  };

  const handleConfirm = () => {
    const parsed = parseFloat(inputValue);
    if (!isNaN(parsed) && parsed !== 0) {
      onChange(Math.abs(parsed));
      setIsEditing(false);
    }
  };

  const handleRemove = () => {
    onChange(0);
    setIsEditing(false);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue('');
    }
  };

  // Estado: No activo y no editando -> mostrar botón "Agregar ajuste"
  if (!isActive && !isEditing) {
    return (
      <div className="flex items-center justify-end py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3 mr-1" />
          Agregar ajuste
        </Button>
      </div>
    );
  }

  // Estado: Editando -> mostrar input + botón "+"
  if (isEditing) {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-muted-foreground">Ajuste</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0"
            autoFocus
            className={`w-28 h-7 text-right tabular-nums text-sm ${isNegative ? 'text-destructive' : ''}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[var(--arca-accent-pos-fg)] hover:text-[var(--arca-accent-pos-fg)] hover:bg-[var(--arca-accent-pos-bg)]"
            onClick={handleConfirm}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              setIsEditing(false);
              setInputValue('');
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Estado: Activo -> mostrar valor + botón eliminar
  const displayValue = isNegative ? -Math.abs(value) : value;
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">Ajuste</span>
      <div className="flex items-center gap-1">
        <span
          className={`tabular-nums text-right ${isNegative ? 'text-destructive' : ''}`}
        >
          {formatCurrency(displayValue)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/** Fila siempre visible con valor editable (ej. Retenciones, Percepciones). Sin agregar/quitar, mínimo 0. */
function EditableSaldoRow({
  label,
  value,
  onChange,
  isNegative = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  isNegative?: boolean;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const displayValue = isNegative ? -Math.abs(value) : value;

  const startEditing = () => {
    setInputValue(String(value === 0 ? '' : value));
    setIsEditing(true);
  };

  const handleConfirm = () => {
    const parsed = parseFloat(inputValue);
    const final = Number.isNaN(parsed)
      ? 0
      : isNegative
        ? -Math.abs(parsed)
        : Math.abs(parsed);
    onChange(final);
    setIsEditing(false);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue('');
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleConfirm}
            placeholder="0"
            autoFocus
            className={`w-28 h-7 text-right tabular-nums text-sm ${isNegative ? 'text-destructive' : ''}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-[var(--arca-accent-pos-fg)] hover:text-[var(--arca-accent-pos-fg)] hover:bg-[var(--arca-accent-pos-bg)]"
            onClick={handleConfirm}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={startEditing}
        className="flex items-center gap-1 rounded px-1 py-0.5 tabular-nums text-right hover:bg-muted"
      >
        <span
          className={displayValue < 0 ? 'text-destructive' : 'text-foreground'}
        >
          {formatCurrency(displayValue)}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

interface DateRange {
  from?: Date;
  to?: Date;
}

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export const MONTH_NAMES_SHORT = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

export function getMonthBounds(
  year: number,
  monthIndex: number
): { from: Date; to: Date } {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  return { from, to };
}

/** Datos de IVA del cliente (mes anterior) devueltos por getClientIvaCredit */
export interface ClientIvaCreditData {
  cuit: string;
  data: {
    periodoFiscal: string;
    fechaPresentacion?: string;
    debitoFiscal: string | null;
    creditoFiscal: string | null;
    saldoMesPasado: string | null;
    saldoArcaMes: string | null;
    saldoTecnicoFavorContribuyente: string | null;
    saldoTecnicoFavorContribuyentePosicionMensual: string | null;
    saldoLibreDisponibilidadPeriodoAnteriorNeto: string | null;
    totalRetencionesPercepcionesPeriodo: string | null;
    saldoLibreDisponibilidadFavorContribuyentePeriodo: string | null;
    ok: boolean;
  } | null;
  message?: string;
}

export interface RenderIvaResumeRef {
  downloadExcel: () => Promise<void>;
}

interface RenderIvaResumeProps {
  clientId: string;
  /** Nombre del cliente para el nombre del archivo Excel. */
  clientName?: string | null;
  /** Datos de IVA crédito fiscal del cliente (período anterior). Opcional mientras carga o si no hay datos. */
  clientIva?: ClientIvaCreditData | undefined;
  /** Perfil seleccionado en la pestaña IVA (definido en client-detail-page). */
  selectedProfileId?: string | undefined;
  /** Rango de fechas del período (controlado desde el padre). */
  dateRange: { from: Date; to: Date };
  /** Si la info de IVA ARCA está cargando. */
  clientIvaLoading?: boolean;
  /** Si hubo error al cargar la info de IVA ARCA. */
  clientIvaError?: unknown;
  /** Período fiscal del scrape (mes anterior) para resaltar coincidencia con ARCA. */
  periodUsedForResumen?: string | null;
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[/\\:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'cliente'
  );
}

export const RenderIvaResume = React.forwardRef<
  RenderIvaResumeRef,
  RenderIvaResumeProps
>(function RenderIvaResume(
  {
    clientId,
    clientName,
    clientIva: clientIvaCredit,
    selectedProfileId,
    dateRange,
    clientIvaLoading = false,
    clientIvaError,
    periodUsedForResumen,
  },
  ref
) {
  const [openDebito, setOpenDebito] = React.useState(false);
  const [openCredito, setOpenCredito] = React.useState(false);
  const [openSaldos, setOpenSaldos] = React.useState(false);
  const [openIvaArca, setOpenIvaArca] = React.useState(false);
  const [ajusteVentas, setAjusteVentas] = React.useState(0);
  const [ajusteCompras, setAjusteCompras] = React.useState(0);
  const [ajusteSaldos, setAjusteSaldos] = React.useState(0);
  const [retenciones, setRetenciones] = React.useState(
    mockData.saldosYRetenciones.Retenciones
  );
  const [percepciones, setPercepciones] = React.useState(
    mockData.saldosYRetenciones.Percepciones
  );
  const [percepcionesAduaneras, setPercepcionesAduaneras] = React.useState(
    mockData.saldosYRetenciones['Percepciones Aduaneras']
  );
  const [compensaciones, setCompensaciones] = React.useState(
    mockData.saldosYRetenciones.Compensaciones
  );

  const {
    data: invoicesInRange,
    error: invoicesError,
    isLoading: loadingInvoices,
  } = useQuery({
    queryKey: [
      'invoicesByProfileInRange',
      selectedProfileId,
      dateRange.from?.toISOString(),
      dateRange.to?.toISOString(),
    ],
    queryFn: () =>
      getInvoicesByProfileInRange({
        data: {
          profileId: selectedProfileId!,
          dateFrom: (dateRange.from ?? new Date()).toISOString(),
          dateTo: (dateRange.to ?? new Date()).toISOString(),
        },
      }),
    enabled: !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  });

  const { data: invoiceStats, isLoading: loadingInvoiceStats } = useQuery({
    queryKey: [
      'invoiceStatsByProfile',
      selectedProfileId,
      dateRange.from?.toISOString(),
      dateRange.to?.toISOString(),
    ],
    queryFn: () =>
      getInvoiceStatsByProfile({
        data: {
          profileId: selectedProfileId!,
          dateFrom: (dateRange.from ?? new Date()).toISOString(),
          dateTo: (dateRange.to ?? new Date()).toISOString(),
        },
      }),
    enabled: !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  });

  const { data: lastScrapeJob } = useQuery({
    queryKey: ['lastComprobantesFullJob', clientId],
    queryFn: () =>
      getLastComprobantesFullJob({
        data: { clientId },
      }),
    enabled: !!clientId,
  });

  React.useEffect(() => {
    console.log('[RenderIvaResume] invoicesInRange', invoicesInRange);
  }, [invoicesInRange]);

  // Débito: Neto A y Total B desde stats (ventas tipo A y tipo B)
  const debitoRows = React.useMemo(() => {
    const netoA21 = invoiceStats?.netoA21 ?? mockData.debito['Neto A 21%'];
    const netoA105 = invoiceStats?.netoA105 ?? mockData.debito['Neto A 10,5%'];
    const totalB105 =
      invoiceStats?.totalAmountB105 ?? mockData.debito['Total B 10,50%'];
    const totalB21 =
      invoiceStats?.totalAmountB21 ?? mockData.debito['Total B 21%'];
    const totalB27 =
      invoiceStats?.totalAmountB27 ?? mockData.debito['Total B 27%'];
    return {
      'Neto A 21%': netoA21,
      'Neto A 10,5%': netoA105,
      'Total B 10,50%': totalB105,
      'Total B 21%': totalB21,
      'Total B 27%': totalB27,
    };
  }, [
    invoiceStats?.netoA21,
    invoiceStats?.netoA105,
    invoiceStats?.totalAmountB21,
    invoiceStats?.totalAmountB105,
    invoiceStats?.totalAmountB27,
  ]);

  // Crédito / Compras: netos por alícuota desde stats (27%, 21%, 10,5%, 5%, 2,5%)
  const creditoRows = React.useMemo(() => {
    const neto27 =
      invoiceStats?.netoInbound27 ?? mockData.credito['Compras 27%'];
    const neto21 =
      invoiceStats?.netoInbound21 ?? mockData.credito['Compras 21%'];
    const neto105 =
      invoiceStats?.netoInbound105 ?? mockData.credito['Compras 10,50%'];
    const neto5 =
      invoiceStats?.netoInbound5 ?? mockData.credito['Compras 5% (4,93%)'];
    const neto25 =
      invoiceStats?.netoInbound25 ?? mockData.credito['Compras 2,5%'];
    return {
      'Compras 27%': neto27,
      'Compras 21%': neto21,
      'Compras 10,50%': neto105,
      'Compras 5% (4,93%)': neto5,
      'Compras 2,5%': neto25,
    };
  }, [
    invoiceStats?.netoInbound27,
    invoiceStats?.netoInbound21,
    invoiceStats?.netoInbound105,
    invoiceStats?.netoInbound5,
    invoiceStats?.netoInbound25,
  ]);

  // Débito Fiscal (ventas) = (B6*0.21)+(B7*0.105)+(B9/1.21*0.21)+(B8/1.105*0.105)+(B10/1.27*0.27)+B11
  // B6=Neto A 21%, B7=Neto A 10,5%, B9=Total B 21%, B8=Total B 10,5%, B10=Total B 27%, B11=ajuste ventas
  const debitoFiscalTotal = React.useMemo(() => {
    const B6 = debitoRows['Neto A 21%'];
    const B7 = debitoRows['Neto A 10,5%'];
    const B8 = debitoRows['Total B 10,50%'];
    const B9 = debitoRows['Total B 21%'];
    const B10 = debitoRows['Total B 27%'];
    const B11 = ajusteVentas;
    return (
      B6 * 0.21 +
      B7 * 0.105 +
      (B9 / 1.21) * 0.21 +
      (B8 / 1.105) * 0.105 +
      (B10 / 1.27) * 0.27 +
      B11
    );
  }, [debitoRows, ajusteVentas]);

  const creditoFiscalTotal =
    invoiceStats != null
      ? (invoiceStats?.creditoFiscalCompras ?? 0) - Math.abs(ajusteCompras)
      : mockData.resumenCredito['Crédito Fiscal'];

  // Saldos y retenciones:
  // - "Saldo a Favor Per. Ant." <- saldoTecnicoFavorContribuyente
  // - "Saldo Libre Disp." <- saldoLibreDisponibilidadFavorContribuyentePeriodo
  // - "Saldo 2° Párrafo" = -(Saldo Libre Disp + Compensaciones + Retenciones + Percepciones + Percepciones Aduaneras) — el cliente lo maneja como negativo
  const saldosYRetenciones = React.useMemo(() => {
    const base = { ...mockData.saldosYRetenciones };
    if (clientIvaCredit?.data) {
      const saldoFavor = parseNumeric(
        clientIvaCredit.data.saldoTecnicoFavorContribuyente
      );
      if (saldoFavor !== null) base['Saldo a Favor Per. Ant.'] = saldoFavor;
      const saldoLibre = parseNumeric(
        clientIvaCredit.data.saldoLibreDisponibilidadFavorContribuyentePeriodo
      );
      if (saldoLibre !== null) base['Saldo Libre Disp.'] = saldoLibre;
    }
    base['Saldo Técnico'] =
      debitoFiscalTotal - creditoFiscalTotal - base['Saldo a Favor Per. Ant.'];
    if (invoiceStats != null) {
      base.Exento = invoiceStats.totalAmountExempt ?? 0;
      base['IVA 0%'] = invoiceStats.totalAmountIVA0 ?? 0;
      base['No gravado'] = invoiceStats.totalAmountNoTaxed ?? 0;
    }
    // Para el 2° párrafo se suman las magnitudes (todas como positivas) y se niega el total.
    // Saldo Libre Disp, Retenciones, etc. pueden estar almacenados como positivos o negativos.
    const saldoLibreDisp = Math.abs(base['Saldo Libre Disp.'] ?? 0);
    const sumaSegundoParrafo =
      saldoLibreDisp +
      Math.abs(compensaciones) +
      Math.abs(retenciones) +
      Math.abs(percepciones) +
      Math.abs(percepcionesAduaneras);
    base['Saldo 2° Párrafo'] = -sumaSegundoParrafo;
    return base;
  }, [
    clientIvaCredit?.data?.saldoTecnicoFavorContribuyente,
    clientIvaCredit?.data?.saldoLibreDisponibilidadFavorContribuyentePeriodo,
    debitoFiscalTotal,
    creditoFiscalTotal,
    compensaciones,
    retenciones,
    percepciones,
    percepcionesAduaneras,
    invoiceStats?.totalAmountExempt,
    invoiceStats?.totalAmountIVA0,
    invoiceStats?.totalAmountNoTaxed,
  ]);

  const totalDebito = sumValues(debitoRows);
  // Neto Gravado Ventas = (B6+B7) + (B8/1.105) + (B9/1.21) + (B10/1.27) + B11
  const netoGravadoVentas = React.useMemo(() => {
    const B6 = debitoRows['Neto A 21%'];
    const B7 = debitoRows['Neto A 10,5%'];
    const B8 = debitoRows['Total B 10,50%'];
    const B9 = debitoRows['Total B 21%'];
    const B10 = debitoRows['Total B 27%'];
    const B11 = ajusteVentas;
    return B6 + B7 + B8 / 1.105 + B9 / 1.21 + B10 / 1.27 + B11;
  }, [debitoRows, ajusteVentas]);
  const totalCredito = sumValues(creditoRows) - Math.abs(ajusteCompras);
  // Saldos mostrados: base + valores editables (Retenciones, Percepciones, Percepciones Aduaneras)
  const saldosParaTotal = React.useMemo(
    () => ({
      ...saldosYRetenciones,
      Compensaciones: compensaciones,
      Retenciones: retenciones,
      Percepciones: percepciones,
      'Percepciones Aduaneras': percepcionesAduaneras,
    }),
    [
      saldosYRetenciones,
      compensaciones,
      retenciones,
      percepciones,
      percepcionesAduaneras,
    ]
  );
  // Saldo Final = Saldo Técnico + Saldo 2° Párrafo + Ajuste
  const saldoFinal = React.useMemo(() => {
    const saldoTecnico = Number(saldosParaTotal['Saldo Técnico']) || 0;
    const saldo2doParrafo = Number(saldosParaTotal['Saldo 2° Párrafo']) || 0;
    return saldoTecnico + saldo2doParrafo + ajusteSaldos;
  }, [saldosParaTotal, ajusteSaldos]);

  const isStatsLoading = loadingInvoices || loadingInvoiceStats;

  const netoGravadoTotal =
    invoiceStats != null && !isStatsLoading
      ? netoGravadoVentas
      : mockData.resumenDebito['Neto Gravado'];
  const netoGravadoComprasTotal =
    invoiceStats != null && !isStatsLoading
      ? (invoiceStats?.netoGravadoCompras ??
        mockData.resumenCredito['Neto Gravado Compras'])
      : mockData.resumenCredito['Neto Gravado Compras'];

  const SaldoIconDebito = openDebito ? ChevronUp : ChevronDown;
  const SaldoIconCredito = openCredito ? ChevronUp : ChevronDown;
  const SaldoIconSaldos = openSaldos ? ChevronUp : ChevronDown;
  const SaldoIconIvaArca = openIvaArca ? ChevronUp : ChevronDown;

  const handleDownloadExcel = React.useCallback(async () => {
    const fromStr =
      dateRange.from?.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) ?? '';
    const toStr =
      dateRange.to?.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) ?? '';
    const ARS_NUM_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00';
    const thinBorder = {
      top: { style: 'thin' as const },
      left: { style: 'thin' as const },
      bottom: { style: 'thin' as const },
      right: { style: 'thin' as const },
    };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resumen IVA', {
      views: [{ showGridLines: true }],
    });
    ws.getColumn(1).width = 42;
    ws.getColumn(2).width = 22;

    let rowNum = 1;
    const writeRow = (
      label: string,
      value: string | number,
      isSectionTitle = false
    ) => {
      const row = ws.getRow(rowNum);
      const cellA = row.getCell(1);
      const cellB = row.getCell(2);
      cellA.value = label;
      cellB.value =
        typeof value === 'number' && !Number.isNaN(value) ? value : value;
      cellA.border = thinBorder;
      cellB.border = thinBorder;
      if (isSectionTitle) {
        cellA.font = { bold: true };
        cellB.font = { bold: true };
      }
      if (typeof value === 'number' && !Number.isNaN(value)) {
        cellB.numFmt = ARS_NUM_FMT;
      }
      rowNum++;
    };

    writeRow('Resumen IVA', '', true);
    writeRow('Período', `${fromStr} - ${toStr}`);
    rowNum++;
    writeRow('Ventas / Débito fiscal', '', true);
    Object.entries(debitoRows).forEach(([label, value]) =>
      writeRow(label, value)
    );
    writeRow('Ajuste', ajusteVentas);
    writeRow('Neto Gravado', netoGravadoTotal);
    writeRow('Débito Fiscal', debitoFiscalTotal);
    rowNum++;
    writeRow('Compras / Crédito fiscal', '', true);
    Object.entries(creditoRows).forEach(([label, value]) =>
      writeRow(label, value)
    );
    writeRow('Neto Gravado Compras', netoGravadoComprasTotal);
    writeRow('Crédito Fiscal', creditoFiscalTotal);
    rowNum++;
    writeRow('Saldos y retenciones', '', true);
    Object.entries(saldosParaTotal)
      .filter(([label]) => label !== 'Ajuste')
      .forEach(([label, value]) => writeRow(label, value));
    writeRow('Ajuste', ajusteSaldos);
    rowNum++;
    const saldoFinalRow = ws.getRow(rowNum);
    saldoFinalRow.getCell(1).value = 'Saldo Final';
    saldoFinalRow.getCell(2).value = saldoFinal;
    saldoFinalRow.getCell(1).border = thinBorder;
    saldoFinalRow.getCell(2).border = thinBorder;
    saldoFinalRow.getCell(1).font = { bold: true };
    saldoFinalRow.getCell(2).font = { bold: true };
    saldoFinalRow.getCell(2).numFmt = ARS_NUM_FMT;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const periodStr = `${fromStr.replace(/\//g, '-')} - ${toStr.replace(/\//g, '-')}`;
    a.download = `${sanitizeFilename(clientName ?? 'cliente')} - ${periodStr}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    clientName,
    dateRange.from,
    dateRange.to,
    debitoRows,
    creditoRows,
    netoGravadoTotal,
    debitoFiscalTotal,
    netoGravadoComprasTotal,
    creditoFiscalTotal,
    saldosParaTotal,
    ajusteVentas,
    ajusteSaldos,
    saldoFinal,
  ]);

  React.useImperativeHandle(
    ref,
    () => ({ downloadExcel: handleDownloadExcel }),
    [handleDownloadExcel]
  );

  if (!selectedProfileId) {
    return (
      <Card className="space-y-4">
        <CardContent className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">
            Seleccioná un perfil en la sección IVA para ver el resumen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen en cajas: Ventas, Compras, Saldo Final */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <div className="min-w-0 rounded-lg border-2 border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-bold uppercase tracking-wide text-foreground mb-3">
            Ventas
          </div>
          <div className="space-y-2.5 text-base">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground font-medium shrink-0">
                Neto Gravado
              </span>
              {isStatsLoading ? (
                <span className="inline-flex h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <span className="tabular-nums font-bold text-foreground truncate">
                  {formatCurrency(netoGravadoTotal)}
                </span>
              )}
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground font-medium shrink-0">
                Débito Fiscal
              </span>
              {isStatsLoading ? (
                <span className="inline-flex h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <span className="tabular-nums font-bold text-foreground truncate">
                  {formatCurrency(debitoFiscalTotal)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-lg border-2 border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-bold uppercase tracking-wide text-foreground mb-3">
            Compras
          </div>
          <div className="space-y-2.5 text-base">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground font-medium shrink-0">
                Neto Gravado
              </span>
              {isStatsLoading ? (
                <span className="inline-flex h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <span className="tabular-nums font-bold text-foreground truncate">
                  {formatCurrency(netoGravadoComprasTotal)}
                </span>
              )}
            </div>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-muted-foreground font-medium shrink-0">
                Crédito Fiscal
              </span>
              {isStatsLoading ? (
                <span className="inline-flex h-5 w-24 animate-pulse rounded bg-muted" />
              ) : (
                <span className="tabular-nums font-bold text-foreground truncate">
                  {formatCurrency(creditoFiscalTotal)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 rounded-lg border-2 border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-bold uppercase tracking-wide text-foreground mb-3">
            Saldo Final
          </div>
          {isStatsLoading ? (
            <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          ) : (
            <div
              className={`text-2xl font-bold tabular-nums truncate ${
                saldoFinal < 0
                  ? 'text-[var(--arca-accent-neg)]'
                  : 'text-[var(--arca-accent-pos-fg)]'
              }`}
            >
              {formatCurrency(saldoFinal)}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground truncate">
            Ult. actualización{' '}
            {lastScrapeJob?.createdAt ? (
              <span
                className={
                  lastScrapeJob.success
                    ? 'text-[var(--arca-accent-pos-fg)] font-medium'
                    : 'text-destructive'
                }
                title={lastScrapeJob.failedReason ?? undefined}
              >
                {new Date(lastScrapeJob.createdAt).toLocaleDateString('es-AR', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      {/* Desglose desplegable: Ventas */}
      <Collapsible open={openDebito} onOpenChange={setOpenDebito}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/60 px-5 py-4 text-base hover:bg-muted/80 transition-colors">
          <span className="font-medium">Ventas — desglose</span>
          <SaldoIconDebito className="h-5 w-5 text-muted-foreground shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-lg border bg-muted/30 px-5 py-4">
          {Object.entries(debitoRows).map(([label, value]) => (
            <SectionRow key={label} label={label} value={value} />
          ))}
          <AjusteRow value={ajusteVentas} onChange={setAjusteVentas} />
        </CollapsibleContent>
      </Collapsible>

      {/* Desglose desplegable: Compras */}
      <Collapsible open={openCredito} onOpenChange={setOpenCredito}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/60 px-5 py-4 text-base hover:bg-muted/80 transition-colors">
          <span className="font-medium">Compras — desglose</span>
          <SaldoIconCredito className="h-5 w-5 text-muted-foreground shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-lg border bg-muted/30 px-5 py-4">
          {Object.entries(creditoRows).map(([label, value]) => (
            <SectionRow
              key={label}
              label={label}
              value={-Math.abs(value)}
              valueClassName="text-destructive"
            />
          ))}
          <AjusteRow
            value={ajusteCompras}
            onChange={setAjusteCompras}
            isNegative
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Desglose desplegable: Saldos y retenciones */}
      <Collapsible open={openSaldos} onOpenChange={setOpenSaldos}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/60 px-5 py-4 text-base hover:bg-muted/80 transition-colors">
          <span className="font-medium">Saldos y retenciones</span>
          <SaldoIconSaldos className="h-5 w-5 text-muted-foreground shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-lg border bg-muted/30 px-5 py-4 space-y-2">
          {Object.entries(saldosParaTotal)
            .filter(([label]) => label !== 'Ajuste')
            .map(([label, value]) =>
              label === 'Compensaciones' ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={compensaciones}
                  onChange={setCompensaciones}
                />
              ) : label === 'Retenciones' ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={retenciones}
                  onChange={setRetenciones}
                  isNegative
                />
              ) : label === 'Percepciones' ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={percepciones}
                  onChange={setPercepciones}
                  isNegative
                />
              ) : label === 'Percepciones Aduaneras' ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={percepcionesAduaneras}
                  onChange={setPercepcionesAduaneras}
                  isNegative
                />
              ) : (
                <SectionRow
                  key={label}
                  label={label}
                  value={value}
                  valueClassName={
                    value < 0 ? 'text-destructive' : 'text-foreground'
                  }
                />
              )
            )}
          <AjusteRow value={ajusteSaldos} onChange={setAjusteSaldos} />
        </CollapsibleContent>
      </Collapsible>

      {/* Info IVA ARCA (compacta) - se muestra si hay perfil (loading, error o data) */}
      {selectedProfileId && (
        <Collapsible open={openIvaArca} onOpenChange={setOpenIvaArca}>
          <CollapsibleTrigger
            className={`flex w-full items-center justify-between rounded-lg border px-5 py-4 text-base hover:bg-muted/80 transition-colors ${
              clientIvaCredit?.data &&
              periodUsedForResumen &&
              clientIvaCredit.data.periodoFiscal === periodUsedForResumen
                ? 'bg-[var(--arca-accent-pos-bg)] border-[var(--arca-accent-pos)]'
                : 'bg-muted/60'
            }`}
          >
            <span className="font-medium">
              Información IVA ARCA
              {clientIvaCredit?.cuit ? ` — ${clientIvaCredit.cuit}` : ''}
              {clientIvaLoading ? ' (cargando…)' : ''}
            </span>
            <SaldoIconIvaArca className="h-5 w-5 text-muted-foreground shrink-0" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-lg border bg-muted/30 px-5 py-4">
            {clientIvaLoading ? (
              <p className="text-sm text-muted-foreground py-4">
                Calculando IVA del cliente…
              </p>
            ) : clientIvaError ? (
              <p className="text-sm text-destructive py-4">
                No se pudo obtener la información de IVA. Verificá las
                credenciales o intentá más tarde.
              </p>
            ) : !clientIvaCredit?.data ? (
              <p className="text-sm text-muted-foreground py-4">
                No hay información de IVA para este perfil.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Período fiscal
                    </div>
                    <div className="font-medium">
                      {clientIvaCredit.data.periodoFiscal ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Débito Fiscal
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(clientIvaCredit.data.debitoFiscal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Crédito Fiscal
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(clientIvaCredit.data.creditoFiscal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo mes pasado
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(clientIvaCredit.data.saldoMesPasado)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo ARCA mes
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(clientIvaCredit.data.saldoArcaMes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo técnico favor contrib.
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(
                        clientIvaCredit.data.saldoTecnicoFavorContribuyente
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo técnico (pos. mensual)
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(
                        clientIvaCredit.data
                          .saldoTecnicoFavorContribuyentePosicionMensual
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo libre disp. ant. (neto)
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(
                        clientIvaCredit.data
                          .saldoLibreDisponibilidadPeriodoAnteriorNeto
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Total ret. y perc. período
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(
                        clientIvaCredit.data.totalRetencionesPercepcionesPeriodo
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Saldo libre disp. (período)
                    </div>
                    <div className="font-medium">
                      {formatIvaValue(
                        clientIvaCredit.data
                          .saldoLibreDisponibilidadFavorContribuyentePeriodo
                      )}
                    </div>
                  </div>
                </div>
                {clientIvaCredit.data.fechaPresentacion && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Presentado {clientIvaCredit.data.fechaPresentacion}
                  </div>
                )}
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
});
