'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Plus,
  ChevronDown,
  Building2,
  Layers,
  DollarSign,
  Trash2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  listConvenios,
  listCategoriasByConvenio,
  listEscalasByCategoria,
  listConveniosAfipEmpleadores,
  agregarConvenioDesdeAfipEmpleadores,
  createConvenio,
  createCategoria,
  upsertEscala,
  deleteEscala,
  deleteConvenio,
} from '@/actions/sueldos';

interface SueldosConveniosProps {
  clientId: string;
}

export function SueldosConvenios({ clientId }: SueldosConveniosProps) {
  const queryClient = useQueryClient();
  const [newConvenioOpen, setNewConvenioOpen] = useState(false);
  const [newConvenioNombre, setNewConvenioNombre] = useState('');

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId],
    queryFn: () => listConvenios({ data: { clientId } }),
    enabled: !!clientId,
  });

  const createConv = useMutation({
    mutationFn: (nombre: string) =>
      createConvenio({ data: { clientId, nombre, descripcion: undefined } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      setNewConvenioNombre('');
      setNewConvenioOpen(false);
      toast.success('Convenio creado');
    },
    onError: (e) => toast.error(e.message),
  });

  const [seleccionarConvenioOpen, setSeleccionarConvenioOpen] = useState(false);
  const { data: conveniosAfip = [] } = useQuery({
    queryKey: ['convenios-afip-empleadores', clientId],
    queryFn: () => listConveniosAfipEmpleadores({ data: { clientId } }),
    enabled: seleccionarConvenioOpen && !!clientId,
  });

  const convenioYaTieneCct = (cct: string) =>
    (convenios ?? []).some(
      (c) => c.nombre === cct || (c.descripcion ?? '').includes(cct)
    );

  const agregarDesdeAfip = useMutation({
    mutationFn: (afipConvenioId: string) =>
      agregarConvenioDesdeAfipEmpleadores({
        data: { clientId, afipConvenioId },
      }),
    onSuccess: (result) => {
      if (result.created) {
        toast.success('Convenio AFIP agregado al cliente');
        setSeleccionarConvenioOpen(false);
        queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      } else {
        toast.info(result.message ?? 'El cliente ya tiene este convenio');
        queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al agregar convenio'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="default"
          onClick={() => setSeleccionarConvenioOpen(true)}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Seleccionar convenio
        </Button>
        <Button variant="outline" onClick={() => setNewConvenioOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo convenio
        </Button>
      </div>

      <Dialog
        open={seleccionarConvenioOpen}
        onOpenChange={setSeleccionarConvenioOpen}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seleccionar CCT (AFIP) para este cliente</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Usamos el CCT scrapeado desde AFIP para este cliente. Se crearán
              las categorías y escalas base.
            </p>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {conveniosAfip.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay convenios AFIP scrapeados para este cliente todavía.
              </p>
            ) : (
              conveniosAfip.map((c) => {
                const yaTiene = convenioYaTieneCct(c.cct);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => !yaTiene && agregarDesdeAfip.mutate(c.id)}
                    disabled={yaTiene || agregarDesdeAfip.isPending}
                    className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-60 disabled:hover:bg-transparent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.cct}</p>
                      {c.actividad && (
                        <p className="mt-0.5 text-xs text-muted-foreground break-words">
                          {c.actividad}
                        </p>
                      )}
                      {c.fechaNovedad && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground break-words">
                          Novedad: {c.fechaNovedad}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0">
                      {yaTiene ? (
                        <span className="text-xs text-muted-foreground">
                          Ya asignado
                        </span>
                      ) : agregarDesdeAfip.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={newConvenioOpen} onOpenChange={setNewConvenioOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo convenio colectivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={newConvenioNombre}
                onChange={(e) => setNewConvenioNombre(e.target.value)}
                placeholder="Ej. Comercio"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createConv.mutate(newConvenioNombre)}
              disabled={!newConvenioNombre.trim() || createConv.isPending}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {convenios.map((conv) => (
          <ConvenioCard
            key={conv.id}
            clientId={clientId}
            convenio={conv}
            onRefresh={() =>
              queryClient.invalidateQueries({
                queryKey: ['convenios', clientId],
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function ConvenioCard({
  clientId,
  convenio,
  onRefresh,
}: {
  clientId: string;
  convenio: { id: string; nombre: string; descripcion: string | null };
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addCategoria, setAddCategoria] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nombreCat, setNombreCat] = useState('');

  const deleteConv = useMutation({
    mutationFn: () => deleteConvenio({ data: { id: convenio.id, clientId } }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      setDeleteOpen(false);
      toast.success('Convenio eliminado');
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', convenio.id],
    queryFn: () =>
      listCategoriasByConvenio({ data: { convenioId: convenio.id, clientId } }),
    enabled: open && !!clientId,
  });

  const createCat = useMutation({
    mutationFn: () =>
      createCategoria({
        data: { convenioId: convenio.id, clientId, codigo, nombre: nombreCat },
      }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['categorias', convenio.id] });
      setCodigo('');
      setNombreCat('');
      setAddCategoria(false);
      toast.success('Categoría creada');
    },
  });

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-6 py-4 text-left">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-lg">{convenio.nombre}</CardTitle>
            </div>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteOpen(true);
                }}
                title="Eliminar convenio"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <ChevronDown
                className={`h-5 w-5 transition ${open ? 'rotate-180' : ''}`}
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar convenio?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará &quot;{convenio.nombre}&quot; y todas sus
                categorías y escalas. Esta acción no se puede deshacer. Si hay
                empleados asignados a este convenio, no se podrá eliminar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteConv.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteConv.isPending}
              >
                {deleteConv.isPending ? 'Eliminando…' : 'Eliminar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <p className="mb-4 text-sm text-muted-foreground">
              {convenio.descripcion || 'Sin descripción.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddCategoria(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nueva categoría
              </Button>
            </div>
            {addCategoria && (
              <div className="mb-4 flex gap-2 rounded-lg border p-4">
                <Input
                  placeholder="Código"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="max-w-[120px]"
                />
                <Input
                  placeholder="Nombre categoría"
                  value={nombreCat}
                  onChange={(e) => setNombreCat(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => createCat.mutate()}
                  disabled={!codigo.trim() || !nombreCat.trim()}
                >
                  Agregar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddCategoria(false)}
                >
                  Cancelar
                </Button>
              </div>
            )}
            <ul className="space-y-4">
              {categorias.map((cat) => (
                <CategoriaRow
                  key={cat.id}
                  clientId={clientId}
                  categoria={cat}
                  onRefresh={onRefresh}
                />
              ))}
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function CategoriaRow({
  clientId,
  categoria,
  onRefresh,
}: {
  clientId: string;
  categoria: { id: string; codigo: string; nombre: string };
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [showEscala, setShowEscala] = useState(false);
  const [vigenciaDesde, setVigenciaDesde] = useState(
    format(new Date(), 'yyyy-MM-dd')
  );
  const [monto, setMonto] = useState('');

  const { data: escalas = [] } = useQuery({
    queryKey: ['escalas', categoria.id],
    queryFn: () =>
      listEscalasByCategoria({ data: { categoriaId: categoria.id, clientId } }),
  });

  const addEscala = useMutation({
    mutationFn: () =>
      upsertEscala({
        data: {
          categoriaId: categoria.id,
          clientId,
          vigenciaDesde,
          montoBasico: parseFloat(monto) || 0,
        },
      }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['escalas', categoria.id] });
      setMonto('');
      setShowEscala(false);
      toast.success('Escala agregada');
    },
  });

  const [escalaToDelete, setEscalaToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const deleteEscalaMutation = useMutation({
    mutationFn: (escalaId: string) =>
      deleteEscala({ data: { escalaId, clientId } }),
    onSuccess: () => {
      setEscalaToDelete(null);
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['escalas', categoria.id] });
      toast.success('Escala eliminada');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al eliminar'),
  });

  return (
    <li className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {categoria.codigo} – {categoria.nombre}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowEscala(!showEscala)}
        >
          <DollarSign className="mr-2 h-4 w-4" />
          {showEscala ? 'Ocultar' : 'Agregar'} escala
        </Button>
      </div>
      {showEscala && (
        <div className="mt-4 flex gap-2">
          <Input
            type="date"
            value={vigenciaDesde}
            onChange={(e) => setVigenciaDesde(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Monto básico"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => addEscala.mutate()}
            disabled={!monto || parseFloat(monto) <= 0}
          >
            Guardar escala
          </Button>
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {escalas.map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
          >
            <span>
              Vigencia {format(e.vigenciaDesde, 'dd/MM/yyyy')}
              {e.vigenciaHasta
                ? ` – ${format(e.vigenciaHasta, 'dd/MM/yyyy')}`
                : ''}
              : $ {Number(e.montoBasico).toLocaleString('es-AR')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                setEscalaToDelete({
                  id: e.id,
                  label: `Vigencia ${format(e.vigenciaDesde, 'dd/MM/yyyy')}: $ ${Number(e.montoBasico).toLocaleString('es-AR')}`,
                })
              }
              disabled={deleteEscalaMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={!!escalaToDelete}
        onOpenChange={(open) =>
          !deleteEscalaMutation.isPending && !open && setEscalaToDelete(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar escala?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la escala: {escalaToDelete?.label}. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEscalaMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                escalaToDelete && deleteEscalaMutation.mutate(escalaToDelete.id)
              }
            >
              {deleteEscalaMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
