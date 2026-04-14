'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronsUpDown, FilePlus2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { BANCOS } from '@/lib/bancos';
import {
  createReciboHeader,
  listImportEmpleadosConConfig,
  listObrasSociales,
} from '@/actions/sueldos';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

const FORMAS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'acreditacion', label: 'Acreditación en cuenta' },
] as const;

const formSchema = z
  .object({
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
    obraSocialId: z.string().optional(),
    fechaPago: z.string().min(1, 'Requerido'),
    lugarPago: z.string().optional(),
    formaPago: z.enum(['efectivo', 'cheque', 'acreditacion']),
    cbu: z.string().optional(),
    banco: z.string().optional(),
    anoCargas: z.string().min(4),
    mesCargas: z.string().min(2),
    fechaDepositoCargas: z.string().optional(),
    observacionInterna: z.string().optional(),
    observacionRecibo: z.string().optional(),
    copiarUltimoRecibo: z.enum(['no', 'si']),
  })
  .superRefine((data, ctx) => {
    if (data.formaPago === 'acreditacion') {
      const digits = (data.cbu ?? '').replace(/\D/g, '');
      if (digits.length < 22) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CBU obligatorio (22 dígitos) si forma de pago es acreditación',
          path: ['cbu'],
        });
      }
    }
  });

export type ReciboFormValues = z.infer<typeof formSchema>;

export interface ReciboFormularioSuccess {
  liquidacionId: string;
  importEmpleadoId: string;
  periodo: string;
  copiarUltimoRecibo: boolean;
  tipoRecibo: string;
}

interface ReciboFormularioProps {
  clientId: string;
  profileId: string;
  onSuccess: (payload: ReciboFormularioSuccess) => void;
}

const now = new Date();
const ANOS = Array.from({ length: 10 }, (_, i) => now.getFullYear() - i + 2);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

