'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth } from 'date-fns';
import {
  Plus,
  ChevronDown,
  Building2,
  Layers,
  DollarSign,
  Trash2,
  Loader2,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  updateConvenio,
  createCategoria,
  upsertEscala,
  deleteEscala,
  deleteConvenio,
  updateCategoriaEsValorHora,
} from '@/actions/sueldos';

interface SueldosConveniosProps {
  clientId: string;
  profileId: string;
}

export function SueldosConvenios({ clientId, profileId }: SueldosConveniosProps) {
  const queryClient = useQueryClient();
  const [newConvenioOpen, setNewConvenioOpen] = useState(false);
  const [newConvenioNombre, setNewConvenioNombre] = useState('');
  const [newConvenioCct, setNewConvenioCct] = useState('');

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId, profileId],
    queryFn: () => listConvenios({ data: { clientId, profileId } }),
    enabled: !!clientId && !!profileId,
  });

  const createConv = useMutation({
    mutationFn: () =>
      createConvenio({
        data: {
          clientId,
          profileId,
          nombre: newConvenioNombre,
          cctCodigo: newConvenioCct.trim() || undefined,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      setNewConvenioNombre('');
      setNewConvenioCct('');
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
      (c) => c.nombre === cct || (c.cctCodigo ?? '') === cct
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
        <button
          type="button"
          onClick={() => setSeleccionarConvenioOpen(true)}
          className="bg-[#12131A] text-white rounded-[10px] px-[17px] py-[10px] text-[13.5px] font-semibold hover:bg-black flex items-center gap-2"
        >
          <CheckCircle2 className="h-[15px] w-[15px]" />
          Seleccionar convenio
        </button>
        <button
          type="button"
          onClick={() => setNewConvenioOpen(true)}
          className="bg-white border border-[#DFDCD3] rounded-[10px] text-[#3E404A] text-[13.5px] font-semibold hover:bg-[#FBFAF6] px-[17px] py-[10px] flex items-center gap-2"
        >
          <Plus className="h-[15px] w-[15px]" />
          Nuevo convenio
        </button>
      </div>

      <Dialog
        open={seleccionarConvenioOpen}
        onOpenChange={setSeleccionarConvenioOpen}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seleccionar CCT (AFIP) para este cliente</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Seleccioná el CCT descargado de AFIP para este cliente. Luego
              cargá las categorías y escalas manualmente.
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
            <div>
              <Label>Número CCT</Label>
              <Input
                value={newConvenioCct}
                onChange={(e) => setNewConvenioCct(e.target.value)}
                placeholder="Ej. 130/75"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createConv.mutate()}
              disabled={!newConvenioNombre.trim() || createConv.isPending}
            >
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border-t border-[#ECEAE3]">
        {convenios.map((conv) => (
          <ConvenioCard
            key={conv.id}
            clientId={clientId}
            profileId={profileId}
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
  profileId,
  convenio,
  onRefresh,
}: {
  clientId: string;
  profileId: string;
  convenio: {
    id: string;
    nombre: string;
    cctCodigo: string | null;
    signatarios: string | null;
    fuentes?: string[];
    afipUpdatedAt?: Date | string | null;
  };
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [addCategoria, setAddCategoria] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editNombre, setEditNombre] = useState('');
  const [editCct, setEditCct] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nombreCat, setNombreCat] = useState('');

  const deleteConv = useMutation({
    mutationFn: () => deleteConvenio({ data: { id: convenio.id, clientId, profileId } }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      setDeleteOpen(false);
      toast.success('Convenio eliminado');
    },
    onError: (e) => toast.error(e.message),
  });

  const updateConv = useMutation({
    mutationFn: () =>
      updateConvenio({
        data: {
          id: convenio.id,
          clientId,
          profileId,
          nombre: editNombre,
          cctCodigo: editCct.trim() || undefined,
        },
      }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['convenios', clientId] });
      setEditOpen(false);
      toast.success('Convenio actualizado');
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
    <div className="border-b border-[#ECEAE3]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between py-5 px-1 text-left">
            <div className="min-w-0 flex-1">
              <span className="font-[family-name:var(--ff-display)] font-bold text-[18px] text-[#12131A] leading-tight">
                {convenio.nombre}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Building2 className="shrink-0" style={{ width: 15, height: 15, color: '#9B9CA3' }} />
                {convenio.cctCodigo ? (
                  <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[#3E404A] bg-white border border-[#DFDCD3] rounded-[6px] px-2 py-[3px]">
                    CCT: {convenio.cctCodigo}
                  </span>
                ) : null}
                <span className="text-[12px] text-[#9B9CA3] max-w-[540px] truncate">
                  {convenio.fuentes && convenio.fuentes.length > 0
                    ? convenio.fuentes.join(', ')
                    : 'Sin fuente identificada'}
                </span>
                {convenio.afipUpdatedAt ? (
                  <span className="text-[oklch(0.42_0.13_160)] bg-[oklch(0.94_0.04_160)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold shrink-0">
                    AFIP actualizado: {format(new Date(convenio.afipUpdatedAt), 'dd/MM/yyyy')}
                  </span>
                ) : (
                  <span className="text-[oklch(0.48_0.13_75)] bg-[oklch(0.95_0.04_75)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold shrink-0">
                    AFIP pendiente
                  </span>
                )}
                <span className="flex-1" />
              </div>
            </div>
            <div
              className="flex items-center gap-1 shrink-0 ml-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-[#F2F1EB] transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setEditNombre(convenio.nombre);
                  setEditCct(convenio.cctCodigo ?? '');
                  setEditOpen(true);
                }}
                title="Editar convenio"
              >
                <Pencil style={{ width: 15, height: 15, color: '#9B9CA3' }} />
              </button>
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteOpen(true);
                }}
                title="Eliminar convenio"
              >
                <Trash2 style={{ width: 15, height: 15, color: '#c0392b' }} />
              </button>
              <ChevronDown
                className={`h-5 w-5 transition-transform duration-150 text-[#9B9CA3] ${open ? 'rotate-180' : ''}`}
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
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar convenio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Nombre</Label>
                <Input
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  placeholder="Ej. Comercio"
                />
              </div>
              <div>
                <Label>Número CCT</Label>
                <Input
                  value={editCct}
                  onChange={(e) => setEditCct(e.target.value)}
                  placeholder="Ej. 130/75"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => updateConv.mutate()}
                disabled={!editNombre.trim() || updateConv.isPending}
              >
                {updateConv.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <CollapsibleContent>
          <div className="px-1 pb-[26px]">
            <div className="py-[14px] px-4 bg-[#FBFAF6] border-l-2 border-[#DFDCD3] text-[13px] text-[#6E7079] mb-4">
              {convenio.signatarios || 'Sin signatarios registrados.'}
            </div>
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => setAddCategoria(true)}
                className="bg-white border border-[#DFDCD3] rounded-[10px] text-[#3E404A] text-[13.5px] font-semibold hover:bg-[#FBFAF6] px-[17px] py-[10px] flex items-center gap-2"
              >
                <Plus className="h-[15px] w-[15px]" />
                Nueva categoría
              </button>
            </div>
            {addCategoria && (
              <div className="mb-4 flex gap-2 rounded-lg border border-[#ECEAE3] p-4">
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
            <ul className="space-y-0">
              {categorias.map((cat) => (
                <CategoriaRow
                  key={cat.id}
                  clientId={clientId}
                  categoria={cat}
                  onRefresh={onRefresh}
                />
              ))}
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function CategoriaRow({
  clientId,
  categoria,
  onRefresh,
}: {
  clientId: string;
  categoria: { id: string; codigo: string; nombre: string; esValorHora: boolean };
  onRefresh: () => void;
}) {
  const getCategoriaDisplay = (codigo: string, nombre: string) => {
    if (!nombre.includes(' - ')) {
      return { titulo: `${codigo} - ${nombre}`, subtitulo: null as string | null };
    }
    const [grupo, detalle] = nombre.split(' - ', 2);
    return {
      titulo: `${codigo} - ${grupo}`,
      subtitulo: detalle || null,
    };
  };
  const categoriaDisplay = getCategoriaDisplay(categoria.codigo, categoria.nombre);

  const queryClient = useQueryClient();
  const [showEscala, setShowEscala] = useState(false);
  const [vigenciaDesde, setVigenciaDesde] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
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

  const toggleValorHora = useMutation({
    mutationFn: (val: boolean) =>
      updateCategoriaEsValorHora({ data: { categoriaId: categoria.id, clientId, esValorHora: val } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      onRefresh();
      toast.success('Categoría actualizada');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
  });

    const hoy = new Date();

  return (
    <li className="border-b border-[#ECEAE3] pb-[10px]">
      <div className="flex items-center gap-2 py-2">
        <Layers style={{ width: 15, height: 15, color: '#9B9CA3', flexShrink: 0 }} />
        <span className="text-[14px] font-semibold text-[#12131A] flex-1 min-w-0">
          {categoriaDisplay.titulo}
          {categoriaDisplay.subtitulo ? (
            <span className="text-[#6E7079] font-normal ml-1">— {categoriaDisplay.subtitulo}</span>
          ) : null}
        </span>
        <span className="text-[11px] text-[#3E404A] bg-[#F2F1EB] rounded-full px-2 py-[2px] shrink-0">
          {escalas.length} escala{escalas.length !== 1 ? 's' : ''}
        </span>
        <label className="flex items-center gap-1 text-[12px] text-[#6E7079] shrink-0 cursor-pointer">
          <Switch
            checked={categoria.esValorHora}
            onCheckedChange={(v) => toggleValorHora.mutate(v)}
            disabled={toggleValorHora.isPending}
          />
          <span>Val/hora</span>
        </label>
        <button
          type="button"
          onClick={() => setShowEscala(!showEscala)}
          className="text-[13px] text-[#2A4680] underline-offset-2 hover:underline shrink-0 flex items-center gap-1"
        >
          <DollarSign className="h-3.5 w-3.5" />
          {showEscala ? 'Ocultar' : '$ Agregar'} escala
        </button>
      </div>
      {showEscala && (
        <div className="mt-2 mb-2 flex gap-2">
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
      <ul className="mt-1">
        {escalas.map((e) => {
          const vigente =
            new Date(e.vigenciaDesde) <= hoy &&
            (!e.vigenciaHasta || new Date(e.vigenciaHasta) >= hoy);
          return (
            <li
              key={e.id}
              className={`py-[11px] px-[14px] border-b border-[#F1EFE8] hover:bg-[#FBFAF6] transition-[background] duration-[120ms] flex items-center justify-between gap-2 border-l-[3px] ${
                vigente
                  ? 'border-l-[#C2A878] bg-[#FFFDF8]'
                  : 'border-l-[#ECEAE3] bg-transparent'
              }`}
            >
              <span className="text-[13px] text-[#3E404A] font-medium">
                Vigencia {format(e.vigenciaDesde, 'dd/MM/yyyy')}
                {e.vigenciaHasta
                  ? ` – ${format(e.vigenciaHasta, 'dd/MM/yyyy')}`
                  : ''}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-[family-name:var(--ff-display)] font-bold text-[13.5px] tabular-nums text-[#12131A]">
                  $ {Number(e.montoBasico).toLocaleString('es-AR')}
                </span>
                {vigente && (
                  <span className="text-[oklch(0.42_0.13_160)] bg-[oklch(0.94_0.04_160)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold">
                    vigente
                  </span>
                )}
                <button
                  type="button"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 transition-colors shrink-0"
                  onClick={() =>
                    setEscalaToDelete({
                      id: e.id,
                      label: `Vigencia ${format(e.vigenciaDesde, 'dd/MM/yyyy')}: $ ${Number(e.montoBasico).toLocaleString('es-AR')}`,
                    })
                  }
                  disabled={deleteEscalaMutation.isPending}
                >
                  <Trash2 style={{ width: 14, height: 14, color: '#c0392b' }} />
                </button>
              </span>
            </li>
          );
        })}
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
