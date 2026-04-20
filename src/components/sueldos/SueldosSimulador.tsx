'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  getUltimoReciboImportado,
  listConceptosPlantillaManualSos,
  guardarReciboDesdeTabla,
  getBasicoParaEmpleadoPeriodo,
} from '@/actions/sueldos';
import { puedeLiquidarPeriodo } from '@/lib/payroll-period-rules';
import { ReciboFormulario } from '@/components/sueldos/ReciboFormulario';
import {
  TablaReciboSos,
  type ConceptoImportado,
  type EditsMap,
} from '@/components/sueldos/TablaReciboSos';

function buildConceptosParaGuardar(
  filas: ConceptoImportado[],
  edits: EditsMap
) {
  const empty = {
    monto: '',
    cantidad: '',
    porcentaje: '',
    importeConceptoNumero: '',
    importe: '',
    importeMinimo: '',
    importeMaximo: '',
  };
  return filas.map((c) => {
    const e = edits[c.codigo] ?? empty;
    return {
      codigo: c.codigo,
      monto: e.monto !== '' ? e.monto : (c.monto ?? ''),
      cantidad: e.cantidad !== '' ? e.cantidad : (c.cantidad ?? ''),
      porcentaje: e.porcentaje !== '' ? e.porcentaje : (c.porcentaje ?? ''),
      importeConceptoNumero:
        e.importeConceptoNumero !== ''
          ? e.importeConceptoNumero
          : (c.importeConceptoNumero ?? ''),
      importe: e.importe !== '' ? e.importe : (c.importe ?? ''),
      importeMinimo:
        e.importeMinimo !== '' ? e.importeMinimo : (c.importeMinimo ?? ''),
      importeMaximo:
        e.importeMaximo !== '' ? e.importeMaximo : (c.importeMaximo ?? ''),
    };
  });
}

type TipoReciboGuardar =
  | 'sueldo'
  | 'anticipo'
  | 'SAC'
  | 'vacaciones'
  | 'despido'
  | 'comisiones'
  | 'desempleo'
  | 'varios';

interface FlowHeader {
  importEmpleadoId: string;
  periodo: string;
  tipoRecibo: TipoReciboGuardar;
  copiarUltimoRecibo: boolean;
}

interface SueldosSimuladorProps {
  clientId: string;
  profileId: string;
  /** Tras guardar en liquidacion_import_*: período y id del recibo importado */
  onConfirmRecibo?: (periodo: string, reciboImportId: string) => void;
}

