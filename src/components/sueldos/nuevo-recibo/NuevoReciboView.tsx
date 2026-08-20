/**
 * Vista "Nuevo recibo" (rediseño de una sola pantalla).
 *
 * Formulario a la izquierda + aside sticky con el recibo en vivo. La carga
 * manual de conceptos abre un drawer con autosave a BD: cada edición debounced
 * 450ms llama a `guardarReciboDesdeTabla` (confirmado=false); "Emitir recibo"
 * hace flush + confirmar. La vista clásica (wizard) sigue disponible vía toggle.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  confirmarReciboLiquidacion,
  getBasicoParaEmpleadoPeriodo,
  getUltimoReciboImportado,
  guardarReciboDesdeTabla,
  listConceptosPlantillaManualSos,
  listConvenios,
  listImportEmpleadosConConfig,
  listImportRecibosByPeriodo,
  listSituaciones,
} from '@/actions/sueldos';
import type {
  ConceptoImportado,
  EditsMap,
} from '@/components/sueldos/TablaReciboSos';
import {
  calcularDiasSemestre,
  puedeLiquidarPeriodo,
} from '@/lib/payroll-period-rules';
import { getPeriodoMesAnterior } from '@/lib/payroll-period-rules';
import {
  aplicarDefaultsSos,
  codigosActivosDeConceptos,
  codigosActivosIniciales,
  conceptosParaGuardar,
} from '@/lib/sos-defaults';
import type { AutosaveEstado } from './AutosaveChip';
import { ConceptosDrawer } from './ConceptosDrawer';
import { ConceptosResumenCard } from './ConceptosResumenCard';
import { EmpleadoPeriodoCard } from './EmpleadoPeriodoCard';
import { ReciboAside, type ControlPrevio } from './ReciboAside';
import {
  RevistaNovedadesCard,
  type SituacionSel,
} from './RevistaNovedadesCard';
import {
  calcularRecibo,
  seedEditRow,
  useReciboCalculo,
} from './useReciboCalculo';
import {
  antiguedadAnios,
  fechaDepositoCargasDe,
  fechaPagoDe,
  fmtMonto,
  MES_NOMBRES,
  pad2,
  periodoDe,
  TIPO_LABELS,
  ultimoDiaDelMes,
  type EmpleadoConfigRow,
  type Quincena,
  type TipoReciboNuevo,
} from './types';

const SIT_VACIA: SituacionSel = { situacionId: null, diaInicio: '' };

export interface NuevoReciboViewProps {
  clientId: string;
  onConfirmRecibo?: (periodo: string, reciboId: string) => void;
}

export function NuevoReciboView({
  clientId,
  onConfirmRecibo,
}: NuevoReciboViewProps) {
  const queryClient = useQueryClient();

  // ------------------------------------------------------------------ estado
  const mesAnterior = getPeriodoMesAnterior(); // 'YYYY-MM'
  const [empleadoSel, setEmpleadoSel] = useState<EmpleadoConfigRow | null>(
    null
  );
  const [tipo, setTipo] = useState<TipoReciboNuevo>('mensual');
  const [anio, setAnio] = useState(() => Number(mesAnterior.slice(0, 4)));
  const [mes, setMes] = useState(() => Number(mesAnterior.slice(5, 7)));
  const [quincena, setQuincena] = useState<Quincena>('0');
  const [dias, setDias] = useState('');
  const [horas, setHoras] = useState('');
  const [maternidad, setMaternidad] = useState(false);
  const [situacionesSel, setSituacionesSel] = useState<
    [SituacionSel, SituacionSel, SituacionSel]
  >([SIT_VACIA, SIT_VACIA, SIT_VACIA]);
  const [obsInterna, setObsInterna] = useState('');
  const [obsRecibo, setObsRecibo] = useState('');
  const [revistaAbierta, setRevistaAbierta] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiarUltimo, setCopiarUltimo] = useState(false);
  const [fechaBaja, setFechaBaja] = useState('');
  const [edits, setEdits] = useState<EditsMap>({});
  const [activeCodigos, setActiveCodigos] = useState<Set<string>>(new Set());
  const [emitido, setEmitido] = useState<{ reciboId: string } | null>(null);
  const [autosaveEstado, setAutosaveEstado] =
    useState<AutosaveEstado>('inicial');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const emp = empleadoSel?.empleado ?? null;
  const empId = emp?.id ?? null;
  const periodo = periodoDe(anio, mes);
  const periodoLiquidable = puedeLiquidarPeriodo(periodo);
  const tipoPersistido: TipoReciboNuevo =
    tipo === 'mensual' && quincena !== '0' ? 'quincenal' : tipo;
  const periodoLabel = `${MES_NOMBRES[mes - 1]} ${anio}${
    quincena !== '0' ? ` · ${quincena === '1' ? '1ra' : '2da'} quincena` : ''
  }`;

  // ----------------------------------------------------------------- queries
  const { data: empleados = [] } = useQuery({
    queryKey: ['import-empleados-config', clientId],
    queryFn: () => listImportEmpleadosConConfig({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId],
    queryFn: () => listConvenios({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: situaciones = [] } = useQuery({
    queryKey: ['catalog-situaciones'],
    queryFn: () => listSituaciones(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: plantillaManual = [] } = useQuery({
    queryKey: ['plantilla-manual-sos', clientId],
    queryFn: () => listConceptosPlantillaManualSos({ data: { clientId } }),
    enabled: !!clientId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: basicoData } = useQuery({
    queryKey: ['basico-empleado-periodo', clientId, empId, periodo],
    queryFn: () =>
      getBasicoParaEmpleadoPeriodo({
        data: { clientId, importEmpleadoId: empId!, periodo },
      }),
    enabled: !!clientId && !!empId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: recibosPeriodo = [] } = useQuery({
    queryKey: ['import-recibos', clientId, periodo],
    queryFn: () => listImportRecibosByPeriodo({ data: { clientId, periodo } }),
    enabled: !!clientId,
  });

  // Recibo ya existente del mismo (empleado, período, tipo) — misma clave que el upsert del server.
  const existingRecibo = useMemo(() => {
    if (!empId) return null;
    return (
      recibosPeriodo.find(
        (r) => r.recibo.empleadoId === empId && r.recibo.tipo === tipoPersistido
      ) ?? null
    );
  }, [recibosPeriodo, empId, tipoPersistido]);

  const { data: ultimoRecibo } = useQuery({
    queryKey: [
      'ultimo-recibo-importado',
      clientId,
      empId,
      existingRecibo?.recibo.id ?? null,
      periodo,
    ],
    queryFn: () =>
      getUltimoReciboImportado({
        data: {
          clientId,
          importEmpleadoId: empId!,
          liquidacionId: existingRecibo?.recibo.id,
          periodoSemestre: periodo,
        },
      }),
    enabled: !!clientId && !!empId,
  });

  // --------------------------------------------------------------- derivados
  const basicoEscala = basicoData?.basico ?? 0;
  const esExcluidoConvenio = basicoData?.esExcluidoConvenio ?? false;
  const esValorHoraCat = basicoData?.esValorHoraCat ?? false;
  const fechaIngreso = basicoData?.fechaIngreso ?? emp?.fechaAlta ?? null;
  const antiguedad = antiguedadAnios(emp?.fechaAlta, anio, mes);

  const convenioNombre = useMemo(() => {
    if (!emp?.convenioId) return null;
    return convenios.find((c) => c.id === emp.convenioId)?.nombre ?? null;
  }, [convenios, emp?.convenioId]);

  // Bruto del período anterior: solo si el recibo cargado NO es el del período actual.
  const brutoMesAnterior = useMemo(() => {
    if (!ultimoRecibo) return 0;
    const esDelPeriodo = ultimoRecibo.recibo.periodo?.slice(0, 7) === periodo;
    if (esDelPeriodo) return 0;
    return (
      Number(ultimoRecibo.recibo.haberes ?? 0) +
      Number(ultimoRecibo.recibo.noRemunerativo ?? 0)
    );
  }, [ultimoRecibo, periodo]);

  const diasSemestre = useMemo(() => {
    if (mes !== 6 && mes !== 12) return 180;
    return calcularDiasSemestre(fechaIngreso, periodo);
  }, [mes, fechaIngreso, periodo]);

  // ¿Se precargan conceptos de un recibo (existente o copia del último)?
  const usaRecibo = !!ultimoRecibo && (!!existingRecibo || copiarUltimo);

  const conceptosFilas: ConceptoImportado[] = useMemo(() => {
    if (plantillaManual.length === 0) return [];
    let filas: ConceptoImportado[];
    if (usaRecibo && ultimoRecibo) {
      const refATexto = (v: number | null) => (v != null ? String(v) : null);
      const ultimoByCode = new Map(
        ultimoRecibo.conceptos.map((c) => [c.codigo, c])
      );
      const plantillaCodes = new Set(plantillaManual.map((p) => p.codigo));
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
    return aplicarDefaultsSos(filas, antiguedad);
  }, [plantillaManual, usaRecibo, ultimoRecibo, antiguedad]);

  const plantillaKey = useMemo(
    () => plantillaManual.map((c) => c.id).join('|'),
    [plantillaManual]
  );

  // Reset de edits y códigos activos al cambiar de clave (empleado/período/tipo/modo).
  const claveRecibo = `${empId ?? ''}|${periodo}|${tipoPersistido}|${usaRecibo ? (ultimoRecibo?.recibo.id ?? 'cargando') : 'plantilla'}|${plantillaKey}`;
  const claveAnterior = useRef(claveRecibo);
  useEffect(() => {
    if (claveAnterior.current === claveRecibo) return;
    claveAnterior.current = claveRecibo;
    setEdits({});
    setEmitido(null);
    setAutosaveEstado(periodoLiquidable ? 'inicial' : 'bloqueado');
    if (usaRecibo && ultimoRecibo) {
      setActiveCodigos(codigosActivosDeConceptos(ultimoRecibo.conceptos));
    } else {
      setActiveCodigos(
        codigosActivosIniciales({
          esExcluidoConvenio,
          esValorHoraCat,
          plantillaBaseCodes: plantillaManual
            .filter(
              (c) =>
                (
                  c as (typeof plantillaManual)[number] & {
                    isPlantillaBase?: boolean;
                  }
                ).isPlantillaBase
            )
            .map((c) => c.codigo),
        })
      );
    }
  }, [
    claveRecibo,
    usaRecibo,
    ultimoRecibo,
    esExcluidoConvenio,
    esValorHoraCat,
    plantillaManual,
    periodoLiquidable,
  ]);

  // Días trabajados aplicados al concepto 1 aunque los edits se hayan
  // reseteado (cambio de tipo — p. ej. liquidación final — o copia del último
  // recibo): overlay declarativo, la edición manual de la fila 1 gana (TIN-1304).
  const editsConDias = useMemo<EditsMap>(() => {
    if (dias === '' || edits['1'] || !activeCodigos.has('1')) return edits;
    const c1 = conceptosFilas.find((c) => c.codigo === '1');
    if (!c1) return edits;
    return {
      ...edits,
      '1': { ...seedEditRow(c1), cantidad: dias, monto: '' },
    };
  }, [edits, dias, activeCodigos, conceptosFilas]);

  // ---------------------------------------------------------------- cálculo
  const calculo = useReciboCalculo({
    conceptos: conceptosFilas,
    activeCodigos,
    edits: editsConDias,
    basicoEscala,
    basicoJornadaCompleta: basicoEscala,
    mejorSueldoSemestre: ultimoRecibo?.mejorSueldoSemestre ?? 0,
    diasSemestre,
    brutoMesAnterior,
  });

  // ---------------------------------------------------------------- autosave
  const guardarPayload = useCallback(() => {
    if (!emp) return null;
    const filasActivas = conceptosFilas.filter((c) =>
      activeCodigos.has(c.codigo)
    );
    // Se guardan los edits calculados (post-cascade): la BD queda con los mismos
    // montos que muestra el aside, y el server (monto gana) llega al mismo neto.
    const conceptos = conceptosParaGuardar(
      filasActivas,
      calcularRecibo({
        conceptos: conceptosFilas,
        activeCodigos,
        edits: editsConDias,
        basicoEscala,
        basicoJornadaCompleta: basicoEscala,
        mejorSueldoSemestre: ultimoRecibo?.mejorSueldoSemestre ?? 0,
        diasSemestre,
        brutoMesAnterior,
      }).editsCalculados
    );
    if (conceptos.length === 0) return null;
    const ultimoDia = ultimoDiaDelMes(anio, mes);
    const s = situacionesSel;
    return {
      clientId,
      importEmpleadoId: emp.id,
      periodo,
      tipoRecibo: tipoPersistido,
      conceptos,
      quincena,
      fechaLiquidacion: `${anio}-${pad2(mes)}-${pad2(ultimoDia)}`,
      obraSocialId: emp.obraSocialId ?? null,
      fechaPago: fechaPagoDe(anio, mes, quincena),
      formaPago: emp.formaPago ?? undefined,
      cbu: emp.cbu ?? null,
      banco: emp.banco ?? null,
      periodoCargas: periodo,
      fechaDepositoCargas: fechaDepositoCargasDe(anio, mes),
      observacionInterna: obsInterna || null,
      observacionRecibo: obsRecibo || null,
      situacionRevista1Id: s[0].situacionId,
      situacionRevista1DiaInicio: s[0].situacionId
        ? Number(s[0].diaInicio) || 1
        : null,
      situacionRevista2Id: s[1].situacionId,
      situacionRevista2DiaInicio: s[1].situacionId
        ? Number(s[1].diaInicio) || 1
        : null,
      situacionRevista3Id: s[2].situacionId,
      situacionRevista3DiaInicio: s[2].situacionId
        ? Number(s[2].diaInicio) || 1
        : null,
      diasTrabajados: dias !== '' ? parseInt(dias, 10) : null,
      horasTrabajadas: horas !== '' ? Math.round(Number(horas)) || 0 : null,
      importeMaternidadArt13: null,
      fechaBaja: fechaBaja.trim() || null,
    };
  }, [
    emp,
    conceptosFilas,
    activeCodigos,
    editsConDias,
    basicoEscala,
    ultimoRecibo?.mejorSueldoSemestre,
    diasSemestre,
    brutoMesAnterior,
    anio,
    mes,
    quincena,
    periodo,
    tipoPersistido,
    clientId,
    situacionesSel,
    obsInterna,
    obsRecibo,
    dias,
    horas,
    fechaBaja,
  ]);

  const payloadRef = useRef(guardarPayload);
  payloadRef.current = guardarPayload;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const lastReciboIdRef = useRef<string | null>(null);
  const liquidableRef = useRef(periodoLiquidable);
  liquidableRef.current = periodoLiquidable;

  const ejecutarGuardado = useCallback(async (): Promise<string | null> => {
    const payload = payloadRef.current();
    if (!payload) return lastReciboIdRef.current;
    if (!liquidableRef.current) {
      setAutosaveEstado('bloqueado');
      return null;
    }
    if (inFlightRef.current) {
      pendingRef.current = true;
      return lastReciboIdRef.current;
    }
    inFlightRef.current = true;
    setAutosaveEstado('guardando');
    try {
      const res = await guardarReciboDesdeTabla({ data: payload });
      lastReciboIdRef.current = res.reciboId;
      setAutosaveEstado('guardado');
      setSavedAt(new Date());
      void queryClient.invalidateQueries({
        queryKey: ['import-recibos', clientId, res.periodo],
      });
      return res.reciboId;
    } catch (e) {
      setAutosaveEstado('error');
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
      return null;
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void ejecutarGuardado();
      }
    }
  }, [clientId, queryClient]);

  const programarGuardado = useCallback(() => {
    if (!liquidableRef.current) {
      setAutosaveEstado('bloqueado');
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void ejecutarGuardado();
    }, 450);
  }, [ejecutarGuardado]);

  /** Flush inmediato con el snapshot actual (llamar ANTES de cambiar de clave). */
  const flushGuardado = useCallback(() => {
    if (!debounceRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    void ejecutarGuardado();
  }, [ejecutarGuardado]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // ------------------------------------------------------------- mutaciones
  const emitir = useMutation({
    mutationFn: async () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const reciboId = await ejecutarGuardado();
      if (!reciboId) throw new Error('No se pudo guardar el recibo');
      await confirmarReciboLiquidacion({
        data: { liquidacionId: reciboId, clientId },
      });
      return reciboId;
    },
    onSuccess: (reciboId) => {
      setEmitido({ reciboId });
      toast.success('Recibo emitido');
      void queryClient.invalidateQueries({
        queryKey: ['import-recibos', clientId, periodo],
      });
      void queryClient.invalidateQueries({
        queryKey: ['ultimo-recibo-importado', clientId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['liquidaciones-filtros', clientId],
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al emitir'),
  });

  // ---------------------------------------------------------------- handlers
  const cambiarClave = useCallback(
    (aplicar: () => void) => {
      flushGuardado();
      setCopiarUltimo(false);
      aplicar();
    },
    [flushGuardado]
  );

  const onEditField = useCallback(
    (codigo: string, field: keyof EditsMap[string], value: string) => {
      setEdits((prev) => {
        const base = prev[codigo] ??
          calculo.editsCalculados[codigo] ?? {
            monto: '',
            montoFijo: '',
            cantidad: '',
            porcentaje: '',
            importeConceptoNumero: '',
            importe: '',
            importeMinimo: '',
            importeMaximo: '',
            memo: '',
          };
        const next = { ...base, [field]: value };
        // Si edita un insumo de la fórmula, vaciar monto para que recalcule.
        if (field !== 'monto' && field !== 'memo') next.monto = '';
        return { ...prev, [codigo]: next };
      });
      programarGuardado();
    },
    [calculo.editsCalculados, programarGuardado]
  );

  const onToggleConcepto = useCallback(
    (codigo: string, activo: boolean) => {
      setActiveCodigos((prev) => {
        const next = new Set(prev);
        if (activo) next.add(codigo);
        else next.delete(codigo);
        return next;
      });
      if (!activo) {
        setEdits((prev) => {
          if (!(codigo in prev)) return prev;
          const next = { ...prev };
          delete next[codigo];
          return next;
        });
      }
      programarGuardado();
    },
    [programarGuardado]
  );

  const onDiasChange = useCallback(
    (v: string) => {
      setDias(v);
      // Sincroniza la cantidad del concepto 1 (sueldo básico por días).
      if (v !== '' && activeCodigos.has('1')) {
        onEditField('1', 'cantidad', v);
      } else {
        programarGuardado();
      }
    },
    [activeCodigos, onEditField, programarGuardado]
  );

  // -------------------------------------------------------------- controles
  const controles: ControlPrevio[] = useMemo(() => {
    if (!emp) return [];
    const c: ControlPrevio[] = [];
    c.push(
      emp.convenioId
        ? {
            nivel: 'ok',
            texto: `Convenio y categoría configurados${convenioNombre ? ` (${convenioNombre})` : ''}`,
          }
        : { nivel: 'warn', texto: 'El empleado no tiene convenio asignado' }
    );
    if (basicoData) {
      if (basicoEscala > 0 && !basicoData.sinEscalaParaPeriodo) {
        // Escala sin correcciones desde antes del período liquidado: el básico
        // puede estar desactualizado respecto del convenio (TIN-1301).
        const actualizadaAt = basicoData.escalaActualizadaAt
          ? new Date(basicoData.escalaActualizadaAt)
          : null;
        const inicioPeriodo = new Date(anio, mes - 1, 1);
        if (actualizadaAt && actualizadaAt < inicioPeriodo) {
          c.push({
            nivel: 'warn',
            texto: `La escala del período no se actualiza desde el ${actualizadaAt.toLocaleDateString('es-AR')} — verificá el básico ${fmtMonto(basicoEscala)} contra el convenio`,
          });
        } else {
          c.push({
            nivel: 'ok',
            texto: `Escala vigente: básico ${fmtMonto(basicoEscala)}`,
          });
        }
      } else if (basicoEscala > 0) {
        c.push({
          nivel: 'warn',
          texto: `Sin escala para el período — se usa ${basicoData.fallbackPeriodoLabel ?? 'la última disponible'}`,
        });
      } else {
        c.push({
          nivel: 'warn',
          texto: 'Sin básico de escala para el período',
        });
      }
    }
    c.push(
      existingRecibo
        ? {
            nivel: 'info',
            texto: 'Ya hay un recibo de este período — al guardar se actualiza',
          }
        : { nivel: 'ok', texto: 'Sin recibo previo del período' }
    );
    if (!periodoLiquidable) {
      c.push({
        nivel: 'warn',
        texto: 'Período no liquidable — no se puede guardar ni emitir',
      });
    }
    const baseDias = quincena === '0' ? 30 : 15;
    if (dias !== '' && Number(dias) < baseDias) {
      c.push({
        nivel: 'info',
        texto: `Liquidación parcial: ${dias} de ${baseDias} días`,
      });
    }
    if (
      (emp.formaPago === 'transferencia' || emp.formaPago === 'deposito') &&
      !emp.cbu
    ) {
      c.push({
        nivel: 'warn',
        texto: 'Forma de pago bancaria sin CBU cargado',
      });
    }
    return c;
  }, [
    emp,
    convenioNombre,
    basicoData,
    basicoEscala,
    existingRecibo,
    periodoLiquidable,
    quincena,
    dias,
    anio,
    mes,
  ]);

  const legajosLiquidados = useMemo(
    () => new Set(recibosPeriodo.map((r) => r.recibo.empleadoId)).size,
    [recibosPeriodo]
  );

  const puedeEmitir =
    !!emp &&
    periodoLiquidable &&
    conceptosFilas.some((c) => activeCodigos.has(c.codigo)) &&
    !emitir.isPending;

  const resetParaOtro = useCallback(() => {
    setEmpleadoSel(null);
    setEmitido(null);
    setEdits({});
    setActiveCodigos(new Set());
    setCopiarUltimo(false);
    setDias('');
    setHoras('');
    setMaternidad(false);
    setSituacionesSel([SIT_VACIA, SIT_VACIA, SIT_VACIA]);
    setObsInterna('');
    setObsRecibo('');
    setAutosaveEstado('inicial');
    lastReciboIdRef.current = null;
  }, []);

  // ------------------------------------------------------------------ render
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(560px,1fr)_372px] gap-3.5 items-start">
      {/* Columna principal */}
      <div className="flex flex-col gap-3.5 min-w-0">
        <EmpleadoPeriodoCard
          empleados={empleados}
          empleadoSel={empleadoSel}
          onSelectEmpleado={(row) =>
            cambiarClave(() => {
              setEmpleadoSel(row);
              setDias('');
              setHoras('');
            })
          }
          tipo={tipo}
          onTipoChange={(t) => cambiarClave(() => setTipo(t))}
          anio={anio}
          onAnioChange={(a) => cambiarClave(() => setAnio(a))}
          mes={mes}
          onMesChange={(m) => cambiarClave(() => setMes(m))}
          quincena={quincena}
          onQuincenaChange={(q) =>
            cambiarClave(() => {
              setQuincena(q);
              setDias('');
            })
          }
          convenioNombre={convenioNombre}
          categoriaNombre={basicoData?.categoriaNombre ?? null}
          fechaBaja={fechaBaja}
          onFechaBajaChange={(v) => { setFechaBaja(v); programarGuardado(); }}
        />

        <RevistaNovedadesCard
          abierta={revistaAbierta}
          onToggle={() => setRevistaAbierta((v) => !v)}
          situaciones={situaciones}
          seleccion={situacionesSel}
          onSeleccionChange={(idx, next) => {
            setSituacionesSel((prev) => {
              const copy = [...prev] as typeof prev;
              copy[idx] = next;
              return copy;
            });
            programarGuardado();
          }}
          quincena={quincena}
          dias={dias}
          onDiasChange={onDiasChange}
          horas={horas}
          onHorasChange={(v) => {
            setHoras(v);
            programarGuardado();
          }}
          maternidad={maternidad}
          onMaternidadChange={setMaternidad}
          obsInterna={obsInterna}
          onObsInternaChange={(v) => {
            setObsInterna(v);
            programarGuardado();
          }}
          obsRecibo={obsRecibo}
          onObsReciboChange={(v) => {
            setObsRecibo(v);
            programarGuardado();
          }}
        />

        <ConceptosResumenCard
          basicoInfo={emp ? (basicoData ?? null) : null}
          conceptos={conceptosFilas}
          activeCodigos={activeCodigos}
          montoByCodigo={calculo.montoByCodigo}
          autosaveEstado={autosaveEstado}
          savedAt={savedAt}
          hayUltimoRecibo={!!ultimoRecibo && !existingRecibo}
          copiaActiva={copiarUltimo}
          onCopiarUltimo={() => {
            setCopiarUltimo(true);
            setEdits({});
          }}
          onRecalcularConvenio={() => {
            setCopiarUltimo(false);
            setEdits({});
            setActiveCodigos(
              codigosActivosIniciales({
                esExcluidoConvenio,
                esValorHoraCat,
                plantillaBaseCodes: plantillaManual
                  .filter(
                    (c) =>
                      (
                        c as (typeof plantillaManual)[number] & {
                          isPlantillaBase?: boolean;
                        }
                      ).isPlantillaBase
                  )
                  .map((c) => c.codigo),
              })
            );
            programarGuardado();
          }}
          onAbrirDrawer={() => setDrawerOpen(true)}
          deshabilitada={!emp}
        />
      </div>

      {/* Aside */}
      <ReciboAside
        empleadoNombre={emp?.nombre ?? null}
        periodoLabel={periodoLabel}
        tipoLabel={TIPO_LABELS[tipoPersistido] ?? tipoPersistido}
        totales={calculo.totales}
        legajosLiquidados={legajosLiquidados}
        legajosTotal={empleados.length}
        controles={controles}
        puedeEmitir={puedeEmitir}
        emitiendo={emitir.isPending}
        emitido={!!emitido}
        onEmitir={() => emitir.mutate()}
        onLiquidarOtro={resetParaOtro}
        onDescargarPdf={() => {
          if (emitido) onConfirmRecibo?.(periodo, emitido.reciboId);
        }}
      />

      {/* Drawer de carga manual */}
      <ConceptosDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        empleadoNombre={emp?.nombre ?? null}
        periodoLabel={periodoLabel}
        basicoInfo={emp ? (basicoData ?? null) : null}
        conceptos={conceptosFilas}
        activeCodigos={activeCodigos}
        catalogo={conceptosFilas}
        editsCalculados={calculo.editsCalculados}
        edits={edits}
        montoByCodigo={calculo.montoByCodigo}
        totales={calculo.totales}
        onEditField={onEditField}
        onToggleConcepto={onToggleConcepto}
        autosaveEstado={autosaveEstado}
        savedAt={savedAt}
      />
    </div>
  );
}
