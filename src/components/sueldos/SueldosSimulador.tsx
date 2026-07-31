'use client';
// Simulador de sueldos
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, FilePlus2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  getUltimoReciboImportado,
  listConceptosPlantillaManualSos,
  guardarReciboDesdeTabla,
  getBasicoParaEmpleadoPeriodo,
  getPayrollEmployerConfig,
  updateEmpleado,
} from '@/actions/sueldos';
import { puedeLiquidarPeriodo, calcularDiasSemestre } from '@/lib/payroll-period-rules';
import { ReciboFormulario, type ReciboFormValues } from '@/components/sueldos/ReciboFormulario';
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
    memo: '',
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
        memo: e.memo !== '' ? e.memo : (c.memo ?? undefined),
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

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

type TipoReciboGuardar =
  | 'mensual'
  | 'quincenal'
  | 'anticipo'
  | 'sac'
  | 'vacaciones'
  | 'liquidacion_final'
  | 'comisiones'
  | 'fondo_desempleo'
  | 'otros';

interface FlowHeader {
  importEmpleadoId: string;
  empleadoNombre: string;
  periodo: string;
  tipoRecibo: TipoReciboGuardar;
  copiarUltimoRecibo: boolean;
  antiguedadAnios: number | null;
  fechaAlta?: string | null;
  fechaIngreso?: string | null;
  // metadata from form — absent when coming from "Editar" (initialData flow)
  quincena?: '0' | '1' | '2';
  fechaLiquidacion?: string;
  obraSocialId?: string | null;
  fechaPago?: string;
  formaPago?: 'efectivo' | 'deposito' | 'transferencia' | 'cheque';
  cbu?: string | null;
  banco?: string | null;
  periodoCargas?: string;
  fechaDepositoCargas?: string | null;
  observacionInterna?: string | null;
  observacionRecibo?: string | null;
  // Situaciones de revista LSD
  situacionRevista1Id?: string | null;
  situacionRevista1DiaInicio?: number | null;
  situacionRevista2Id?: string | null;
  situacionRevista2DiaInicio?: number | null;
  situacionRevista3Id?: string | null;
  situacionRevista3DiaInicio?: number | null;
  // Datos complementarios LSD
  diasTrabajados?: number | null;
  horasTrabajadas?: number | null;
  importeMaternidadArt13?: string | null;
}

interface SueldosSimuladorProps {
  clientId: string;
  /** Tras guardar en liquidacion_import_*: período y id del recibo importado */
  onConfirmRecibo?: (periodo: string, reciboImportId: string) => void;
  /** Pre-carga el simulador (desde Recibo → Editar) saltando el formulario. */
  initialData?: {
    reciboId?: string;
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
  };
  /** Llamado cuando el usuario descarta el modo edición con "Nuevo recibo". */
  onReset?: () => void;
}

