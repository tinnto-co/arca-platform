import * as React from 'react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Pencil,
  Eye,
  EyeOff,
  X,
  Users,
  GitCompareArrows,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getRepresentative, updateRepresentative } from '@/actions/client';

const clientSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  email: z
    .string()
    .optional()
    .refine(
      (val) => !val || val === '' || z.string().email().safeParse(val).success,
      { message: 'Email inválido' }
    )
    .or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  image: z.string().optional(),
  // Contraseña de AFIP: vacío = no se cambia.
  password: z.string().optional(),
  regimenFiscal: z.enum(['local', 'multilateral', 'sin_definir']),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface EditRepresentativeDialogProps {
  representativeId: string;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const inputClass =
  'h-12 rounded-[12px] border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-4 text-[15px] text-[var(--arca-ink)] placeholder:text-[var(--arca-ink-4)] transition-[border-color,box-shadow] duration-[120ms] focus-visible:border-[var(--arca-navy-600)] focus-visible:ring-[3px] focus-visible:ring-[rgba(42,70,128,0.12)]';

const labelClass = 'text-[14px] font-semibold text-[var(--arca-ink)]';

function SectionCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[16px] p-5">
      <div className="flex items-center gap-2 mb-[18px]">
        {icon}
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[var(--arca-ink-3)]">
          {label}
        </span>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function EditRepresentativeDialog({
  representativeId,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditRepresentativeDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const queryClient = useQueryClient();

  const isControlled =
    controlledOpen !== undefined && controlledOnOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => controlledOnOpenChange?.(v)
    : setInternalOpen;

  const initializedRef = React.useRef<string | null>(null);

  const { data: representative, isLoading: loadingRepresentative } = useQuery({
    queryKey: ['representative', representativeId],
    queryFn: () => getRepresentative({ data: { id: representativeId } }),
    enabled: open && !!representativeId,
  });

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema) as Resolver<ClientFormValues>,
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      image: '',
      password: '',
      regimenFiscal: 'sin_definir',
    },
  });

  React.useEffect(() => {
    if (representative && initializedRef.current !== representativeId) {
      initializedRef.current = representativeId;
      const regimenFiscal = representative.convenioMultilateral
        ? 'multilateral'
        : representative.regimenLocal
          ? 'local'
          : 'sin_definir';
      form.reset({
        name: representative.name ?? '',
        email: representative.email || '',
        phone: representative.phone || '',
        address: representative.address || '',
        image: representative.image ?? '',
        // Nunca precargamos la contraseña actual (no exponer el secreto).
        password: '',
        regimenFiscal,
      });
    }
  }, [representative, representativeId, form]);

  React.useEffect(() => {
    if (!open) {
      initializedRef.current = null;
      setShowPassword(false);
    }
  }, [open]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateRepresentative({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['representatives'] });
      void queryClient.invalidateQueries({
        queryKey: ['representativesWithClients'],
      });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({
        queryKey: ['representative', representativeId],
      });
      toast.success('Representante actualizado exitosamente');
      setOpen(false);
    },
    onError: (error) => {
      console.error('Error updating client:', error);
      toast.error('Error al actualizar el cliente');
    },
  });

  const onSubmit = async (values: ClientFormValues) => {
    setLoading(true);
    try {
      const { regimenFiscal, ...rest } = values;
      await updateMutation.mutateAsync({
        id: representativeId,
        ...rest,
        convenioMultilateral: regimenFiscal === 'multilateral',
        regimenLocal: regimenFiscal === 'local',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && children != null ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : null}
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-[640px] p-0 gap-0 flex flex-col overflow-hidden rounded-[22px] border-0 bg-[var(--arca-bg)] shadow-[0_24px_60px_rgba(11,23,48,0.28)] max-h-[calc(100vh-80px)]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-[18px]">
          <div>
            <DialogTitle className="flex items-center gap-2.5 font-display text-[22px] font-bold tracking-[-0.02em] text-[var(--arca-ink)]">
              <Pencil className="h-5 w-5" strokeWidth={2} />
              Editar
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-[340px] text-[14px] leading-[1.45] text-[var(--arca-ink-3)]">
              Modifica los datos del cliente y la credencial de AFIP del
              representante.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Cerrar"
              className="flex-none w-[34px] h-[34px] rounded-[10px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] inline-flex items-center justify-center text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </DialogClose>
        </div>

        {loadingRepresentative ? (
          <div className="flex items-center justify-center h-32 pb-7">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col min-h-0 flex-1"
            >
              {/* Scrollable body */}
              <div className="overflow-y-auto px-7 pb-2 flex flex-col gap-[22px]">
                {/* SECTION: Cliente */}
                <SectionCard
                  icon={
                    <Users
                      className="h-[15px] w-[15px]"
                      style={{ color: 'var(--arca-navy-600)' }}
                      strokeWidth={2}
                    />
                  }
                  label="Cliente"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>
                          Email (opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="cliente@ejemplo.com"
                            className={inputClass}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>
                          Teléfono (opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+54 9 11 1234-5678"
                            className={inputClass}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>
                          Dirección (opcional)
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Dirección completa"
                            className={inputClass}
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>
                          Imagen (URL)
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="url"
                            placeholder="https://ejemplo.com/imagen.jpg"
                            className={inputClass}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="regimenFiscal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={`${labelClass} mb-0.5`}>
                          Régimen IIBB provincial
                        </FormLabel>
                        <FormControl>
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="grid grid-cols-3 gap-2.5"
                          >
                            {[
                              { value: 'local', label: 'Régimen local' },
                              { value: 'multilateral', label: 'Multilateral' },
                              { value: 'sin_definir', label: 'Sin definir' },
                            ].map(({ value, label }) => {
                              const selected = field.value === value;
                              return (
                                <label
                                  key={value}
                                  className={`flex items-center gap-[9px] px-3 py-3.5 rounded-[12px] text-[14px] cursor-pointer transition-all duration-[120ms] ${
                                    selected
                                      ? 'bg-[var(--arca-surface)] border-[1.5px] border-[var(--arca-ink)] text-[var(--arca-ink)] font-semibold'
                                      : 'bg-[var(--arca-surface-2)] border border-[var(--arca-border)] text-[var(--arca-ink-3)] font-medium'
                                  }`}
                                >
                                  <RadioGroupItem
                                    value={value}
                                    className="sr-only"
                                  />
                                  <span
                                    className={`flex-none w-[18px] h-[18px] rounded-full border-[1.5px] inline-flex items-center justify-center ${
                                      selected
                                        ? 'border-[var(--arca-ink)]'
                                        : 'border-[var(--arca-border-strong)]'
                                    }`}
                                  >
                                    {selected && (
                                      <span className="w-2 h-2 rounded-full bg-[var(--arca-ink)]" />
                                    )}
                                  </span>
                                  <span className="text-left leading-[1.2]">
                                    {label}
                                  </span>
                                </label>
                              );
                            })}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SectionCard>

                {/* SECTION: Representante */}
                <SectionCard
                  icon={
                    <GitCompareArrows
                      className="h-[15px] w-[15px]"
                      style={{ color: 'var(--arca-chart-3)' }}
                      strokeWidth={2}
                    />
                  }
                  label="Representante"
                >
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>Nombre</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Nombre del representante"
                            className={inputClass}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className={labelClass}>
                          Actualizar contraseña en AFIP
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Dejar en blanco para no cambiarla"
                              autoComplete="new-password"
                              {...field}
                              value={field.value ?? ''}
                              className={`${inputClass} pr-[46px]`}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setShowPassword((s) => !s)}
                              aria-label={
                                showPassword
                                  ? 'Ocultar contraseña'
                                  : 'Mostrar contraseña'
                              }
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-[34px] h-[34px] inline-flex items-center justify-center text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors duration-[120ms] cursor-pointer"
                            >
                              {showPassword ? (
                                <EyeOff className="h-5 w-5" />
                              ) : (
                                <Eye className="h-5 w-5" />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <p className="mt-0.5 text-[12.5px] text-[var(--arca-ink-4)]">
                          Déjala en blanco para mantener la actual.
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </SectionCard>
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-7 pt-5 pb-[26px]">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="h-[46px] px-[22px] rounded-[12px] text-[15px] font-semibold text-[var(--arca-ink)] bg-[var(--arca-surface)] border border-[var(--arca-border-strong)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] cursor-pointer disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-[46px] px-[22px] rounded-[12px] text-[15px] font-semibold text-white bg-[var(--arca-ink)] border border-[var(--arca-ink)] hover:bg-black transition-colors duration-[120ms] cursor-pointer inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Actualizar
                </button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
