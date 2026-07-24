'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { format, differenceInYears, endOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { FilePlus2, ChevronLeft, ChevronRight } from 'lucide-react';
import { legajoParaMostrar } from '@/lib/legajo';
import { getPeriodoMaxLiquidable, getPeriodoMesAnterior } from '@/lib/payroll-period-rules';
import { listImportEmpleadosConConfig, listSituaciones } from '@/actions/sueldos';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TIPOS_RECIBO = [
  { value: 'sueldo', label: 'Sueldo' },
  { value: 'anticipo', label: 'Anticipo' },
  { value: 'SAC', label: 'SAC' },
  { value: 'vacaciones', label: 'Vacaciones' },
  { value: 'despido', label: 'Liquidación final' },
  { value: 'comisiones', label: 'Comisiones' },
  { value: 'desempleo', label: 'Fondo de desempleo' },
  { value: 'varios', label: 'Varios' },
] as const;

const FORMA_PAGO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  cheque: 'Cheque',
  acreditacion: 'Acreditación en cuenta',
};

const STEPS = ['Empleado y período', 'Datos del empleado', 'Conceptos'] as const;

const formSchema = z.object({
  importEmpleadoId: z
    .string()
    .min(1, 'Seleccione empleado')
    .uuid('Seleccione empleado'),
  ano: z.string().min(4),
  mes: z.string().min(2),
  quincena: z.enum(['0', '1', '2']),
  tipoRecibo: z.enum([
    'sueldo',
    'anticipo',
    'SAC',
    'vacaciones',
    'despido',
    'comisiones',
    'desempleo',
    'varios',
  ]),
  fechaLiquidacion: z.string().min(1, 'Requerido'),
  fechaPago: z.string().min(1, 'Requerido'),
  anoCargas: z.string().min(4),
  mesCargas: z.string().min(2),
  fechaDepositoCargas: z.string().optional(),
  observacionInterna: z.string().optional(),
  observacionRecibo: z.string().optional(),
  copiarUltimoRecibo: z.enum(['no', 'si']),
  // Situaciones de revista LSD
  situacionRevista1Id: z.string().optional(),
  situacionRevista1DiaInicio: z.string().optional().refine(
    (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31),
    { message: 'Debe ser un día entre 1 y 31' }
  ),
  situacionRevista2Id: z.string().optional(),
  situacionRevista2DiaInicio: z.string().optional().refine(
    (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31),
    { message: 'Debe ser un día entre 1 y 31' }
  ),
  situacionRevista3Id: z.string().optional(),
  situacionRevista3DiaInicio: z.string().optional().refine(
    (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 31),
    { message: 'Debe ser un día entre 1 y 31' }
  ),
  // Datos complementarios LSD
  diasTrabajados: z.string().optional().refine(
    (v) => !v || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 31),
    { message: 'Debe ser un número entre 0 y 31' }
  ),
  horasTrabajadas: z.string().optional().refine(
    (v) => !v || (Number(v) >= 0 && !isNaN(Number(v))),
    { message: 'Debe ser un número mayor o igual a 0' }
  ),
  importeMaternidadArt13: z.string().optional().refine(
    (v) => !v || (Number(v) >= 0 && !isNaN(Number(v))),
    { message: 'El importe no puede ser negativo' }
  ),
});

export type ReciboFormValues = z.infer<typeof formSchema>;

export interface ReciboFormularioSuccess {
  importEmpleadoId: string;
  empleadoNombre: string;
  periodo: string;
  copiarUltimoRecibo: boolean;
  tipoRecibo: string;
  antiguedadAnios: number | null;
  fechaAlta: string | null;
  fechaIngreso: string | null;
  quincena: '0' | '1' | '2';
  fechaLiquidacion: string;
  obraSocialId: string | null;
  fechaPago: string;
  lugarPago: string | null;
  formaPago: 'efectivo' | 'cheque' | 'acreditacion';
  cbu: string | null;
  banco: string | null;
  periodoCargas: string;
  fechaDepositoCargas: string | null;
  observacionInterna: string | null;
  observacionRecibo: string | null;
  // Situaciones de revista LSD
  situacionRevista1Id: string | null;
  situacionRevista1DiaInicio: number | null;
  situacionRevista2Id: string | null;
  situacionRevista2DiaInicio: number | null;
  situacionRevista3Id: string | null;
  situacionRevista3DiaInicio: number | null;
  // Datos complementarios LSD
  diasTrabajados: number | null;
  horasTrabajadas: number | null;
  importeMaternidadArt13: string | null;
}

