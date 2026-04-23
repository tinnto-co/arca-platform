'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  FileText,
  Calculator,
  Loader2,
  Calendar,
  Trash2,
  ChevronLeft,
  ChevronRight,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  listLiquidacionesByPeriodo,
  listEmpleados,
  listImportEmpleados,
  listConvenios,
  calcularLiquidacionMasiva,
  eliminarLiquidacion,
  eliminarLiquidacionesDelPeriodo,
} from '@/actions/sueldos';
import {
  getPeriodoMesAnterior,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';

const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] =
  getPeriodoMesAnterior().split('-');

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
  const { data: liquidaciones = [], isLoading: loadingLiq } =
    liquidacionesQuery;

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
  const [liquidacionToDelete, setLiquidacionToDelete] = useState<{
    id: string;
    empleadoNombre: string;
  } | null>(null);
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
  const eliminarLiquidacionItem = useMutation({
    mutationFn: (liquidacionId: string) =>
      eliminarLiquidacion({ data: { clientId, liquidacionId } }),
    onSuccess: () => {
      setLiquidacionToDelete(null);
      toast.success('Liquidación eliminada.');
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, periodo],
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

  return (
    <div className="space-y-6">
      {sueldosQueryError ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los datos de sueldos</AlertTitle>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <MonthPicker ano={ano} mes={mes} onSelect={(a, m) => { setAno(a); setMes(m); }} />
        <div className="flex flex-col items-end gap-1">
          {!permiteLiquidar && (
            <span className="text-xs text-[var(--arca-ink-3)]">
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
            <CardTitle className="text-sm font-medium text-[var(--arca-ink-3)]">
              Empleados activos
            </CardTitle>
            <Users className="h-4 w-4 text-[var(--arca-ink-3)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{importEmpleados.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[var(--arca-ink-3)]">
              Liquidaciones (período)
            </CardTitle>
            <FileText className="h-4 w-4 text-[var(--arca-ink-3)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingLiq ? '—' : liquidaciones.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-[var(--arca-ink-3)]">
              Total bruto
            </CardTitle>
            <Calculator className="h-4 w-4 text-[var(--arca-ink-3)]" />
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
            <CardTitle className="text-sm font-medium text-[var(--arca-ink-3)]">
              Total neto
            </CardTitle>
            <LayoutDashboard className="h-4 w-4 text-[var(--arca-ink-3)]" />
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
              <p className="text-sm text-[var(--arca-ink-3)]">
                Período {periodo}. Incluye recibos importados (LSD) y generados
                por el sistema.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-[var(--arca-accent-neg)] hover:bg-destructive/10 hover:text-[var(--arca-accent-neg)]"
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
            <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : liquidaciones.length === 0 ? (
            <p className="text-[var(--arca-ink-3)]">
              No hay recibos para este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {liquidaciones.slice(0, 10).map((l) => (
                <li
                  key={l.liquidacion.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {l.empleado.nombre}
                    {l.liquidacion.origen === 'import' ? (
                      <Badge variant="secondary" className="text-xs">
                        LSD
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Generado
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      $
                      {Number(l.liquidacion.neto).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-[var(--arca-accent-neg)] hover:bg-destructive/10 hover:text-[var(--arca-accent-neg)]"
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
              className="bg-destructive text-[var(--arca-accent-neg)]-foreground hover:bg-destructive/90"
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
              Se eliminará la liquidación de{' '}
              {liquidacionToDelete?.empleadoNombre} del período {periodo}. Esta
              acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminarLiquidacionItem.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-[var(--arca-accent-neg)]-foreground hover:bg-destructive/90"
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

/* ─── Month Picker ─── */
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_LABELS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function MonthPicker({
  ano,
  mes,
  onSelect,
}: {
  ano: string;
  mes: string;
  onSelect: (ano: string, mes: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [navYear, setNavYear] = useState(Number(ano));
  const now = new Date();
  const selectedLabel = `${MONTH_LABELS_FULL[Number(mes) - 1]} ${ano}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--arca-r-md)] text-[13px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
          <Calendar className="w-[13px] h-[13px] shrink-0 text-[var(--arca-ink-3)]" />
          {selectedLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-3" align="start" sideOffset={8}>
        {/* Year navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setNavYear((y) => y - 1)}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[13px] font-semibold text-[var(--arca-ink)]">{navYear}</span>
          <button
            onClick={() => setNavYear((y) => y + 1)}
            disabled={navYear >= now.getFullYear()}
            className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-3 gap-1">
          {MONTH_LABELS.map((label, i) => {
            const mValue = String(i + 1).padStart(2, '0');
            const isSelected = String(navYear) === ano && mValue === mes;
            const isFuture =
              navYear > now.getFullYear() ||
              (navYear === now.getFullYear() && i >= now.getMonth());
            return (
              <button
                key={mValue}
                disabled={isFuture}
                onClick={() => {
                  onSelect(String(navYear), mValue);
                  setOpen(false);
                }}
                className={cn(
                  'py-1.5 rounded-md text-[12.5px] font-medium transition-colors duration-[120ms]',
                  isSelected
                    ? 'bg-[var(--arca-navy-900)] text-white'
                    : 'text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]',
                  isFuture && 'opacity-30 pointer-events-none'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
