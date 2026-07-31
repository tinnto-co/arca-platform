'use client';

import * as React from 'react';
import {
  ChevronDown,
  Plus,
  X,
  Pencil,
  FileText,
  RefreshCw,
} from 'lucide-react';
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

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import {
  getComprobantesEnRango,
  getComprobanteStats,
} from '@/actions/comprobante';
import { getLastJobByType } from '@/actions/client';

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

function formatIvaValue(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isNaN(n) ? '—' : currencyFormatter.format(n);
}

/** Formato es-AR con glifo de menos "−" para negativos. */
function fmtCurrency(value: number): string {
  const s = currencyFormatter.format(Math.abs(value));
  return value < 0 ? `− ${s}` : s;
}

/** Divide el monto en parte entera y decimales (para el número hero). */
function splitHero(value: number): { int: string; dec: string } {
  const s = currencyFormatter.format(Math.abs(value));
  const idx = s.lastIndexOf(',');
  if (idx === -1) return { int: s, dec: '' };
  return { int: s.slice(0, idx), dec: s.slice(idx) };
}

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--arca-ink-4)]">
      {children}
    </div>
  );
}

/** Fila de la banda libro mayor (Ventas / Compras). */
function BandRow({
  label,
  value,
  loading = false,
  border = false,
}: {
  label: string;
  value: number;
  loading?: boolean;
  border?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-2.5 ${
        border ? 'border-b border-[var(--arca-border)]' : ''
      }`}
    >
      <span className="text-[14px] text-[var(--arca-ink-3)]">{label}</span>
      {loading ? (
        <span className="inline-flex h-5 w-24 animate-pulse rounded bg-[var(--arca-border)]" />
      ) : (
        <span className="tnum font-display text-[17px] font-semibold text-[var(--arca-ink)]">
          {fmtCurrency(value)}
        </span>
      )}
    </div>
  );
}

/** Fila de desglose por alícuota (read-only). */
function DesgloseRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: number;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-2 text-[14px] ${
        last ? '' : 'border-b border-[var(--arca-border)]'
      }`}
    >
      <span className="text-[var(--arca-ink-2)]">{label}</span>
      <span
        className={`tnum font-medium ${
          value < 0
            ? 'text-[var(--arca-accent-neg-fg)]'
            : 'text-[var(--arca-ink)]'
        }`}
      >
        {fmtCurrency(value)}
      </span>
    </div>
  );
}

/** Fila read-only de la sección Saldos. */
function SaldoRow({
  label,
  value,
  negative = false,
  last = false,
}: {
  label: string;
  value: number;
  negative?: boolean;
  last?: boolean;
}) {
  const shown = negative ? -Math.abs(value) : value;
  return (
    <div
      className={`flex items-baseline justify-between py-2.5 text-[14px] ${
        last ? '' : 'border-b border-[var(--arca-border)]'
      }`}
    >
      <span className="text-[var(--arca-ink-3)]">{label}</span>
      <span
        className={`tnum font-semibold ${
          shown < 0
            ? 'text-[var(--arca-accent-neg-fg)]'
            : 'text-[var(--arca-ink)]'
        }`}
      >
        {fmtCurrency(shown)}
      </span>
    </div>
  );
}

