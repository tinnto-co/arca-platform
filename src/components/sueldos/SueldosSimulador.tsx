'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calculator, Loader2, FileCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

interface SueldosSimuladorProps {
  clientId: string;
  profileId: string;
  onConfirmRecibo?: (periodo: string, liquidacionId: string) => void;
}

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

  const { data: empleados = [] } = useQuery({
    queryKey: ['import-empleados-config', clientId, profileId],
    queryFn: () =>
      listImportEmpleadosConConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const calcular = useMutation({
    mutationFn: () =>
      calcularLiquidacion({ data: { clientId, importEmpleadoId, periodo } }),
    onSuccess: (result) => {
      toast.success('Liquidación calculada');
      setResult(result);
    },
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

  const [result, setResult] = useState<{
    liquidacion: { id: string };
    totalRemunerativo: number;
    totalNoRemunerativo: number;
    totalDescuentos: number;
    neto: number;
    detalles: {
      conceptoId: string;
      monto: number;
      cantidad?: number;
      conceptoNombre: string;
      conceptoCodigo: string;
      conceptoTipo: 'remunerativo' | 'no_remunerativo' | 'descuento';
      conceptoFormula: string;
    }[];
  } | null>(null);

  /** Quita del nombre la parte entre paréntesis con porcentaje */
  const nombreSinParentesis = (nombre: string) =>
    nombre.replace(/\s*\([^)]*%[^)]*\)\s*$/, '').trim();

  /** Texto para columna Cantidad (días, %, etc.) */
  const cantidadTexto = (d: NonNullable<typeof result>['detalles'][number]) => {
    const codigo = d.conceptoCodigo?.toUpperCase() ?? '';
    const formula = d.conceptoFormula ?? '';
    if (codigo === 'BASICO') return '30';
    if (codigo === 'PRES') return '8,33%';
    if (d.conceptoTipo === 'descuento' && formula) {
      const match = /0\.\d+/.exec(formula);
      if (match) {
        const pct = parseFloat(match[0]) * 100;
        return pct % 1 === 0
          ? `${Math.round(pct)}%`
          : `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;
      }
    }
    if (d.cantidad != null && d.cantidad !== 0) return String(d.cantidad);
    return '';
  };

  const filas =
    result?.detalles.map((d) => ({
      id: d.conceptoId,
      nombre: nombreSinParentesis(d.conceptoNombre),
      cantidadTexto: cantidadTexto(d),
      remunerativo: d.conceptoTipo === 'remunerativo' ? d.monto : 0,
      noRemunerativo: d.conceptoTipo === 'no_remunerativo' ? d.monto : 0,
      descuentos: d.conceptoTipo === 'descuento' ? d.monto : 0,
    })) ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Simulador de liquidación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Elija empleado y período para calcular (o recalcular) la
            liquidación.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <Label>Empleado</Label>
              <Select
                value={importEmpleadoId}
                onValueChange={setImportEmpleadoId}
              >
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Seleccione empleado" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((r) => (
                    <SelectItem
                      key={r.empleado.id}
                      value={r.empleado.id}
                      disabled={!r.payrollId}
                    >
                      <span className="flex items-center gap-2">
                        {r.empleado.nombre}
                        {r.payrollId === null && (
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
            </div>
            <div>
              <Label>Mes</Label>
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
            <div className="flex flex-col gap-1 items-end">
              {!permiteLiquidar && (
                <span className="text-xs text-muted-foreground">
                  Solo se puede liquidar el mes anterior al en curso.
                </span>
              )}
              <Button
                onClick={() => calcular.mutate()}
                disabled={
                  !importEmpleadoId || calcular.isPending || !permiteLiquidar
                }
              >
                {calcular.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="mr-2 h-4 w-4" />
                )}
                Calcular
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
              Detalle por concepto y totales del período {periodo}.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs md:text-sm">
                <thead className="bg-muted/60">
                  <tr className="border-b text-muted-foreground">
                    <th className="px-2 py-1 text-left">Concepto</th>
                    <th className="px-2 py-1 text-center">Cantidad</th>
                    <th className="px-2 py-1 text-right">Remunerativo</th>
                    <th className="px-2 py-1 text-right">No Remunerativo</th>
                    <th className="px-2 py-1 text-right">Descuentos</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1">{f.nombre}</td>
                      <td className="px-2 py-1 text-center">
                        {f.cantidadTexto}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {f.remunerativo !== 0
                          ? `$${f.remunerativo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : ''}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {f.noRemunerativo !== 0
                          ? `$${f.noRemunerativo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : ''}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {f.descuentos !== 0
                          ? `- $${f.descuentos.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-2 py-1 text-left">Totales</td>
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1 text-right">
                      $
                      {result.totalRemunerativo.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-1 text-right">
                      $
                      {result.totalNoRemunerativo.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-2 py-1 text-right">
                      - $
                      {result.totalDescuentos.toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end border-t pt-2 text-base font-semibold">
              <span className="text-muted-foreground">Neto a cobrar:</span>
              <span className="ml-2">
                $
                {result.neto.toLocaleString('es-AR', {
                  minimumFractionDigits: 2,
                })}
              </span>
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
