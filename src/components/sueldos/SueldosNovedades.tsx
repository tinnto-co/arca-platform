"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Plus, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listNovedadesByPeriodo,
  listEmpleados,
  listConceptos,
  upsertNovedad,
} from "@/actions/sueldos";
import { puedeIngresarDatosPeriodo } from "@/lib/payroll-period-rules";

const now = new Date();
const ANOS = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, "0"),
  label: format(new Date(2000, i, 1), "MMMM", { locale: es }),
}));

interface SueldosNovedadesProps {
  clientId: string;
}

export function SueldosNovedades({ clientId }: SueldosNovedadesProps) {
  const queryClient = useQueryClient();
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [mes, setMes] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const periodo = useMemo(() => `${ano}-${mes}`, [ano, mes]);
  const permiteIngresar = puedeIngresarDatosPeriodo(periodo);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [empleadoId, setEmpleadoId] = useState("");
  const [conceptoId, setConceptoId] = useState("");
  const [valor, setValor] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [detalle, setDetalle] = useState("");

  const { data: novedades = [] } = useQuery({
    queryKey: ["novedades", clientId, periodo],
    queryFn: () => listNovedadesByPeriodo({ data: { clientId, periodo } }),
    enabled: !!clientId,
  });

  const { data: empleados = [] } = useQuery({
    queryKey: ["empleados", clientId],
    queryFn: () => listEmpleados({ data: { clientId } }),
    enabled: !!clientId,
  });

  const { data: conceptos = [] } = useQuery({
    queryKey: ["conceptos", clientId],
    queryFn: () => listConceptos({ data: { clientId } }),
    enabled: !!clientId,
  });

  const addNovedad = useMutation({
    mutationFn: () =>
      upsertNovedad({
        data: {
          empleadoId,
          conceptoId,
          periodo,
          valor: parseFloat(valor) || 0,
          cantidad: cantidad ? parseFloat(cantidad) : undefined,
          detalle: detalle || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["novedades", clientId, periodo] });
      setDialogOpen(false);
      setEmpleadoId("");
      setConceptoId("");
      setValor("");
      setCantidad("");
      setDetalle("");
      toast.success("Novedad cargada");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Label>Año:</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANOS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>Mes:</Label>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-end gap-1">
          {!permiteIngresar && (
            <span className="text-xs text-muted-foreground">
              Solo se puede cargar información de meses anteriores al en curso.
            </span>
          )}
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!permiteIngresar}
          >
            <Plus className="mr-2 h-4 w-4" />
            Cargar novedad
          </Button>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva novedad</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Empleado</Label>
              <Select value={empleadoId} onValueChange={setEmpleadoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {empleados.map((r) => (
                    <SelectItem key={r.empleado.id} value={r.empleado.id}>
                      {r.empleado.apellido}, {r.empleado.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Concepto</Label>
              <Select value={conceptoId} onValueChange={setConceptoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {conceptos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} – {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div>
              <Label>Cantidad (opcional, ej. horas)</Label>
              <Input
                type="number"
                step="0.01"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div>
              <Label>Detalle (opcional)</Label>
              <Input value={detalle} onChange={(e) => setDetalle(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => addNovedad.mutate()}
              disabled={!empleadoId || !conceptoId || valor === ""}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Novedades del período</CardTitle>
          <p className="text-sm text-muted-foreground">
            {periodo}. Estas se aplican al calcular la liquidación.
          </p>
        </CardHeader>
        <CardContent>
          {novedades.length === 0 ? (
            <p className="text-muted-foreground">
              No hay novedades cargadas para este período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {novedades.map((n) => (
                  <TableRow key={n.novedad.id}>
                    <TableCell>{n.empleadoNombre}</TableCell>
                    <TableCell>{n.conceptoNombre}</TableCell>
                    <TableCell>
                      ${Number(n.novedad.valor).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>{n.novedad.cantidad ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
