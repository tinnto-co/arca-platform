'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Loader2,
  Calendar,
  Trash2,
  Zap,
  Upload,
  FileCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listLiquidacionesByPeriodo,
  listEmpleados,
  listImportEmpleados,
  listConvenios,
  getProfileSueldosConfig,
  calcularLiquidacionMasiva,
  type LiquidacionMasivaErrorCode,
  updateEmpleado,
  eliminarLiquidacion,
  eliminarLiquidacionesDelPeriodo,
} from '@/actions/sueldos';
import {
  getPeriodoMesAnterior,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';
import { legajoParaMostrar } from '@/lib/legajo';
import { toTitleCase } from '@/lib/format-name';

const now = new Date();
const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] =
  getPeriodoMesAnterior().split('-');
const ANOS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

function compareLegajoAsc(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const aTrim = (a ?? '').trim();
  const bTrim = (b ?? '').trim();
  const aNum = /^\d+$/.test(aTrim) ? Number(aTrim) : null;
  const bNum = /^\d+$/.test(bTrim) ? Number(bTrim) : null;
  if (aNum != null && bNum != null) return aNum - bNum;
  if (aNum != null) return -1;
  if (bNum != null) return 1;
  return aTrim.localeCompare(bTrim, 'es', { sensitivity: 'base' });
}

interface SueldosDashboardProps {
  clientId: string;
  profileId: string;
}

type LiquidacionMasivaResultItem = {
  empleadoId: string;
  empleadoNombre: string;
  legajo: string;
  ok: boolean;
  skipped?: boolean;
  errorCode?: LiquidacionMasivaErrorCode;
  error?: string;
};

