'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, ChevronRight, Pencil, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listLiquidacionesByFiltros,
  listImportEmpleados,
  getReciboDetalle,
  getPayrollEmployerConfig,
} from '@/actions/sueldos';
import { getClient } from '@/actions/profile';
import { legajoParaMostrar } from '@/lib/legajo';
import { toTitleCase } from '@/lib/format-name';
import { Button } from '@/components/ui/button';
import { ImprimirRecibosDialog } from '@/components/sueldos/ImprimirRecibosDialog';

const now = new Date();
const ANOS = Array.from({ length: 8 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

interface SueldosReciboProps {
  clientId: string;
  profileId: string;
  initialEmpleadoId?: string;
  onEditRecibo?: (data: {
    importEmpleadoId: string;
    empleadoNombre: string;
    periodo: string;
    tipoRecibo: string;
    quincena?: string | null;
    fechaLiquidacion?: string | null;
    fechaPago?: string | null;
    obraSocialId?: string | null;
    periodoCargas?: string | null;
    fechaDepositoCargas?: string | null;
    observacionInterna?: string | null;
    observacionRecibo?: string | null;
    situacionRevista1Id?: string | null;
    situacionRevista1DiaInicio?: number | null;
    situacionRevista2Id?: string | null;
    situacionRevista2DiaInicio?: number | null;
    situacionRevista3Id?: string | null;
    situacionRevista3DiaInicio?: number | null;
    diasTrabajados?: number | null;
    horasTrabajadas?: number | null;
    importeMaternidadArt13?: string | null;
  }) => void;
}

function tipoReciboLabel(tipo: string | null): string {
  if (!tipo) return 'Sueldo';
  const byTipo: Record<string, string> = {
    sueldo: 'Sueldo',
    anticipo: 'Anticipo',
    SAC: 'SAC',
    vacaciones: 'Vacaciones',
    despido: 'Liquidación final',
    comisiones: 'Comisiones',
    desempleo: 'Fondo de desempleo',
    varios: 'Varios',
  };
  return byTipo[tipo] ?? tipo;
}

function quincenaLabel(q: string | null): string {
  if (q === '1') return '1ra quincena';
  if (q === '2') return '2da quincena';
  return 'Mes completo';
}

function moneyFmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Suma montos de líneas de detalle (mismo criterio que la grilla del recibo). */
function sumaMontosDetalle(
  rows: Array<{ detalle: { monto: string | null | undefined } }>
): number {
  return rows.reduce((acc, r) => {
    const n = Number(r.detalle.monto ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function redondearPesos(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function esCategoriaGerente(v: string | null | undefined): boolean {
  if (!v) return false;
  return v.trim().toLowerCase().includes('gerente');
}

function basicoDesdeDetalle(
  rows: Array<{
    detalle: { codigo: string; monto: string | null };
    concepto?: { numeroSos?: number | null; nombre?: string | null } | null;
    conceptoSos?: { codigo?: string | null; nombre?: string | null } | null;
  }>
): number {
  for (const r of rows) {
    const numSos = r.concepto?.numeroSos ?? null;
    const codDet = (r.detalle.codigo ?? '').trim();
    const codSos = (r.conceptoSos?.codigo ?? '').trim();
    const nombre = `${r.concepto?.nombre ?? ''} ${r.conceptoSos?.nombre ?? ''}`
      .trim()
      .toLowerCase();
    const esBasico =
      numSos === 1 ||
      codDet === '1' ||
      codSos === '1' ||
      nombre.includes('sueldo basico') ||
      nombre.includes('sueldo básico');
    if (!esBasico) continue;
    const monto = Number(r.detalle.monto ?? 0);
    if (Number.isFinite(monto) && monto > 0) return monto;
  }
  return 0;
}

function dateFmt(d: Date | string | null | undefined): string {
  if (d === null || d === undefined || d === '') return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'dd/MM/yyyy');
}

function formaPagoLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const s = String(v).trim().toLowerCase();
  /** Códigos SOS / import (1–4), por si el dato llega sin normalizar del servidor. */
  if (s === '1' || s === 'efectivo') return 'Efectivo';
  if (s === '2' || s === 'acreditacion' || s === 'acreditación') {
    return 'Acreditación';
  }
  if (s === '3' || s === 'cheque') return 'Cheque';
  if (s === '4' || s === 'otro' || s === 'otros') return 'Otro';
  const by: Record<string, string> = {
    efectivo: 'Efectivo',
    cheque: 'Cheque',
    acreditacion: 'Acreditación',
  };
  return by[s] ?? String(v);
}

/** Lectura defensiva: serialización puede exponer camelCase o snake_case; fechas como string ISO. */
function strU(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

function bancoLabel(v: string | null | undefined): string {
  const s = strU(v);
  if (!s) return '—';
  if (s === '_otro banco') return 'Otro banco';
  return s;
}

/** Ignora guiones / placeholders que no son datos reales (import o celdas vacías). */
function valorCabeceraLegible(v: unknown): string | null {
  const s = strU(v);
  if (!s) return null;
  if (s === '—' || s === '-' || s === '–') return null;
  const lower = s.toLowerCase();
  if (lower === 'n/a' || lower === 's/d' || lower === 's.d.') return null;
  return s;
}

function pickCabecera(liquidacion: Record<string, unknown>) {
  const fechaPagoRaw = liquidacion.fechaPago ?? liquidacion.fecha_pago ?? null;
  const fechaLiqRaw = liquidacion.fecha ?? null;
  const lugar =
    valorCabeceraLegible(liquidacion.lugarPago) ??
    valorCabeceraLegible(liquidacion.lugar_pago) ??
    null;
  const bancoVal = valorCabeceraLegible(liquidacion.banco);
  const forma =
    valorCabeceraLegible(liquidacion.formaPago) ??
    valorCabeceraLegible(liquidacion.forma_pago) ??
    null;
  const cbuVal = valorCabeceraLegible(liquidacion.cbu);
  /** Si falta fecha de pago pero hay fecha de liquidación, mostrar esa. */
  const fechaPagoParaMostrar = fechaPagoRaw ?? fechaLiqRaw;
  return {
    lugarPago: lugar,
    banco: bancoVal,
    formaPago: forma,
    cbu: cbuVal,
    fechaPagoParaMostrar,
  };
}

type CabeceraPago = ReturnType<typeof pickCabecera>;

/** Completa con datos del legajo (empleado) cuando el recibo no trae cabecera útil. */
function completarCabeceraConLegajo(
  cab: CabeceraPago,
  empleado: {
    lugarPago?: string | null;
    formaPago?: string | null;
    cbu?: string | null;
    banco?: string | null;
  }
): CabeceraPago {
  return {
    ...cab,
    lugarPago: cab.lugarPago ?? valorCabeceraLegible(empleado.lugarPago),
    banco: cab.banco ?? valorCabeceraLegible(empleado.banco),
    formaPago: cab.formaPago ?? valorCabeceraLegible(empleado.formaPago),
    cbu: cab.cbu ?? valorCabeceraLegible(empleado.cbu),
  };
}

// ─── Número a letras (pesos argentinos) ─────────────────────────────────────
const UNIDADES = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve',
];
const DECENAS = [
  '', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta',
  'ochenta', 'noventa',
];
const CENTENAS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
];

function cientos(n: number): string {
  if (n === 100) return 'cien';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const parteC = CENTENAS[c] ?? '';
  if (resto === 0) return parteC;
  if (resto < 20) return `${parteC} ${UNIDADES[resto]}`.trim();
  const d = Math.floor(resto / 10);
  const u = resto % 10;
  const parteD = DECENAS[d] ?? '';
  const parteU = u > 0 ? ` y ${UNIDADES[u]}` : '';
  return `${parteC} ${parteD}${parteU}`.trim();
}

function miles(n: number): string {
  if (n < 1000) return cientos(n);
  const m = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteM = m === 1 ? 'mil' : `${cientos(m)} mil`;
  if (resto === 0) return parteM;
  return `${parteM} ${cientos(resto)}`;
}

function millones(n: number): string {
  if (n < 1_000_000) return miles(n);
  const m = Math.floor(n / 1_000_000);
  const resto = n % 1_000_000;
  const parteM =
    m === 1 ? 'un millón' : `${miles(m)} millones`;
  if (resto === 0) return parteM;
  return `${parteM} ${miles(resto)}`;
}

function pesoEnLetras(valor: string | number | null | undefined): string {
  if (!valor) return 'cero pesos';
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (Number.isNaN(n) || n < 0) return '—';
  const entero = Math.floor(n);
  const cents = Math.round((n - entero) * 100);
  const parteEntera = entero === 0 ? 'cero' : millones(entero);
  const sufijo = entero === 1 ? 'peso' : 'pesos';
  if (cents === 0) return `${parteEntera} ${sufijo}`;
  return `${parteEntera} ${sufijo} con ${cents}/100`;
}
// ────────────────────────────────────────────────────────────────────────────

type ConceptoTipo =
  | 'remunerativo'
  | 'no_remunerativo'
  | 'descuento'
  | 'retencion';

function clasificarTipo(tipo: string | null | undefined): ConceptoTipo {
  if (tipo === 'remunerativo') return 'remunerativo';
  if (tipo === 'no_remunerativo') return 'no_remunerativo';
  if (tipo === 'retencion') return 'retencion';
  return 'descuento';
}

/**
 * Columna del recibo (SOS Contador): el servidor calcula `tipoColumna` por rango 1–599 / ARCA.
 * Va antes que `tipoLiquidacion` (motor) para no pisar la regla de columnas del recibo.
 */
function columnaConcepto(d: {
  tipoColumna?: ConceptoTipo;
  detalle?: { tipoLiquidacion?: string | null };
  concepto?: { tipo?: string | null } | null;
}): ConceptoTipo {
  if (
    d.tipoColumna === 'remunerativo' ||
    d.tipoColumna === 'no_remunerativo' ||
    d.tipoColumna === 'descuento' ||
    d.tipoColumna === 'retencion'
  ) {
    return d.tipoColumna;
  }
  const tl = d.detalle?.tipoLiquidacion;
  if (
    tl === 'remunerativo' ||
    tl === 'no_remunerativo' ||
    tl === 'descuento' ||
    tl === 'retencion'
  ) {
    return tl;
  }
  return clasificarTipo(d.concepto?.tipo ?? null);
}

// ─── Celda de la grilla del documento ───────────────────────────────────────
function DocCell({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col px-2 py-1 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="mt-0.5 text-sm font-medium leading-tight">{value || '—'}</span>
    </div>
  );
}

export function SueldosRecibo({ clientId, profileId, initialEmpleadoId, onEditRecibo }: SueldosReciboProps) {
  const [ano, setAno] = useState('');
  const [mes, setMes] = useState('');
  const [empleadoId, setEmpleadoId] = useState(initialEmpleadoId ?? '');
  const [reciboId, setReciboId] = useState('');
  const [showImprimir, setShowImprimir] = useState(false);

  useEffect(() => {
    if (initialEmpleadoId) {
      setEmpleadoId(initialEmpleadoId);
      setAno('');
      setMes('');
      setReciboId('');
    }
  }, [initialEmpleadoId]);

  const periodo = useMemo(
    () => (ano && mes ? `${ano}-${mes}` : ''),
    [ano, mes]
  );

  const hayFiltro = !!periodo || !!empleadoId;

  const resetFiltros = useCallback(() => {
    setAno('');
    setMes('');
    setEmpleadoId('');
    setReciboId('');
  }, []);

  const { data: clientData } = useQuery({
    queryKey: ['client', profileId],
    queryFn: () => getClient({ data: { id: profileId } }),
    enabled: !!profileId,
  });

  const { data: empleadosRaw = [] } = useQuery({
    queryKey: ['import-empleados', clientId, profileId],
    queryFn: () => listImportEmpleados({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  // Solo empleados activos para los selectores y el PDF
  const empleados = useMemo(
    () => empleadosRaw.filter((e) => e.empleado.activo),
    [empleadosRaw]
  );

  const { data: recibos = [], isLoading: loadingList } = useQuery({
    queryKey: ['liquidaciones-filtros', clientId, profileId, periodo, empleadoId],
    queryFn: () =>
      listLiquidacionesByFiltros({
        data: {
          clientId,
          profileId,
          ...(periodo ? { periodo } : {}),
          ...(empleadoId ? { importEmpleadoId: empleadoId } : {}),
        },
      }),
    enabled: !!clientId && !!profileId && hayFiltro,
  });

  const { data: detalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ['recibo-detalle', reciboId, clientId],
    queryFn: () =>
      getReciboDetalle({ data: { liquidacionId: reciboId, clientId } }),
    enabled: !!reciboId && !!clientId,
  });

  const { data: employerConfig } = useQuery({
    queryKey: ['payroll-employer-config', clientId, profileId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const firmaEmpleadorUrl = employerConfig?.firmaEmpleadorUrl ?? null;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Recibos liquidados
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Filtrá por período (mes + año) y/o por empleado. Podés usar solo empleado para ver todos sus recibos.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setShowImprimir(true)}
            >
              <Printer className="h-4 w-4" />
              Imprimir PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          {/* Año */}
          <div>
            <label className="mb-2 block text-sm font-medium">Año</label>
            <Select
              value={ano || '__all'}
              onValueChange={(v) => {
                setAno(v === '__all' ? '' : v);
                setMes('');
                setReciboId('');
              }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los años</SelectItem>
                {ANOS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mes (solo relevante si hay año) */}
          <div>
            <label className="mb-2 block text-sm font-medium">Mes</label>
            <Select
              value={mes || '__all'}
              onValueChange={(v) => {
                setMes(v === '__all' ? '' : v);
                setReciboId('');
              }}
              disabled={!ano}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">
                  {ano ? 'Todos los meses' : '—'}
                </SelectItem>
                {MESES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Empleado */}
          <div>
            <label className="mb-2 block text-sm font-medium">Empleado</label>
            <Select
              value={empleadoId || '__all'}
              onValueChange={(v) => {
                setEmpleadoId(v === '__all' ? '' : v);
                setReciboId('');
              }}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los empleados</SelectItem>
                {empleados.map((e) => (
                  <SelectItem key={e.empleado.id} value={e.empleado.id}>
                    {toTitleCase(e.empleado.nombre)}
                    {e.empleado.legajo
                      ? ` (Leg. ${legajoParaMostrar(e.empleado.legajo)})`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Limpiar */}
          {(ano || empleadoId) && (
            <button
              type="button"
              onClick={resetFiltros}
              className="mb-0.5 text-xs text-muted-foreground underline hover:text-foreground"
            >
              Limpiar filtros
            </button>
          )}
        </CardContent>
      </Card>

      {/* ── Lista de resultados ───────────────────────────────────────────── */}
      {hayFiltro && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {loadingList
                ? 'Buscando…'
                : recibos.length === 0
                  ? 'Sin resultados'
                  : `${recibos.length} recibo${recibos.length !== 1 ? 's' : ''} encontrado${recibos.length !== 1 ? 's' : ''}`}
            </CardTitle>
          </CardHeader>
          {!loadingList && recibos.length > 0 && (
            <CardContent className="p-0">
              <div className="divide-y">
                {recibos.map((r) => {
                  const isSelected = r.liquidacion.id === reciboId;
                  return (
                    <button
                      key={r.liquidacion.id}
                      type="button"
                      onClick={() =>
                        setReciboId(
                          isSelected ? '' : r.liquidacion.id
                        )
                      }
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 ${
                        isSelected ? 'bg-muted/60 font-medium' : ''
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-medium truncate">
                          {toTitleCase(r.empleado.nombre)}
                          {r.empleado.legajo && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              Leg. {legajoParaMostrar(r.empleado.legajo)}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {r.liquidacion.periodo} · {tipoReciboLabel(r.liquidacion.tipo)}
                          {r.liquidacion.quincena
                            ? ` · ${quincenaLabel(r.liquidacion.quincena)}`
                            : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        {r.liquidacion.neto && (
                          <span className="text-sm tabular-nums font-medium">
                            ${Math.ceil(Number(r.liquidacion.neto)).toLocaleString('es-AR')}
                          </span>
                        )}
                        {onEditRecibo && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditRecibo({
                                importEmpleadoId: r.empleado.id,
                                empleadoNombre: r.empleado.nombre,
                                periodo: r.liquidacion.periodo,
                                tipoRecibo: r.liquidacion.tipo ?? 'sueldo',
                                quincena: r.liquidacion.quincena,
                                fechaLiquidacion: r.liquidacion.fecha ? (r.liquidacion.fecha instanceof Date ? r.liquidacion.fecha.toISOString().slice(0, 10) : String(r.liquidacion.fecha).slice(0, 10)) : null,
                                fechaPago: r.liquidacion.fechaPago ? (r.liquidacion.fechaPago instanceof Date ? r.liquidacion.fechaPago.toISOString().slice(0, 10) : String(r.liquidacion.fechaPago).slice(0, 10)) : null,
                                obraSocialId: r.liquidacion.obraSocialId,
                                periodoCargas: r.liquidacion.periodoCargas,
                                fechaDepositoCargas: r.liquidacion.fechaDepositoCargas ? (r.liquidacion.fechaDepositoCargas instanceof Date ? r.liquidacion.fechaDepositoCargas.toISOString().slice(0, 10) : String(r.liquidacion.fechaDepositoCargas).slice(0, 10)) : null,
                                observacionInterna: r.liquidacion.observacionInterna,
                                observacionRecibo: r.liquidacion.observacionRecibo,
                                situacionRevista1Id: r.liquidacion.situacionRevista1Id,
                                situacionRevista1DiaInicio: r.liquidacion.situacionRevista1DiaInicio,
                                situacionRevista2Id: r.liquidacion.situacionRevista2Id,
                                situacionRevista2DiaInicio: r.liquidacion.situacionRevista2DiaInicio,
                                situacionRevista3Id: r.liquidacion.situacionRevista3Id,
                                situacionRevista3DiaInicio: r.liquidacion.situacionRevista3DiaInicio,
                                diasTrabajados: r.liquidacion.diasTrabajados,
                                horasTrabajadas: r.liquidacion.horasTrabajadas,
                                importeMaternidadArt13: r.liquidacion.importeMaternidadArt13,
                              });
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Editar recibo"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isSelected ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── Dialog: imprimir PDF ─────────────────────────────────────────── */}
      <ImprimirRecibosDialog
        open={showImprimir}
        onOpenChange={setShowImprimir}
        clientId={clientId}
        profileId={profileId}
        clientData={clientData ?? null}
        firmaEmpleadorUrl={firmaEmpleadorUrl}
        empleados={empleados}
      />

      {/* ── Recibo detalle ───────────────────────────────────────────────── */}
      {reciboId && (
        <>
          {loadingDetalle ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground">Cargando…</p>
              </CardContent>
            </Card>
          ) : !detalle ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-muted-foreground">
                  No se encontró el recibo.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ReciboDocumento detalle={detalle} clientData={clientData ?? null} firmaEmpleadorUrl={firmaEmpleadorUrl} />
          )}
        </>
      )}
    </div>
  );
}

// ─── Componente del documento recibo ────────────────────────────────────────
type DetalleType = NonNullable<
  Awaited<ReturnType<typeof getReciboDetalle>>
>;
type ClientData = Awaited<ReturnType<typeof getClient>>;

function ReciboDocumento({
  detalle,
  clientData,
  firmaEmpleadorUrl,
}: {
  detalle: DetalleType;
  clientData: ClientData | null;
  firmaEmpleadorUrl: string | null;
}) {
  const {
    liquidacion,
    empleado,
    convenio,
    categoria,
    obraSocial,
    detalles,
    basicoCalculado,
    basicoEscalaCategoria,
  } = detalle;

  const basicoCalculadoNum = Number(basicoCalculado ?? 0);
  const basicoEscalaNum = Number(basicoEscalaCategoria ?? 0);
  const basicoLiquidacionNum = Number(liquidacion.basico ?? 0);
  const basicoDetalleNum = basicoDesdeDetalle(detalles);
  const esGerente =
    esCategoriaGerente(categoria?.nombre) || esCategoriaGerente(empleado.categoria);
  const mostrarBasicoEscalaGerente =
    esGerente &&
    Number.isFinite(basicoCalculadoNum) &&
    basicoCalculadoNum <= 0 &&
    Number.isFinite(basicoEscalaNum) &&
    basicoEscalaNum > 0;
  const basicoMostrado = mostrarBasicoEscalaGerente
    ? basicoEscalaNum
    : esGerente && basicoCalculadoNum <= 0
      ? basicoLiquidacionNum > 0
        ? basicoLiquidacionNum
        : basicoDetalleNum > 0
          ? basicoDetalleNum
          : basicoCalculado
      : basicoCalculado;

  // Clasificar conceptos por tipo (solo los activos)
  const conceptosActivos = detalles.filter((d) => d.detalle.activoEnRecibo);
  const haberesCon = conceptosActivos.filter(
    (d) => columnaConcepto(d) === 'remunerativo'
  );
  const haberesSin = conceptosActivos.filter(
    (d) => columnaConcepto(d) === 'no_remunerativo'
  );
  const descuentos = conceptosActivos.filter(
    (d) => columnaConcepto(d) === 'descuento'
  );
  const retenciones = conceptosActivos.filter(
    (d) => columnaConcepto(d) === 'retencion'
  );

  // Filas de la tabla: unimos los 4 grupos en orden
  const filas = [
    ...haberesCon.map((d) => ({ ...d, col: 'hab' as const })),
    ...descuentos.map((d) => ({ ...d, col: 'desc' as const })),
    ...retenciones.map((d) => ({ ...d, col: 'ret' as const })),
    ...haberesSin.map((d) => ({ ...d, col: 'noRem' as const })),
  ];

  /**
   * Totales por columna = suma de las filas visibles (reglas SOS / tipoColumna).
   * No usar solo liquidacion.haberes/descuentos/…: el motor puede clasificar distinto
   * y quedar en 0 en el encabezado aunque haya importes en la grilla.
   */
  const totalHaberes = redondearPesos(sumaMontosDetalle(haberesCon));
  const totalDescuentos = redondearPesos(sumaMontosDetalle(descuentos));
  const totalRetenciones = redondearPesos(sumaMontosDetalle(retenciones));
  const totalNoRemunerativo = redondearPesos(sumaMontosDetalle(haberesSin));
  const netoRaw = redondearPesos(
    totalHaberes +
      totalNoRemunerativo -
      totalDescuentos -
      totalRetenciones
  );
  const redondeo = netoRaw > 0 && netoRaw % 1 > 0.001 ? Math.ceil(netoRaw) - netoRaw : 0;
  const neto = redondeo > 0 ? Math.ceil(netoRaw) : netoRaw;

  const cab = completarCabeceraConLegajo(
    pickCabecera(liquidacion as unknown as Record<string, unknown>),
    empleado
  );

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[700px] rounded-md border border-border bg-background text-sm shadow-sm">

        {/* ── ENCABEZADO ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 border-b border-border">
          {/* Empresa (izquierda) */}
          <div className="flex flex-col justify-center gap-1 border-r border-border px-5 py-4">
            <span className="text-xl font-bold leading-tight">
              {toTitleCase(clientData?.name) || '—'}
            </span>
            {clientData?.address && (
              <span className="text-sm text-muted-foreground">
                {clientData.address}
              </span>
            )}
            <span className="text-sm font-medium text-muted-foreground">
              CUIT: {clientData?.identityNumber ?? '—'}
            </span>
          </div>
          {/* Título + grilla pago (derecha) */}
          <div className="flex flex-col">
            <div className="border-b border-border px-4 py-2 text-center">
              <span className="text-base font-bold uppercase tracking-widest">
                Recibo de Haberes
              </span>
              <span className="ml-3 text-sm font-medium text-muted-foreground">
                — {tipoReciboLabel(liquidacion.tipo)}
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border">
              <DocCell label="Período a pagar" value={liquidacion.periodo} />
              <DocCell label="Fecha de pago" value={dateFmt(cab.fechaPagoParaMostrar)} />
              <DocCell label="Lugar de pago" value={cab.lugarPago ?? '—'} />
              <DocCell
                label="Banco"
                value={bancoLabel(cab.banco)}
                className="border-t border-border"
              />
              <DocCell
                label="Forma de pago"
                value={formaPagoLabel(cab.formaPago)}
                className="border-t border-border"
              />
              <DocCell
                label="CBU / Cuenta"
                value={cab.cbu ?? '—'}
                className="border-t border-border"
              />
            </div>
          </div>
        </div>

        {/* ── FILA 1 EMPLEADO: Categoría | Tipo de liquidación ───────────── */}
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <DocCell label="Categoría" value={empleado.categoria ? toTitleCase(empleado.categoria) : (categoria?.nombre ?? '—')} />
          <DocCell
            label="Tipo de liquidación"
            value={`${tipoReciboLabel(liquidacion.tipo)} — ${quincenaLabel(liquidacion.quincena)}`}
          />
        </div>

        {/* ── FILA 2 EMPLEADO: Legajo | Apellido y Nombre | Ingreso | CUIL | Básico */}
        <div className="grid grid-cols-[100px_1fr_120px_160px_140px] divide-x divide-border border-b border-border">
          <DocCell
            label="Legajo"
            value={legajoParaMostrar(
              empleado.legajo ?? detalle.importLegajo ?? null
            )}
          />
          <DocCell
            label="Apellido y Nombres"
            value={toTitleCase(empleado.nombre)}
          />
          <DocCell
            label="Fecha de ingreso"
            value={dateFmt(empleado.fechaAlta)}
          />
          <DocCell label="CUIL" value={empleado.cuil} />
          <DocCell label="Sueldo básico" value={`$${moneyFmt(basicoMostrado)}`} />
        </div>

        {/* ── FILA 3 EMPLEADO: Convenio | Modalidad | Obra Social ─────────── */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <DocCell
            label="Convenio"
            value={
              convenio
                ? convenio.cctCodigo
                  ? `${(convenio.nombre ?? '').replace(convenio.cctCodigo, '').trim()} (CCT ${convenio.cctCodigo})`
                  : convenio.nombre
                : '—'
            }
          />
          <DocCell
            label="Modalidad"
            value={empleado.tipoJornada === 'full_time' ? 'Tiempo completo' : 'Tiempo parcial'}
          />
          <DocCell
            label="Obra social"
            value={
              obraSocial
                ? `${obraSocial.codigo} ${obraSocial.nombre}`
                : '—'
            }
          />
        </div>

        {/* ── TABLA DE CONCEPTOS ──────────────────────────────────────────── */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-[70px] px-2 py-2 text-left">Código</th>
              <th className="px-2 py-2 text-left">Descripción del concepto</th>
              <th className="w-[70px] px-2 py-2 text-right">Cant.</th>
              <th className="w-[140px] border-l border-border px-2 py-2 text-right">
                Haberes
              </th>
              <th className="w-[140px] border-l border-border px-2 py-2 text-right">
                Descuentos
              </th>
              <th className="w-[140px] border-l border-border px-2 py-2 text-right">
                Retenciones
              </th>
              <th className="w-[140px] border-l border-border px-2 py-2 text-right">
                No remunerativo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filas.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-2 py-4 text-center text-sm text-muted-foreground"
                >
                  Sin conceptos cargados
                </td>
              </tr>
            ) : (
              filas.map(({ detalle: det, concepto, conceptoAfip, conceptoSos, col }) => (
                <tr key={det.id} className="hover:bg-muted/20">
                  <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                    {det.codigo}
                  </td>
                  <td className="px-2 py-1">
                    {(det.memo && !det.memo.startsWith('source=') && !det.memo.includes('calc_error='))
                      ? det.memo
                      : (concepto?.nombre ??
                          conceptoAfip?.descripcion ??
                          conceptoSos?.nombre ??
                          det.codigo)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {det.cantidad ? moneyFmt(det.cantidad) : '—'}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {det.porcentaje ? moneyFmt(det.porcentaje) : '—'}
                  </td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">
                    {col === 'hab' ? moneyFmt(det.monto) : ''}
                  </td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">
                    {col === 'desc' ? moneyFmt(det.monto) : ''}
                  </td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">
                    {col === 'ret' ? moneyFmt(det.monto) : ''}
                  </td>
                  <td className="border-l border-border/50 px-2 py-1 text-right tabular-nums">
                    {col === 'noRem' ? moneyFmt(det.monto) : ''}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {/* ── Fila de totales ─────────────────────────────────────────── */}
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold">
              <td colSpan={4} className="px-2 py-2 uppercase tracking-wide text-xs">
                Totales
              </td>
              <td className="border-l border-border px-2 py-2 text-right tabular-nums">
                {moneyFmt(totalHaberes)}
              </td>
              <td className="border-l border-border px-2 py-2 text-right tabular-nums">
                {moneyFmt(totalDescuentos)}
              </td>
              <td className="border-l border-border px-2 py-2 text-right tabular-nums">
                {moneyFmt(totalRetenciones)}
              </td>
              <td className="border-l border-border px-2 py-2 text-right tabular-nums">
                {moneyFmt(totalNoRemunerativo)}
              </td>
            </tr>
            {redondeo > 0 && (
              <>
                <tr className="border-t border-border text-xs text-muted-foreground">
                  <td colSpan={7} className="px-2 py-1.5 text-right">Neto sin redondeo</td>
                  <td className="border-l border-border px-2 py-1.5 text-right tabular-nums font-medium">
                    {moneyFmt(netoRaw)}
                  </td>
                </tr>
                <tr className="border-t border-border text-xs italic text-muted-foreground">
                  <td colSpan={7} className="px-2 py-1.5 text-right">Redondeo</td>
                  <td className="border-l border-border px-2 py-1.5 text-right tabular-nums font-medium">
                    +{moneyFmt(redondeo)}
                  </td>
                </tr>
                <tr className="border-t-2 border-border bg-muted/30 text-sm font-bold">
                  <td colSpan={7} className="px-2 py-2 text-right uppercase tracking-wide text-xs">
                    Total neto
                  </td>
                  <td className="border-l border-border px-2 py-2 text-right tabular-nums">
                    {moneyFmt(neto)}
                  </td>
                </tr>
              </>
            )}
          </tfoot>
        </table>

        {/* ── NETO ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t-2 border-border bg-muted/10 px-4 py-3">
          <span className="text-sm text-muted-foreground">
            Son{' '}
            <span className="font-medium capitalize text-foreground">
              {pesoEnLetras(neto)}
            </span>
          </span>
          <span className="text-base font-bold">
            Total neto: ${moneyFmt(neto)}
          </span>
        </div>

        {/* ── OBSERVACIÓN ─────────────────────────────────────────────────── */}
        {liquidacion.observacionRecibo && (
          <div className="border-t border-border px-4 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Observación:
            </span>{' '}
            <span className="text-sm">{liquidacion.observacionRecibo}</span>
          </div>
        )}

        {/* ── FIRMAS ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 divide-x divide-border border-t border-border">
          <div className="flex flex-col items-center gap-4 px-8 py-6">
            {firmaEmpleadorUrl ? (
              <img
                src={firmaEmpleadorUrl}
                alt="Firma del empleador"
                className="h-16 max-w-[240px] object-contain"
              />
            ) : (
              <div className="h-16 w-full" />
            )}
            <div className="w-full border-t border-foreground/40 pt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Firma y sello del empleador
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 px-8 py-6">
            <div className="h-16 w-full" />
            <div className="w-full border-t border-foreground/40 pt-1 text-center text-xs uppercase tracking-widest text-muted-foreground">
              Firma del empleado
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
