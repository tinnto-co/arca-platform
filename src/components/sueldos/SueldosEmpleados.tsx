"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Pencil, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listEmpleados,
  listConvenios,
  updateEmpleado,
  deleteEmpleado,
} from "@/actions/sueldos";
import { EmpleadoFormDialog } from "./EmpleadoFormDialog";
import { EmpleadosCargaMasivaDialog } from "./EmpleadosCargaMasivaDialog";

const TIPO_JORNADA: Record<string, string> = {
  full_time: "Tiempo completo",
  part_time: "Part time",
  reducida: "Reducida",
};

interface SueldosEmpleadosProps {
  clientId: string;
}

export function SueldosEmpleados({ clientId }: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [cargaMasivaOpen, setCargaMasivaOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [empleadoToDelete, setEmpleadoToDelete] = useState<{
    id: string;
    nombre: string;
    apellido: string;
  } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["empleados", clientId],
    queryFn: () => listEmpleados({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ["convenios", clientId],
    queryFn: () => listConvenios({ data: { clientId } }),
    enabled: !!clientId,
  });

  const updateMutation = useMutation({
    mutationFn: updateEmpleado,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados", clientId] });
      setFormOpen(false);
      setEditId(null);
      toast.success("Empleado actualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmpleado({ data: { id, clientId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["empleados", clientId] });
      setEmpleadoToDelete(null);
      toast.success("Empleado eliminado");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setCargaMasivaOpen(true)}>
          <Upload className="mr-2 h-4 w-4" />
          Carga masiva (Excel)
        </Button>
        <Button onClick={() => { setEditId(null); setFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo empleado
        </Button>
      </div>

      <EmpleadosCargaMasivaDialog
        open={cargaMasivaOpen}
        onOpenChange={setCargaMasivaOpen}
        clientId={clientId}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["empleados", clientId] })}
      />

      <EmpleadoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        clientId={clientId}
        convenios={convenios}
        editId={editId}
        empleado={rows.find((r) => r.empleado.id === editId)?.empleado}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["empleados", clientId] });
          setFormOpen(false);
          setEditId(null);
        }}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Apellido y nombre</TableHead>
              <TableHead>CUIT/CUIL</TableHead>
              <TableHead>Ingreso</TableHead>
              <TableHead>Convenio</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Jornada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[120px] text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Cargando…
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.empleado.id}>
                  <TableCell className="font-medium">
                    {r.empleado.apellido}, {r.empleado.nombre}
                  </TableCell>
                  <TableCell>{r.empleado.cuilCuil}</TableCell>
                  <TableCell>{format(r.empleado.fechaIngreso, "dd/MM/yyyy")}</TableCell>
                  <TableCell>{r.convenioNombre}</TableCell>
                  <TableCell>{r.categoriaNombre}</TableCell>
                  <TableCell>{TIPO_JORNADA[r.empleado.tipoJornada] ?? r.empleado.tipoJornada}</TableCell>
                  <TableCell>
                    {r.empleado.activo ? (
                      <Badge variant="default">Activo</Badge>
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
                        onClick={() => {
                          setEditId(r.empleado.id);
                          setFormOpen(true);
                        }}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() =>
                          setEmpleadoToDelete({
                            id: r.empleado.id,
                            nombre: r.empleado.nombre,
                            apellido: r.empleado.apellido,
                          })
                        }
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

      <AlertDialog
        open={!!empleadoToDelete}
        onOpenChange={() => !deleteMutation.isPending && setEmpleadoToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará a {empleadoToDelete?.apellido}, {empleadoToDelete?.nombre}. También se
              eliminarán sus novedades y liquidaciones asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => empleadoToDelete && deleteMutation.mutate(empleadoToDelete.id)}
            >
              {deleteMutation.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
