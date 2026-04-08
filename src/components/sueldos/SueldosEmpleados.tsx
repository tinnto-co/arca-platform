'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  listImportEmpleados,
  createManualEmpleado,
  deleteManualEmpleado,
} from '@/actions/sueldos';

interface SueldosEmpleadosProps {
  clientId: string;
  profileId: string;
}

function formatDate(d: Date | string | null | undefined): string {
  if (d == null) return '—';
  try {
    const dt = typeof d === 'string' ? parseISO(d) : d;
    return format(dt, 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

export function SueldosEmpleados({
  clientId,
  profileId,
}: SueldosEmpleadosProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    cuil: '',
    legajo: '',
    nombre: '',
    fechaAlta: '',
    fechaBaja: '',
    modoContrato: '',
    categoria: '',
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['import-empleados', clientId, profileId],
    queryFn: () => listImportEmpleados({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const crear = useMutation({
    mutationFn: () =>
      createManualEmpleado({
        data: {
          clientId,
          profileId,
          cuil: form.cuil,
          legajo: form.legajo,
          nombre: form.nombre,
          fechaAlta: form.fechaAlta || undefined,
          fechaBaja: form.fechaBaja || undefined,
          modoContrato: form.modoContrato || undefined,
          categoria: form.categoria || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Empleado creado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
      setOpen(false);
      setForm({
        cuil: '',
        legajo: '',
        nombre: '',
        fechaAlta: '',
        fechaBaja: '',
        modoContrato: '',
        categoria: '',
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (empleadoId: string) =>
      deleteManualEmpleado({ data: { clientId, empleadoId } }),
    onSuccess: () => {
      toast.success('Empleado eliminado');
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId, profileId],
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cuil || !form.legajo || !form.nombre) {
      toast.error('CUIL, legajo y nombre son requeridos');
      return;
    }
    crear.mutate();
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground break-words">
          Empleados del perfil fiscal (importados desde LSD o creados
          manualmente).
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Nuevo empleado manual</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="cuil">CUIL *</Label>
                  <Input
                    id="cuil"
                    value={form.cuil}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cuil: e.target.value }))
                    }
                    placeholder="20-12345678-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="legajo">Legajo *</Label>
                  <Input
                    id="legajo"
                    value={form.legajo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, legajo: e.target.value }))
                    }
                    placeholder="001"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="nombre">Nombre completo *</Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, nombre: e.target.value }))
                  }
                  placeholder="Apellido, Nombre"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="fechaAlta">Fecha de alta</Label>
                  <Input
                    id="fechaAlta"
                    type="date"
                    value={form.fechaAlta}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fechaAlta: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="fechaBaja">Fecha de baja</Label>
                  <Input
                    id="fechaBaja"
                    type="date"
                    value={form.fechaBaja}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, fechaBaja: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="modoContrato">Modo contrato</Label>
                  <Input
                    id="modoContrato"
                    value={form.modoContrato}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, modoContrato: e.target.value }))
                    }
                    placeholder="Tiempo indeterminado"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="categoria">Categoría</Label>
                  <Input
                    id="categoria"
                    value={form.categoria}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, categoria: e.target.value }))
                    }
                    placeholder="A1"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={crear.isPending}>
                  {crear.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-md border">
        <Table className="w-full min-w-0 table-fixed text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[8%]" />
            <col className="w-[6%]" />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal">Nombre</TableHead>
              <TableHead>CUIL</TableHead>
              <TableHead>Legajo</TableHead>
              <TableHead className="whitespace-normal">Fecha alta</TableHead>
              <TableHead className="whitespace-normal">Fecha baja</TableHead>
              <TableHead className="whitespace-normal">Modo</TableHead>
              <TableHead className="whitespace-normal">Categoría</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                >
                  Cargando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-muted-foreground"
                >
                  No hay empleados para este perfil. Ejecutá el import de Excel
                  en el scrapper o creá uno manualmente con el botón "Nuevo
                  empleado".
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const e = r.empleado;
                const baja = e.fechaBaja != null;
                const esManual = e.origen === 'manual';
                return (
                  <TableRow key={e.id}>
                    <TableCell className="min-w-0 break-words font-medium align-top py-2">
                      {e.nombre}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {e.cuil}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2 tabular-nums">
                      {e.legajo}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaAlta ?? undefined)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top py-2">
                      {formatDate(e.fechaBaja ?? undefined)}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {e.modoContrato ?? '—'}
                    </TableCell>
                    <TableCell className="min-w-0 break-words align-top py-2">
                      {e.categoria ?? '—'}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      {baja ? (
                        <Badge
                          variant="secondary"
                          className="whitespace-nowrap"
                        >
                          Baja
                        </Badge>
                      ) : (
                        <Badge variant="default" className="whitespace-nowrap">
                          Activo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="align-top py-2">
                      {esManual && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={eliminar.isPending}
                          onClick={() => eliminar.mutate(e.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
