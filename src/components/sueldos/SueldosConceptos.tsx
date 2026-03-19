"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listConceptos,
  createConcepto,
  updateConcepto,
  deleteConcepto,
} from "@/actions/sueldos";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import z from "zod";

const schema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  tipo: z.enum(["remunerativo", "no_remunerativo", "descuento"]),
  baseCalculo: z.string().optional(),
  formula: z.string().min(1, "Fórmula requerida"),
  esPorcentaje: z.boolean(),
  orden: z.coerce.number(),
});

type FormValues = z.infer<typeof schema>;

const TIPO_LABEL: Record<string, string> = {
  remunerativo: "Remunerativo",
  no_remunerativo: "No remunerativo",
  descuento: "Descuento",
};

const BASE_LABEL: Record<string, string> = {
  basico: "Básico",
  bruto: "Bruto",
  total_remunerativo: "Total remunerativo",
  total_no_remunerativo: "Total no remunerativo",
  total_descuentos: "Total descuentos",
  neto: "Neto",
  fijo: "Fijo",
  custom: "Custom",
};

/** Quita del nombre la parte entre paréntesis con porcentaje (ej. "Jubilación (11%)" → "Jubilación") */
function nombreSinParentesis(nombre: string): string {
  return nombre.replace(/\s*\([^)]*%[^)]*\)\s*$/, "").trim();
}

interface SueldosConceptosProps {
  clientId: string;
}

type ConceptoRow = Awaited<ReturnType<typeof listConceptos>>[number];

export function SueldosConceptos({ clientId }: SueldosConceptosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingConcepto, setEditingConcepto] = useState<ConceptoRow | null>(null);
  const [conceptoToDelete, setConceptoToDelete] = useState<ConceptoRow | null>(null);

  const { data: conceptos = [], isLoading } = useQuery({
    queryKey: ["conceptos", clientId],
    queryFn: () => listConceptos({ data: { clientId } }),
    enabled: !!clientId,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      codigo: "",
      nombre: "",
      tipo: "remunerativo",
      baseCalculo: "basico",
      formula: "0 * basico",
      esPorcentaje: true,
      orden: 0,
    },
  });

  const create = useMutation({
    mutationFn: (data: FormValues) =>
      createConcepto({
        data: {
          clientId,
          codigo: data.codigo,
          nombre: data.nombre,
          tipo: data.tipo,
          baseCalculo: data.baseCalculo ?? "basico",
          formula: data.formula,
          esPorcentaje: data.esPorcentaje,
          orden: data.orden,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conceptos", clientId] });
      setOpen(false);
      setEditingConcepto(null);
      form.reset(defaultFormValues);
      toast.success("Concepto creado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const defaultFormValues: FormValues = {
    codigo: "",
    nombre: "",
    tipo: "remunerativo",
    baseCalculo: "basico",
    formula: "0 * basico",
    esPorcentaje: true,
    orden: 0,
  };

  const update = useMutation({
    mutationFn: (data: FormValues & { id: string }) =>
      updateConcepto({
        data: {
          id: data.id,
          clientId,
          codigo: data.codigo,
          nombre: data.nombre,
          tipo: data.tipo,
          baseCalculo: data.baseCalculo ?? "basico",
          formula: data.formula,
          esPorcentaje: data.esPorcentaje,
          orden: data.orden,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conceptos", clientId] });
      setOpen(false);
      setEditingConcepto(null);
      form.reset(defaultFormValues);
      toast.success("Concepto actualizado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteConcepto({ data: { id, clientId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conceptos", clientId] });
      setConceptoToDelete(null);
      toast.success("Concepto eliminado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      updateConcepto({ data: { id, clientId, activo } }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["conceptos", clientId] });
      toast.success(variables.activo ? "Concepto habilitado" : "Concepto deshabilitado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const handleOpenCreate = () => {
    setEditingConcepto(null);
    form.reset(defaultFormValues);
    setOpen(true);
  };

  const handleOpenEdit = (c: ConceptoRow) => {
    setEditingConcepto(c);
    form.reset({
      codigo: c.codigo,
      nombre: c.nombre,
      tipo: c.tipo,
      baseCalculo: c.baseCalculo ?? "basico",
      formula: c.formula,
      esPorcentaje: c.esPorcentaje ?? true,
      orden: c.orden ?? 0,
    });
    setOpen(true);
  };

  const handleSubmit = (data: FormValues) => {
    if (editingConcepto) {
      update.mutate({ ...data, id: editingConcepto.id });
    } else {
      create.mutate(data);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleOpenCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo concepto
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingConcepto(null);
          setOpen(isOpen);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingConcepto ? "Editar concepto salarial" : "Nuevo concepto salarial"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="BASICO" />
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
                        <Input {...field} placeholder="Sueldo básico" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                        <SelectItem value="remunerativo">Remunerativo</SelectItem>
                        <SelectItem value="no_remunerativo">No remunerativo</SelectItem>
                        <SelectItem value="descuento">Descuento</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="formula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fórmula</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="0.11 * basico | valor | 1000"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      Variables: basico, antiguedad, bruto, valor, cantidad
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="esPorcentaje"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>¿Porcentaje?</FormLabel>
                      <Select
                        onValueChange={(v) => field.onChange(v === "true")}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="true">Sí</SelectItem>
                          <SelectItem value="false">Monto fijo</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orden"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orden</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  {editingConcepto ? "Guardar" : "Crear"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[160px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : (
              conceptos.map((c) => (
                <TableRow
                  key={c.id}
                  className={c.activo === false ? "opacity-60" : undefined}
                >
                  <TableCell className="font-mono text-sm">{c.codigo}</TableCell>
                  <TableCell>{nombreSinParentesis(c.nombre)}</TableCell>
                  <TableCell>
                    <Badge variant={c.tipo === "descuento" ? "secondary" : "default"}>
                      {TIPO_LABEL[c.tipo] ?? c.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>{c.orden}</TableCell>
                  <TableCell className="text-center">
                    {c.activo !== false ? (
                      <Badge variant="default" className="bg-green-600">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          toggleActivo.mutate({
                            id: c.id,
                            activo: c.activo === false,
                          })
                        }
                        disabled={toggleActivo.isPending}
                        title={c.activo !== false ? "Deshabilitar" : "Habilitar"}
                      >
                        {c.activo !== false ? (
                          <PowerOff className="h-4 w-4 text-amber-600" />
                        ) : (
                          <Power className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEdit(c)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setConceptoToDelete(c)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!conceptoToDelete} onOpenChange={() => setConceptoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar concepto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el concepto &quot;{conceptoToDelete ? nombreSinParentesis(conceptoToDelete.nombre) : ""}&quot; (
              {conceptoToDelete?.codigo}). Las novedades y detalles de liquidación que lo usen
              pueden verse afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => conceptoToDelete && remove.mutate(conceptoToDelete.id)}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
