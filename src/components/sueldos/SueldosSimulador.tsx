'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, BookTemplate, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getUltimoReciboImportado,
  listConceptosPlantillaManualSos,
  guardarReciboDesdeTabla,
  getBasicoParaEmpleadoPeriodo,
  getPayrollEmployerConfig,
  listReceiptTemplates,
  createReceiptTemplate,
  deleteReceiptTemplate,
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const periodo = flowHeader?.periodo ?? '';
  const permiteLiquidar = periodo.length === 7 && puedeLiquidarPeriodo(periodo);

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

  const { data: plantillaManual = [], isLoading: loadingPlantilla } = useQuery({
    queryKey: ['plantilla-manual-sos', clientId, profileId],
    queryFn: () =>
      listConceptosPlantillaManualSos({
        data: { clientId, profileId },
      }),
    enabled: !!clientId && !!profileId && usaPlantillaManual,
  });

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
    enabled:
      usaPlantillaManual &&
      !!flowHeader?.importEmpleadoId &&
      !!flowHeader?.periodo,
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

  interface ReceiptTemplate {
    id: string;
    name: string;
    receiptType: string;
    conceptIds: string[] | null;
    active: boolean;
    createdAt: Date;
  }

  const { data: templates = [] } = useQuery<ReceiptTemplate[]>({
    queryKey: ['receipt-templates', profileId],
    queryFn: () =>
      listReceiptTemplates({ data: { profileId } }) as Promise<
        ReceiptTemplate[]
      >,
    enabled: !!profileId,
  });

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const templateConceptIds: string[] = Array.isArray(
    selectedTemplate?.conceptIds
  )
    ? selectedTemplate.conceptIds
    : [];

  const saveTemplate = useMutation({
    mutationFn: () =>
      createReceiptTemplate({
        data: {
          profileId,
          name: templateName.trim(),
          receiptType: flowHeader?.tipoRecibo ?? 'sueldo',
          conceptIds: conceptosFilas.map((c) => c.codigo),
        },
      }),
    onSuccess: () => {
      toast.success('Template guardado');
      void queryClient.invalidateQueries({
        queryKey: ['receipt-templates', profileId],
      });
      setShowSaveTemplateDialog(false);
      setTemplateName('');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al guardar template'),
  });

  const removeTemplate = useMutation({
    mutationFn: (id: string) => deleteReceiptTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success('Template eliminado');
      void queryClient.invalidateQueries({
        queryKey: ['receipt-templates', profileId],
      });
      setSelectedTemplateId('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

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

  const basePlantilla = showImportTable
    ? ultimoRecibo.conceptos
    : showManualTable
      ? plantillaManual
      : [];

  const conceptosFilas: ConceptoImportado[] =
    templateConceptIds.length > 0
      ? basePlantilla.filter((c) => templateConceptIds.includes(c.codigo))
      : basePlantilla;

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
      if (!flowHeader)
        throw new Error('Completá el formulario y presioná Agregar');
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
        <p className="text-sm text-[var(--arca-ink-3)] flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando último recibo importado…
        </p>
      )}

      {flowHeader?.copiarUltimoRecibo &&
        sosEmpleadoId &&
        !loadingUltimo &&
        !ultimoRecibo && (
          <p className="text-sm text-[var(--arca-accent-warn-fg)]">
            No hay recibo importado previo para este empleado. Volvé al
            formulario y elegí cargar conceptos manualmente o importá
            liquidaciones desde Excel.
          </p>
        )}

      {showImportTable && (
        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Último recibo importado — conceptos
            </CardTitle>
            <p className="text-sm text-[var(--arca-ink-3)]">
              Editá la grilla y presioná{' '}
              <span className="font-medium">Guardar recibo</span> para persistir
              en el libro de sueldos importado (LSD).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-background p-3">
              <TablaReciboSos
                variant="importado"
                recibo={ultimoRecibo.recibo}
                conceptos={ultimoRecibo.conceptos}
                onChange={handleTablaChange}
                firmaEmpleadorUrl={firmaEmpleadorUrl}
              />
            </div>
            <div className="flex flex-col items-end gap-2">
              {!permiteLiquidar && (
                <span className="text-xs text-[var(--arca-ink-3)]">
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">
                  Conceptos — carga manual
                </CardTitle>
                <p className="text-sm text-[var(--arca-ink-3)] mt-1">
                  Los montos se pre-calculan con el básico de escala vigente del
                  empleado en el período a liquidar. Podés ajustar cualquier
                  valor antes de guardar.
                </p>
              </div>
              {templates.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={selectedTemplateId}
                    onValueChange={setSelectedTemplateId}
                  >
                    <SelectTrigger className="w-48 h-8 text-xs">
                      <SelectValue placeholder="Usar template…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos los conceptos</SelectItem>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedTemplateId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeTemplate.mutate(selectedTemplateId)}
                      disabled={removeTemplate.isPending}
                      title="Eliminar template"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingPlantilla || loadingBasico ? (
              <p className="text-sm text-[var(--arca-ink-3)] flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {loadingBasico
                  ? 'Cargando escala salarial…'
                  : 'Cargando plantilla…'}
              </p>
            ) : (
              <>
                <div className="rounded-md border border-[var(--arca-accent-pos)]/30 bg-[var(--arca-accent-pos-bg)] px-3 py-2 text-xs text-[var(--arca-accent-pos-fg)]">
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
                    firmaEmpleadorUrl={firmaEmpleadorUrl}
                  />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!permiteLiquidar && (
                    <span className="text-xs text-[var(--arca-ink-3)]">
                      Solo se puede guardar el mes anterior al en curso.
                    </span>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowSaveTemplateDialog(true)}
                      disabled={conceptosFilas.length === 0}
                      title="Guardar lista de conceptos como template reutilizable"
                    >
                      <BookTemplate className="mr-2 h-4 w-4" />
                      Guardar como template
                    </Button>
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
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={showSaveTemplateDialog}
        onOpenChange={setShowSaveTemplateDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar template de conceptos</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-[var(--arca-ink-3)]">
              Se guardarán los {conceptosFilas.length} concepto(s) visibles como
              template reutilizable para este perfil.
            </p>
            <div className="space-y-1">
              <Label htmlFor="template-name">Nombre del template</Label>
              <Input
                id="template-name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ej: Sueldo básico mensual"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveTemplateDialog(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveTemplate.mutate()}
              disabled={!templateName.trim() || saveTemplate.isPending}
            >
              {saveTemplate.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