export function SueldosDashboard({
  clientId,
  profileId,
}: SueldosDashboardProps) {
  const queryClient = useQueryClient();
  const [ano, setAno] = useState(PERIODO_INICIAL_ANO);
  const [mes, setMes] = useState(PERIODO_INICIAL_MES);
  const periodo = useMemo(() => `${ano}-${mes}`, [ano, mes]);
  const permiteLiquidar = puedeLiquidarPeriodo(periodo);
  const mesesDisponibles = ano === PERIODO_INICIAL_ANO
    ? MESES.filter((m) => m.value <= PERIODO_INICIAL_MES)
    : MESES;

  const liquidacionesQuery = useQuery({
    queryKey: ['liquidaciones', clientId, profileId, periodo],
    queryFn: () =>
      listLiquidacionesByPeriodo({ data: { clientId, profileId, periodo } }),
    enabled: !!clientId && !!profileId,
  });
  const { data: liquidaciones = [], isLoading: loadingLiq } = liquidacionesQuery;

  const empleadosQuery = useQuery({
    queryKey: ['empleados', clientId, profileId],
    queryFn: () => listEmpleados({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const { data: empleados = [] } = empleadosQuery;

  const importEmpleadosQuery = useQuery({
    queryKey: ['import-empleados', clientId, profileId],
    queryFn: () => listImportEmpleados({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const { data: importEmpleados = [] } = importEmpleadosQuery;

  const sueldosQueryError =
    liquidacionesQuery.isError ||
    empleadosQuery.isError ||
    importEmpleadosQuery.isError;
  const sueldosErrorMessage =
    (liquidacionesQuery.error as Error | undefined)?.message ||
    (empleadosQuery.error as Error | undefined)?.message ||
    (importEmpleadosQuery.error as Error | undefined)?.message ||
    'Error desconocido';

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId, profileId],
    queryFn: () => listConvenios({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const { data: profileSueldosConfig } = useQuery({
    queryKey: ['profile-sueldos-config', clientId, profileId],
    queryFn: () => getProfileSueldosConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const usaLsdReferencia = profileSueldosConfig?.usaLsdReferencia ?? false;

  const empleadosConReciboGenerado = useMemo(() => {
    const set = new Set<string>();
    for (const l of liquidaciones) {
      if (
        l.liquidacion.periodo === periodo &&
        l.liquidacion.tipo === 'sueldo' &&
        l.liquidacion.origen === 'generado'
      ) {
        set.add(l.empleado.id);
      }
    }
    return set;
  }, [liquidaciones, periodo]);

  const empleadosPendientesMasiva = useMemo(
    () =>
      [...empleados]
        .filter(
          (e) => {
            if (!e.empleado.activo) return false;
            if (usaLsdReferencia) {
              return !empleadosConReciboGenerado.has(e.empleado.id);
            }
            return !liquidaciones.some(
              (l) =>
                l.empleado.id === e.empleado.id &&
                l.liquidacion.periodo === periodo &&
                l.liquidacion.tipo === 'sueldo'
            );
          }
        )
        .sort((a, b) => {
          const byLegajo = compareLegajoAsc(
            a.empleado.legajo,
            b.empleado.legajo
          );
          if (byLegajo !== 0) return byLegajo;
          return a.empleado.nombre.localeCompare(b.empleado.nombre, 'es', {
            sensitivity: 'base',
          });
        }),
    [empleados, empleadosConReciboGenerado, liquidaciones, periodo, usaLsdReferencia]
  );

  const liquidacionMasiva = useMutation({
    mutationFn: (p: string) =>
      calcularLiquidacionMasiva({ data: { clientId, profileId, periodo: p } }),
    onSuccess: (payload) => {
      const { summary, results } = payload;
      const { ok, fail, skipped } = summary;
      const fallidos = results.filter((r) => !r.ok);
      setErroresMasiva(fallidos);
      setErroresMasivaOpen(fallidos.length > 0);
      if (fail === 0) {
        if (skipped > 0) {
          toast.success(
            `Liquidación masiva: ${ok - skipped} procesados, ${skipped} omitidos por recibo generado.`
          );
        } else {
          toast.success(`Liquidación masiva: ${ok} empleados procesados.`);
        }
      } else {
        toast.warning(`${ok} OK, ${fail} con error. Revisar datos.`);
      }
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, profileId, periodo],
      });
    },
    onError: () => toast.error('Error al ejecutar liquidación masiva'),
  });
  const actualizarConvenioEmpleado = useMutation({
    mutationFn: (data: { empleadoId: string; convenioId: string }) =>
      updateEmpleado({
        data: {
          id: data.empleadoId,
          clientId,
          convenioId: data.convenioId,
        },
      }),
  });

  const [deleteLiquidacionesOpen, setDeleteLiquidacionesOpen] = useState(false);
  const [confirmMasivaOpen, setConfirmMasivaOpen] = useState(false);
  const [convenioByEmpleado, setConvenioByEmpleado] = useState<
    Record<string, string>
  >({});
  const [erroresMasiva, setErroresMasiva] = useState<LiquidacionMasivaResultItem[]>(
    []
  );
  const [erroresMasivaOpen, setErroresMasivaOpen] = useState(false);
  const [liquidacionToDelete, setLiquidacionToDelete] = useState<{
    id: string;
    empleadoNombre: string;
  } | null>(null);

  const empleadosSinConvenio = useMemo(
    () =>
      empleadosPendientesMasiva.filter((e) => !e.empleado.convenioId).map((e) => e.empleado),
    [empleadosPendientesMasiva]
  );

  const faltanConvenios = empleadosSinConvenio.some(
    (e) => !convenioByEmpleado[e.id]
  );
  const copiarErroresMasiva = async () => {
    if (erroresMasiva.length === 0) return;
    const lines = erroresMasiva.map(
      (r) =>
        `${r.empleadoNombre} | Legajo: ${r.legajo || '—'} | ${
          r.errorCode ?? 'OTRO'
        } | ${r.error ?? 'Error desconocido'}`
    );
    const text = [`Errores liquidación masiva (${periodo})`, ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Detalle de errores copiado al portapapeles.');
    } catch {
      toast.error('No se pudo copiar el detalle de errores.');
    }
  };

  const abrirConfirmacionMasiva = () => {
    const next: Record<string, string> = {};
    for (const e of empleadosPendientesMasiva) {
      if (e.empleado.convenioId) next[e.empleado.id] = e.empleado.convenioId;
    }
    setConvenioByEmpleado(next);
    setConfirmMasivaOpen(true);
  };

  const confirmarLiquidacionMasiva = async () => {
    if (faltanConvenios) {
      toast.warning('Completá convenio en todos los empleados pendientes.');
      return;
    }
    try {
      for (const e of empleadosSinConvenio) {
        const convenioId = convenioByEmpleado[e.id];
        if (!convenioId) continue;
        await actualizarConvenioEmpleado.mutateAsync({
          empleadoId: e.id,
          convenioId,
        });
      }
      await liquidacionMasiva.mutateAsync(periodo);
      setConfirmMasivaOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo preparar la liquidación masiva'
      );
    }
  };
  const eliminarLiquidaciones = useMutation({
    mutationFn: () =>
      eliminarLiquidacionesDelPeriodo({ data: { clientId, periodo } }),
    onSuccess: (result) => {
      setDeleteLiquidacionesOpen(false);
      toast.success(
        result.deleted > 0
          ? `Se eliminaron ${result.deleted} liquidación(es) del período ${periodo}.`
          : 'No había liquidaciones para eliminar.'
      );
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, profileId, periodo],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al eliminar'),
  });
  const eliminarLiquidacionItem = useMutation({
    mutationFn: (liquidacionId: string) =>
      eliminarLiquidacion({ data: { clientId, liquidacionId } }),
    onSuccess: () => {
      setLiquidacionToDelete(null);
      toast.success('Liquidación eliminada.');
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, profileId, periodo],
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'Error al eliminar la liquidación'
      ),
  });

  const totalNeto = liquidaciones.reduce(
    (acc, l) => acc + Number(l.liquidacion.neto),
    0
  );
  const totalBruto = liquidaciones.reduce(
    (acc, l) =>
      acc +
      Number(l.liquidacion.haberes) +
      Number(l.liquidacion.noRemunerativo || 0),
    0
  );
  const liquidacionesGeneradas = liquidaciones.filter(
    (l) => l.liquidacion.origen === 'generado'
  );
  const liquidacionesImportadasLsd = liquidaciones.filter(
    (l) => l.liquidacion.origen === 'import'
  );

  return (
    <div className="space-y-0">
      {sueldosQueryError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>No se pudieron cargar los datos de sueldos</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{sueldosErrorMessage}</p>
            <p>
              Si el error menciona columnas en{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                liquidacion_import_empleado
              </code>
              , ejecutá en la carpeta del proyecto{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                npm run db:ensure-empleado-pago
              </code>{' '}
              (necesita <code className="font-mono text-xs">DATABASE_URL</code> en
              .env). Es seguro repetirlo: solo agrega columnas si faltan.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Control row */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar style={{ width: 15, height: 15, color: '#9B9CA3' }} />
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-[100px] shadow-none focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] h-auto w-[140px] shadow-none focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mesesDisponibles.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!permiteLiquidar && (
            <span className="text-xs" style={{ color: '#9B9CA3' }}>
              No se puede liquidar meses futuros.
            </span>
          )}
          <button
            type="button"
            onClick={abrirConfirmacionMasiva}
            disabled={
              liquidacionMasiva.isPending ||
              actualizarConvenioEmpleado.isPending ||
              empleados.length === 0 ||
              !permiteLiquidar
            }
            className="inline-flex items-center gap-2 bg-[#12131A] text-white rounded-[10px] px-[17px] py-[10px] text-[13.5px] font-semibold hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {liquidacionMasiva.isPending ? (
              <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
            ) : (
              <Zap style={{ width: 15, height: 15 }} />
            )}
            Liquidación masiva
          </button>
        </div>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-4 border-t border-b border-[#ECEAE3] py-6 mb-[44px]">
        {/* Col 1 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Users style={{ width: 15, height: 15, color: '#9B9CA3' }} />
            <span style={{ fontSize: '12.5px', color: '#6E7079', fontWeight: 500 }}>Empleados activos</span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-semibold tabular-nums"
            style={{ fontSize: 30, letterSpacing: '-0.025em', color: '#12131A', lineHeight: 1.1, marginTop: 4 }}
          >
            {importEmpleados.filter((e) => e.empleado.activo).length}
          </div>
        </div>
        {/* Col 2 */}
        <div className="flex flex-col gap-1 border-l border-[#ECEAE3] pl-7">
          <div className="flex items-center gap-1.5">
            <FileText style={{ width: 15, height: 15, color: '#9B9CA3' }} />
            <span style={{ fontSize: '12.5px', color: '#6E7079', fontWeight: 500 }}>Liquidaciones (período)</span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-semibold tabular-nums"
            style={{ fontSize: 30, letterSpacing: '-0.025em', color: '#12131A', lineHeight: 1.1, marginTop: 4 }}
          >
            {loadingLiq ? '—' : liquidaciones.length}
          </div>
        </div>
        {/* Col 3 */}
        <div className="flex flex-col gap-1 border-l border-[#ECEAE3] pl-7">
          <div className="flex items-center gap-1.5">
            <Calculator style={{ width: 15, height: 15, color: '#9B9CA3' }} />
            <span style={{ fontSize: '12.5px', color: '#6E7079', fontWeight: 500 }}>Total bruto</span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-semibold tabular-nums"
            style={{ fontSize: 30, letterSpacing: '-0.025em', color: '#12131A', lineHeight: 1.1, marginTop: 4 }}
          >
            {loadingLiq ? '—' : `$${Math.ceil(totalBruto).toLocaleString('es-AR')}`}
          </div>
        </div>
        {/* Col 4 */}
        <div className="flex flex-col gap-1 border-l border-[#ECEAE3] pl-7">
          <div className="flex items-center gap-1.5">
            <LayoutDashboard style={{ width: 15, height: 15, color: '#9B9CA3' }} />
            <span style={{ fontSize: '12.5px', color: '#6E7079', fontWeight: 500 }}>Total neto</span>
          </div>
          <div
            className="font-[family-name:var(--ff-display)] font-semibold tabular-nums"
            style={{ fontSize: 30, letterSpacing: '-0.025em', color: '#12131A', lineHeight: 1.1, marginTop: 4 }}
          >
            {loadingLiq ? '—' : `$${Math.ceil(totalNeto).toLocaleString('es-AR')}`}
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-[1.15fr_1fr] gap-[44px]">
        {/* Left column: Recibos generados */}
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h2
                className="font-[family-name:var(--ff-display)] font-semibold"
                style={{ fontSize: 16, color: '#12131A' }}
              >
                Recibos generados del período
              </h2>
              <p style={{ fontSize: 13, color: '#9B9CA3', marginTop: 2 }}>
                Período {periodo}. Estos son los recibos calculados en ARCA.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeleteLiquidacionesOpen(true)}
              disabled={loadingLiq || liquidacionesGeneradas.length === 0}
              className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] font-semibold hover:bg-[#FBFAF6] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ color: '#c0392b' }}
            >
              <Trash2 style={{ width: 14, height: 14 }} />
              Eliminar liquidaciones
            </button>
          </div>

          {/* List header */}
          <div
            className="grid gap-4 border-b border-[#ECEAE3] py-2"
            style={{ gridTemplateColumns: '1fr auto auto' }}
          >
            <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Empleado</span>
            <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Estado</span>
            <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Neto</span>
          </div>

          {loadingLiq ? (
            <div className="flex items-center gap-2 py-4" style={{ color: '#9B9CA3' }}>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Cargando…</span>
            </div>
          ) : liquidacionesGeneradas.length === 0 ? (
            <p className="py-4" style={{ fontSize: 13, color: '#9B9CA3' }}>
              No hay recibos generados para este período.
            </p>
          ) : (
            <div>
              {liquidacionesGeneradas.slice(0, 10).map((l) => (
                <div
                  key={l.liquidacion.id}
                  className="grid gap-4 py-3 px-[2px] border-b border-[#F1EFE8] hover:bg-[#FBFAF6] transition-[background] duration-[120ms] items-center"
                  style={{ gridTemplateColumns: '1fr auto auto' }}
                >
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#12131A' }}>
                      {toTitleCase(l.empleado.nombre)}
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#9B9CA3' }}>
                      {' · Legajo '}
                      {legajoParaMostrar(l.empleado.legajo ?? null)}
                    </span>
                  </div>
                  <span
                    style={{
                      color: 'oklch(0.42 0.13 160)',
                      backgroundColor: 'oklch(0.94 0.04 160)',
                      borderRadius: 9999,
                      padding: '3px 9px',
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Generado
                  </span>
                  <div className="flex items-center gap-2 justify-end" style={{ minWidth: 104 }}>
                    <span
                      className="tabular-nums"
                      style={{ fontSize: '13.5px', fontWeight: 600, color: '#12131A' }}
                    >
                      ${Math.ceil(Number(l.liquidacion.neto)).toLocaleString('es-AR')}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLiquidacionToDelete({
                          id: l.liquidacion.id,
                          empleadoNombre: l.empleado.nombre,
                        })
                      }
                      disabled={
                        eliminarLiquidacionItem.isPending ||
                        eliminarLiquidaciones.isPending
                      }
                      aria-label={`Eliminar liquidación de ${l.empleado.nombre}`}
                      className="flex items-center justify-center rounded-md transition-colors disabled:opacity-40"
                      style={{ width: 28, height: 28, color: '#c0392b' }}
                    >
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: Recibos importados LSD */}
        <div className="border-l border-[#ECEAE3] pl-[44px]">
          <div className="mb-4">
            <h2
              className="font-[family-name:var(--ff-display)] font-semibold"
              style={{ fontSize: 16, color: '#12131A' }}
            >
              Recibos importados LSD
            </h2>
            <p style={{ fontSize: 13, color: '#9B9CA3', marginTop: 2 }}>
              Período {periodo}.{usaLsdReferencia ? ' Se conservan para comparar contra los generados.' : ''}
            </p>
          </div>

          {loadingLiq ? (
            <div className="flex items-center gap-2 py-4" style={{ color: '#9B9CA3' }}>
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
              <span style={{ fontSize: 13 }}>Cargando…</span>
            </div>
          ) : liquidacionesImportadasLsd.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div
                className="flex items-center justify-center rounded-[10px]"
                style={{ width: 42, height: 42, backgroundColor: '#F1EFE8' }}
              >
                <FileCheck style={{ width: 20, height: 20, color: '#9B9CA3' }} />
              </div>
              <p style={{ fontSize: '13.5px', color: '#6E7079', textAlign: 'center' }}>
                No hay recibos LSD importados para este período.
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 bg-white border border-[#DFDCD3] rounded-[10px] px-[13px] py-[8px] text-[13.5px] font-semibold hover:bg-[#FBFAF6] transition-colors"
                style={{ color: '#3E404A' }}
              >
                <Upload style={{ width: 14, height: 14 }} />
                Importar LSD
              </button>
            </div>
          ) : (
            <div>
              {/* List header */}
              <div
                className="grid gap-4 border-b border-[#ECEAE3] py-2"
                style={{ gridTemplateColumns: '1fr auto auto' }}
              >
                <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Empleado</span>
                <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Tipo</span>
                <span style={{ fontSize: '10.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9B9CA3' }}>Neto</span>
              </div>
              {liquidacionesImportadasLsd.slice(0, 10).map((l) => (
                <div
                  key={l.liquidacion.id}
                  className="grid gap-4 py-3 px-[2px] border-b border-[#F1EFE8] hover:bg-[#FBFAF6] transition-[background] duration-[120ms] items-center"
                  style={{ gridTemplateColumns: '1fr auto auto' }}
                >
                  <div>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#12131A' }}>
                      {toTitleCase(l.empleado.nombre)}
                    </span>
                    <span style={{ fontSize: '11.5px', color: '#9B9CA3' }}>
                      {' · Legajo '}
                      {legajoParaMostrar(l.empleado.legajo ?? null)}
                    </span>
                  </div>
                  <span
                    style={{
                      color: '#6E7079',
                      backgroundColor: '#F1EFE8',
                      borderRadius: 9999,
                      padding: '3px 9px',
                      fontSize: 11,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    LSD
                  </span>
                  <span
                    className="tabular-nums"
                    style={{ fontSize: '13.5px', fontWeight: 600, color: '#12131A', minWidth: 104, textAlign: 'right' }}
                  >
                    ${Number(l.liquidacion.neto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={confirmMasivaOpen}
        onOpenChange={(open) =>
          !liquidacionMasiva.isPending &&
          !actualizarConvenioEmpleado.isPending &&
          setConfirmMasivaOpen(open)
        }
      >
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar liquidación masiva ({empleadosPendientesMasiva.length})
            </AlertDialogTitle>
            <AlertDialogDescription>
              {usaLsdReferencia
                ? `Se liquidarán solo empleados activos sin recibo generado en ${periodo}. Los LSD importados se mantienen como referencia.`
                : `Se liquidarán solo empleados activos sin recibo de sueldo en ${periodo}.`}
              Si falta convenio, asignalo antes de continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {empleadosPendientesMasiva.length === 0 ? (
              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                {usaLsdReferencia
                  ? 'No hay empleados pendientes: todos ya tienen recibo generado para este período.'
                  : 'No hay empleados pendientes: todos ya tienen recibo de sueldo para este período.'}
              </div>
            ) : (
              empleadosPendientesMasiva.map((e) => (
                <div
                  key={e.empleado.id}
                  className="grid grid-cols-1 items-center gap-2 rounded-md border p-2 md:grid-cols-[1fr_auto]"
                >
                  <div className="text-sm">
                    <div className="font-medium">{toTitleCase(e.empleado.nombre)}</div>
                    <div className="text-muted-foreground">
                      Legajo: {legajoParaMostrar(e.empleado.legajo ?? null)}
                    </div>
                  </div>
                  {e.empleado.convenioId ? (
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold">
                      {e.convenioNombre ?? 'Convenio asignado'}
                    </span>
                  ) : (
                    <div className="w-full md:w-[260px]">
                      <Select
                        value={convenioByEmpleado[e.empleado.id] ?? ''}
                        onValueChange={(value) =>
                          setConvenioByEmpleado((prev) => ({
                            ...prev,
                            [e.empleado.id]: value,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar convenio" />
                        </SelectTrigger>
                        <SelectContent>
                          {convenios.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={
                liquidacionMasiva.isPending || actualizarConvenioEmpleado.isPending
              }
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmarLiquidacionMasiva();
              }}
              disabled={
                liquidacionMasiva.isPending ||
                actualizarConvenioEmpleado.isPending ||
                empleadosPendientesMasiva.length === 0
              }
            >
              {liquidacionMasiva.isPending || actualizarConvenioEmpleado.isPending
                ? 'Procesando...'
                : 'Liquidar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={erroresMasivaOpen} onOpenChange={setErroresMasivaOpen}>
        <AlertDialogContent className="max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Liquidación masiva con errores ({erroresMasiva.length})
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se procesó el período {periodo} con errores en algunos empleados.
              Revisá el detalle para corregir y volver a intentar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
            {erroresMasiva.map((r) => (
              <div key={r.empleadoId} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{toTitleCase(r.empleadoNombre)}</div>
                <div className="text-muted-foreground">
                  Legajo: {r.legajo || '—'} | Código: {r.errorCode ?? 'OTRO'}
                </div>
                <div className="mt-1">{r.error ?? 'Error desconocido'}</div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={copiarErroresMasiva}>
              Copiar errores
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteLiquidacionesOpen}
        onOpenChange={(open) =>
          !eliminarLiquidaciones.isPending && setDeleteLiquidacionesOpen(open)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar liquidaciones del período?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todas las liquidaciones del período {periodo} para
              este cliente ({liquidacionesGeneradas.length} generadas en total). Los recibos
              confirmados también se eliminarán. Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarLiquidaciones.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => eliminarLiquidaciones.mutate()}
            >
              {eliminarLiquidaciones.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!liquidacionToDelete}
        onOpenChange={(open) =>
          !eliminarLiquidacionItem.isPending &&
          !open &&
          setLiquidacionToDelete(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta liquidación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la liquidación de {liquidacionToDelete?.empleadoNombre}{' '}
              del período {periodo}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarLiquidacionItem.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!liquidacionToDelete) return;
                eliminarLiquidacionItem.mutate(liquidacionToDelete.id);
              }}
            >
              {eliminarLiquidacionItem.isPending ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
