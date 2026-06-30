import * as React from 'react';
import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Edit } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
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
import { Button } from '@/components/ui/button';
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
  regimenFiscal: z.enum(['local', 'multilateral', 'sin_definir']),
});

type ClientFormValues = z.infer<typeof clientSchema>;

interface EditRepresentativeDialogProps {
  representativeId: string;
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EditRepresentativeDialog({
  representativeId,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EditRepresentativeDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
        image: representative.image || '',
        regimenFiscal,
      });
    }
  }, [representative, representativeId, form]);

  React.useEffect(() => {
    if (!open) {
      initializedRef.current = null;
    }
  }, [open]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => updateRepresentative({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representatives'] });
      queryClient.invalidateQueries({ queryKey: ['representativesWithClients'] });
      queryClient.invalidateQueries({ queryKey: ['representative', representativeId] });
      toast.success('Cliente actualizado exitosamente');
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Cliente
          </DialogTitle>
          <DialogDescription>
            Modifica la información del cliente seleccionado.
          </DialogDescription>
        </DialogHeader>

        {loadingRepresentative ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Cargando...</div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del cliente" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="cliente@ejemplo.com"
                        {...field}
                        value={field.value || ''}
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
                    <FormLabel>Teléfono (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="+54 9 11 1234-5678"
                        {...field}
                        value={field.value || ''}
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
                    <FormLabel>Dirección (opcional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Dirección completa"
                        {...field}
                        value={field.value || ''}
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
                    <FormLabel>Imagen (URL)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://ejemplo.com/imagen.jpg"
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
                    <FormLabel>Régimen IIBB provincial</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid grid-cols-3 gap-2 mt-1"
                      >
                        {[
                          { value: 'local', label: 'Régimen local' },
                          { value: 'multilateral', label: 'Multilateral' },
                          { value: 'sin_definir', label: 'Sin definir' },
                        ].map(({ value, label }) => (
                          <label
                            key={value}
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer text-sm transition-colors ${
                              field.value === value
                                ? 'border-primary bg-primary/5 text-primary font-medium'
                                : 'border-border hover:bg-muted/50 text-muted-foreground'
                            }`}
                          >
                            <RadioGroupItem value={value} />
                            {label}
                          </label>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Actualizar Cliente
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
