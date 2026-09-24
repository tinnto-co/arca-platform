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
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { SelectorFecha } from '@/components/shared/selector-fecha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  traerConveniosDeArca,
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
}

export function SueldosConvenios({ clientId }: SueldosConveniosProps) {
  const queryClient = useQueryClient();
  const [newConvenioOpen, setNewConvenioOpen] = useState(false);
  const [newConvenioNombre, setNewConvenioNombre] = useState('');
  const [newConvenioCct, setNewConvenioCct] = useState('');

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', clientId],
    queryFn: () => listConvenios({ data: { clientId } }),
    enabled: !!clientId,
  });

  const createConv = useMutation({
    mutationFn: () =>
      createConvenio({
        data: {
          clientId,
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

  const convenioYaTieneCct = (cct: string | null) =>
    !!cct &&
    (convenios ?? []).some(
      (c) => c.nombre === cct || (c.cctCodigo ?? '') === cct
    );

  /**
   * Trae los CCT de ARCA para esta empresa. El diálogo antes decía "todavía
   * no se trajeron" sin ofrecer forma de traerlos: para toda empresa dada de
   * alta después de la carga inicial, era un callejón sin salida.
   */
  const traerDeArca = useMutation({
    mutationFn: () => traerConveniosDeArca({ data: { clientId } }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({
        queryKey: ['convenios-afip-empleadores', clientId],
      });
      if (r.sinInformar) {
        toast.info('ARCA no informa convenios para esta empresa', {
          description:
            'Cargalo a mano con «Nuevo convenio» si sabés cuál le corresponde.',
        });
      } else {
        toast.success(
          r.nuevos > 0
            ? `${r.nuevos} convenio${r.nuevos === 1 ? '' : 's'} nuevo${r.nuevos === 1 ? '' : 's'} de ARCA`
            : `${r.convenios} convenio${r.convenios === 1 ? '' : 's'} de ARCA, sin cambios`
        );
      }
    },
    // El error se muestra dentro del diálogo (ver más abajo): un toast se va
    // solo y acá hace falta leerlo para decidir si reintentar.
  });

  const agregarDesdeAfip = useMutation({
    mutationFn: (afipConvenioId: string) =>
      agregarConvenioDesdeAfipEmpleadores({
        data: { clientId, afipConvenioId },
      }),
    onSuccess: (result) => {
      if (result.created) {
        toast.success('Convenio ARCA agregado al cliente');
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
        {/* Crear va en primario y elegir del catálogo en secundario, como
          "Nuevo cliente" y "Nuevo empleado" en el resto de la plataforma:
          acá estaban al revés. */}
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setSeleccionarConvenioOpen(true)}
        >
          <CheckCircle2 className="size-4" />
          Seleccionar convenio
        </Button>
        <Button className="gap-2" onClick={() => setNewConvenioOpen(true)}>
          <Plus className="size-4" />
          Nuevo convenio
        </Button>
      </div>

      <Dialog
        open={seleccionarConvenioOpen}
        onOpenChange={setSeleccionarConvenioOpen}
      >
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Seleccionar CCT (ARCA) para este cliente</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Seleccioná el CCT descargado de ARCA para este cliente. Luego
              cargá las categorías y escalas manualmente.
            </p>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {conveniosAfip.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-muted-foreground">
                  Para esta empresa no hay convenios traídos de ARCA. Se
                  consultan en «Simplificación Registral - Empleadores», con la
                  clave fiscal del estudio.
                </p>

                {/* El error queda a la vista y no en un toast que se va: Mi
                    Simplificación de ARCA es intermitente, así que reintentar
                    es parte del uso normal y no una excepción. (El 7 de 10 que
                    midió el scrapper es el peor caso: corridas seguidas sobre
                    la misma clave, que además disparan el freno de AFIP. En
                    uso real la tasa es mejor.) */}
                {traerDeArca.isError && (
                  <div className="flex items-start gap-2 rounded-lg border border-[var(--arca-border)] bg-[var(--arca-accent-warn-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--arca-accent-warn-fg)]">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {traerDeArca.error instanceof Error
                        ? traerDeArca.error.message
                        : 'No se pudieron traer los convenios.'}
                    </span>
                  </div>
                )}

                <Button
                  className="gap-2"
                  disabled={traerDeArca.isPending}
                  onClick={() => traerDeArca.mutate()}
                >
                  {traerDeArca.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {traerDeArca.isPending
                    ? 'Consultando ARCA…'
                    : traerDeArca.isError
                      ? 'Reintentar'
                      : 'Buscar en ARCA'}
                </Button>
                {traerDeArca.isPending && (
                  <p className="text-xs text-muted-foreground">
                    Entra a ARCA con la clave del estudio: puede tardar un par
                    de minutos.
                  </p>
                )}
                {/* Insistir empeora las cosas: ARCA frena la clave cuando se
                    entra muchas veces seguidas, así que al segundo fallo
                    conviene decirlo en vez de dejar que el usuario machaque. */}
                {traerDeArca.isError && traerDeArca.failureCount > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Si vuelve a fallar, esperá unos minutos antes de insistir:
                    ARCA frena la clave cuando se entra muchas veces seguidas.
                  </p>
                )}
              </div>
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
        {/* Los campos iban en un <div> pelado: el rótulo quedaba pegado al
          input y el anillo de foco se lo comía. */}
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nuevo convenio colectivo</DialogTitle>
            <DialogDescription>
              El CCT es opcional: se puede cargar después.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="convenio-nombre">Nombre</Label>
              <Input
                id="convenio-nombre"
                value={newConvenioNombre}
                onChange={(e) => setNewConvenioNombre(e.target.value)}
                placeholder="Ej. Comercio"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="convenio-cct">Número CCT</Label>
              <Input
                id="convenio-cct"
                value={newConvenioCct}
                onChange={(e) => setNewConvenioCct(e.target.value)}
                placeholder="Ej. 130/75"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewConvenioOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createConv.mutate()}
              disabled={!newConvenioNombre.trim() || createConv.isPending}
            >
              {createConv.isPending ? 'Creando…' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="border-t border-[var(--arca-border)]">
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
    mutationFn: () => deleteConvenio({ data: { id: convenio.id, clientId } }),
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
    <div className="border-b border-[var(--arca-border)]">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between py-5 px-1 text-left">
            <div className="min-w-0 flex-1">
              <span className="font-[family-name:var(--ff-display)] font-bold text-[18px] text-[var(--arca-ink)] leading-tight">
                {convenio.nombre}
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <Building2
                  className="shrink-0"
                  style={{ width: 15, height: 15, color: 'var(--arca-ink-4)' }}
                />
                {convenio.cctCodigo ? (
                  <span className="font-[family-name:var(--ff-mono)] text-[12px] text-[var(--arca-ink-2)] bg-white border border-[var(--arca-border-strong)] rounded-[6px] px-2 py-[3px]">
                    CCT: {convenio.cctCodigo}
                  </span>
                ) : null}
                <span className="text-[12px] text-[var(--arca-ink-4)] max-w-[540px] truncate">
                  {convenio.fuentes && convenio.fuentes.length > 0
                    ? // El dato guardado dice "AFIP" desde antes del cambio
                      // de nombre del organismo; se traduce al mostrarlo para
                      // no reescribir filas ni romper comparaciones.
                      convenio.fuentes
                        .map((f) => (f === 'AFIP' ? 'ARCA' : f))
                        .join(', ')
                    : 'Sin fuente identificada'}
                </span>
                {convenio.afipUpdatedAt ? (
                  <span className="text-[oklch(0.42_0.13_160)] bg-[oklch(0.94_0.04_160)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold shrink-0">
                    ARCA actualizado:{' '}
                    {format(new Date(convenio.afipUpdatedAt), 'dd/MM/yyyy')}
                  </span>
                ) : (
                  <span className="text-[oklch(0.48_0.13_75)] bg-[oklch(0.95_0.04_75)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold shrink-0">
                    ARCA pendiente
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
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--arca-surface-2)] transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setEditNombre(convenio.nombre);
                  setEditCct(convenio.cctCodigo ?? '');
                  setEditOpen(true);
                }}
                title="Editar convenio"
              >
                <Pencil
                  style={{ width: 15, height: 15, color: 'var(--arca-ink-4)' }}
                />
              </button>
              <button
                type="button"
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-[var(--arca-accent-neg-bg)] transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteOpen(true);
                }}
                title="Eliminar convenio"
              >
                <Trash2
                  style={{
                    width: 15,
                    height: 15,
                    color: 'var(--arca-accent-neg)',
                  }}
                />
              </button>
              <ChevronDown
                className={`h-5 w-5 transition-transform duration-150 text-[var(--arca-ink-4)] ${open ? 'rotate-180' : ''}`}
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
            <div className="py-[14px] px-4 bg-[var(--arca-surface-2)] border-l-2 border-[var(--arca-border-strong)] text-[13px] text-[var(--arca-ink-3)] mb-4">
              {convenio.signatarios || 'Sin signatarios registrados.'}
            </div>
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={() => setAddCategoria(true)}
                className="bg-white border border-[var(--arca-border-strong)] rounded-lg text-[var(--arca-ink-2)] text-[13px] font-semibold hover:bg-[var(--arca-surface-2)] h-9 px-4 flex items-center gap-2"
              >
                <Plus className="h-[15px] w-[15px]" />
                Nueva categoría
              </button>
            </div>
            {addCategoria && (
              <div className="mb-4 flex gap-2 rounded-lg border border-[var(--arca-border)] p-4">
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
  categoria: {
    id: string;
    codigo: string;
    nombre: string;
    esValorHora: boolean;
  };
  onRefresh: () => void;
}) {
  const getCategoriaDisplay = (codigo: string, nombre: string) => {
    if (!nombre.includes(' - ')) {
      return {
        titulo: `${codigo} - ${nombre}`,
        subtitulo: null as string | null,
      };
    }
    const [grupo, detalle] = nombre.split(' - ', 2);
    return {
      titulo: `${codigo} - ${grupo}`,
      subtitulo: detalle || null,
    };
  };
  const categoriaDisplay = getCategoriaDisplay(
    categoria.codigo,
    categoria.nombre
  );

  const queryClient = useQueryClient();
  const [showEscala, setShowEscala] = useState(false);
  const [vigenciaDesde, setVigenciaDesde] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [monto, setMonto] = useState('');
  // Las escalas de convenio suelen tener básico + sumas no remunerativas
  // (los acuerdos que todavía no se absorbieron). Sin este campo la carga a
  // mano quedaba incompleta y el recibo salía sin las sumas.
  const [montoNoRem, setMontoNoRem] = useState('');

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
          montoNoRemunerativo: parseFloat(montoNoRem) || 0,
          fuente: 'manual',
        },
      }),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ['escalas', categoria.id] });
      setMonto('');
      setMontoNoRem('');
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
      updateCategoriaEsValorHora({
        data: { categoriaId: categoria.id, clientId, esValorHora: val },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categorias'] });
      onRefresh();
      toast.success('Categoría actualizada');
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'Error al actualizar'),
  });

  const hoy = new Date();

  return (
    <li className="border-b border-[var(--arca-border)] pb-[10px]">
      <div className="flex items-center gap-2 py-2">
        <Layers
          style={{
            width: 15,
            height: 15,
            color: 'var(--arca-ink-4)',
            flexShrink: 0,
          }}
        />
        <span className="text-[14px] font-semibold text-[var(--arca-ink)] flex-1 min-w-0">
          {categoriaDisplay.titulo}
          {categoriaDisplay.subtitulo ? (
            <span className="text-[var(--arca-ink-3)] font-normal ml-1">
              — {categoriaDisplay.subtitulo}
            </span>
          ) : null}
        </span>
        <span className="text-[11px] text-[var(--arca-ink-2)] bg-[var(--arca-surface-2)] rounded-full px-2 py-[2px] shrink-0">
          {escalas.length} escala{escalas.length !== 1 ? 's' : ''}
        </span>
        <label className="flex items-center gap-1 text-[12px] text-[var(--arca-ink-3)] shrink-0 cursor-pointer">
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
          className="text-[13px] text-[var(--arca-accent)] underline-offset-2 hover:underline shrink-0 flex items-center gap-1"
        >
          <DollarSign className="h-3.5 w-3.5" />
          {showEscala ? 'Ocultar' : '$ Agregar'} escala
        </button>
      </div>
      {showEscala && (
        <div className="mt-2 mb-2 flex gap-2">
          <SelectorFecha
            value={vigenciaDesde}
            onChange={setVigenciaDesde}
            placeholder="Vigencia desde"
          />
          <Input
            type="number"
            placeholder="Monto básico"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
          />
          <Input
            type="number"
            placeholder="No remunerativo"
            value={montoNoRem}
            onChange={(e) => setMontoNoRem(e.target.value)}
            title="Sumas no remunerativas del acuerdo, si las hay. Si son varias, la suma de todas."
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
              className={`py-[11px] px-[14px] border-b border-[var(--arca-surface-2)] hover:bg-[var(--arca-surface-2)] transition-[background] duration-[120ms] flex items-center justify-between gap-2 border-l-[3px] ${
                vigente
                  ? 'border-l-[var(--arca-chart-3)] bg-[#FFFDF8]'
                  : 'border-l-[var(--arca-border)] bg-transparent'
              }`}
            >
              <span className="text-[13px] text-[var(--arca-ink-2)] font-medium">
                Vigencia {format(e.vigenciaDesde, 'dd/MM/yyyy')}
                {e.vigenciaHasta
                  ? ` – ${format(e.vigenciaHasta, 'dd/MM/yyyy')}`
                  : ''}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-[family-name:var(--ff-display)] font-bold text-[13.5px] tabular-nums text-[var(--arca-ink)]">
                  $ {Number(e.montoBasico).toLocaleString('es-AR')}
                </span>
                {vigente && (
                  <span className="text-[oklch(0.42_0.13_160)] bg-[oklch(0.94_0.04_160)] rounded-full px-[9px] py-[3px] text-[11px] font-semibold">
                    vigente
                  </span>
                )}
                <button
                  type="button"
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-[var(--arca-accent-neg-bg)] transition-colors shrink-0"
                  onClick={() =>
                    setEscalaToDelete({
                      id: e.id,
                      label: `Vigencia ${format(e.vigenciaDesde, 'dd/MM/yyyy')}: $ ${Number(e.montoBasico).toLocaleString('es-AR')}`,
                    })
                  }
                  disabled={deleteEscalaMutation.isPending}
                >
                  <Trash2
                    style={{
                      width: 14,
                      height: 14,
                      color: 'var(--arca-accent-neg)',
                    }}
                  />
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
