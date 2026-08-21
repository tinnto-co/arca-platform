'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import { createTarea, listOrgMembers } from '@/actions/tareas';
import type { listColumnas } from '@/actions/tareas';
import { TIPO_LABELS } from './utils';

type Columna = Awaited<ReturnType<typeof listColumnas>>[number];

const now = new Date();
const ANOS = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

const formSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().optional(),
  tipo: z.enum(['iva', 'iibb', 'ddjj', 'sueldos', 'convenios', 'otro']),
  asignadoAUserId: z.string().optional(),
  periodoAno: z.string().optional(),
  periodoMes: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  columnaId: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface NuevaTareaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnas?: Columna[];
  defaultColumnaId?: string;
}

export function NuevaTareaDialog({
  open,
  onOpenChange,
  columnas = [],
  defaultColumnaId,
}: NuevaTareaDialogProps) {
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => listOrgMembers(),
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titulo: '',
      descripcion: '',
      tipo: 'otro',
      asignadoAUserId: '',
      periodoAno: '',
      periodoMes: '',
      fechaVencimiento: '',
      columnaId: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        titulo: '',
        descripcion: '',
        tipo: 'otro',
        asignadoAUserId: '',
        periodoAno: '',
        periodoMes: '',
        fechaVencimiento: '',
        columnaId: defaultColumnaId ?? '',
      });
    }
    // form is stable from useForm — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultColumnaId]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const periodoMes =
        values.periodoAno && values.periodoMes
          ? `${values.periodoAno}-${values.periodoMes}`
          : null;
      return createTarea({
        data: {
          titulo: values.titulo,
          descripcion:
            values.descripcion !== '' ? values.descripcion : undefined,
          tipo: values.tipo,
          asignadoA:
            values.asignadoAUserId !== '' ? values.asignadoAUserId : null,
          periodo: periodoMes,
          venceAt:
            values.fechaVencimiento !== '' ? values.fechaVencimiento : null,
          columnaId: values.columnaId !== '' ? values.columnaId : null,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      });
      toast.success('Tarea creada');
      form.reset();
      onOpenChange(false);
    },
    onError: () => toast.error('Error al crear la tarea'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="titulo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Título <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Reunión de equipo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
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
                      {Object.entries(TIPO_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {columnas.length > 0 && (
              <FormField
                control={form.control}
                name="columnaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Columna{' '}
                      <span className="text-muted-foreground font-normal">
                        (opcional)
                      </span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sin columna" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin columna</SelectItem>
                        {columnas.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Período: año + mes */}
            <div>
              <p className="text-sm font-medium mb-1.5">
                Período{' '}
                <span className="text-muted-foreground font-normal">
                  (opcional)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="periodoAno"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Año" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Sin año</SelectItem>
                          {ANOS.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodoMes"
                  render={({ field }) => (
                    <FormItem>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Mes" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Sin mes</SelectItem>
                          {MESES.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Vencimiento opcional */}
            <FormField
              control={form.control}
              name="fechaVencimiento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Fecha de vencimiento{' '}
                    <span className="text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="asignadoAUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asignar a</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Sin asignar</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
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
              name="descripcion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Descripción{' '}
                    <span className="text-muted-foreground font-normal">
                      (opcional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={2} className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                Crear tarea
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