interface ReciboFormularioProps {
  clientId: string;
  profileId: string;
  onSuccess: (payload: ReciboFormularioSuccess) => void;
  initialValues?: Partial<ReciboFormValues>;
}

const now = new Date();
const ANOS = Array.from({ length: 10 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

const STEP1_FIELDS = [
  'importEmpleadoId',
  'tipoRecibo',
  'ano',
  'mes',
  'quincena',
  'fechaLiquidacion',
] as const;
const STEP2_FIELDS = ['fechaPago'] as const;

export function ReciboFormulario({
  clientId,
  profileId,
  onSuccess,
  initialValues,
}: ReciboFormularioProps) {
  const [step, setStep] = useState(1);

  const { data: empleados = [] } = useQuery({
    queryKey: ['import-empleados-config', clientId, profileId],
    queryFn: () =>
      listImportEmpleadosConConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const { data: situaciones = [] } = useQuery({
    queryKey: ['catalog-situaciones'],
    queryFn: () => listSituaciones(),
    staleTime: 30 * 60 * 1000,
  });

  const [defaultAno, defaultMes] = getPeriodoMesAnterior().split('-');

  const form = useForm<ReciboFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      importEmpleadoId: '',
      ano: defaultAno,
      mes: defaultMes,
      quincena: '0',
      tipoRecibo: 'sueldo',
      fechaLiquidacion: format(now, 'yyyy-MM-dd'),
      fechaPago: format(now, 'yyyy-MM-dd'),
      anoCargas: defaultAno,
      mesCargas: defaultMes,
      fechaDepositoCargas: '',
      observacionInterna: '',
      observacionRecibo: '',
      copiarUltimoRecibo: 'no',
      situacionRevista1Id: '',
      situacionRevista1DiaInicio: '1',
      situacionRevista2Id: '',
      situacionRevista2DiaInicio: '',
      situacionRevista3Id: '',
      situacionRevista3DiaInicio: '',
      diasTrabajados: '30',
      horasTrabajadas: '',
      importeMaternidadArt13: '',
      ...initialValues,
    },
  });

  const empleadoId = form.watch('importEmpleadoId');
  const empleadoSel = useMemo(
    () => empleados.find((e) => e.empleado.id === empleadoId),
    [empleados, empleadoId]
  );

  const antiguedadAnios = useMemo(() => {
    const fechaAlta = empleadoSel?.empleado.fechaAlta;
    if (!fechaAlta) return null;
    return differenceInYears(now, new Date(fechaAlta as unknown as string));
  }, [empleadoSel]);

  // Actualizar fechaLiquidacion y fechaDepositoCargas al cambiar año/mes
  const ano = form.watch('ano');
  const mes = form.watch('mes');
  const [maxAno, maxMes] = getPeriodoMaxLiquidable().split('-');
  const mesesDisponibles = ano === maxAno
    ? MESES.filter((m) => m.value <= maxMes)
    : MESES;
  useEffect(() => {
    if (!ano || !mes) return;
    const periodoDate = new Date(Number(ano), Number(mes) - 1, 1);
    const mesSiguiente = addMonths(periodoDate, 1);
    const ultimoDia = format(endOfMonth(periodoDate), 'yyyy-MM-dd');
    form.setValue('fechaLiquidacion', ultimoDia);
    form.setValue('fechaPago', ultimoDia);
    form.setValue('fechaDepositoCargas', format(new Date(mesSiguiente.getFullYear(), mesSiguiente.getMonth(), 10), 'yyyy-MM-dd'));
  }, [ano, mes, form]);

  // Pre-llenar situación de revista 1 desde el empleado si el campo está vacío
  useEffect(() => {
    if (!empleadoSel) return;
    const situacionId = empleadoSel.empleado.situacionId;
    if (!situacionId) return;
    if (!form.getValues('situacionRevista1Id')) {
      form.setValue('situacionRevista1Id', situacionId);
    }
  }, [empleadoSel, form]);

  const onSubmit = (values: ReciboFormValues) => {
    const emp = empleados.find((e) => e.empleado.id === values.importEmpleadoId);
    const periodo = `${values.ano}-${values.mes}`;
    const periodoCargas = `${values.anoCargas} / ${values.mesCargas}`;
    onSuccess({
      importEmpleadoId: values.importEmpleadoId,
      empleadoNombre: emp?.empleado.nombre ?? '',
      periodo,
      copiarUltimoRecibo: values.copiarUltimoRecibo === 'si',
      tipoRecibo: values.tipoRecibo,
      antiguedadAnios,
      fechaAlta: emp?.empleado.fechaAlta
        ? (typeof emp.empleado.fechaAlta === 'string' ? emp.empleado.fechaAlta : (emp.empleado.fechaAlta as Date).toISOString()).slice(0, 10)
        : null,
      fechaIngreso: emp?.empleado.fechaIngreso
        ? (typeof emp.empleado.fechaIngreso === 'string' ? emp.empleado.fechaIngreso : (emp.empleado.fechaIngreso as Date).toISOString()).slice(0, 10)
        : null,
      quincena: values.quincena,
      fechaLiquidacion: values.fechaLiquidacion,
      obraSocialId: emp?.empleado.obraSocialId ?? null,
      fechaPago: values.fechaPago,
      lugarPago: emp?.empleado.lugarPago ?? null,
      formaPago: (emp?.empleado.formaPago ?? 'efectivo') as
        | 'efectivo'
        | 'cheque'
        | 'acreditacion',
      cbu: emp?.empleado.cbu ?? null,
      banco: emp?.empleado.banco ?? null,
      periodoCargas,
      fechaDepositoCargas: values.fechaDepositoCargas?.trim() || null,
      observacionInterna: values.observacionInterna?.trim() || null,
      observacionRecibo: values.observacionRecibo?.trim() || null,
      situacionRevista1Id: values.situacionRevista1Id || null,
      situacionRevista1DiaInicio: values.situacionRevista1DiaInicio ? parseInt(values.situacionRevista1DiaInicio, 10) : null,
      situacionRevista2Id: values.situacionRevista2Id || null,
      situacionRevista2DiaInicio: values.situacionRevista2DiaInicio ? parseInt(values.situacionRevista2DiaInicio, 10) : null,
      situacionRevista3Id: values.situacionRevista3Id || null,
      situacionRevista3DiaInicio: values.situacionRevista3DiaInicio ? parseInt(values.situacionRevista3DiaInicio, 10) : null,
      diasTrabajados: values.diasTrabajados ? parseInt(values.diasTrabajados, 10) : null,
      horasTrabajadas: values.horasTrabajadas ? parseInt(values.horasTrabajadas, 10) : null,
      importeMaternidadArt13: values.importeMaternidadArt13?.trim() || null,
    });
  };

  const goNext = async () => {
    const fields = step === 1 ? STEP1_FIELDS : STEP2_FIELDS;
    const valid = await form.trigger(
      fields as unknown as (keyof ReciboFormValues)[]
    );
    if (valid) setStep((s) => s + 1);
  };

  return (
    <Card className="border border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-4 w-4" />
          Nuevo recibo
        </CardTitle>
        {/* Step indicator */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const active = n === step;
            const done = n < step;
            return (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : done
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {n}
                </div>
                <span
                  className={`text-xs ${active ? 'font-medium' : 'text-muted-foreground'}`}
                >
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Paso 1: Empleado y período ── */}
            {step === 1 && (
              <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Empleado y período</h3>
                  <p className="text-xs text-muted-foreground">
                    Selección de empleado, tipo y período del recibo.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="importEmpleadoId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Legajo / empleado</FormLabel>
                        <FormDescription>
                          Solo se muestran empleados activos. Los deshabilitados
                          aún no tienen convenio configurado.
                        </FormDescription>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione empleado" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {empleados.map((r) => {
                              const leg = legajoParaMostrar(r.empleado.legajo);
                              const disabled = !r.empleado.convenioId;
                              return (
                                <SelectItem
                                  key={r.empleado.id}
                                  value={r.empleado.id}
                                  disabled={disabled}
                                >
                                  {leg} — {r.empleado.nombre}
                                  {disabled ? ' (sin configurar)' : ''}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tipoRecibo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIPOS_RECIBO.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    control={form.control}
                    name="ano"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Año (liquidado)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ANOS.map((y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mes</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[170px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {mesesDisponibles.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quincena"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Periodo</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[190px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">Mes completo</SelectItem>
                            <SelectItem value="1">Primera quincena</SelectItem>
                            <SelectItem value="2">Segunda quincena</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fechaLiquidacion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha de liquidación</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            )}

            {/* ── Paso 2: Datos del empleado + cargas ── */}
            {step === 2 && (
              <section className="space-y-4 rounded-lg border bg-background p-4">
                <div>
                  <h3 className="text-sm font-semibold">Datos del empleado</h3>
                  <p className="text-xs text-muted-foreground">
                    Información cargada en la pestaña{' '}
                    <span className="font-medium">Empleados</span>. Para
                    modificarla, actualizá el legajo desde esa pestaña.
                  </p>
                </div>
                <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
                  <InfoRow
                    label="Obra social"
                    value={
                      empleadoSel?.obraSocialNombre
                        ? `${empleadoSel.obraSocialCodigo} — ${empleadoSel.obraSocialNombre}`
                        : null
                    }
                  />
                  <InfoRow
                    label="Forma de pago"
                    value={
                      FORMA_PAGO_LABELS[empleadoSel?.empleado.formaPago ?? ''] ??
                      null
                    }
                  />
                  <InfoRow label="Banco" value={empleadoSel?.empleado.banco ?? null} />
                  <InfoRow
                    label="CBU"
                    value={empleadoSel?.empleado.cbu ?? null}
                    mono
                  />
                  <InfoRow
                    label="Lugar de pago"
                    value={empleadoSel?.empleado.lugarPago ?? null}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="fechaPago"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha de pago</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    control={form.control}
                    name="anoCargas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Año (período cargas)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ANOS.map((y) => (
                              <SelectItem key={y} value={String(y)}>
                                {y}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mesCargas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mes (cargas)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-[170px]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {MESES.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="fechaDepositoCargas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fecha depósito cargas</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {/* ── Datos Complementarios LSD ── */}
                <div>
                  <h4 className="text-sm font-semibold">Situaciones de revista del período</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Hasta 3 situaciones distintas en el mismo mes. Indicá el día de inicio de cada una.
                  </p>
                  <div className="space-y-3">
                    {([1, 2, 3] as const).map((n) => {
                      const idKey = `situacionRevista${n}Id` as keyof ReciboFormValues;
                      const diaKey = `situacionRevista${n}DiaInicio` as keyof ReciboFormValues;
                      return (
                        <div key={n} className="flex flex-wrap items-end gap-3">
                          <FormField
                            control={form.control}
                            name={idKey}
                            render={({ field }) => (
                              <FormItem className="flex-1 min-w-[200px]">
                                {n === 1 && <FormLabel>Situación de revista {n}</FormLabel>}
                                {n > 1 && <FormLabel className="text-muted-foreground">Situación {n} (opcional)</FormLabel>}
                                <Select
                                  onValueChange={(val) => field.onChange(val === '__none__' ? '' : val)}
                                  value={(field.value as string) || (n > 1 ? '__none__' : '')}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder={n === 1 ? 'Seleccione situación' : 'Sin segunda situación'} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="max-h-[240px]">
                                    {n > 1 && <SelectItem value="__none__">—</SelectItem>}
                                    {situaciones.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.codigo} — {s.nombre}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={diaKey}
                            render={({ field }) => (
                              <FormItem className="w-28">
                                {n === 1 && <FormLabel>Día inicio</FormLabel>}
                                {n > 1 && <FormLabel className="text-muted-foreground">Día inicio</FormLabel>}
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    step={1}
                                    placeholder="1"
                                    {...field}
                                    disabled={n > 1 && !form.watch((`situacionRevista${n}Id`) as keyof ReciboFormValues)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="diasTrabajados"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Días trabajados</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={31} step={1} placeholder="30" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="horasTrabajadas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horas trabajadas</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step={1} placeholder="200" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="importeMaternidadArt13"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maternidad Art.13 Ley 27.674</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} step="0.01" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="observacionInterna"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Observación interna</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={2} className="resize-y" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="observacionRecibo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Obs. a imprimir en recibo</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={2} className="resize-y" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>
            )}


            {/* ── Paso 3: Origen de conceptos ── */}
            {step === 3 && (
              <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold">Origen de conceptos</h3>
                </div>
                <FormField
                  control={form.control}
                  name="copiarUltimoRecibo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Cómo cargar los conceptos?</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="max-w-md">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="no">
                            No — cargar conceptos manualmente (empleado nuevo / sin import)
                          </SelectItem>
                          <SelectItem value="si">
                            Copiar último recibo de este empleado y mismo tipo
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Si no copiás, se muestra el catálogo completo de conceptos
                        SOS (1–699) con valores vacíos. Completá solo los que
                        aplican al empleado.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </section>
            )}

            <div className="flex items-center justify-between border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                disabled={step === 1}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              {step < 3 ? (
                <Button type="button" onClick={goNext} className="gap-1">
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => void form.handleSubmit(onSubmit)()}
                >
                  Agregar
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {value ? (
        <span className={mono ? 'font-mono' : 'font-medium'}>{value}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}
