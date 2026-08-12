'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getEmpleadorConfig,
  updateEmpleadorConfig,
  listTiposEmpresa,
  listSituaciones,
  listCondiciones,
  listActividades,
  listModalidadesContratacion,
  listSiniestrados,
  listZonas,
  listObrasSociales,
} from '@/actions/sueldos';

const schema = z.object({
  liquidaSueldos: z.boolean(),
  tipoEmpresaId: z.string().uuid().nullable(),
  seguroColectivo: z.boolean(),
  mipyme: z.boolean(),
  ordenCLN: z.enum(['C', 'L', 'N']).nullable(),
  situacionDefaultId: z.string().uuid().nullable(),
  condicionDefaultId: z.string().uuid().nullable(),
  actividadDefaultId: z.string().uuid().nullable(),
  contratacionDefaultId: z.string().uuid().nullable(),
  siniestradoDefaultId: z.string().uuid().nullable(),
  zonaDefaultId: z.string().uuid().nullable(),
  obraSocialDefaultId: z.string().uuid().nullable(),
});
type FormValues = z.infer<typeof schema>;

const NONE = '__none__';
const ORDEN_CLN = ['C', 'L', 'N'] as const;

function CatalogSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; codigo: string; nombre: string }[];
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger className="h-8 text-[13px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          value={NONE}
          className="text-[13px] text-[var(--arca-ink-3)]"
        >
          — Sin configurar —
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-[13px]">
            {o.codigo} — {o.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  empresaNombre: string;
}

