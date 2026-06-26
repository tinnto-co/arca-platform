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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  getPeriodoMesActual,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';
import { legajoParaMostrar } from '@/lib/legajo';
import { toTitleCase } from '@/lib/format-name';

const now = new Date();
const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] =
  getPeriodoMesActual().split('-');
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
    <div className="space-y-6">
      {sueldosQueryError ? (
        <Alert variant="destructive">
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">Año:</span>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[100px]">
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
          <span className="text-sm font-medium">Mes:</span>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!permiteLiquidar && (
            <span className="text-xs text-muted-foreground">
              No se puede liquidar meses futuros.
            </span>
          )}
          <Button
            onClick={abrirConfirmacionMasiva}
            disabled={
              liquidacionMasiva.isPending ||
              actualizarConvenioEmpleado.isPending ||
              empleados.length === 0 ||
              !permiteLiquidar
            }
          >
            {liquidacionMasiva.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Liquidación masiva
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Empleados activos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{importEmpleados.filter((e) => e.empleado.activo).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Liquidaciones (período)
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingLiq ? '—' : liquidaciones.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total bruto
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingLiq
                ? '—'
                : `$${Math.ceil(totalBruto).toLocaleString('es-AR')}`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total neto
            </CardTitle>
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingLiq
                ? '—'
                : `$${Math.ceil(totalNeto).toLocaleString('es-AR')}`}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Recibos generados del período</CardTitle>
              <p className="text-sm text-muted-foreground">
                Período {periodo}. Estos son los recibos calculados en ARCA.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteLiquidacionesOpen(true)}
              disabled={loadingLiq || liquidacionesGeneradas.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar liquidaciones del período
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLiq ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : liquidacionesGeneradas.length === 0 ? (
            <p className="text-muted-foreground">
              No hay recibos generados para este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {liquidacionesGeneradas.slice(0, 10).map((l) => (
                <li
                  key={l.liquidacion.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span>
                      {toTitleCase(l.empleado.nombre)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Legajo: {legajoParaMostrar(l.empleado.legajo ?? null)}
                      </span>
                    </span>
                    <Badge variant="outline" className="text-xs">Generado</Badge>
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      $
                      {Math.ceil(Number(l.liquidacion.neto)).toLocaleString('es-AR')}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {usaLsdReferencia ? (
      <Card>
        <CardHeader>
          <CardTitle>Recibos importados (LSD) de referencia</CardTitle>
          <p className="text-sm text-muted-foreground">
            Período {periodo}. Se conservan para comparar contra los generados.
          </p>
        </CardHeader>
        <CardContent>
          {loadingLiq ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : liquidacionesImportadasLsd.length === 0 ? (
            <p className="text-muted-foreground">
              No hay recibos LSD importados para este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {liquidacionesImportadasLsd.slice(0, 10).map((l) => (
                <li
                  key={l.liquidacion.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span>
                      {toTitleCase(l.empleado.nombre)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Legajo: {legajoParaMostrar(l.empleado.legajo ?? null)}
                      </span>
                    </span>
                    <Badge variant="secondary" className="text-xs">LSD</Badge>
                  </span>
                  <span className="font-medium">
                    $
                    {Number(l.liquidacion.neto).toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      ) : null}
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
                    <Badge variant="secondary">{e.convenioNombre ?? 'Convenio asignado'}</Badge>
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