export function SueldosSimulador({
  clientId,
  onConfirmRecibo,
  initialData,
  onReset,
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
  const [reciboIdToLoad, setReciboIdToLoad] = useState<string | null>(null);
  const [tablaEdits, setTablaEdits] = useState<EditsMap>({});
  const [activeCodigos, setActiveCodigos] = useState<Set<string>>(new Set());
  const [recalcularConEscalaVigente, setRecalcularConEscalaVigente] =
    useState(false);
  const [initialFormValues, setInitialFormValues] =
    useState<Partial<ReciboFormValues> | null>(null);
  const [basicoOverrideInput, setBasicoOverrideInput] = useState('');

  const periodo = flowHeader?.periodo ?? '';
  const permiteLiquidar =
    periodo.length === 7 && puedeLiquidarPeriodo(periodo);

  const { data: ultimoRecibo, isLoading: loadingUltimo } = useQuery({
    queryKey: ['ultimo-recibo-importado', clientId, sosEmpleadoId, reciboIdToLoad, flowHeader?.periodo],
    queryFn: () =>
      getUltimoReciboImportado({
        data: {
          clientId,
          importEmpleadoId: sosEmpleadoId!,
          ...(reciboIdToLoad ? { liquidacionId: reciboIdToLoad } : {}),
          // En modo nuevo recibo (sin reciboIdToLoad), pasar el período destino para el
          // cálculo correcto del mejor sueldo del semestre (ej: Jan–Jun para SAC de junio).
          ...(!reciboIdToLoad && flowHeader?.periodo ? { periodoSemestre: flowHeader.periodo } : {}),
        },
      }),
    enabled: !!sosEmpleadoId,
  });

  // Plantilla con todos los conceptos SOS; se carga solo cuando flowHeader está seteado
  // (es decir, después de que el usuario presionó "Agregar").
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
    enabled: !!flowHeader?.importEmpleadoId && !!flowHeader?.periodo,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  // El básico de escala se pasa como prop implícito a TablaReciboSos.
  // No se inyecta en la columna Importe — el cálculo ocurre internamente en la grilla.
  const basicoEscala = basicoData?.basico ?? 0;
  const esExcluidoConvenio = basicoData?.esExcluidoConvenio ?? false;
  const esValorHoraCat = basicoData?.esValorHoraCat ?? false;
  // La base OS (conceptos 203, 502, etc.) siempre calcula sobre el básico de escala al 100%,
  // independientemente del porcentaje que tenga seteado el concepto 1 o el 411.
  const basicoJornadaCompleta = basicoEscala;
  const categoriaEscala = basicoData?.categoriaNombre ?? null;
  const sinEscalaParaPeriodo = basicoData?.sinEscalaParaPeriodo ?? false;
  const fallbackPeriodoLabel = basicoData?.fallbackPeriodoLabel ?? null;
  const periodoEscalaLabel = basicoData?.periodoEscalaLabel ?? null;
  // Fechas del empleado: primero desde el form (flujo nuevo recibo), luego desde basicoData (flujo editar)
  const fechaAltaDisplay = flowHeader?.fechaAlta ?? basicoData?.fechaAlta ?? null;
  const fechaIngresoDisplay = flowHeader?.fechaIngreso ?? basicoData?.fechaIngreso ?? null;

  // Bruto del período anterior (haberes + no remunerativo del último recibo cargado).
  // En modo "nuevo recibo" ultimoRecibo es el último recibo existente (= mes anterior).
  // En modo copia es el recibo fuente (también mes anterior). En modo edición es el recibo actual.
  const brutoMesAnterior =
    Number(ultimoRecibo?.recibo?.haberes ?? 0) +
    Number(ultimoRecibo?.recibo?.noRemunerativo ?? 0);

  // Días trabajados en el semestre (para SAC proporcional — concepto 42)
  const diasSemestre = useMemo(() => {
    const periodo = flowHeader?.periodo ?? '';
    const mesStr = periodo.split('-')[1] ?? '';
    if (mesStr !== '06' && mesStr !== '12') return 180;
    return calcularDiasSemestre(fechaIngresoDisplay, periodo);
  }, [fechaIngresoDisplay, flowHeader?.periodo]);

  const { data: employerConfig } = useQuery({
    queryKey: ['payroll-employer-config', clientId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId } }),
    enabled: !!clientId,
  });
  const firmaEmpleadorUrl = employerConfig?.firmaEmpleadorUrl ?? null;

  const reciboHeaderSimulado = useMemo(() => {
    if (!flowHeader) {
      return {
        id: 'pendiente',
        periodo: '',
        tipo: 'mensual',
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
  const showBase =
    !!flowHeader && !isLoadingTable && plantillaManual.length > 0;
  /** Tabla con datos del último recibo importado (solo si hay último recibo). */
  const showImportadoTable = showBase && isCopyMode && !!ultimoRecibo;
  /** Plantilla manual: sin copia, o copia pero sin recibo previo. */
  const showManualTable =
    showBase && (!isCopyMode || (isCopyMode && !ultimoRecibo));

  // Para modo copia: muestra todos los conceptos SOS con valores del último recibo pre-cargados.
  // Para modo manual: muestra todos los conceptos SOS con valores vacíos.
  const conceptosFilas: ConceptoImportado[] = useMemo(() => {
    if (!flowHeader || plantillaManual.length === 0) return [];

    let filas: ConceptoImportado[];
    if (isCopyMode && ultimoRecibo) {
      const ultimoByCode = new Map(
        ultimoRecibo.conceptos.map((c) => [c.codigo, c])
      );
      const plantillaCodes = new Set(plantillaManual.map((p) => p.codigo));
      // `reciboConcepto.conceptoRef` viaja como número; la grilla trabaja con strings.
      const refATexto = (v: number | null) => (v != null ? String(v) : null);
      const extras = ultimoRecibo.conceptos
        .filter((c) => !plantillaCodes.has(c.codigo))
        .map((c) => ({
          ...c,
          importeConceptoNumero: refATexto(c.importeConceptoNumero),
        }));
      filas = [
        ...plantillaManual.map((p) => {
          const prev = ultimoByCode.get(p.codigo);
          if (!prev) return p;
          return {
            ...p,
            monto: prev.monto,
            cantidad: prev.cantidad,
            porcentaje: prev.porcentaje,
            importeConceptoNumero: refATexto(prev.importeConceptoNumero),
            importe: prev.importe,
            importeMinimo: prev.importeMinimo,
            importeMaximo: prev.importeMaximo,
            memo: prev.memo ?? null,
          };
        }),
        ...extras,
      ];
    } else {
      filas = plantillaManual;
    }

    // Valores fijos por concepto SOS (se aplican siempre, en cualquier modo)
    const { antiguedadAnios } = flowHeader;
    return filas.map((c) => {
      const num = parseInt(c.codigo, 10);
      if (num === 1) {
        // Sueldo básico: pre-llenar porcentaje=100 y cantidad=30 si no tienen valor.
        // El monto se calcula automáticamente cuando basicoEscala está disponible.
        return {
          ...c,
          porcentaje: c.porcentaje ?? '100',
          cantidad: c.cantidad ?? '30',
        };
      }
      if (num === 3) {
        // Antigüedad: % siempre 1, cantidad = años completos desde fecha de ingreso
        return {
          ...c,
          porcentaje: '1',
          cantidad:
            antiguedadAnios !== null ? String(antiguedadAnios) : c.cantidad,
        };
      }
      if (num === 19) return { ...c, porcentaje: '8.33', cantidad: '1' };  // SAC proporcional
      if (num === 201) return { ...c, porcentaje: '11' };  // Jubilación
      if (num === 202) return { ...c, porcentaje: '3' };   // Ley 19032
      if (num === 203) return { ...c, porcentaje: '3' };   // Obra social
      if (num === 206) return { ...c, porcentaje: c.porcentaje ?? '2' };   // Cuota sindical (empresa-específico)
      if (num === 209) return { ...c, porcentaje: c.porcentaje ?? '0.5' }; // Solidaridad (empresa-específico)
      if (num === 501) return { ...c, porcentaje: '2' };   // Ret. obra social
      if (num === 502) return { ...c, porcentaje: '3' };   // Ret. jubilación
      if (num === 503) return { ...c, porcentaje: '0.5' }; // Ret. ley 19032
      return c;
    });
  }, [flowHeader, isCopyMode, plantillaManual, ultimoRecibo]);

  const plantillaKey = useMemo(
    () => plantillaManual.map((c) => c.id).join('|'),
    [plantillaManual]
  );

  const conceptosActivos = useMemo(
    () => conceptosFilas.filter((c) => activeCodigos.has(c.codigo)),
    [conceptosFilas, activeCodigos]
  );

  // Resetear edits cuando cambia empleado/período/modo/plantilla
  useEffect(() => {
    setTablaEdits({});
  }, [
    flowHeader?.importEmpleadoId,
    flowHeader?.periodo,
    flowHeader?.copiarUltimoRecibo,
    ultimoRecibo?.recibo.id,
    plantillaKey,
  ]);

  // Resetear códigos activos cuando cambia empleado/período/modo/plantilla.
  // En modo manual (no copiar) se pre-activan los conceptos de la plantilla base
  // (si el profile tiene referencia configurada) o los 5 básicos por defecto.
  // Excepción: empleados del convenio 9999/99 (excluidos de convenio) — solo concepto 1.
  // En modo copia el effect posterior los reemplaza con los del último recibo.
  useEffect(() => {
    const copiar = !!flowHeader?.copiarUltimoRecibo;
    if (copiar) {
      setActiveCodigos(new Set());
      return;
    }
    if (esExcluidoConvenio) {
      setActiveCodigos(new Set(['1']));
      return;
    }
    const plantillaBaseCodes = plantillaManual
      .filter((c) => (c as typeof c & { isPlantillaBase?: boolean }).isPlantillaBase)
      .map((c) => c.codigo);
    const defaultCodes = esValorHoraCat
      ? new Set(['2', '3', '201', '202', '203'])
      : new Set(['1', '3', '201', '202', '203']);
    const initial = plantillaBaseCodes.length > 0
      ? (() => {
          const s = new Set(plantillaBaseCodes);
          // Para empleados con valor por hora: excluir concepto 1 e incluir concepto 2
          if (esValorHoraCat) { s.delete('1'); s.add('2'); }
          return s;
        })()
      : defaultCodes;
    setActiveCodigos(initial);
  }, [
    flowHeader?.importEmpleadoId,
    flowHeader?.periodo,
    flowHeader?.copiarUltimoRecibo,
    plantillaKey,
    esExcluidoConvenio,
    esValorHoraCat,
  ]);

  // En modo copia: pre-cargar los códigos activos del último recibo.
  // `initialData` es dep para que se re-ejecute cuando el usuario abre un nuevo recibo
  // a editar aunque `ultimoRecibo` y `isCopyMode` no hayan cambiado de referencia
  // (caso: mismo recibo abierto dos veces con el componente todavía montado).
  useEffect(() => {
    if (!isCopyMode || !ultimoRecibo) return;
    setActiveCodigos(
      new Set(
        ultimoRecibo.conceptos
          .filter((c) => {
            const montoN = Number(c.monto);
            return (
              (!isNaN(montoN) && montoN !== 0) ||
              c.cantidad !== null ||
              c.porcentaje !== null ||
              c.importe !== null ||
              c.importeConceptoNumero !== null ||
              c.importeMinimo !== null ||
              c.importeMaximo !== null
            );
          })
          .map((c) => c.codigo)
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCopyMode, ultimoRecibo, initialData]);

  const guardarRecibo = useMutation({
    mutationFn: async () => {
      if (!flowHeader) throw new Error('Completá el formulario y presioná Agregar');
      const conceptos = buildConceptosParaGuardar(conceptosActivos, tablaEdits);
      if (conceptos.length === 0) {
        throw new Error('No hay conceptos para guardar');
      }
      return guardarReciboDesdeTabla({
        data: {
          clientId,
          importEmpleadoId: flowHeader.importEmpleadoId,
          periodo: flowHeader.periodo,
          tipoRecibo: flowHeader.tipoRecibo,
          conceptos,
          quincena: flowHeader.quincena,
          fechaLiquidacion: flowHeader.fechaLiquidacion,
          obraSocialId: flowHeader.obraSocialId,
          fechaPago: flowHeader.fechaPago,
          formaPago: flowHeader.formaPago,
          cbu: flowHeader.cbu,
          banco: flowHeader.banco,
          periodoCargas: flowHeader.periodoCargas,
          fechaDepositoCargas: flowHeader.fechaDepositoCargas,
          observacionInterna: flowHeader.observacionInterna,
          observacionRecibo: flowHeader.observacionRecibo,
          situacionRevista1Id: flowHeader.situacionRevista1Id,
          situacionRevista1DiaInicio: flowHeader.situacionRevista1DiaInicio,
          situacionRevista2Id: flowHeader.situacionRevista2Id,
          situacionRevista2DiaInicio: flowHeader.situacionRevista2DiaInicio,
          situacionRevista3Id: flowHeader.situacionRevista3Id,
          situacionRevista3DiaInicio: flowHeader.situacionRevista3DiaInicio,
          diasTrabajados: flowHeader.diasTrabajados,
          horasTrabajadas: flowHeader.horasTrabajadas,
          importeMaternidadArt13: flowHeader.importeMaternidadArt13,
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
      queryClient.invalidateQueries({
        queryKey: ['liquidaciones-filtros', clientId],
      });
      onConfirmRecibo?.(data.periodo, data.reciboId);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  });

  const guardarBasicoOverride = useMutation({
    mutationFn: async () => {
      if (!flowHeader) throw new Error('Sin empleado seleccionado');
      const valor = parseFloat(basicoOverrideInput.replace(',', '.'));
      if (isNaN(valor) || valor <= 0) throw new Error('Ingresá un monto válido mayor a 0');
      return updateEmpleado({
        data: {
          id: flowHeader.importEmpleadoId,
          clientId,
          valorSueldo: String(valor),
        },
      });
    },
    onSuccess: () => {
      toast.success('Sueldo básico guardado');
      setBasicoOverrideInput('');
      queryClient.invalidateQueries({
        queryKey: [
          'basico-empleado-periodo',
          clientId,
          flowHeader?.importEmpleadoId,
          flowHeader?.periodo,
        ],
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const handleTablaChange = useCallback((edits: EditsMap) => {
    setTablaEdits(edits);
  }, []);

  const handleAddConcepto = useCallback((codigos: string[]) => {
    setActiveCodigos((prev) => new Set([...prev, ...codigos]));
  }, []);

  const handleRemoveConcepto = useCallback((codigo: string) => {
    setActiveCodigos((prev) => {
      const next = new Set(prev);
      next.delete(codigo);
      return next;
    });
  }, []);

  // Auto-agregar concepto SAC (41 ó 42) cuando el período es mes 06 ó 12
  // y aún no hay ninguno de los dos en la tabla de conceptos.
  useEffect(() => {
    const periodo = flowHeader?.periodo ?? '';
    const mesStr = periodo.split('-')[1] ?? '';
    if (mesStr !== '06' && mesStr !== '12') return;
    const mejorSueldo = ultimoRecibo?.mejorSueldoSemestre ?? 0;
    if (mejorSueldo <= 0) return;
    const codigoSac = diasSemestre >= 180 ? '41' : '42';
    const otroSac = codigoSac === '41' ? '42' : '41';
    setActiveCodigos((prev) => {
      if (prev.has('41') || prev.has('42')) return prev; // ya tiene uno, no tocar
      const next = new Set(prev);
      next.add(codigoSac);
      next.delete(otroSac);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowHeader?.periodo, ultimoRecibo?.mejorSueldoSemestre, diasSemestre]);

  // Cuando llega initialData (desde "Editar" en la solapa Recibo), pre-carga el simulador.
  // No usamos guard de referencia: el prop solo cambia cuando el usuario hace click en "Editar"
  // (viene de useState en el padre), y queremos reinicializar siempre para que reciboIdToLoad
  // se setee correctamente aunque haya quedado en null por una operación previa.
  useEffect(() => {
    if (!initialData) return;
    setFlowHeader({
      importEmpleadoId: initialData.importEmpleadoId,
      empleadoNombre: initialData.empleadoNombre,
      periodo: initialData.periodo,
      tipoRecibo: initialData.tipoRecibo as TipoReciboGuardar,
      copiarUltimoRecibo: true,
      antiguedadAnios: null,
      quincena: (initialData.quincena as '0' | '1' | '2') ?? undefined,
      fechaLiquidacion: initialData.fechaLiquidacion ?? undefined,
      fechaPago: initialData.fechaPago ?? undefined,
      obraSocialId: initialData.obraSocialId ?? undefined,
      periodoCargas: initialData.periodoCargas ?? undefined,
      fechaDepositoCargas: initialData.fechaDepositoCargas ?? undefined,
      observacionInterna: initialData.observacionInterna ?? undefined,
      observacionRecibo: initialData.observacionRecibo ?? undefined,
      situacionRevista1Id: initialData.situacionRevista1Id,
      situacionRevista1DiaInicio: initialData.situacionRevista1DiaInicio,
      situacionRevista2Id: initialData.situacionRevista2Id,
      situacionRevista2DiaInicio: initialData.situacionRevista2DiaInicio,
      situacionRevista3Id: initialData.situacionRevista3Id,
      situacionRevista3DiaInicio: initialData.situacionRevista3DiaInicio,
      diasTrabajados: initialData.diasTrabajados,
      horasTrabajadas: initialData.horasTrabajadas,
      importeMaternidadArt13: initialData.importeMaternidadArt13,
    });
    setSosEmpleadoId(initialData.importEmpleadoId);
    setReciboIdToLoad(initialData.reciboId ?? null);
    setTablaEdits({});
    // No reseteamos activeCodigos aquí: Effect 3 (declarado antes) ya se ejecuta
    // con `initialData` como dep y carga los códigos del recibo. Si lo resetearamos
    // aquí (declarado después), sobreescribiríamos el set de Effect 3 con Set vacío.
    setRecalcularConEscalaVigente(true);
  }, [initialData]);

  const onFormSuccess = useCallback(
    (payload: {
      importEmpleadoId: string;
      empleadoNombre: string;
      periodo: string;
      tipoRecibo: string;
      copiarUltimoRecibo: boolean;
      antiguedadAnios: number | null;
      fechaAlta: string | null;
      fechaIngreso: string | null;
      quincena: '0' | '1' | '2';
      fechaLiquidacion: string;
      obraSocialId: string | null;
      fechaPago: string;
      formaPago: 'efectivo' | 'deposito' | 'transferencia' | 'cheque';
      cbu: string | null;
      banco: string | null;
      periodoCargas: string;
      fechaDepositoCargas: string | null;
      observacionInterna: string | null;
      observacionRecibo: string | null;
      situacionRevista1Id?: string | null;
      situacionRevista1DiaInicio?: number | null;
      situacionRevista2Id?: string | null;
      situacionRevista2DiaInicio?: number | null;
      situacionRevista3Id?: string | null;
      situacionRevista3DiaInicio?: number | null;
      diasTrabajados?: number | null;
      horasTrabajadas?: number | null;
      importeMaternidadArt13?: string | null;
    }) => {
      setFlowHeader({
        importEmpleadoId: payload.importEmpleadoId,
        empleadoNombre: payload.empleadoNombre,
        periodo: payload.periodo,
        tipoRecibo: payload.tipoRecibo as TipoReciboGuardar,
        copiarUltimoRecibo: payload.copiarUltimoRecibo,
        antiguedadAnios: payload.antiguedadAnios,
        fechaAlta: payload.fechaAlta,
        fechaIngreso: payload.fechaIngreso,
        quincena: payload.quincena,
        fechaLiquidacion: payload.fechaLiquidacion,
        obraSocialId: payload.obraSocialId,
        fechaPago: payload.fechaPago,
        formaPago: payload.formaPago,
        cbu: payload.cbu,
        banco: payload.banco,
        periodoCargas: payload.periodoCargas,
        fechaDepositoCargas: payload.fechaDepositoCargas,
        observacionInterna: payload.observacionInterna,
        observacionRecibo: payload.observacionRecibo,
        situacionRevista1Id: payload.situacionRevista1Id,
        situacionRevista1DiaInicio: payload.situacionRevista1DiaInicio,
        situacionRevista2Id: payload.situacionRevista2Id,
        situacionRevista2DiaInicio: payload.situacionRevista2DiaInicio,
        situacionRevista3Id: payload.situacionRevista3Id,
        situacionRevista3DiaInicio: payload.situacionRevista3DiaInicio,
        diasTrabajados: payload.diasTrabajados,
        horasTrabajadas: payload.horasTrabajadas,
        importeMaternidadArt13: payload.importeMaternidadArt13,
      });
      queryClient.invalidateQueries({
        queryKey: [
          'basico-empleado-periodo',
          clientId,
          payload.importEmpleadoId,
          payload.periodo,
        ],
      });
      // Siempre setear sosEmpleadoId para que getUltimoReciboImportado cargue
      // mejorSueldoSemestre (necesario para conceptos 41/42 en meses 06/12).
      setSosEmpleadoId(payload.importEmpleadoId);
      setReciboIdToLoad(null);
      setTablaEdits({});
      setActiveCodigos(new Set());
      setRecalcularConEscalaVigente(payload.copiarUltimoRecibo);
    },
    []
  );

  const resetFlow = useCallback(() => {
    setFlowHeader(null);
    setInitialFormValues(null);
    setSosEmpleadoId(null);
    setReciboIdToLoad(null);
    setTablaEdits({});
    setActiveCodigos(new Set());
    setRecalcularConEscalaVigente(false);
    onReset?.();
  }, [onReset]);

  const editarDatos = useCallback(() => {
    if (!flowHeader) return;
    const [ano, mes] = flowHeader.periodo.split('-');
    // `periodoCargas` viaja como 'YYYY-MM' (ver ReciboFormulario.onSubmit).
    const [anoCargas, mesCargas] = flowHeader.periodoCargas
      ? flowHeader.periodoCargas.split('-')
      : [ano, mes];
    setInitialFormValues({
      importEmpleadoId: flowHeader.importEmpleadoId,
      ano,
      mes,
      quincena: flowHeader.quincena ?? '0',
      tipoRecibo: flowHeader.tipoRecibo,
      fechaLiquidacion: flowHeader.fechaLiquidacion ?? '',
      fechaPago: flowHeader.fechaPago ?? '',
      anoCargas: anoCargas?.trim() ?? ano,
      mesCargas: mesCargas?.trim() ?? mes,
      fechaDepositoCargas: flowHeader.fechaDepositoCargas ?? '',
      observacionInterna: flowHeader.observacionInterna ?? '',
      observacionRecibo: flowHeader.observacionRecibo ?? '',
      copiarUltimoRecibo: flowHeader.copiarUltimoRecibo ? 'si' : 'no',
      situacionRevista1Id: flowHeader.situacionRevista1Id ?? '',
      situacionRevista1DiaInicio: flowHeader.situacionRevista1DiaInicio != null
        ? String(flowHeader.situacionRevista1DiaInicio) : '1',
      situacionRevista2Id: flowHeader.situacionRevista2Id ?? '',
      situacionRevista2DiaInicio: flowHeader.situacionRevista2DiaInicio != null
        ? String(flowHeader.situacionRevista2DiaInicio) : '',
      situacionRevista3Id: flowHeader.situacionRevista3Id ?? '',
      situacionRevista3DiaInicio: flowHeader.situacionRevista3DiaInicio != null
        ? String(flowHeader.situacionRevista3DiaInicio) : '',
      diasTrabajados: flowHeader.diasTrabajados != null
        ? String(flowHeader.diasTrabajados) : '',
      horasTrabajadas: flowHeader.horasTrabajadas != null
        ? String(flowHeader.horasTrabajadas) : '',
      importeMaternidadArt13: flowHeader.importeMaternidadArt13 ?? '',
    });
    setFlowHeader(null);
  }, [flowHeader]);

  const puedeGuardar =
    !!flowHeader &&
    (showImportadoTable || showManualTable) &&
    permiteLiquidar &&
    !guardarRecibo.isPending;

  return (
    <div className="space-y-6">
      {/* Formulario: visible solo mientras no hay cabecera creada */}
      {!flowHeader && (
        <ReciboFormulario
          clientId={clientId}
          onSuccess={onFormSuccess}
          initialValues={initialFormValues ?? undefined}
        />
      )}

      {/* Banner resumen + selector de origen + botón "Nuevo recibo" */}
      {!!flowHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm">
              <span className="font-medium">{flowHeader.empleadoNombre}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">Período {flowHeader.periodo}</span>
            </div>
            <Select
              value={flowHeader.copiarUltimoRecibo ? 'si' : 'no'}
              onValueChange={(val) => {
                const copiar = val === 'si';
                setFlowHeader((prev) =>
                  prev ? { ...prev, copiarUltimoRecibo: copiar } : null
                );
                setSosEmpleadoId(flowHeader.importEmpleadoId);
                setTablaEdits({});
                setRecalcularConEscalaVigente(copiar);
              }}
            >
              <SelectTrigger className="h-8 w-auto gap-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no">Carga manual</SelectItem>
                <SelectItem value="si">Copiar último recibo</SelectItem>
              </SelectContent>
            </Select>
            {isCopyMode && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={recalcularConEscalaVigente}
                  onCheckedChange={setRecalcularConEscalaVigente}
                />
                Recalcular con escala vigente
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={editarDatos} className="gap-1.5 text-muted-foreground">
              Editar datos
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={resetFlow} className="gap-1.5">
              <FilePlus2 className="h-4 w-4" />
              Nuevo recibo
            </Button>
          </div>
        </div>
      )}

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

      {showBase && (fechaAltaDisplay || fechaIngresoDisplay) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-border/50 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">Fecha de alta (antigüedad):</span>{' '}
            {fmtDate(fechaAltaDisplay)}
          </span>
          <span>
            <span className="font-medium text-foreground">Fecha de ingreso:</span>{' '}
            {fmtDate(fechaIngresoDisplay)}
          </span>
          {flowHeader?.antiguedadAnios != null && (
            <span>
              <span className="font-medium text-foreground">Antigüedad:</span>{' '}
              {flowHeader.antiguedadAnios} {flowHeader.antiguedadAnios === 1 ? 'año' : 'años'}
            </span>
          )}
        </div>
      )}

      {showImportadoTable && (
        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              Conceptos — copia del último recibo
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Conceptos del último recibo pre-cargados. Podés editar cualquier fila o agregar
              conceptos extra con el botón + de cada sección.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loadingBasico && basicoEscala >= 0 && (
              <div className={`rounded-md border px-3 py-2 text-xs ${sinEscalaParaPeriodo ? 'border-amber-300/60 bg-amber-50/50 text-amber-900' : 'border-emerald-300/60 bg-emerald-50/50 text-emerald-950'}`}>
                {sinEscalaParaPeriodo ? (
                  <>
                    Sin escala cargada para{' '}
                    <span className="font-semibold">{flowHeader!.periodo}</span>.{' '}
                    Usando la más reciente
                    {fallbackPeriodoLabel && <> ({fallbackPeriodoLabel})</>}
                    :{' '}
                    <span className="font-mono font-semibold">
                      ${moneyFmt(basicoEscala)}
                    </span>
                    {categoriaEscala && (
                      <> · Categoría: <span className="font-semibold">{categoriaEscala}</span></>
                    )}
                    . Cargá la escala del período en Convenios.
                  </>
                ) : (
                  <>
                    Escala vigente para período{' '}
                    <span className="font-semibold">{flowHeader!.periodo}</span>
                    {periodoEscalaLabel && (
                      <> (<span className="font-semibold">{periodoEscalaLabel}</span>)</>
                    )}
                    :{' '}
                    <span className="font-mono font-semibold">
                      ${moneyFmt(basicoEscala)}
                    </span>
                    {categoriaEscala && (
                      <> · Categoría: <span className="font-semibold">{categoriaEscala}</span></>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="rounded-lg border bg-background p-3">
            <TablaReciboSos
              key={`${plantillaKey}|${ultimoRecibo.recibo.id}`}
              variant="importado"
              recibo={ultimoRecibo.recibo}
              conceptos={conceptosFilas}
              basico={basicoEscala}
              basicoJornadaCompleta={basicoJornadaCompleta}
              mejorSueldoSemestre={ultimoRecibo.mejorSueldoSemestre ?? 0}
              diasSemestre={diasSemestre}
              brutoMesAnterior={brutoMesAnterior}
              activeCodigos={activeCodigos}
              catalogoCompleto={conceptosFilas}
              onAddConcepto={handleAddConcepto}
              onRemoveConcepto={handleRemoveConcepto}
              recalculateWithBasico={recalcularConEscalaVigente}
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
                Cargando escala salarial…
              </p>
            ) : (
              <>
                <div className={`rounded-md border px-3 py-2 text-xs ${sinEscalaParaPeriodo ? 'border-amber-300/60 bg-amber-50/50 text-amber-900' : 'border-emerald-300/60 bg-emerald-50/50 text-emerald-950'}`}>
                  {sinEscalaParaPeriodo ? (
                    <>
                      Sin escala cargada para{' '}
                      <span className="font-semibold">{flowHeader!.periodo}</span>.{' '}
                      Usando la más reciente
                      {fallbackPeriodoLabel && (
                        <> ({fallbackPeriodoLabel})</>
                      )}
                      :{' '}
                      <span className="font-mono font-semibold">
                        ${moneyFmt(basicoEscala)}
                      </span>
                      {categoriaEscala && (
                        <>
                          {' '}
                          · Categoría: <span className="font-semibold">{categoriaEscala}</span>
                        </>
                      )}
                      . Cargá la escala del período en Convenios.
                    </>
                  ) : (
                    <>
                      Escala vigente para período{' '}
                      <span className="font-semibold">{flowHeader!.periodo}</span>
                      {periodoEscalaLabel && (
                        <>
                          {' '}
                          (<span className="font-semibold">{periodoEscalaLabel}</span>)
                        </>
                      )}
                      :{' '}
                      <span className="font-mono font-semibold">
                        ${moneyFmt(basicoEscala)}
                      </span>
                      {categoriaEscala && (
                        <>
                          {' '}
                          · Categoría: <span className="font-semibold">{categoriaEscala}</span>
                        </>
                      )}
                    </>
                  )}
                </div>
                {basicoEscala === 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="flex-1">
                      El sueldo básico de este empleado es <strong>$0</strong>. Los cálculos no se realizarán correctamente.
                      Ingresá el monto manualmente:
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 w-36 text-sm"
                        placeholder="Ej: 850000"
                        value={basicoOverrideInput}
                        onChange={(e) => setBasicoOverrideInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') guardarBasicoOverride.mutate();
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => guardarBasicoOverride.mutate()}
                        disabled={guardarBasicoOverride.isPending || !basicoOverrideInput}
                      >
                        {guardarBasicoOverride.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Guardar sueldo
                      </Button>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border bg-background p-3">
                <TablaReciboSos
                  key={plantillaKey}
                  variant="manual"
                  recibo={reciboHeaderSimulado}
                  conceptos={conceptosFilas}
                  basico={basicoEscala}
                  basicoJornadaCompleta={basicoJornadaCompleta}
                  mejorSueldoSemestre={ultimoRecibo?.mejorSueldoSemestre ?? 0}
                  diasSemestre={diasSemestre}
                  brutoMesAnterior={brutoMesAnterior}
                  activeCodigos={activeCodigos}
                  catalogoCompleto={conceptosFilas}
                  onAddConcepto={handleAddConcepto}
                  onRemoveConcepto={handleRemoveConcepto}
                  recalculateWithBasico={
                    isCopyMode && recalcularConEscalaVigente && !ultimoRecibo
                  }
                  onChange={handleTablaChange}
                  firmaEmpleadorUrl={firmaEmpleadorUrl}
                />
                </div>
                <div className="flex flex-col items-end gap-2">
                  {!permiteLiquidar && (
                    <span className="text-xs text-muted-foreground">
                      No se puede guardar períodos futuros.
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