export function SueldosSimulador({
  clientId,
  profileId,
  onConfirmRecibo,
}: SueldosSimuladorProps) {
  const moneyFmt = useCallback(
    (value: number) =>
      value.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const queryClient = useQueryClient();
  const [flowHeader, setFlowHeader] = useState<FlowHeader | null>(null);
  const [sosEmpleadoId, setSosEmpleadoId] = useState<string | null>(null);
  const [tablaEdits, setTablaEdits] = useState<EditsMap>({});

  const periodo = flowHeader?.periodo ?? '';
  const permiteLiquidar =
    periodo.length === 7 && puedeLiquidarPeriodo(periodo);

  const { data: ultimoRecibo, isLoading: loadingUltimo } = useQuery({
    queryKey: ['ultimo-recibo-importado', clientId, sosEmpleadoId],
    queryFn: () =>
      getUltimoReciboImportado({
        data: { clientId, importEmpleadoId: sosEmpleadoId! },
      }),
    enabled: !!sosEmpleadoId,
  });

  const usaPlantillaManual =
    flowHeader !== null && !flowHeader.copiarUltimoRecibo;

  const { data: plantillaManual = [], isLoading: loadingPlantilla } = useQuery(
    {
      queryKey: ['plantilla-manual-sos', clientId, profileId],
      queryFn: () =>
        listConceptosPlantillaManualSos({
          data: { clientId, profileId },
        }),
      enabled: !!clientId && !!profileId && usaPlantillaManual,
    }
  );

  const { data: basicoData, isLoading: loadingBasico } = useQuery({
    queryKey: [
      'basico-empleado-periodo',
      clientId,
      flowHeader?.importEmpleadoId,
      flowHeader?.periodo,
    ],
    queryFn: () =>
      getBasicoParaEmpleadoPeriodo({
        data: {
          clientId,
          importEmpleadoId: flowHeader!.importEmpleadoId,
          periodo: flowHeader!.periodo,
        },
      }),
    enabled: usaPlantillaManual && !!flowHeader?.importEmpleadoId && !!flowHeader?.periodo,
  });

  // El básico de escala se pasa como prop implícito a TablaReciboSos.
  // No se inyecta en la columna Importe — el cálculo ocurre internamente en la grilla.
  const basicoEscala = basicoData?.basico ?? 0;

  const reciboHeaderSimulado = useMemo(() => {
    if (!flowHeader) {
      return {
        id: 'pendiente',
        periodo: '',
        tipo: 'sueldo',
        haberes: null as string | null,
        noRemunerativo: null as string | null,
        descuentos: null as string | null,
        retenciones: null as string | null,
        neto: null as string | null,
      };
    }
    return {
      id: 'pendiente',
      periodo: flowHeader.periodo,
      tipo: flowHeader.tipoRecibo,
      haberes: null as string | null,
      noRemunerativo: null as string | null,
      descuentos: null as string | null,
      retenciones: null as string | null,
      neto: null as string | null,
    };
  }, [flowHeader]);

  const showImportTable =
    !!flowHeader?.copiarUltimoRecibo && !!sosEmpleadoId && !!ultimoRecibo;
  const showManualTable = !!flowHeader && !flowHeader.copiarUltimoRecibo;

  const conceptosFilas: ConceptoImportado[] = showImportTable
    ? ultimoRecibo!.conceptos
    : showManualTable
      ? plantillaManual
      : [];

  const plantillaKey = useMemo(
    () => plantillaManual.map((c) => c.id).join('|'),
    [plantillaManual]
  );

  useEffect(() => {
    setTablaEdits({});
  }, [
    flowHeader?.importEmpleadoId,
    flowHeader?.periodo,
    flowHeader?.copiarUltimoRecibo,
    ultimoRecibo?.recibo.id,
    plantillaKey,
  ]);

  const guardarRecibo = useMutation({
    mutationFn: async () => {
      if (!flowHeader) throw new Error('Completá el formulario y presioná Agregar');
      const conceptos = buildConceptosParaGuardar(conceptosFilas, tablaEdits);
      if (conceptos.length === 0) {
        throw new Error('No hay conceptos para guardar');
      }
      return guardarReciboDesdeTabla({
        data: {
          clientId,
          profileId,
          importEmpleadoId: flowHeader.importEmpleadoId,
          periodo: flowHeader.periodo,
          tipoRecibo: flowHeader.tipoRecibo,
          conceptos,
        },
      });
    },
    onSuccess: (data) => {
      toast.success('Recibo guardado');
      queryClient.invalidateQueries({
        queryKey: ['import-recibos', clientId, data.periodo],
      });
      queryClient.invalidateQueries({
        queryKey: ['ultimo-recibo-importado', clientId],
      });
      onConfirmRecibo?.(data.periodo, data.reciboId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const handleTablaChange = useCallback((edits: EditsMap) => {
    setTablaEdits(edits);
  }, []);

  const onFormSuccess = useCallback(
    (payload: {
      importEmpleadoId: string;
      periodo: string;
      tipoRecibo: string;
      copiarUltimoRecibo: boolean;
    }) => {
      setFlowHeader({
        importEmpleadoId: payload.importEmpleadoId,
        periodo: payload.periodo,
        tipoRecibo: payload.tipoRecibo as TipoReciboGuardar,
        copiarUltimoRecibo: payload.copiarUltimoRecibo,
      });
      setSosEmpleadoId(
        payload.copiarUltimoRecibo ? payload.importEmpleadoId : null
      );
      setTablaEdits({});
    },
    []
  );

  const puedeGuardar =
    !!flowHeader &&
    conceptosFilas.length > 0 &&
    permiteLiquidar &&
    !guardarRecibo.isPending;

  return (
    <div className="space-y-6">
      <ReciboFormulario
        clientId={clientId}
        profileId={profileId}
        onSuccess={onFormSuccess}
      />

      {flowHeader?.copiarUltimoRecibo && sosEmpleadoId && loadingUltimo && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando último recibo importado…
        </p>
      )}

      {flowHeader?.copiarUltimoRecibo &&
        sosEmpleadoId &&
        !loadingUltimo &&
        !ultimoRecibo && (
          <p className="text-sm text-amber-700">
            No hay recibo importado previo para este empleado. Volvé al formulario
            y elegí cargar conceptos manualmente o importá liquidaciones desde
            Excel.
          </p>
        )}

      {showImportTable && (
        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Último recibo importado — conceptos
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Editá la grilla y presioná <span className="font-medium">Guardar recibo</span>{' '}
              para persistir en el libro de sueldos importado (LSD).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-background p-3">
            <TablaReciboSos
              variant="importado"
              recibo={ultimoRecibo!.recibo}
              conceptos={ultimoRecibo!.conceptos}
              onChange={handleTablaChange}
            />
            </div>
            <div className="flex flex-col items-end gap-2">
              {!permiteLiquidar && (
                <span className="text-xs text-muted-foreground">
                  Solo se puede guardar el mes anterior al en curso.
                </span>
              )}
              <Button
                onClick={() => guardarRecibo.mutate()}
                disabled={!puedeGuardar}
              >
                {guardarRecibo.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Guardar recibo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showManualTable && (
        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Conceptos — carga manual</CardTitle>
            <p className="text-sm text-muted-foreground">
              Los montos se pre-calculan con el básico de escala vigente del empleado
              en el período a liquidar. Podés ajustar cualquier valor antes de guardar.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPlantilla || loadingBasico ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingBasico ? 'Cargando escala salarial…' : 'Cargando plantilla…'}
              </p>
            ) : (
              <>
                <div className="rounded-md border border-emerald-300/60 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-950">
                  Básico de escala tomado para empleado/período{' '}
                  <span className="font-semibold">{flowHeader.periodo}</span>:{' '}
                  <span className="font-mono font-semibold">
                    ${moneyFmt(basicoEscala)}
                  </span>
                </div>
                <div className="rounded-lg border bg-background p-3">
                <TablaReciboSos
                  key={plantillaManual.map((c) => c.id).join('|')}
                  variant="manual"
                  recibo={reciboHeaderSimulado}
                  conceptos={plantillaManual}
                  basico={basicoEscala}
                  onChange={handleTablaChange}
                />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!permiteLiquidar && (
                    <span className="text-xs text-muted-foreground">
                      Solo se puede guardar el mes anterior al en curso.
                    </span>
                  )}
                  <Button
                    onClick={() => guardarRecibo.mutate()}
                    disabled={!puedeGuardar}
                  >
                    {guardarRecibo.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Guardar recibo
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
