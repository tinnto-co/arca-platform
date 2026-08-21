import { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Plus,
  Zap,
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
import { TaskCard } from '@/components/tareas/TaskCard';
import { NuevaTareaDialog } from '@/components/tareas/NuevaTareaDialog';
import {
  listTareas,
  listOrgMembers,
  listOrgRepresentatives,
  autoGenerarTareas,
  listColumnas,
  createColumna,
  updateColumna,
  deleteColumna,
  reorderColumnas,
  moverTarea,
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

function TareasPage() {
  const queryClient = useQueryClient();
  const [nuevaOpen, setNuevaOpen] = useState(false);

  const [filtroAno, setFiltroAno] = useState('');
  const [filtroMes, setFiltroMes] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroAsignado, setFiltroAsignado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroVencimientoHasta, setFiltroVencimientoHasta] = useState('');

  // Column management state
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColNombre, setEditingColNombre] = useState('');
  const [creandoColumna, setCreandoColumna] = useState(false);
  const [nuevaColNombre, setNuevaColNombre] = useState('');

  const filtroPeriodo = filtroAno && filtroMes ? `${filtroAno}-${filtroMes}` : '';

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

  // Group tasks by columnaId; nulls go into __sin_columna__
  const tareasPorColumna = useMemo(() => {
    const map: Record<string, typeof tareas> = { __sin_columna__: [] };
    for (const col of columnas) map[col.id] = [];
    for (const t of tareas) {
      const key = t.columnaId ?? '__sin_columna__';
      if (map[key] !== undefined) map[key].push(t);
      else map['__sin_columna__'].push(t);
    }
    return map;
  }, [tareas, columnas]);

  const sinColumna = tareasPorColumna['__sin_columna__'] ?? [];

  // ─── Mutations ────────────────────────────────────────────────────────────

  const autoGenMutation = useMutation({
    mutationFn: (periodo: string) => autoGenerarTareas({ data: { periodo } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
      const parts: string[] = [];
      if (result.omitidas > 0) parts.push(`${result.omitidas} ya existían`);
      if (result.sinCliente > 0) parts.push(`${result.sinCliente} sin cliente asociado`);
      const detalle = parts.length > 0 ? ` (${parts.join(', ')})` : '';

      if (result.creadas === 0) {
        toast.info(
          result.omitidas > 0 && result.sinCliente === 0
            ? `Todas las tareas de este período ya existen (${result.omitidas} omitidas)`
            : result.sinCliente > 0
              ? `Se encontraron vencimientos pero ${result.sinCliente} no se pudieron asociar a ningún cliente`
              : 'No se encontraron vencimientos para este período'
        );
      } else {
        toast.success(
          `${result.creadas} tarea${result.creadas !== 1 ? 's' : ''} generada${result.creadas !== 1 ? 's' : ''}${detalle}`
        );
      }
    },
    onError: () => toast.error('Error al generar tareas'),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, columnaId }: { id: string; columnaId: string | null }) =>
      moverTarea({ data: { id, columnaId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false }),
    onError: () => toast.error('Error al mover la tarea'),
  });

  const createColMutation = useMutation({
    mutationFn: (nombre: string) => createColumna({ data: { nombre } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
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
      queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
      setEditingColId(null);
    },
    onError: () => toast.error('Error al renombrar la columna'),
  });

  const deleteColMutation = useMutation({
    mutationFn: (id: string) => deleteColumna({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] });
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
      toast.success('Columna eliminada');
    },
    onError: () => toast.error('Error al eliminar la columna'),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderColumnas({ data: { ids } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tareas-columnas'] }),
    onError: () => toast.error('Error al reordenar columnas'),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent, columnaId: string | null) => {
    e.preventDefault();
    setDragOverColId(null);
    const id = e.dataTransfer.getData('tareaId');
    if (!id) return;
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea || tarea.columnaId === columnaId) return;
    moveMutation.mutate({ id, columnaId });
  };

  const handleDragOver = (e: React.DragEvent, colId: string | null) => {
    e.preventDefault();
    setDragOverColId(colId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverColId(null);
    }
  };

  const moveColumn = (colId: string, direction: 'left' | 'right') => {
    const idx = columnas.findIndex((c) => c.id === colId);
    if (idx === -1) return;
    const ids = columnas.map((c) => c.id) as string[];
    const swapIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ids.length) return;
    [ids[idx], ids[swapIdx]] = [ids[swapIdx]!, ids[idx]!];
    reorderMutation.mutate(ids);
  };

  const startEditCol = (id: string, nombre: string) => {
    setEditingColId(id);
    setEditingColNombre(nombre);
  };

  const saveEditCol = () => {
    if (!editingColId || !editingColNombre.trim()) return;
    updateColMutation.mutate({ id: editingColId, nombre: editingColNombre });
  };

  const periodoParaGenerar = filtroPeriodo || format(now, 'yyyy-MM');
  const hayFiltros = !!(filtroAno || filtroMes || filtroTipo || filtroAsignado || filtroCliente || filtroVencimientoHasta);

  return (
    <div className="min-h-screen bg-[#F7F6F2]">
      {/* Header */}
      <div className="bg-white border-b px-8 py-4">
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => autoGenMutation.mutate(periodoParaGenerar)}
              disabled={autoGenMutation.isPending}
            >
              {autoGenMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1.5" />
              )}
              Generar tareas del mes
            </Button>
            <Button size="sm" onClick={() => setNuevaOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nueva tarea
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border-b px-8 py-2.5">
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

          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
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
          <div className="flex gap-4 items-start min-w-fit">
            {/* Sin columna — solo visible si hay tareas sin asignar */}
            {sinColumna.length > 0 && (
              <KanbanColumn
                id={null}
                nombre="Sin columna"
                tasks={sinColumna}
                isDragOver={dragOverColId === '__sin_columna__'}
                isFirst={true}
                isLast={true}
                readOnly
                onDrop={(e) => handleDrop(e, null)}
                onDragOver={(e) => handleDragOver(e, '__sin_columna__')}
                onDragLeave={handleDragLeave}
              />
            )}

            {/* Columnas dinámicas */}
            {columnas.map((col, idx) => {
              const tasks = tareasPorColumna[col.id] ?? [];
              const isDragOver = dragOverColId === col.id;
              const isEditing = editingColId === col.id;

              return (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  nombre={col.nombre}
                  tasks={tasks}
                  isDragOver={isDragOver}
                  isFirst={idx === 0}
                  isLast={idx === columnas.length - 1}
                  isEditing={isEditing}
                  editingNombre={editingColNombre}
                  onDrop={(e) => handleDrop(e, col.id)}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onEditStart={() => startEditCol(col.id, col.nombre)}
                  onEditChange={setEditingColNombre}
                  onEditSave={saveEditCol}
                  onEditCancel={() => setEditingColId(null)}
                  onDelete={() => {
                    if (confirm(`¿Eliminar la columna "${col.nombre}"? Las tareas quedarán sin columna.`)) {
                      deleteColMutation.mutate(col.id);
                    }
                  }}
                  onMoveLeft={() => moveColumn(col.id, 'left')}
                  onMoveRight={() => moveColumn(col.id, 'right')}
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

            {/* Estado vacío — sin columnas ni tareas */}
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
        )}
      </div>

      <NuevaTareaDialog open={nuevaOpen} onOpenChange={setNuevaOpen} columnas={columnas} />
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

type Tarea = Awaited<ReturnType<typeof listTareas>>[number];

interface KanbanColumnProps {
  id: string | null;
  nombre: string;
  tasks: Tarea[];
  isDragOver: boolean;
  isFirst: boolean;
  isLast: boolean;
  readOnly?: boolean;
  isEditing?: boolean;
  editingNombre?: string;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onEditStart?: () => void;
  onEditChange?: (v: string) => void;
  onEditSave?: () => void;
  onEditCancel?: () => void;
  onDelete?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}

function KanbanColumn({
  nombre,
  tasks,
  isDragOver,
  isFirst,
  isLast,
  readOnly,
  isEditing,
  editingNombre,
  onDrop,
  onDragOver,
  onDragLeave,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: KanbanColumnProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className="w-72 shrink-0 flex flex-col gap-3"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-white shadow-sm group/header">
        {isEditing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={inputRef}
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
      <div
        className={cn(
          'flex flex-col gap-2.5 min-h-[60px] rounded-lg p-1 transition-colors',
          isDragOver && 'bg-primary/5 ring-2 ring-primary/20 ring-offset-1'
        )}
      >
        {tasks.length === 0 ? (
          <div
            className={cn(
              'text-center py-8 text-sm text-muted-foreground border border-dashed rounded-lg bg-white/50',
              isDragOver && 'border-primary/40 text-primary/60'
            )}
          >
            {isDragOver ? 'Soltar aquí' : 'Sin tareas'}
          </div>
        ) : (
          <>
            {tasks.map((tarea) => (
              <div
                key={tarea.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('tareaId', tarea.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => {}}
                className="cursor-grab active:cursor-grabbing"
              >
                <TaskCard tarea={tarea} />
              </div>
            ))}
            {isDragOver && (
              <div className="text-center py-3 text-xs text-primary/60 border border-dashed border-primary/30 rounded-lg">
                Soltar aquí
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
