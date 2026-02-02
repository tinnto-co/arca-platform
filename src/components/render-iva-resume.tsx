"use client"

import * as React from "react"
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Download, Pencil, Plus, X } from "lucide-react"
import ExcelJSRaw from "exceljs"
const ExcelJS = ExcelJSRaw as unknown as {
  Workbook: new () => {
    addWorksheet(name: string, options?: { views?: { showGridLines?: boolean }[] }): {
      getColumn(col: number): { width?: number }
      getRow(row: number): { getCell(col: number): { value: unknown; border?: unknown; font?: { bold?: boolean }; numFmt?: string } }
    }
    xlsx: { writeBuffer(): Promise<ArrayBuffer | Buffer> }
  }
}

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useQuery } from "@tanstack/react-query"
import {
  getInvoicesByProfileInRange,
  getInvoiceStatsByProfile,
} from "@/actions/invoice"

const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
})

const mockData = {
  debito: {
    "Neto A 21%": 125000.5,
    "Neto A 10,5%": 34000.75,
    "Total B 10,50%": 0,
    "Total B 21%": 0,
    "Total B 27%": 0,
  },
  resumenDebito: {
    "Neto Gravado": 251751.5,
    "Débito Fiscal": 52867.82,
  },
  credito: {
    "Compras 21%": 82000.0,
    "Compras 10,50%": 23000.5,
    "Compras 27%": 15500.0,
    "Compras 5% (4,93%)": 4200.0,
    "Compras 2,5%": 3100.0,
    Ajuste: 0,
  },
  resumenCredito: {
    "Neto Gravado Compras": 127800.5,
    "Crédito Fiscal": 26890.32,
  },
  saldosYRetenciones: {
    "Saldo a Favor Per. Ant.": 15000.0,
    "Saldo Técnico": 0, // Se calcula: Débito Fiscal - Crédito Fiscal - Saldo a Favor Per. Ant.
    "Saldo Libre Disp.": 0,
    Compensaciones: 0,
    Retenciones: 0,
    Percepciones: 0,
    "Percepciones Aduaneras": 0,
    "Saldo 2° Párrafo": 6500.0,
    Ajuste: 0,
  },
  resultado: {
    "Saldo Final": 36500.75,
  },
}

function sumValues(record: Record<string, number>) {
  return Object.values(record).reduce((acc, value) => acc + value, 0)
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function SectionRow({
  label,
  value,
  emphasize = false,
  valueClassName = "",
}: {
  label: string
  value: number
  emphasize?: boolean
  valueClassName?: string
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 text-sm ${emphasize ? "font-semibold" : ""
        }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums text-right ${emphasize ? "text-foreground" : ""
          } ${valueClassName}`}
      >
        {formatCurrency(value)}
      </span>
    </div>
  )
}

function AjusteRow({
  value,
  onChange,
  isNegative = false,
}: {
  value: number
  onChange: (value: number) => void
  isNegative?: boolean
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const isActive = value !== 0

  const handleAdd = () => {
    setInputValue("")
    setIsEditing(true)
  }

  const handleConfirm = () => {
    const parsed = parseFloat(inputValue)
    if (!isNaN(parsed) && parsed !== 0) {
      onChange(Math.abs(parsed))
      setIsEditing(false)
    }
  }

  const handleRemove = () => {
    onChange(0)
    setIsEditing(false)
    setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm()
    } else if (e.key === "Escape") {
      setIsEditing(false)
      setInputValue("")
    }
  }

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
    )
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
            className={`w-28 h-7 text-right tabular-nums text-sm ${isNegative ? "text-destructive" : ""}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            onClick={handleConfirm}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => {
              setIsEditing(false)
              setInputValue("")
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  // Estado: Activo -> mostrar valor + botón eliminar
  const displayValue = isNegative ? -Math.abs(value) : value
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">Ajuste</span>
      <div className="flex items-center gap-1">
        <span className={`tabular-nums text-right ${isNegative ? "text-destructive" : ""}`}>
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
  )
}

/** Fila siempre visible con valor editable (ej. Retenciones, Percepciones). Sin agregar/quitar, mínimo 0. */
function EditableSaldoRow({
  label,
  value,
  onChange,
  isNegative = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  isNegative?: boolean
}) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

  const displayValue = isNegative ? -Math.abs(value) : value

  const startEditing = () => {
    setInputValue(String(value === 0 ? "" : value))
    setIsEditing(true)
  }

  const handleConfirm = () => {
    const parsed = parseFloat(inputValue)
    const final = Number.isNaN(parsed) ? 0 : (isNegative ? -Math.abs(parsed) : Math.abs(parsed))
    onChange(final)
    setIsEditing(false)
    setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleConfirm()
    if (e.key === "Escape") {
      setIsEditing(false)
      setInputValue("")
    }
  }

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
            className={`w-28 h-7 text-right tabular-nums text-sm ${isNegative ? "text-destructive" : ""}`}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            onClick={handleConfirm}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <button
        type="button"
        onClick={startEditing}
        className="flex items-center gap-1 rounded px-1 py-0.5 tabular-nums text-right hover:bg-muted"
      >
        <span className={displayValue < 0 ? "text-destructive" : "text-foreground"}>
          {formatCurrency(displayValue)}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  )
}

