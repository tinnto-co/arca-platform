"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEmpleado, listCategoriasByConvenio } from "@/actions/sueldos";
import { toast } from "sonner";
import { format } from "date-fns";

const schema = z.object({
  nombre: z.string().min(1, "Requerido"),
  apellido: z.string().min(1, "Requerido"),
  cuilCuil: z.string().min(1, "CUIT/CUIL requerido"),
  fechaIngreso: z.string().min(1, "Requerido"),
  convenioId: z.string().uuid("Seleccione convenio"),
  categoriaId: z.string().uuid("Seleccione categoría"),
  tipoJornada: z.enum(["full_time", "part_time", "reducida"]),
});

type FormValues = z.infer<typeof schema>;

type Convenio = { id: string; nombre: string };
type Empleado = {
  id: string;
  nombre: string;
  apellido: string;
  cuilCuil: string;
  fechaIngreso: Date;
  convenioId: string;
  categoriaId: string;
  tipoJornada: string;
};

interface EmpleadoFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  convenios: Convenio[];
  editId: string | null;
  empleado?: Empleado;
  onSuccess: () => void;
}

export function EmpleadoFormDialog({
  open,
  onOpenChange,
  clientId,
  convenios,
  editId,
  empleado,
  onSuccess,
}: EmpleadoFormDialogProps) {
  const [categorias, setCategorias] = useState<{ id: string; codigo: string; nombre: string }[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: "",
      apellido: "",
      cuilCuil: "",
      fechaIngreso: format(new Date(), "yyyy-MM-dd"),
      convenioId: "",
      categoriaId: "",
      tipoJornada: "full_time",
    },
  });

  const convenioId = form.watch("convenioId");

  useEffect(() => {
    if (!convenioId || !clientId) {
      setCategorias([]);
      form.setValue("categoriaId", "");
      return;
    }
    listCategoriasByConvenio({ data: { convenioId, clientId } }).then(setCategorias);
  }, [convenioId, clientId, form]);

  useEffect(() => {
    if (empleado) {
      form.reset({
        nombre: empleado.nombre,
        apellido: empleado.apellido,
        cuilCuil: empleado.cuilCuil,
        fechaIngreso: format(new Date(empleado.fechaIngreso), "yyyy-MM-dd"),
        convenioId: empleado.convenioId,
        categoriaId: empleado.categoriaId,
        tipoJornada: empleado.tipoJornada as "full_time" | "part_time" | "reducida",
      });
    } else if (open && !editId) {
      form.reset({
        nombre: "",
        apellido: "",
        cuilCuil: "",
        fechaIngreso: format(new Date(), "yyyy-MM-dd"),
        convenioId: convenios[0]?.id ?? "",
        categoriaId: "",
        tipoJornada: "full_time",
      });
    }
  }, [empleado, open, editId, convenios, form]);

  const onSubmit = async (values: FormValues) => {
    if (editId) {
      toast.info("Use el menú Editar para actualizar. Por ahora solo alta.");
      return;
    }
    try {
      await createEmpleado({ data: { ...values, clientId } });
      toast.success("Empleado creado");
      onSuccess();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editId ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="apellido"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Apellido</FormLabel>
                    <FormControl>
                      <Input {...field} className="w-full" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} className="w-full" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cuilCuil"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT/CUIL</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="20-12345678-9" className="w-full" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fechaIngreso"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de ingreso</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} className="w-full" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="convenioId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Convenio colectivo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {convenios.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre}
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
                name="categoriaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccione categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categorias.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.codigo} – {cat.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="tipoJornada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de jornada</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="full_time">Tiempo completo</SelectItem>
                      <SelectItem value="part_time">Part time</SelectItem>
                      <SelectItem value="reducida">Reducida</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editId ? "Guardar" : "Crear"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
