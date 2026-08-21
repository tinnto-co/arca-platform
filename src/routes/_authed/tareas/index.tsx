import { generateKeyBetween } from 'fractional-indexing';
import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Kanban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { TaskCard } from '@/components/tareas/TaskCard';
import { NuevaTareaDialog } from '@/components/tareas/NuevaTareaDialog';
import {
  listTareas,
  listOrgMembers,
  listOrgRepresentatives,
  listColumnas,
  createColumna,
  updateColumna,
  deleteColumna,
  reorderColumnas,
  moverTarea,
  type TipoTarea,
  reorderTarea,
} from '@/actions/tareas';
import { TIPO_LABELS } from '@/components/tareas/utils';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/tareas/')({
  component: TareasPage,
});

const now = new Date();
const ANOS = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));
const MESES = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
}));

type Tarea = Awaited<ReturnType<typeof listTareas>>[number];

// ─── SortableTaskCard ─────────────────────────────────────────────────────────

function SortableTaskCard({ tarea }: { tarea: Tarea }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tarea.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn('touch-none', isDragging && 'opacity-40')}
    >
      <TaskCard tarea={tarea} />
    </div>
  );
}

// ─── TareasPage ──────────────────────────────────────────────────────────────

/**
 * Clave fraccional para insertar en `insertIdx` dentro de una lista ya ordenada
 * (sin la tarjeta que se está moviendo).
 *
 * `generateKeyBetween` exige que los dos bordes sean claves válidas o `null`,
 * así que se busca la vecina más cercana que TENGA posición en cada dirección:
 * una tarea vieja sin backfillear no puede servir de borde. Devuelve `null` si
 * la clave no se puede generar, para no escribir una posición inválida.
 */
function posicionEntre(lista: Tarea[], insertIdx: number): string | null {
  let antes: string | null = null;
  for (let i = insertIdx - 1; i >= 0; i--) {
    const pos = lista[i]?.posicion;
    if (pos != null) {
      antes = pos;
      break;
    }
  }
  let despues: string | null = null;
  for (let i = insertIdx; i < lista.length; i++) {
    const pos = lista[i]?.posicion;
    if (pos != null) {
      despues = pos;
      break;
    }
  }

  try {
    return generateKeyBetween(antes, despues);
  } catch {
    // Bordes incoherentes (antes >= despues). Pasa sólo si el cliente quedó con
    // datos viejos; el refetch posterior lo acomoda.
    return null;
  }
}