export function ReciboFormulario({
  clientId,
  profileId,
  onSuccess,
}: ReciboFormularioProps) {
  const [obraOpen, setObraOpen] = useState(false);
  const [cargasOpen, setCargasOpen] = useState(true);

  const { data: empleados = [] } = useQuery({
    queryKey: ['import-empleados-config', clientId, profileId],
    queryFn: () =>
      listImportEmpleadosConConfig({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const { data: obras = [] } = useQuery({
    queryKey: ['obras-sociales'],
    queryFn: () => listObrasSociales(),
  });

  const defaultAno = String(now.getFullYear());
  const defaultMes = String(now.getMonth() + 1).padStart(2, '0');

  const form = useForm<ReciboFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      importEmpleadoId: '',
      ano: defaultAno,
      mes: defaultMes,
      quincena: '0',
      tipoRecibo: 'sueldo',
      fechaLiquidacion: format(now, 'yyyy-MM-dd'),
      obraSocialId: '',
      fechaPago: format(now, 'yyyy-MM-dd'),
      lugarPago: 'CABA',
      formaPago: 'efectivo',
      cbu: '',
      banco: '_otro banco',
      anoCargas: defaultAno,
      mesCargas: defaultMes,
      fechaDepositoCargas: '',
      observacionInterna: '',
      observacionRecibo: '',
      copiarUltimoRecibo: 'no',
    },
  });

  const formaPago = form.watch('formaPago');
  const obraId = form.watch('obraSocialId');

  const obraLabel = useMemo(() => {
    if (!obraId) return 'Sin obra social';
    const o = obras.find((x) => x.id === obraId);
    return o ? `${o.codigo} — ${o.nombre}` : 'Seleccionar…';
  }, [obraId, obras]);

  const onSubmit = async (values: ReciboFormValues) => {
    const periodo = `${values.ano}-${values.mes}`;
    const periodoCargas = `${values.anoCargas} / ${values.mesCargas}`;
    try {
      const res = await createReciboHeader({
        data: {
          clientId,
          importEmpleadoId: values.importEmpleadoId,
          periodo,
          tipoRecibo: values.tipoRecibo,
          quincena: values.quincena,
          fechaLiquidacion: values.fechaLiquidacion,
          obraSocialId:
            values.obraSocialId && values.obraSocialId.length > 0
              ? values.obraSocialId
              : null,
          fechaPago: values.fechaPago,
          lugarPago: values.lugarPago?.trim() || null,
          formaPago: values.formaPago,
          cbu: values.cbu?.trim() || null,
          banco: values.banco?.trim() || null,
          periodoCargas,
          fechaDepositoCargas: values.fechaDepositoCargas?.trim()
            ? values.fechaDepositoCargas
            : null,
          observacionInterna: values.observacionInterna?.trim() || null,
          observacionRecibo: values.observacionRecibo?.trim() || null,
          copiarUltimoRecibo: values.copiarUltimoRecibo === 'si',
        },
      });
      toast.success('Cabecera del recibo creada. Podés calcular la liquidación.');
      onSuccess({
        liquidacionId: res.liquidacionId,
        importEmpleadoId: res.importEmpleadoId,
        periodo: res.periodo,
        copiarUltimoRecibo: values.copiarUltimoRecibo === 'si',
        tipoRecibo: values.tipoRecibo,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    }
  };

  return (
    <Card className="border border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FilePlus2 className="h-4 w-4" />
          Nuevo recibo — datos del recibo
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Completá la cabecera y presioná Agregar. Luego usá Calcular para
          aplicar fórmulas (o conservá conceptos si copiaste el último recibo).
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
              <div>
                <h3 className="text-sm font-semibold">Cabecera principal</h3>
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
                      Solo podés elegir empleados que ya tengan liquidación
                      configurada (convenio y categoría en la pestaña{' '}
                      <span className="font-medium">Empleados</span>). Los que
                      aparecen deshabilitados aún no tienen ese vínculo.
                    </FormDescription>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione empleado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {empleados.map((r) => {
                          const leg =
                            r.empleado.legajo?.trim() ||
                            '—';
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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
                name="quincena"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quincena</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
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
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
              <FormField
                control={form.control}
                name="obraSocialId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Obra social</FormLabel>
                    <Popover open={obraOpen} onOpenChange={setObraOpen}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            role="combobox"
                            className={cn(
                              'justify-between font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            <span className="truncate text-left">
                              {obraLabel}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(100vw-2rem,420px)] p-0">
                        <Command>
                          <CommandInput placeholder="Buscar por código o nombre…" />
                          <CommandList>
                            <CommandEmpty>
                              {obras.length === 0
                                ? 'No hay obras cargadas. Ejecutá el seed.'
                                : 'Sin resultados.'}
                            </CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="__none__"
                                onSelect={() => {
                                  field.onChange('');
                                  setObraOpen(false);
                                }}
                              >
                                Sin obra social
                              </CommandItem>
                              {obras.map((o) => (
                                <CommandItem
                                  key={o.id}
                                  value={`${o.codigo} ${o.nombre}`}
                                  onSelect={() => {
                                    field.onChange(o.id);
                                    setObraOpen(false);
                                  }}
                                >
                                  {o.codigo} — {o.nombre}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>
            </section>

            <section className="space-y-4 rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Pago, cargas y observaciones</h3>
                  <p className="text-xs text-muted-foreground">
                    Datos complementarios del recibo y del período de cargas.
                  </p>
                </div>
                <Collapsible open={cargasOpen} onOpenChange={setCargasOpen}>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" size="sm">
                      {cargasOpen ? 'Ocultar bloque' : 'Mostrar bloque'}
                    </Button>
                  </CollapsibleTrigger>
                </Collapsible>
              </div>

              <Collapsible open={cargasOpen} onOpenChange={setCargasOpen}>
                <CollapsibleContent className="space-y-4 pt-1">
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
                  <FormField
                    control={form.control}
                    name="lugarPago"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lugar de pago</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={50} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="formaPago"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forma de pago</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FORMAS_PAGO.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
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
                    name="banco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Banco</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || '_otro banco'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Banco" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-[240px]">
                            {BANCOS.map((b) => (
                              <SelectItem key={b} value={b}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>
                  {formaPago === 'acreditacion' && (
                    <div className="rounded-md border border-amber-300/60 bg-amber-50/40 p-3">
                      <FormField
                        control={form.control}
                        name="cbu"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CBU</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="22 dígitos"
                                maxLength={22}
                                className="font-mono"
                              />
                            </FormControl>
                            <p className="text-xs text-destructive">
                              Obligatorio si forma de pago es acreditación
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    control={form.control}
                    name="anoCargas"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Año (período cargas)</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
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
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
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
                </CollapsibleContent>
              </Collapsible>
            </section>

            <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <FormField
                control={form.control}
                name="copiarUltimoRecibo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origen de conceptos</FormLabel>
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
                      Si no copiás, se muestra la grilla con los conceptos SOS del{' '}
                      <span className="font-medium">perfil</span> (vínculos en concepto_sos_profile).
                      Los conceptos salariales sin número SOS coincidente se liquidan solo por
                      fórmulas al calcular.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Guardando…' : 'Agregar'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
