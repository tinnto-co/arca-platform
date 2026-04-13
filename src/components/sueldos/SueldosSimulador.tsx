'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calculator, Loader2, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listImportEmpleadosConConfig,
  calcularLiquidacion,
  confirmarReciboLiquidacion,
  updateDetalleInputs,
} from '@/actions/sueldos';
import {
  getPeriodoMesAnterior,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';
import { ReciboFormulario } from '@/components/sueldos/ReciboFormulario';

const now = new Date();
const [PERIODO_INICIAL_ANO, PERIODO_INICIAL_MES] =
  getPeriodoMesAnterior().split('-');
const ANOS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

interface SueldosSimuladorProps {
  clientId: string;
  profileId: string;
  onConfirmRecibo?: (periodo: string, liquidacionId: string) => void;
}

type DetalleResult = {
  detalleId?: string;
  conceptoId: string;
  monto: number;
  cantidad?: number;
  pct?: number;
  importeOverride?: number;
  conceptoNombre: string;
  conceptoCodigo: string;
  conceptoTipo: 'remunerativo' | 'no_remunerativo' | 'descuento' | 'retencion';
  conceptoFormula: string;
};

type EditState = {
  cantidad: string;
  importeOverride: string;
};

export function SueldosSimulador({
  clientId,
  profileId,
  onConfirmRecibo,
}: SueldosSimuladorProps) {
  const queryClient = useQueryClient();
  const [importEmpleadoId, setImportEmpleadoId] = useState('');
  const [ano, setAno] = useState(PERIODO_INICIAL_ANO);
  const [mes, setMes] = useState(PERIODO_INICIAL_MES);
  const periodo = useMemo(() => `${ano}-${mes}`, [ano, mes]);
  const permiteLiquidar = puedeLiquidarPeriodo(periodo);

  const [headerLiquidacionId, setHeaderLiquidacionId] = useState<string | null>(null);
  const [headerBinding, setHeaderBinding] = useState<{
    importEmpleadoId: string;
    periodo: string;
  } | null>(null);

  // Estado de edición por conceptoId
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});

  useEffect(() => {
    if (!headerBinding) return;
    if (
      importEmpleadoId !== headerBinding.importEmpleadoId ||
      periodo !== headerBinding.periodo
    ) {
      setHeaderLiquidacionId(null);
      setHeaderBinding(null);
    }
  }, [importEmpleadoId, periodo, headerBinding]);

  const { data: empleados = [] } = useQuery({
    queryKey: ['import-empleados-config', clientId, profileId],
    queryFn: () =>
      listImportEmpleadosConConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const [result, setResult] = useState<{
    liquidacion: { id: string };
    totalRemunerativo: number;
    totalNoRemunerativo: number;
    totalDescuentos: number;
    totalRetenciones: number;
    neto: number;
    detalles: DetalleResult[];
  } | null>(null);

  const calcular = useMutation({
    mutationFn: () =>
      calcularLiquidacion({
        data: {
          clientId,
          importEmpleadoId,
          periodo,
          ...(headerLiquidacionId ? { liquidacionId: headerLiquidacionId } : {}),
        },
      }),
    onSuccess: (res) => {
      toast.success('Liquidación calculada');
      setResult(res as typeof result);
      // Sincronizar estados de edición con los detalles calculados
      const newEditStates: Record<string, EditState> = {};
      for (const d of (res as NonNullable<typeof result>).detalles) {
        newEditStates[d.conceptoId] = {
          cantidad: d.cantidad != null ? String(d.cantidad) : '',
          importeOverride: d.importeOverride != null ? String(d.importeOverride) : '',
        };
      }
      setEditStates(newEditStates);
    },
    onError: (e) => toast.error(e.message),
  });

  const guardarInput = useMutation({
    mutationFn: (params: {
      detalleId: string;
      cantidad?: number | null;
      importeOverride?: number | null;
    }) =>
      updateDetalleInputs({
        data: {
          clientId,
          detalleId: params.detalleId,
          cantidad: params.cantidad,
          importeOverride: params.importeOverride,
        },
      }),
    onError: (e) => toast.error(e.message),
  });

  const confirmarRecibo = useMutation({
    mutationFn: (liquidacionId: string) =>
      confirmarReciboLiquidacion({ data: { clientId, liquidacionId } }),
    onSuccess: (_, liquidacionId) => {
      toast.success('Recibo confirmado');
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones', clientId, periodo],
      });
      onConfirmRecibo?.(periodo, liquidacionId);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleBlurInput = (d: DetalleResult) => {
    if (!d.detalleId) return;
    const state = editStates[d.conceptoId];
    if (!state) return;
    const cantidad = state.cantidad !== '' ? parseFloat(state.cantidad) : null;
    const importeOverride = state.importeOverride !== '' ? parseFloat(state.importeOverride) : null;
    guardarInput.mutate({ detalleId: d.detalleId, cantidad, importeOverride });
  };

  const nombreSinParentesis = (nombre: string) =>
    nombre.replace(/\s*\([^)]*%[^)]*\)\s*$/, '').trim();

  const fmt = (n: number) =>
    n.toLocaleString('es-AR', { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <ReciboFormulario
        clientId={clientId}
        profileId={profileId}
        onSuccess={(payload) => {
          setHeaderLiquidacionId(payload.liquidacionId);
          setHeaderBinding({
            importEmpleadoId: payload.importEmpleadoId,
            periodo: payload.periodo,
          });
          setImportEmpleadoId(payload.importEmpleadoId);
          const [y, mo] = payload.periodo.split('-');
          setAno(y);
          setMes(mo);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Simulador de liquidación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Elija empleado y período para calcular (o recalcular) la liquidación.
          </p>
          {headerLiquidacionId && (
            <p className="text-sm text-primary font-medium">
              Cabecera de recibo guardada. Calcular aplicará las fórmulas y conservará los datos del recibo.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <Label>Empleado</Label>
              <p className="text-xs text-muted-foreground mb-1.5 max-w-[320px]">
                Los deshabilitados no tienen convenio/categoría asignados; configurálos en la pestaña Empleados.
              </p>
              <Select
                value={importEmpleadoId}
                onValueChange={(v) => {
                  setImportEmpleadoId(v);
                  setResult(null);
                  setEditStates({});
                }}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Seleccione empleado" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((r) => (
                    <SelectItem
                      key={r.empleado.id}
                      value={r.empleado.id}
                      disabled={!r.empleado.convenioId}
                    >
                      <span className="flex items-center gap-2">
                        {r.empleado.nombre}
                        {!r.empleado.convenioId && (
                          <Badge variant="secondary" className="text-xs">
                            Sin configurar
                          </Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Año</Label>
              <Select
                value={ano}
                onValueChange={(v) => { setAno(v); setResult(null); setEditStates({}); }}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANOS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mes</Label>
              <Select
                value={mes}
                onValueChange={(v) => { setMes(v); setResult(null); setEditStates({}); }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 items-end">
              {!permiteLiquidar && (
                <span className="text-xs text-muted-foreground">
                  Solo se puede liquidar el mes anterior al en curso.
                </span>
              )}
              <Button
                onClick={() => calcular.mutate()}
                disabled={!importEmpleadoId || calcular.isPending || !permiteLiquidar}
              >
                {calcular.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                {result ? 'Recalcular' : 'Calcular'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            <p className="text-sm text-muted-foreground">
              Período {periodo}. Editá Cantidad o Importe y presioná <strong>Recalcular</strong> para actualizar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 text-left">Concepto</th>
                    <th className="px-2 py-1 text-center w-[90px]">Cantidad</th>
                    <th className="px-2 py-1 text-center w-[110px]">Importe fijo</th>
                    <th className="px-2 py-1 text-right">Haberes</th>
                    <th className="px-2 py-1 text-right">No Remun.</th>
                    <th className="px-2 py-1 text-right">Descuentos</th>
                    <th className="px-2 py-1 text-right">Retenciones</th>
                  </tr>
                </thead>
                <tbody>
                  {result.detalles.map((d) => {
                    const state = editStates[d.conceptoId] ?? { cantidad: '', importeOverride: '' };
                    return (
                      <tr key={d.conceptoId} className="border-b last:border-b-0">
                        <td className="px-2 py-1">{nombreSinParentesis(d.conceptoNombre)}</td>
                        <td className="px-1 py-0.5">
                          <Input
                            className="h-7 text-xs text-center w-full"
                            type="number"
                            step="0.01"
                            placeholder="—"
                            value={state.cantidad}
                            onChange={(e) =>
                              setEditStates((prev) => ({
                                ...prev,
                                [d.conceptoId]: { ...state, cantidad: e.target.value },
                              }))
                            }
                            onBlur={() => handleBlurInput(d)}
                          />
                        </td>
                        <td className="px-1 py-0.5">
                          <Input
                            className="h-7 text-xs text-right w-full"
                            type="number"
                            step="0.01"
                            placeholder="—"
                            value={state.importeOverride}
                            onChange={(e) =>
                              setEditStates((prev) => ({
                                ...prev,
                                [d.conceptoId]: { ...state, importeOverride: e.target.value },
                              }))
                            }
                            onBlur={() => handleBlurInput(d)}
                          />
                        </td>
                        <td className="px-2 py-1 text-right">
                          {d.conceptoTipo === 'remunerativo' ? `$${fmt(d.monto)}` : ''}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {d.conceptoTipo === 'no_remunerativo' ? `$${fmt(d.monto)}` : ''}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {d.conceptoTipo === 'descuento' ? `- $${fmt(d.monto)}` : ''}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {d.conceptoTipo === 'retencion' ? `- $${fmt(d.monto)}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-2 py-1 text-left">Totales</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1 text-right">${fmt(result.totalRemunerativo)}</td>
                    <td className="px-2 py-1 text-right">${fmt(result.totalNoRemunerativo)}</td>
                    <td className="px-2 py-1 text-right">- ${fmt(result.totalDescuentos)}</td>
                    <td className="px-2 py-1 text-right">- ${fmt(result.totalRetenciones)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end border-t pt-2 text-base font-semibold">
              <span className="text-muted-foreground">Neto a cobrar:</span>
              <span className="ml-2">${fmt(result.neto)}</span>
            </div>
            {onConfirmRecibo && result && (
              <div className="flex justify-end pt-4">
                <Button
                  onClick={() => confirmarRecibo.mutate(result.liquidacion.id)}
                  disabled={confirmarRecibo.isPending}
                >
                  {confirmarRecibo.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck className="mr-2 h-4 w-4" />
                  )}
                  Confirmar recibo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