function TareasPage() {
  const queryClient = useQueryClient();
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [nuevaColumnaId, setNuevaColumnaId] = useState<string | undefined>(undefined);

  const [filtroAno, setFiltroAno] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoTarea | ''>('');
  const [filtroAsignado, setFiltroAsignado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroVencimientoHasta, setFiltroVencimientoHasta] = useState('');

  // Column management state
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColNombre, setEditingColNombre] = useState('');
  const [creandoColumna, setCreandoColumna] = useState(false);
  const [nuevaColNombre, setNuevaColNombre] = useState('');
  const [deleteColConfirm, setDeleteColConfirm] = useState<{ id: string; nombre: string } | null>(null);

  const filtroPeriodo = filtroAno && filtroMes ? `${filtroAno}-${filtroMes}` : '';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => listOrgMembers(),
  });

  const { data: representatives = [] } = useQuery({
    queryKey: ['org-representatives'],
    queryFn: () => listOrgRepresentatives(),
  });

  const { data: columnas = [], isLoading: isColsLoading } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
  });

  const { data: tareas = [], isLoading: isTareasLoading } = useQuery({
    queryKey: ['tareas', filtroPeriodo, filtroTipo, filtroAsignado, filtroCliente, filtroVencimientoHasta],
    queryFn: () =>
      listTareas({
        data: {
          periodo: filtroPeriodo || undefined,
          tipo: filtroTipo || undefined,
          asignadoA: filtroAsignado || undefined,
          clienteId: filtroCliente || undefined,
          vencimientoHasta: filtroVencimientoHasta || undefined,
        },
      }),
  });

  const isLoading = isColsLoading || isTareasLoading;

  // Agrupa por columna. NO reordena: `listTareas` ya devuelve las tareas por
  // `posicion` con `collate "C"`, y ordenarlas de nuevo acá con parseFloat las
  // rompía — las claves fraccionales son texto ("a0", "Zz"), no números.
  const tareasPorColumna = useMemo(() => {
    const map: Record<string, Tarea[]> = { __sin_columna__: [] };
    for (const col of columnas) map[col.id] = [];
    for (const t of tareas) {
      const key = t.columnaId ?? '__sin_columna__';
      if (map[key] !== undefined) map[key].push(t);
      else map.__sin_columna__.push(t);
    }
    return map;
  }, [tareas, columnas]);

  const sinColumna = tareasPorColumna.__sin_columna__ ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────

  const moveMutation = useMutation({
    mutationFn: ({
      id,
      columnaId,
      posicion,
    }: {
      id: string;
      columnaId: string | null;
      posicion?: string;
    }) => moverTarea({ data: { id, columnaId, posicion } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false }),
    onError: () => toast.error('Error al mover la tarea'),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ id, posicion }: { id: string; posicion: string }) =>
      reorderTarea({ data: { id, posicion } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false }),
    onError: () => toast.error('Error al reordenar'),
  });

  const createColMutation = useMutation({
    mutationFn: (nombre: string) => createColumna({ data: { nombre } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
      setCreandoColumna(false);
      setNuevaColNombre('');
      toast.success('Columna creada');
    },
    onError: () => toast.error('Error al crear la columna'),
  });

  const updateColMutation = useMutation({
    mutationFn: ({ id, nombre }: { id: string; nombre: string }) =>
      updateColumna({ data: { id, nombre } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
      setEditingColId(null);
    },
    onError: () => toast.error('Error al renombrar la columna'),
  });

  const deleteColMutation = useMutation({
    mutationFn: (id: string) => deleteColumna({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
      void queryClient.invalidateQueries({ queryKey: ['tareas'] });
      toast.success('Columna eliminada');
    },
    onError: () => toast.error('Error al eliminar la columna'),
  });

  const reorderColsMutation = useMutation({
    mutationFn: (ids: string[]) => reorderColumnas({ data: { ids } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] }),
    onError: () => toast.error('Error al reordenar columnas'),
  });

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeTarea = tareas.find((t) => t.id === activeId);
    if (!activeTarea) return;

    const srcColKey = activeTarea.columnaId ?? '__sin_columna__';

    // `overId` es otra tarjeta, o el id de la columna cuando se suelta en el vacío.
    const overTarea = tareas.find((t) => t.id === overId);
    const destColKey = overTarea ? (overTarea.columnaId ?? '__sin_columna__') : overId;
    const destColumnaId = destColKey === '__sin_columna__' ? null : destColKey;

    const destino = (tareasPorColumna[destColKey] ?? []).filter((t) => t.id !== activeId);

    // Dónde cae dentro de la columna destino.
    let insertIdx: number;
    if (!overTarea) {
      // Soltada sobre la columna, no sobre una tarjeta: va al final.
      insertIdx = destino.length;
    } else {
      const overIdx = destino.findIndex((t) => t.id === overId);
      if (overIdx === -1) return;
      if (srcColKey === destColKey) {
        // Dentro de la misma columna, arrastrar hacia abajo inserta DESPUÉS
        // de la tarjeta de destino; hacia arriba, antes.
        const sorted = tareasPorColumna[srcColKey] ?? [];
        const movingDown =
          sorted.findIndex((t) => t.id === activeId) < sorted.findIndex((t) => t.id === overId);
        insertIdx = movingDown ? overIdx + 1 : overIdx;
      } else {
        insertIdx = overIdx;
      }
    }

    const posicion = posicionEntre(destino, insertIdx);
    if (posicion === null) return;

    if (srcColKey !== destColKey) {
      moveMutation.mutate({ id: activeId, columnaId: destColumnaId, posicion });
    } else {
      reorderMutation.mutate({ id: activeId, posicion });
    }
  };

  // ─── Column handlers ──────────────────────────────────────────────────────

  const moveColumn = (colId: string, direction: 'left' | 'right') => {
    const idx = columnas.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    const ids = columnas.map((c) => c.id);
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    const tmp = ids[idx];
    ids[idx] = ids[swapIdx]!;
    ids[swapIdx] = tmp!;
    reorderColsMutation.mutate(ids);
  };

  const startEditCol = (id: string, nombre: string) => {
    setEditingColId(id);
    setEditingColNombre(nombre);
  };

  const saveEditCol = () => {
    if (!editingColId || !editingColNombre.trim()) return;
    updateColMutation.mutate({ id: editingColId, nombre: editingColNombre });
  };

  const openNuevaTarea = (columnaId?: string) => {
    setNuevaColumnaId(columnaId);
    setNuevaOpen(true);
  };

  const hayFiltros = !!(filtroAno || filtroMes || filtroTipo || filtroAsignado || filtroCliente || filtroVencimientoHasta);

  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      {/* Header */}
      <div className="border-b px-8 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Tareas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tareas.length} tarea{tareas.length !== 1 ? 's' : ''}
              {filtroMes && ` · ${MESES.find((m) => m.value === filtroMes)?.label ?? filtroMes}`}
              {filtroAno && ` ${filtroAno}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => openNuevaTarea()}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nueva tarea
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="border-b px-8 py-2.5">
        <div className="max-w-[1400px] mx-auto flex items-center gap-2 flex-wrap">
          <Select value={filtroAno} onValueChange={setFiltroAno}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Año</SelectItem>
              {ANOS.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroMes} onValueChange={setFiltroMes}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Mes</SelectItem>
              {MESES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TipoTarea | '')}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los tipos</SelectItem>
              {Object.entries(TIPO_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroAsignado} onValueChange={setFiltroAsignado}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Todos los asignados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los asignados</SelectItem>
              <SelectItem value="sin_asignar">Sin asignar</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroCliente} onValueChange={setFiltroCliente}>
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Todas las empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todas las empresas</SelectItem>
              {representatives.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Vence hasta</span>
            <Input
              type="date"
              value={filtroVencimientoHasta}
              onChange={(e) => setFiltroVencimientoHasta(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>

          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => {
                setFiltroAno('');
                setFiltroMes('');
                setFiltroTipo('');
                setFiltroAsignado('');
                setFiltroCliente('');
                setFiltroVencimientoHasta('');
              }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>

      {/* Kanban */}
      <div className="px-8 py-6 overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 items-start min-w-fit">
              {/* Sin columna — solo visible si hay tareas sin asignar */}
              {sinColumna.length > 0 && (
                <KanbanColumn
                  id={null}
                  nombre="Sin columna"
                  tasks={sinColumna}
                  isFirst={true}
                  isLast={true}
                  readOnly
                />
              )}

              {/* Columnas dinámicas */}
              {columnas.map((col, idx) => {
                const tasks = tareasPorColumna[col.id] ?? [];
                const isEditing = editingColId === col.id;

                return (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    nombre={col.nombre}
                    tasks={tasks}
                    isFirst={idx === 0}
                    isLast={idx === columnas.length - 1}
                    isEditing={isEditing}
                    editingNombre={editingColNombre}
                    onEditStart={() => startEditCol(col.id, col.nombre)}
                    onEditChange={setEditingColNombre}
                    onEditSave={saveEditCol}
                    onEditCancel={() => setEditingColId(null)}
                    onDelete={() => setDeleteColConfirm({ id: col.id, nombre: col.nombre })}
                    onMoveLeft={() => moveColumn(col.id, 'left')}
                    onMoveRight={() => moveColumn(col.id, 'right')}
                    onAddCard={() => openNuevaTarea(col.id)}
                  />
                );
              })}

              {/* Crear columna */}
              {creandoColumna ? (
                <div className="w-72 shrink-0">
                  <div className="bg-white border border-border rounded-lg p-3 shadow-sm">
                    <Input
                      autoFocus
                      value={nuevaColNombre}
                      onChange={(e) => setNuevaColNombre(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && nuevaColNombre.trim()) {
                          createColMutation.mutate(nuevaColNombre);
                        }
                        if (e.key === 'Escape') {
                          setCreandoColumna(false);
                          setNuevaColNombre('');
                        }
                      }}
                      placeholder="Nombre de la columna..."
                      className="mb-2 h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (nuevaColNombre.trim()) createColMutation.mutate(nuevaColNombre);
                        }}
                        disabled={!nuevaColNombre.trim() || createColMutation.isPending}
                      >
                        {createColMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          'Crear'
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCreandoColumna(false);
                          setNuevaColNombre('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCreandoColumna(true)}
                  className="w-72 shrink-0 flex items-center justify-center gap-2 h-11 rounded-lg border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Crear columna
                </button>
              )}

              {/* Estado vacío */}
              {columnas.length === 0 && sinColumna.length === 0 && !creandoColumna && (
                <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
                  <Kanban className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No hay columnas todavía</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Creá una columna para empezar a organizar tus tareas
                  </p>
                </div>
              )}
            </div>
          </DndContext>
        )}
      </div>

      <NuevaTareaDialog
        open={nuevaOpen}
        onOpenChange={setNuevaOpen}
        columnas={columnas}
        defaultColumnaId={nuevaColumnaId}
      />

      {/* AlertDialog: eliminar columna */}
      <AlertDialog
        open={!!deleteColConfirm}
        onOpenChange={(open) => { if (!open) setDeleteColConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar columna?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la columna{deleteColConfirm ? ` "${deleteColConfirm.nombre}"` : ''}. Las tareas
              asignadas a ella quedarán sin columna. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteColConfirm) {
                  deleteColMutation.mutate(deleteColConfirm.id);
                  setDeleteColConfirm(null);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  id: string | null;
  nombre: string;
  tasks: Tarea[];
  isFirst: boolean;
  isLast: boolean;
  readOnly?: boolean;
  isEditing?: boolean;
  editingNombre?: string;
  onEditStart?: () => void;
  onEditChange?: (v: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onDelete?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onAddCard?: () => void;
}

function KanbanColumn({
  id,
  nombre,
  tasks,
  isFirst,
  isLast,
  readOnly,
  isEditing,
  editingNombre,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onAddCard,
}: KanbanColumnProps) {
  const droppableId = id ?? '__sin_columna__';
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div className="w-72 shrink-0 flex flex-col gap-3">
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white shadow-sm group/header">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              autoFocus
              value={editingNombre}
              onChange={(e) => onEditChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEditSave?.();
                if (e.key === 'Escape') onEditCancel?.();
              }}
              className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-b border-primary outline-none"
            />
            <button onClick={onEditSave} className="text-green-600 hover:text-green-700 p-0.5">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={onEditCancel} className="text-muted-foreground hover:text-foreground p-0.5">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span
              className="text-sm font-semibold flex-1 truncate"
              onDoubleClick={!readOnly ? onEditStart : undefined}
              title={readOnly ? nombre : 'Doble clic para editar'}
            >
              {nombre}
            </span>
            <Badge variant="secondary" className="text-xs h-5 shrink-0">
              {tasks.length}
            </Badge>
            {!readOnly && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                <button
                  onClick={onMoveLeft}
                  disabled={isFirst}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Mover izquierda"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onMoveRight}
                  disabled={isLast}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Mover derecha"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onEditStart}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                  title="Renombrar"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={onDelete}
                  className="p-0.5 text-muted-foreground hover:text-destructive"
                  title="Eliminar columna"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Cards drop zone */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex flex-col gap-2.5 min-h-[60px] rounded-lg p-1 transition-colors',
            isOver && 'bg-primary/5 ring-2 ring-primary/20 ring-offset-1'
          )}
        >
          {tasks.length === 0 ? (
            <div
              className={cn(
                'text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg bg-white/50',
                isOver && 'border-primary/40 text-primary/60'
              )}
            >
              {isOver ? 'Soltar aquí' : 'Sin tareas'}
            </div>
          ) : (
            <>
              {tasks.map((tarea) => (
                <SortableTaskCard key={tarea.id} tarea={tarea} />
              ))}
              {isOver && (
                <div className="text-center py-3 text-xs text-primary/60 border border-dashed border-primary/30 rounded-lg">
                  Soltar aquí
                </div>
              )}
            </>
          )}
        </div>
      </SortableContext>

      {/* Add card button */}
      {!readOnly && onAddCard && (
        <button
          onClick={onAddCard}
          className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 rounded-md transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar tarea
        </button>
      )}
    </div>
  );
}