/** Fila editable inline con subrayado punteado (Retenciones, Percepciones, etc.). */
function EditableSaldoRow({
  label,
  value,
  onChange,
  isNegative = false,
  last = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  isNegative?: boolean;
  last?: boolean;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const displayValue = isNegative ? -Math.abs(value) : value;
  const isNeg = displayValue < 0;

  const startEditing = () => {
    setInputValue(String(value === 0 ? '' : Math.abs(value)));
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

  return (
    <div
      className={`flex items-baseline justify-between py-2.5 text-[14px] ${
        last ? '' : 'border-b border-[var(--arca-border)]'
      }`}
    >
      <span className="text-[var(--arca-ink-3)]">{label}</span>
      {isEditing ? (
        <Input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleConfirm}
          placeholder="0"
          autoFocus
          className="w-24 h-7 text-right tnum text-[13px]"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={`tnum cursor-text border-b border-dashed pb-px font-semibold ${
            isNeg
              ? 'text-[var(--arca-accent-neg-fg)] border-[#DDBBB4]'
              : 'text-[var(--arca-ink)] border-[#C9C6BC]'
          }`}
        >
          {fmtCurrency(displayValue)}
        </button>
      )}
    </div>
  );
}

/** Control de ajuste para el footer de "Saldos y retenciones". */
function AdjustControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const handleConfirm = () => {
    const parsed = parseFloat(inputValue);
    if (!Number.isNaN(parsed) && parsed !== 0) {
      onChange(parsed);
      setIsEditing(false);
      setInputValue('');
    }
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
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0"
          autoFocus
          className="w-24 h-7 text-right tnum text-[13px]"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[var(--arca-accent-pos-fg)] hover:bg-[var(--arca-accent-pos-bg)]"
          onClick={handleConfirm}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[var(--arca-ink-4)] hover:text-[var(--arca-accent-neg)]"
          onClick={() => {
            setIsEditing(false);
            setInputValue('');
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (value !== 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="tnum text-[13.5px] font-semibold text-[var(--arca-ink)]">
          {fmtCurrency(value)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-[var(--arca-ink-4)] hover:text-[var(--arca-accent-neg)]"
          onClick={() => onChange(0)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setInputValue('');
        setIsEditing(true);
      }}
      className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--arca-ink-2)] transition-colors hover:text-[var(--arca-ink)]"
    >
      <Plus className="h-3.5 w-3.5" />
      Agregar ajuste
    </button>
  );
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
  /** Login de AFIP (`credencial_afip.id`): de ahí sale el último job de IVA. */
  representativeId: string;
  /** Nombre del cliente para el nombre del archivo Excel. */
  clientName?: string | null;
  /** Datos de IVA crédito fiscal del cliente (período anterior). Opcional mientras carga o si no hay datos. */
  clientIva?: ClientIvaCreditData | undefined;
  /** Empresa seleccionada en la pestaña IVA: es un `cliente.id`. */
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

/**
 * `comprobante.fecha_emision` es una columna `date`: los filtros viajan como
 * `YYYY-MM-DD` y no como timestamp ISO, para no correr el día por zona horaria.
 */
function aFechaISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
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
    representativeId,
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
  const [openSaldos, setOpenSaldos] = React.useState(true);
  const [openIvaArca, setOpenIvaArca] = React.useState(true);
  const [ajusteVentas] = React.useState(0);
  const [ajusteCompras] = React.useState(0);
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

  const { isLoading: loadingInvoices } = useQuery({
    queryKey: [
      'comprobantesEnRango',
      selectedProfileId,
      dateRange.from?.toISOString(),
      dateRange.to?.toISOString(),
    ],
    queryFn: () =>
      getComprobantesEnRango({
        data: {
          clienteId: selectedProfileId!,
          dateFrom: aFechaISO(dateRange.from ?? new Date()),
          dateTo: aFechaISO(dateRange.to ?? new Date()),
        },
      }),
    enabled: !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  });

  const { data: invoiceStats, isLoading: loadingInvoiceStats } = useQuery({
    queryKey: [
      'comprobanteStats',
      selectedProfileId,
      dateRange.from?.toISOString(),
      dateRange.to?.toISOString(),
    ],
    queryFn: () =>
      getComprobanteStats({
        data: {
          clienteId: selectedProfileId!,
          dateFrom: aFechaISO(dateRange.from ?? new Date()),
          dateTo: aFechaISO(dateRange.to ?? new Date()),
        },
      }),
    enabled: !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  });

  const { data: lastScrapeJob } = useQuery({
    queryKey: ['lastIvaJob', representativeId],
    queryFn: () =>
      getLastJobByType({
        data: { credencialId: representativeId, jobType: 'iva' },
      }),
    enabled: !!representativeId,
  });

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
      'NC recibidas': invoiceStats?.ncRecibidasNeto ?? 0,
    };
  }, [
    invoiceStats?.netoA21,
    invoiceStats?.netoA105,
    invoiceStats?.totalAmountB21,
    invoiceStats?.totalAmountB105,
    invoiceStats?.totalAmountB27,
    invoiceStats?.ncRecibidasNeto,
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
      'NC emitidas': invoiceStats?.ncEmitidasNeto ?? 0,
    };
  }, [
    invoiceStats?.netoInbound27,
    invoiceStats?.netoInbound21,
    invoiceStats?.netoInbound105,
    invoiceStats?.netoInbound5,
    invoiceStats?.netoInbound25,
    invoiceStats?.ncEmitidasNeto,
  ]);

  // Débito Fiscal (ventas) = (B6*0.21)+(B7*0.105)+(B9/1.21*0.21)+(B8/1.105*0.105)+(B10/1.27*0.27)+B11
  // B6=Neto A 21%, B7=Neto A 10,5%, B9=Total B 21%, B8=Total B 10,5%, B10=Total B 27%, B11=ajuste ventas
  // Se suma el IVA de las NC recibidas de proveedores, que integra el débito fiscal.
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
      (invoiceStats?.ncRecibidasIva ?? 0) +
      B11
    );
  }, [debitoRows, ajusteVentas, invoiceStats?.ncRecibidasIva]);

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

  // Neto Gravado Ventas = (B6+B7) + (B8/1.105) + (B9/1.21) + (B10/1.27) + B11
  const netoGravadoVentas = React.useMemo(() => {
    const B6 = debitoRows['Neto A 21%'];
    const B7 = debitoRows['Neto A 10,5%'];
    const B8 = debitoRows['Total B 10,50%'];
    const B9 = debitoRows['Total B 21%'];
    const B10 = debitoRows['Total B 27%'];
    const B11 = ajusteVentas;
    return (
      B6 +
      B7 +
      B8 / 1.105 +
      B9 / 1.21 +
      B10 / 1.27 +
      (invoiceStats?.ncRecibidasNeto ?? 0) +
      B11
    );
  }, [debitoRows, ajusteVentas, invoiceStats?.ncRecibidasNeto]);
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

  // Neto de ajustes aplicados al saldo (retenciones/percepciones ya son negativas en el estado).
  const netoAjustes =
    compensaciones +
    retenciones +
    percepciones +
    percepcionesAduaneras +
    ajusteSaldos;

  // Estado del saldo final: > 0 a pagar, < 0 a favor, = 0 neutro.
  const saldoEstado =
    saldoFinal > 0 ? 'a_pagar' : saldoFinal < 0 ? 'a_favor' : 'neutro';
  const saldoHero = splitHero(saldoFinal);

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
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-7 py-14 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--arca-surface-2)]">
          <FileText className="h-5 w-5 text-[var(--arca-ink-4)]" />
        </div>
        <p className="max-w-sm text-sm text-[var(--arca-ink-3)]">
          Este representante no tiene ninguna empresa cargada. Agregá una empresa
          (perfil fiscal) para ver el resumen de IVA.
        </p>
      </div>
    );
  }

  const saldoPillMeta =
    saldoEstado === 'a_pagar'
      ? {
          label: 'A pagar',
          className:
            'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
        }
      : saldoEstado === 'a_favor'
        ? {
            label: 'Saldo a favor',
            className:
              'bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)]',
          }
        : {
            label: 'Neutro',
            className: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]',
          };

  const arcaMatches =
    !!clientIvaCredit?.data &&
    !!periodUsedForResumen &&
    clientIvaCredit.data.periodoFiscal === periodUsedForResumen;

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--arca-border-strong)] bg-[var(--arca-surface)]">
      {/* Banda libro mayor: Ventas · Compras · Saldo Final (hero) */}
      <div className="grid grid-cols-1 gap-px bg-[var(--arca-border)] lg:grid-cols-[1fr_1fr_1.15fr]">
        {/* Ventas */}
        <div className="bg-[var(--arca-surface)] px-7 py-6">
          <MicroLabel>Ventas</MicroLabel>
          <div className="mt-3">
            <BandRow
              label="Neto gravado"
              value={netoGravadoTotal}
              loading={isStatsLoading}
              border
            />
            <BandRow
              label="Débito fiscal"
              value={debitoFiscalTotal}
              loading={isStatsLoading}
            />
          </div>
        </div>

        {/* Compras */}
        <div className="bg-[var(--arca-surface)] px-7 py-6">
          <MicroLabel>Compras</MicroLabel>
          <div className="mt-3">
            <BandRow
              label="Neto gravado"
              value={netoGravadoComprasTotal}
              loading={isStatsLoading}
              border
            />
            <BandRow
              label="Crédito fiscal"
              value={creditoFiscalTotal}
              loading={isStatsLoading}
            />
          </div>
        </div>

        {/* Saldo final (hero) */}
        <div className="bg-[var(--arca-surface-2)] px-7 py-6">
          <div className="flex items-center justify-between">
            <MicroLabel>Saldo del período</MicroLabel>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${saldoPillMeta.className}`}
            >
              {saldoPillMeta.label}
            </span>
          </div>
          {isStatsLoading ? (
            <div className="mt-4 h-10 w-40 animate-pulse rounded bg-[var(--arca-border)]" />
          ) : (
            <div
              className={`mt-3 font-display tnum text-[38px] leading-none font-semibold ${
                saldoEstado === 'a_pagar'
                  ? 'text-[var(--arca-accent-neg-fg)]'
                  : saldoEstado === 'a_favor'
                    ? 'text-[var(--arca-accent-pos-fg)]'
                    : 'text-[var(--arca-ink)]'
              }`}
            >
              {saldoHero.int}
              <span className="text-[24px] text-[var(--arca-ink-4)]">
                {saldoHero.dec}
              </span>
            </div>
          )}
          <div className="mt-4 text-[12px] text-[var(--arca-ink-3)]">
            Última actualización{' '}
            {lastScrapeJob?.createdAt ? (
              <span
                className={
                  lastScrapeJob.success
                    ? 'font-medium text-[var(--arca-accent-pos-fg)]'
                    : 'font-medium text-[var(--arca-accent-neg-fg)]'
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

      {/* Desglose por alícuota: Ventas · Compras */}
      <div className="grid grid-cols-1 gap-px border-t border-[var(--arca-border)] bg-[var(--arca-border)] md:grid-cols-2">
        <div className="bg-[var(--arca-surface)] px-7 py-6">
          <MicroLabel>Ventas — desglose</MicroLabel>
          <div className="mt-2">
            {(() => {
              const entries = Object.entries(debitoRows);
              return entries.map(([label, value], i) => (
                <DesgloseRow
                  key={label}
                  label={label}
                  value={value}
                  last={i === entries.length - 1}
                />
              ));
            })()}
          </div>
        </div>
        <div className="bg-[var(--arca-surface)] px-7 py-6">
          <MicroLabel>Compras — desglose</MicroLabel>
          <div className="mt-2">
            {(() => {
              const entries = Object.entries(creditoRows);
              return entries.map(([label, value], i) => (
                <DesgloseRow
                  key={label}
                  label={label}
                  value={value}
                  last={i === entries.length - 1}
                />
              ));
            })()}
          </div>
        </div>
      </div>

      {/* Saldos y retenciones (colapsable, 3 columnas) */}
      <Collapsible open={openSaldos} onOpenChange={setOpenSaldos}>
        <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-[var(--arca-border)] px-7 py-4 text-left transition-colors hover:bg-[var(--arca-surface-2)]">
          <MicroLabel>Saldos y retenciones</MicroLabel>
          <ChevronDown
            className={`h-4 w-4 text-[var(--arca-ink-4)] transition-transform ${
              openSaldos ? 'rotate-180' : ''
            }`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-px border-t border-[var(--arca-border)] bg-[var(--arca-border)] lg:grid-cols-3">
            {/* Saldos del período (read-only) */}
            <div className="bg-[var(--arca-surface)] px-7 py-6">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                Saldos del período
              </div>
              <SaldoRow
                label="Saldo a favor per. ant."
                value={saldosParaTotal['Saldo a Favor Per. Ant.']}
              />
              <SaldoRow
                label="Saldo técnico"
                value={saldosParaTotal['Saldo Técnico']}
              />
              <SaldoRow
                label="Saldo libre disp."
                value={saldosParaTotal['Saldo Libre Disp.']}
              />
              <SaldoRow
                label="Saldo 2° párrafo"
                value={saldosParaTotal['Saldo 2° Párrafo']}
                last
              />
            </div>

            {/* Retenciones y percepciones (editable) */}
            <div className="bg-[var(--arca-surface)] px-7 py-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                  Retenciones y percepciones
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--arca-surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--arca-ink-3)]">
                  <Pencil className="h-3 w-3" />
                  Editable
                </span>
              </div>
              <EditableSaldoRow
                label="Compensaciones"
                value={compensaciones}
                onChange={setCompensaciones}
              />
              <EditableSaldoRow
                label="Retenciones"
                value={retenciones}
                onChange={setRetenciones}
                isNegative
              />
              <EditableSaldoRow
                label="Percepciones"
                value={percepciones}
                onChange={setPercepciones}
                isNegative
              />
              <EditableSaldoRow
                label="Percepciones aduaneras"
                value={percepcionesAduaneras}
                onChange={setPercepcionesAduaneras}
                isNegative
                last
              />
            </div>

            {/* Otros conceptos (read-only) */}
            <div className="bg-[var(--arca-surface)] px-7 py-6">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                Otros conceptos
              </div>
              <SaldoRow label="Exento" value={saldosParaTotal.Exento} />
              <SaldoRow label="IVA 0%" value={saldosParaTotal['IVA 0%']} />
              <SaldoRow
                label="No gravado"
                value={saldosParaTotal['No gravado']}
                last
              />
            </div>
          </div>

          {/* Footer: neto de ajustes + agregar ajuste manual */}
          <div className="flex items-center justify-between border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-7 py-4">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] text-[var(--arca-ink-3)]">
                Neto de ajustes
              </span>
              <span
                className={`tnum text-[15px] font-semibold ${
                  netoAjustes < 0
                    ? 'text-[var(--arca-accent-neg-fg)]'
                    : 'text-[var(--arca-ink)]'
                }`}
              >
                {fmtCurrency(netoAjustes)}
              </span>
            </div>
            <AdjustControl value={ajusteSaldos} onChange={setAjusteSaldos} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Información IVA ARCA (colapsable) */}
      {selectedProfileId && (
        <Collapsible open={openIvaArca} onOpenChange={setOpenIvaArca}>
          <CollapsibleTrigger className="flex w-full items-center justify-between border-t border-[var(--arca-border)] px-7 py-4 text-left transition-colors hover:bg-[var(--arca-surface-2)]">
            <div className="flex items-center gap-2.5">
              <MicroLabel>Información IVA ARCA</MicroLabel>
              {clientIvaCredit?.cuit && (
                <span className="inline-flex items-center rounded-md bg-[var(--arca-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--arca-ink-2)]">
                  {clientIvaCredit.cuit}
                </span>
              )}
              {arcaMatches && (
                <span className="inline-flex items-center rounded-full bg-[var(--arca-accent-pos-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--arca-accent-pos-fg)]">
                  Coincide período
                </span>
              )}
              {clientIvaLoading && (
                <span className="text-[11px] text-[var(--arca-ink-4)]">
                  cargando…
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-[var(--arca-ink-4)] transition-transform ${
                openIvaArca ? 'rotate-180' : ''
              }`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-[var(--arca-border)] px-7 py-6">
              {clientIvaLoading ? (
                <p className="text-[13px] text-[var(--arca-ink-3)]">
                  Calculando IVA del cliente…
                </p>
              ) : clientIvaError ? (
                <p className="text-[13px] text-[var(--arca-accent-neg-fg)]">
                  No se pudo obtener la información de IVA. Verificá las
                  credenciales o intentá más tarde.
                </p>
              ) : !clientIvaCredit?.data ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--arca-surface-2)]">
                    <FileText className="h-5 w-5 text-[var(--arca-ink-4)]" />
                  </div>
                  <p className="mt-3 text-[13px] text-[var(--arca-ink-3)]">
                    No hay información de IVA para este perfil.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--arca-surface-2)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--arca-ink-3)]">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Sincronizá con ARCA para traer los datos
                  </span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                    {(
                      [
                        ['Período fiscal', clientIvaCredit.data.periodoFiscal],
                        ['Débito fiscal', clientIvaCredit.data.debitoFiscal],
                        ['Crédito fiscal', clientIvaCredit.data.creditoFiscal],
                        ['Saldo mes pasado', clientIvaCredit.data.saldoMesPasado],
                        ['Saldo ARCA mes', clientIvaCredit.data.saldoArcaMes],
                        [
                          'Saldo técnico favor contrib.',
                          clientIvaCredit.data.saldoTecnicoFavorContribuyente,
                        ],
                        [
                          'Saldo técnico (pos. mensual)',
                          clientIvaCredit.data
                            .saldoTecnicoFavorContribuyentePosicionMensual,
                        ],
                        [
                          'Saldo libre disp. ant. (neto)',
                          clientIvaCredit.data
                            .saldoLibreDisponibilidadPeriodoAnteriorNeto,
                        ],
                        [
                          'Total ret. y perc. período',
                          clientIvaCredit.data
                            .totalRetencionesPercepcionesPeriodo,
                        ],
                        [
                          'Saldo libre disp. (período)',
                          clientIvaCredit.data
                            .saldoLibreDisponibilidadFavorContribuyentePeriodo,
                        ],
                      ] as const
                    ).map(([label, value], i) => (
                      <div key={i}>
                        <div className="text-[11px] text-[var(--arca-ink-4)]">
                          {label}
                        </div>
                        <div className="mt-0.5 tnum text-[13.5px] font-medium text-[var(--arca-ink)]">
                          {i === 0
                            ? (value ?? '—')
                            : formatIvaValue(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {clientIvaCredit.data.fechaPresentacion && (
                    <div className="mt-4 text-[11.5px] text-[var(--arca-ink-4)]">
                      Presentado {clientIvaCredit.data.fechaPresentacion}
                    </div>
                  )}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
});
