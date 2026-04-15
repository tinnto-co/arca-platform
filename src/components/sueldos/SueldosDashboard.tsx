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
  calcularLiquidacionMasiva,
  eliminarLiquidacionesDelPeriodo,
} from '@/actions/sueldos';
import {
  getPeriodoMesAnterior,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';

const now = new Date();
const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] =
  getPeriodoMesAnterior().split('-');
const ANOS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

interface SueldosDashboardProps {
  clientId: string;
  profileId: string;
}

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
    queryKey: ['liquidaciones', clientId, periodo],
    queryFn: () => listLiquidacionesByPeriodo({ data: { clientId, periodo } }),
    enabled: !!clientId,
  });
  const { data: liquidaciones = [], isLoading: loadingLiq } = liquidacionesQuery;

  const empleadosQuery = useQuery({
    queryKey: ['empleados', clientId],
    queryFn: () => listEmpleados({ data: { clientId } }),
    enabled: !!clientId,
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

  const liquidacionMasiva = useMutation({
    mutationFn: (p: string) =>
      calcularLiquidacionMasiva({ data: { clientId, periodo: p } }),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok).length;
      if (fail === 0)
        toast.success(`Liquidación masiva: ${ok} empleados procesados.`);
      else toast.warning(`${ok} OK, ${fail} con error. Revisar datos.`);
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, periodo],
      });
    },
    onError: () => toast.error('Error al ejecutar liquidación masiva'),
  });

  const [deleteLiquidacionesOpen, setDeleteLiquidacionesOpen] = useState(false);
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
        queryKey: ['liquidaciones', clientId, periodo],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al eliminar'),
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
              Solo se puede liquidar el mes anterior al en curso.
            </span>
          )}
          <Button
            onClick={() => liquidacionMasiva.mutate(periodo)}
            disabled={
              liquidacionMasiva.isPending ||
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
            <div className="text-2xl font-bold">{importEmpleados.length}</div>
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
                : `$${totalBruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
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
                : `$${totalNeto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Recibos del período</CardTitle>
              <p className="text-sm text-muted-foreground">
                Período {periodo}. Incluye recibos importados (LSD) y generados por el sistema.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteLiquidacionesOpen(true)}
              disabled={loadingLiq || liquidaciones.length === 0}
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
          ) : liquidaciones.length === 0 ? (
            <p className="text-muted-foreground">
              No hay recibos para este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {liquidaciones.slice(0, 10).map((l) => (
                <li
                  key={l.liquidacion.id}
                  className="flex justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {l.empleado.nombre}
                    {l.liquidacion.origen === 'import' ? (
                      <Badge variant="secondary" className="text-xs">LSD</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">Generado</Badge>
                    )}
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
              este cliente ({liquidaciones.length} en total). Los recibos
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
    </div>
  );
}
