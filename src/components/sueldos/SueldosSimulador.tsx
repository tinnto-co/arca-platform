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
  getPayrollEmployerConfig,
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
  return filas
    .map((c) => {
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
    })
    .filter((c) => {
      // Excluir filas sin ningún dato (monto cero y todos los campos vacíos)
      const montoN = Number(c.monto);
      if (!isNaN(montoN) && montoN !== 0) return true;
      return (
        c.cantidad !== '' ||
        c.porcentaje !== '' ||
        c.importe !== '' ||
        c.importeConceptoNumero !== '' ||
        c.importeMinimo !== '' ||
        c.importeMaximo !== ''
      );
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

  // Plantilla con todos los conceptos SOS (catálogo completo); se carga siempre
  // que haya un flowHeader activo, tanto para modo manual como para copia.
  const { data: plantillaManual = [], isLoading: loadingPlantilla } = useQuery(
    {
      queryKey: ['plantilla-manual-sos', clientId],
      queryFn: () =>
        listConceptosPlantillaManualSos({
          data: { clientId },
        }),
      enabled: !!clientId && !!flowHeader,
      staleTime: 10 * 60 * 1000,
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
    enabled: !flowHeader?.copiarUltimoRecibo && !!flowHeader?.importEmpleadoId && !!flowHeader?.periodo,
  });

  // El básico de escala se pasa como prop implícito a TablaReciboSos.
  // No se inyecta en la columna Importe — el cálculo ocurre internamente en la grilla.
  const basicoEscala = basicoData?.basico ?? 0;

  const { data: employerConfig } = useQuery({
    queryKey: ['payroll-employer-config', clientId, profileId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });
  const firmaEmpleadorUrl = employerConfig?.firmaEmpleadorUrl ?? null;

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

  const isCopyMode = !!flowHeader?.copiarUltimoRecibo;
  const isLoadingTable =
    loadingPlantilla || (isCopyMode && loadingUltimo);
  const showTable = !!flowHeader && !isLoadingTable && plantillaManual.length > 0;

  // Para modo copia: muestra todos los conceptos SOS con valores del último recibo pre-cargados.
  // Para modo manual: muestra todos los conceptos SOS con valores vacíos.
  const conceptosFilas: ConceptoImportado[] = useMemo(() => {
    if (!flowHeader || plantillaManual.length === 0) return [];
    if (isCopyMode && ultimoRecibo) {
      const ultimoByCode = new Map(
        ultimoRecibo.conceptos.map((c) => [c.codigo, c])
      );
      const plantillaCodes = new Set(plantillaManual.map((p) => p.codigo));
      // Conceptos del último recibo con código fuera del catálogo (ej. > 699)
      const extras = ultimoRecibo.conceptos.filter(
        (c) => !plantillaCodes.has(c.codigo)
      );
      return [
        ...plantillaManual.map((p) => {
          const prev = ultimoByCode.get(p.codigo);
          if (!prev) return p;
          return {
            ...p,
            monto: prev.monto,
            cantidad: prev.cantidad,
            porcentaje: prev.porcentaje,
            importeConceptoNumero: prev.importeConceptoNumero,
            importe: prev.importe,
            importeMinimo: prev.importeMinimo,
            importeMaximo: prev.importeMaximo,
          };
        }),
        ...extras,
      ];
    }
    return plantillaManual;
  }, [flowHeader, isCopyMode, plantillaManual, ultimoRecibo]);

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
    showTable &&
    permiteLiquidar &&
    !guardarRecibo.isPending;

  return (
    <div className="space-y-6">
      <ReciboFormulario
        clientId={clientId}
        profileId={profileId}
        onSuccess={onFormSuccess}
      />

      {!!flowHeader && isLoadingTable && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingPlantilla ? 'Cargando conceptos SOS…' : 'Cargando último recibo…'}
        </p>
      )}

      {isCopyMode && !loadingUltimo && !ultimoRecibo && !loadingPlantilla && (
        <p className="text-sm text-amber-700">
          No hay recibo previo para este empleado — se muestra el catálogo completo
          con valores vacíos para carga manual.
        </p>
      )}

      {showTable && (
        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {isCopyMode ? 'Conceptos — copia del último recibo' : 'Conceptos — carga manual'}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {isCopyMode
                ? 'Se muestran todos los conceptos SOS con los valores del último recibo pre-cargados. Podés editar cualquier fila antes de guardar.'
                : 'Se muestran todos los conceptos SOS. Los montos se pre-calculan con el básico de escala vigente del empleado. Podés ajustar cualquier valor antes de guardar.'}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isCopyMode && loadingBasico ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando escala salarial…
              </p>
            ) : (
              <>
                {!isCopyMode && (
                  <div className="rounded-md border border-emerald-300/60 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-950">
                    Básico de escala tomado para empleado/período{' '}
                    <span className="font-semibold">{flowHeader!.periodo}</span>:{' '}
                    <span className="font-mono font-semibold">
                      ${moneyFmt(basicoEscala)}
                    </span>
                  </div>
                )}
                <div className="rounded-lg border bg-background p-3">
                  <TablaReciboSos
                    key={plantillaKey}
                    variant={isCopyMode ? 'importado' : 'manual'}
                    recibo={isCopyMode && ultimoRecibo ? ultimoRecibo.recibo : reciboHeaderSimulado}
                    conceptos={conceptosFilas}
                    basico={!isCopyMode ? basicoEscala : undefined}
                    onChange={handleTablaChange}
                    firmaEmpleadorUrl={firmaEmpleadorUrl}
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