export function EmpleadorConfigDialog({
  open,
  onOpenChange,
  clientId,
  empresaNombre,
}: Props) {
  const qc = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['empleador-config', clientId],
    queryFn: () => getEmpleadorConfig({ data: { clientId } }),
    enabled: open && !!clientId,
  });

  const { data: tipos = [] } = useQuery({
    queryKey: ['tipos-empresa'],
    queryFn: () => listTiposEmpresa(),
    enabled: open,
  });
  const { data: situaciones = [] } = useQuery({
    queryKey: ['situaciones'],
    queryFn: () => listSituaciones(),
    enabled: open,
  });
  const { data: condiciones = [] } = useQuery({
    queryKey: ['condiciones'],
    queryFn: () => listCondiciones(),
    enabled: open,
  });
  const { data: actividades = [] } = useQuery({
    queryKey: ['actividades'],
    queryFn: () => listActividades(),
    enabled: open,
  });
  const { data: modalidades = [] } = useQuery({
    queryKey: ['modalidades-contratacion'],
    queryFn: () => listModalidadesContratacion(),
    enabled: open,
  });
  const { data: siniestrados = [] } = useQuery({
    queryKey: ['siniestrados'],
    queryFn: () => listSiniestrados(),
    enabled: open,
  });
  const { data: zonas = [] } = useQuery({
    queryKey: ['zonas'],
    queryFn: () => listZonas(),
    enabled: open,
  });
  const { data: obrasSociales = [] } = useQuery({
    queryKey: ['obras-sociales'],
    queryFn: () => listObrasSociales(),
    enabled: open,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      liquidaSueldos: false,
      tipoEmpresaId: null,
      seguroColectivo: false,
      mipyme: false,
      ordenCLN: null,
      situacionDefaultId: null,
      condicionDefaultId: null,
      actividadDefaultId: null,
      contratacionDefaultId: null,
      siniestradoDefaultId: null,
      zonaDefaultId: null,
      obraSocialDefaultId: null,
    },
  });

  useEffect(() => {
    if (!config) return;
    const orden = ORDEN_CLN.find((o) => o === config.ordenCLN) ?? null;
    reset({ ...config, ordenCLN: orden });
  }, [config, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      updateEmpleadorConfig({ data: { clientId, ...values } }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['empleador-config', clientId] });
      qc.invalidateQueries({ queryKey: ['lsd-preview'] });
      onOpenChange(false);
    },
    onError: () => toast.error('Error al guardar configuración'),
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  const fieldCls = 'space-y-1.5';
  const labelCls = 'text-[12px] text-[var(--arca-ink-2)] font-medium';
  const sectionCls =
    'text-[11px] font-semibold uppercase tracking-wider text-[var(--arca-ink-3)] mb-2';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Configuración de empleador
          </DialogTitle>
          <p className="text-[13px] text-[var(--arca-ink-2)]">
            {empresaNombre}
          </p>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5 py-1">
          {/* Sección: Tipo de empleador */}
          <div>
            <p className={sectionCls}>Tipo de empleador</p>
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldCls}>
                <Label className={labelCls}>Tipo empresa (LSD)</Label>
                <Controller
                  name="tipoEmpresaId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) =>
                        field.onChange(v === NONE ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue placeholder="Seleccioná..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={NONE}
                          className="text-[13px] text-[var(--arca-ink-3)]"
                        >
                          — Sin configurar —
                        </SelectItem>
                        {tipos.map((t) => (
                          <SelectItem
                            key={t.id}
                            value={t.id}
                            className="text-[13px]"
                          >
                            {t.codigoLsd} — {t.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Orden impresión (CLN)</Label>
                <Controller
                  name="ordenCLN"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) =>
                        field.onChange(v === NONE ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue placeholder="Seleccioná..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={NONE}
                          className="text-[13px] text-[var(--arca-ink-3)]"
                        >
                          — Sin configurar —
                        </SelectItem>
                        <SelectItem value="C" className="text-[13px]">
                          C — Por CUIL
                        </SelectItem>
                        <SelectItem value="L" className="text-[13px]">
                          L — Por Legajo
                        </SelectItem>
                        <SelectItem value="N" className="text-[13px]">
                          N — Por Nombre
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="flex gap-6 mt-3">
              <Controller
                name="liquidaSueldos"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="liquida-sueldos"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="scale-90"
                    />
                    <Label
                      htmlFor="liquida-sueldos"
                      className="text-[13px] cursor-pointer"
                    >
                      Liquida sueldos en la plataforma
                    </Label>
                  </div>
                )}
              />
              <Controller
                name="seguroColectivo"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="seguro"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="scale-90"
                    />
                    <Label
                      htmlFor="seguro"
                      className="text-[13px] cursor-pointer"
                    >
                      Seguro colectivo de vida (Dec. 1567/74)
                    </Label>
                  </div>
                )}
              />
              <Controller
                name="mipyme"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Switch
                      id="mipyme"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="scale-90"
                    />
                    <Label
                      htmlFor="mipyme"
                      className="text-[13px] cursor-pointer"
                    >
                      Certificado MiPyME
                    </Label>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Sección: Defaults de catálogo */}
          <div>
            <p className={sectionCls}>Valores por defecto de empleados</p>
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldCls}>
                <Label className={labelCls}>Situación de revista</Label>
                <Controller
                  name="situacionDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={situaciones}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Condición del trabajador</Label>
                <Controller
                  name="condicionDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={condiciones}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Actividad SIJP</Label>
                <Controller
                  name="actividadDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={actividades}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Modalidad de contratación</Label>
                <Controller
                  name="contratacionDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={modalidades}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Tipo de siniestro</Label>
                <Controller
                  name="siniestradoDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={siniestrados}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls}>
                <Label className={labelCls}>Zona geográfica</Label>
                <Controller
                  name="zonaDefaultId"
                  control={control}
                  render={({ field }) => (
                    <CatalogSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={zonas}
                      placeholder="Seleccioná..."
                    />
                  )}
                />
              </div>

              <div className={fieldCls + ' col-span-2'}>
                <Label className={labelCls}>Obra social</Label>
                <Controller
                  name="obraSocialDefaultId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? NONE}
                      onValueChange={(v) =>
                        field.onChange(v === NONE ? null : v)
                      }
                    >
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue placeholder="Seleccioná..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          value={NONE}
                          className="text-[13px] text-[var(--arca-ink-3)]"
                        >
                          — Sin configurar —
                        </SelectItem>
                        {obrasSociales.map((o) => (
                          <SelectItem
                            key={o.id}
                            value={o.id}
                            className="text-[13px]"
                          >
                            {o.codigo} — {o.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!isDirty || isSubmitting || mutation.isPending}
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