type DateRange = {
  from?: Date
  to?: Date
}

/** Datos de IVA del cliente (mes anterior) devueltos por getClientIvaCredit */
export interface ClientIvaCreditData {
  cuit: string
  data: {
    periodoFiscal: string
    fechaPresentacion?: string
    debitoFiscal: string | null
    creditoFiscal: string | null
    saldoMesPasado: string | null
    saldoArcaMes: string | null
    saldoTecnicoFavorContribuyente: string | null
    saldoTecnicoFavorContribuyentePosicionMensual: string | null
    saldoLibreDisponibilidadPeriodoAnteriorNeto: string | null
    totalRetencionesPercepcionesPeriodo: string | null
    saldoLibreDisponibilidadFavorContribuyentePeriodo: string | null
    ok: boolean
  } | null
  message?: string
}

interface RenderIvaResumeProps {
  clientId: string
  /** Nombre del cliente para el nombre del archivo Excel. */
  clientName?: string | null
  /** Datos de IVA crédito fiscal del cliente (período anterior). Opcional mientras carga o si no hay datos. */
  clientIva?: ClientIvaCreditData | undefined
  /** Perfil seleccionado en la pestaña IVA (definido en client-detail-page). */
  selectedProfileId?: string | undefined
  /** Se llama cuando cambia el rango de fechas del resumen (para resaltar el scrape del período usado). */
  onDateRangeChange?: (range: { from?: Date; to?: Date }) => void
}

function parseNumeric(value: string | null | undefined): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "cliente"
}

export function RenderIvaResume({
  clientId: _clientId,
  clientName,
  clientIva: clientIvaCredit,
  selectedProfileId,
  onDateRangeChange,
}: RenderIvaResumeProps) {
  const [openDebito, setOpenDebito] = React.useState(true)
  const [openCredito, setOpenCredito] = React.useState(false)
  const [dateRange, setDateRange] = React.useState<DateRange>({
    from: new Date(),
    to: new Date(),
  })

  React.useEffect(() => {
    onDateRangeChange?.(dateRange)
  }, [dateRange.from, dateRange.to, onDateRangeChange])
  const [ajusteVentas, setAjusteVentas] = React.useState(0)
  const [ajusteCompras, setAjusteCompras] = React.useState(0)
  const [ajusteSaldos, setAjusteSaldos] = React.useState(0)
  const [retenciones, setRetenciones] = React.useState(
    mockData.saldosYRetenciones.Retenciones
  )
  const [percepciones, setPercepciones] = React.useState(
    mockData.saldosYRetenciones.Percepciones
  )
  const [percepcionesAduaneras, setPercepcionesAduaneras] = React.useState(
    mockData.saldosYRetenciones["Percepciones Aduaneras"]
  )

  const {
    data: invoicesInRange,
    error: invoicesError,
    isLoading: loadingInvoices,
  } = useQuery({
    queryKey: [
      "invoicesByProfileInRange",
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
    enabled:
      !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  })

  const { data: invoiceStats } = useQuery({
    queryKey: [
      "invoiceStatsByProfile",
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
    enabled:
      !!selectedProfileId && !!dateRange.from && !!dateRange.to,
  })

  React.useEffect(() => {
    console.log("[RenderIvaResume] invoicesInRange", invoicesInRange)
  }, [invoicesInRange])

  // Débito: Neto A y Total B desde stats (ventas tipo A y tipo B)
  const debitoRows = React.useMemo(() => {
    const netoA21 = invoiceStats?.netoA21 ?? mockData.debito["Neto A 21%"]
    const netoA105 = invoiceStats?.netoA105 ?? mockData.debito["Neto A 10,5%"]
    const totalB105 = invoiceStats?.totalAmountB105 ?? mockData.debito["Total B 10,50%"]
    const totalB21 = invoiceStats?.totalAmountB21 ?? mockData.debito["Total B 21%"]
    const totalB27 = invoiceStats?.totalAmountB27 ?? mockData.debito["Total B 27%"]
    return {
      "Neto A 21%": netoA21,
      "Neto A 10,5%": netoA105,
      "Total B 10,50%": totalB105,
      "Total B 21%": totalB21,
      "Total B 27%": totalB27,
    }
  }, [
    invoiceStats?.netoA21,
    invoiceStats?.netoA105,
    invoiceStats?.totalAmountB21,
    invoiceStats?.totalAmountB105,
    invoiceStats?.totalAmountB27,
  ])

  // Crédito / Compras: netos por alícuota desde stats (27%, 21%, 10,5%, 5%, 2,5%)
  const creditoRows = React.useMemo(() => {
    const neto27 = invoiceStats?.netoInbound27 ?? mockData.credito["Compras 27%"]
    const neto21 = invoiceStats?.netoInbound21 ?? mockData.credito["Compras 21%"]
    const neto105 = invoiceStats?.netoInbound105 ?? mockData.credito["Compras 10,50%"]
    const neto5 = invoiceStats?.netoInbound5 ?? mockData.credito["Compras 5% (4,93%)"]
    const neto25 = invoiceStats?.netoInbound25 ?? mockData.credito["Compras 2,5%"]
    return {
      "Compras 27%": neto27,
      "Compras 21%": neto21,
      "Compras 10,50%": neto105,
      "Compras 5% (4,93%)": neto5,
      "Compras 2,5%": neto25,
    }
  }, [
    invoiceStats?.netoInbound27,
    invoiceStats?.netoInbound21,
    invoiceStats?.netoInbound105,
    invoiceStats?.netoInbound5,
    invoiceStats?.netoInbound25,
  ])

  // Débito Fiscal (ventas) = (B6*0.21)+(B7*0.105)+(B9/1.21*0.21)+(B8/1.105*0.105)+(B10/1.27*0.27)+B11
  // B6=Neto A 21%, B7=Neto A 10,5%, B9=Total B 21%, B8=Total B 10,5%, B10=Total B 27%, B11=ajuste ventas
  const debitoFiscalTotal = React.useMemo(() => {
    const B6 = debitoRows["Neto A 21%"]
    const B7 = debitoRows["Neto A 10,5%"]
    const B8 = debitoRows["Total B 10,50%"]
    const B9 = debitoRows["Total B 21%"]
    const B10 = debitoRows["Total B 27%"]
    const B11 = ajusteVentas
    return (
      B6 * 0.21 +
      B7 * 0.105 +
      (B9 / 1.21) * 0.21 +
      (B8 / 1.105) * 0.105 +
      (B10 / 1.27) * 0.27 +
      B11
    )
  }, [debitoRows, ajusteVentas])

  const creditoFiscalTotal =
    invoiceStats != null
      ? (invoiceStats?.creditoFiscalCompras ?? 0) - Math.abs(ajusteCompras)
      : mockData.resumenCredito["Crédito Fiscal"]

  // Saldos y retenciones:
  // - "Saldo a Favor Per. Ant." <- saldoTecnicoFavorContribuyente
  // - "Saldo Libre Disp." <- saldoLibreDisponibilidadFavorContribuyentePeriodo
  // - "Saldo 2° Párrafo" = -(Saldo Libre Disp + Compensaciones + Retenciones + Percepciones + Percepciones Aduaneras) — el cliente lo maneja como negativo
  const saldosYRetenciones = React.useMemo(() => {
    const base = { ...mockData.saldosYRetenciones }
    if (clientIvaCredit?.data) {
      const saldoFavor = parseNumeric(
        clientIvaCredit.data.saldoTecnicoFavorContribuyente
      )
      if (saldoFavor !== null) base["Saldo a Favor Per. Ant."] = saldoFavor
      const saldoLibre = parseNumeric(
        clientIvaCredit.data.saldoLibreDisponibilidadFavorContribuyentePeriodo
      )
      if (saldoLibre !== null) base["Saldo Libre Disp."] = saldoLibre
    }
    base["Saldo Técnico"] =
      debitoFiscalTotal - creditoFiscalTotal - base["Saldo a Favor Per. Ant."]
    const saldoLibreDisp = base["Saldo Libre Disp."] ?? 0
    const compensaciones = base["Compensaciones"] ?? 0
    const sumaSegundoParrafo =
      saldoLibreDisp + compensaciones + retenciones + percepciones + percepcionesAduaneras
    base["Saldo 2° Párrafo"] = -Math.abs(sumaSegundoParrafo)
    return base
  }, [
    clientIvaCredit?.data?.saldoTecnicoFavorContribuyente,
    clientIvaCredit?.data?.saldoLibreDisponibilidadFavorContribuyentePeriodo,
    debitoFiscalTotal,
    creditoFiscalTotal,
    retenciones,
    percepciones,
    percepcionesAduaneras,
  ])

  const totalDebito = sumValues(debitoRows)
  const totalCredito = sumValues(creditoRows) - Math.abs(ajusteCompras)
  // Saldos mostrados: base + valores editables (Retenciones, Percepciones, Percepciones Aduaneras)
  const saldosParaTotal = React.useMemo(
    () => ({
      ...saldosYRetenciones,
      Retenciones: retenciones,
      Percepciones: percepciones,
      "Percepciones Aduaneras": percepcionesAduaneras,
    }),
    [saldosYRetenciones, retenciones, percepciones, percepcionesAduaneras]
  )
  // Total saldos: Saldo a Favor + Saldo Técnico + (los del 2° párrafo como negativos) + Ajuste. Excluimos "Saldo 2° Párrafo" del sumatorio (es solo subtotal).
  const SEGUNDO_PARRAFO_KEYS = [
    "Saldo Libre Disp.",
    "Compensaciones",
    "Retenciones",
    "Percepciones",
    "Percepciones Aduaneras",
  ]
  const totalSaldosYRetenciones = React.useMemo(() => {
    let sum = 0
    for (const [key, value] of Object.entries(saldosParaTotal)) {
      if (key === "Saldo 2° Párrafo") continue
      if (key === "Ajuste") continue
      const num = Number(value)
      if (Number.isNaN(num)) continue
      sum += SEGUNDO_PARRAFO_KEYS.includes(key) ? -Math.abs(num) : num
    }
    return sum - saldosParaTotal.Ajuste + ajusteSaldos
  }, [saldosParaTotal, ajusteSaldos])

  const netoGravadoTotal =
    invoiceStats != null ? totalDebito : mockData.resumenDebito["Neto Gravado"]
  const netoGravadoComprasTotal =
    invoiceStats != null
      ? (invoiceStats?.netoGravadoCompras ?? mockData.resumenCredito["Neto Gravado Compras"])
      : mockData.resumenCredito["Neto Gravado Compras"]

  // Saldo Final = Débito - Crédito + Saldos/Retenciones (simplificado)
  const saldoFinal = debitoFiscalTotal - creditoFiscalTotal + totalSaldosYRetenciones

  const SaldoIconDebito = openDebito ? ChevronUp : ChevronDown
  const SaldoIconCredito = openCredito ? ChevronUp : ChevronDown

  const handleDownloadExcel = React.useCallback(async () => {
    const fromStr =
      dateRange.from?.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) ?? ""
    const toStr =
      dateRange.to?.toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }) ?? ""
    const ARS_NUM_FMT = '"$"#,##0.00;[Red]-"$"#,##0.00'
    const thinBorder = {
      top: { style: "thin" as const },
      left: { style: "thin" as const },
      bottom: { style: "thin" as const },
      right: { style: "thin" as const },
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Resumen IVA", { views: [{ showGridLines: true }] })
    ws.getColumn(1).width = 42
    ws.getColumn(2).width = 22

    let rowNum = 1
    const writeRow = (label: string, value: string | number, isSectionTitle = false) => {
      const row = ws.getRow(rowNum)
      const cellA = row.getCell(1)
      const cellB = row.getCell(2)
      cellA.value = label
      cellB.value = typeof value === "number" && !Number.isNaN(value) ? value : value
      cellA.border = thinBorder
      cellB.border = thinBorder
      if (isSectionTitle) {
        cellA.font = { bold: true }
        cellB.font = { bold: true }
      }
      if (typeof value === "number" && !Number.isNaN(value)) {
        cellB.numFmt = ARS_NUM_FMT
      }
      rowNum++
    }

    writeRow("Resumen IVA", "", true)
    writeRow("Período", `${fromStr} - ${toStr}`)
    rowNum++
    writeRow("Ventas / Débito fiscal", "", true)
    Object.entries(debitoRows).forEach(([label, value]) => writeRow(label, value))
    writeRow("Ajuste", ajusteVentas)
    writeRow("Neto Gravado", netoGravadoTotal)
    writeRow("Débito Fiscal", debitoFiscalTotal)
    rowNum++
    writeRow("Compras / Crédito fiscal", "", true)
    Object.entries(creditoRows).forEach(([label, value]) => writeRow(label, value))
    writeRow("Neto Gravado Compras", netoGravadoComprasTotal)
    writeRow("Crédito Fiscal", creditoFiscalTotal)
    rowNum++
    writeRow("Saldos y retenciones", "", true)
    Object.entries(saldosParaTotal)
      .filter(([label]) => label !== "Ajuste")
      .forEach(([label, value]) => writeRow(label, value as number))
    writeRow("Ajuste", ajusteSaldos)
    rowNum++
    const saldoFinalRow = ws.getRow(rowNum)
    saldoFinalRow.getCell(1).value = "Saldo Final"
    saldoFinalRow.getCell(2).value = saldoFinal
    saldoFinalRow.getCell(1).border = thinBorder
    saldoFinalRow.getCell(2).border = thinBorder
    saldoFinalRow.getCell(1).font = { bold: true }
    saldoFinalRow.getCell(2).font = { bold: true }
    saldoFinalRow.getCell(2).numFmt = ARS_NUM_FMT

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const periodStr = `${fromStr.replace(/\//g, "-")} - ${toStr.replace(/\//g, "-")}`
    a.download = `${sanitizeFilename(clientName ?? "cliente")} - ${periodStr}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
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
  ])

  if (!selectedProfileId) {
    return (
      <Card className="space-y-4">
        <CardContent className="flex items-center justify-center py-10">
          <p className="text-sm text-muted-foreground text-center">
            Seleccioná un perfil en la sección IVA para ver el resumen.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="space-y-4">
      <CardHeader className="pb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Resumen de IVA</CardTitle>
          <CardDescription className="text-xs">
            Detalle de débitos, créditos y saldos del período
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadExcel}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Descargar Excel</span>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="justify-start text-left font-normal min-w-[220px]"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                <span className="text-xs">
                  {dateRange.from && dateRange.to
                    ? `${dateRange.from.toLocaleDateString("es-AR", {
                      year: "2-digit",
                      month: "2-digit",
                      day: "2-digit",
                    })} - ${dateRange.to.toLocaleDateString("es-AR", {
                      year: "2-digit",
                      month: "2-digit",
                      day: "2-digit",
                    })}`
                    : "Seleccionar rango de fechas"}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={dateRange as any}
                onSelect={(range) => {
                  if (!range) return
                  setDateRange({
                    from: range.from ?? dateRange.from,
                    to: range.to ?? range.from ?? dateRange.to,
                  })
                }}
                numberOfMonths={1}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Débito Fiscal / Ventas */}
        <Collapsible open={openDebito} onOpenChange={setOpenDebito}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/60 px-3 py-2 text-sm">
            <div className="flex flex-col gap-0.5 text-left">
              <span className="font-medium">
                Ventas
                <span className="block font-normal">
                  Neto Gravado: {formatCurrency(netoGravadoTotal)}
                </span>
                <span className="block font-normal">
                  Débito Fiscal: {formatCurrency(debitoFiscalTotal)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-sm font-semibold">
                {formatCurrency(totalDebito)}
              </span>
              <SaldoIconDebito className="h-4 w-4 text-muted-foreground" />
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2 rounded-lg bg-muted/40 px-3 py-2">
            {Object.entries(debitoRows).map(([label, value]) => (
              <SectionRow key={label} label={label} value={value} />
            ))}
            <AjusteRow
              value={ajusteVentas}
              onChange={setAjusteVentas}
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Crédito Fiscal / Compras */}
        <Collapsible open={openCredito} onOpenChange={setOpenCredito}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border bg-muted/60 px-3 py-2 text-sm">
            <div className="flex flex-col gap-0.5 text-left">
              <span className="font-medium">
                Compras
                <span className="block font-normal">
                  Neto Gravado: {formatCurrency(netoGravadoComprasTotal)}
                </span>
                <span className="block font-normal">
                  Crédito Fiscal: {formatCurrency(creditoFiscalTotal)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums text-sm font-semibold text-destructive">
                {formatCurrency(-Math.abs(totalCredito))}
              </span>
              <SaldoIconCredito className="h-4 w-4 text-muted-foreground" />
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-2 rounded-lg bg-muted/40 px-3 py-2">
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

        <Separator className="my-1" />

        {/* Saldos y Retenciones */}
        <div className="space-y-1.5">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Saldos y retenciones
          </div>
          {Object.entries(saldosParaTotal)
            .filter(([label]) => label !== "Ajuste")
            .map(([label, value]) =>
              label === "Retenciones" ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={retenciones}
                  onChange={setRetenciones}
                  isNegative
                />
              ) : label === "Percepciones" ? (
                <EditableSaldoRow
                  key={label}
                  label={label}
                  value={percepciones}
                  onChange={setPercepciones}
                  isNegative
                />
              ) : label === "Percepciones Aduaneras" ? (
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
                    value < 0 ? "text-destructive" : "text-foreground"
                  }
                />
              )
            )}
          <AjusteRow
            value={ajusteSaldos}
            onChange={setAjusteSaldos}
          />
        </div>

        <Separator className="my-1" />

        {/* Saldo Final */}
        <div className="rounded-lg border bg-muted/40 px-3 py-3">
          <SectionRow
            label="Saldo Final"
            value={saldoFinal}
            emphasize
            valueClassName={
              saldoFinal < 0 ? "text-destructive" : "text-emerald-600"
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
