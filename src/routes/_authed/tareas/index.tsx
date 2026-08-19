import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Plus, Zap, Loader2 } from 'lucide-react';
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
  updateEstadoTarea,
} from '@/actions/tareas';
import { TIPO_LABELS, ESTADO_LABELS, ESTADO_BG, ESTADO_COLORS } from '@/components/tareas/utils';
import type { EstadoTarea } from '@/components/tareas/utils';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/tareas/')({
  component: TareasPage,
});

const ESTADOS: EstadoTarea[] = ['pendiente', 'presentada', 'verificada'];

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

  // Drag and drop
  const [dragOverEstado, setDragOverEstado] = useState<EstadoTarea | null>(null);

  const filtroPeriodo = filtroAno && filtroMes ? `${filtroAno}-${filtroMes}` : '';

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => listOrgMembers(),
  });

  const { data: representatives = [] } = useQuery({
    queryKey: ['org-representatives'],
    queryFn: () => listOrgRepresentatives(),
  });

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['tareas', filtroPeriodo, filtroTipo, filtroAsignado, filtroCliente, filtroVencimientoHasta],
    queryFn: () =>
      listTareas({
        data: {
          periodoMes: filtroPeriodo || undefined,
          tipo: filtroTipo || undefined,
          asignadoAUserId: filtroAsignado || undefined,
          representativeId: filtroCliente || undefined,
          vencimientoHasta: filtroVencimientoHasta || undefined,
        },
      }),
  });

  const autoGenMutation = useMutation({
    mutationFn: (periodoMes: string) => autoGenerarTareas({ data: { periodoMes } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
      if (result.creadas === 0) {
        toast.info(
          result.omitidas > 0
            ? `Todas las tareas de este período ya existen (${result.omitidas} omitidas)`
            : 'No se encontraron vencimientos para este período'
        );
      } else {
        toast.success(
          `${result.creadas} tarea${result.creadas !== 1 ? 's' : ''} generada${result.creadas !== 1 ? 's' : ''}${result.omitidas > 0 ? ` (${result.omitidas} ya existían)` : ''}`
        );
      }
    },
    onError: () => toast.error('Error al generar tareas'),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoTarea }) =>
      updateEstadoTarea({ data: { id, estado } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas'], exact: false });
    },
    onError: () => toast.error('Error al mover la tarea'),
  });

  const handleDrop = (e: React.DragEvent, estado: EstadoTarea) => {
    e.preventDefault();
    setDragOverEstado(null);
    const id = e.dataTransfer.getData('tareaId');
    if (!id) return;
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea || tarea.estado === estado) return;
    moveMutation.mutate({ id, estado });
  };

  const tareasPorEstado = useMemo(() => {
    const map: Record<EstadoTarea, typeof tareas> = {
      pendiente: [],
      presentada: [],
      verificada: [],
    };
    for (const t of tareas) {
      const estado = t.estado as EstadoTarea;
      if (map[estado]) map[estado].push(t);
    }
    return map;
  }, [tareas]);

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
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
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
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
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
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
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
      <div className="max-w-[1400px] mx-auto px-8 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ESTADOS.map((estado) => {
              const col = tareasPorEstado[estado];
              const isDragOver = dragOverEstado === estado;
              return (
                <div
                  key={estado}
                  className="flex flex-col gap-3"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverEstado(estado);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDragOverEstado(null);
                    }
                  }}
                  onDrop={(e) => handleDrop(e, estado)}
                >
                  {/* Column header */}
                  <div
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-lg border',
                      ESTADO_BG[estado]
                    )}
                  >
                    <span className={`text-sm font-semibold ${ESTADO_COLORS[estado]}`}>
                      {ESTADO_LABELS[estado]}
                    </span>
                    <Badge variant="secondary" className="text-xs h-5">
                      {col.length}
                    </Badge>
                  </div>

                  {/* Cards */}
                  <div
                    className={cn(
                      'flex flex-col gap-2.5 min-h-[60px] rounded-lg p-1 transition-colors',
                      isDragOver && 'bg-primary/5 ring-2 ring-primary/20 ring-offset-1'
                    )}
                  >
                    {col.length === 0 ? (
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
                        {col.map((tarea) => (
                          <div
                            key={tarea.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('tareaId', tarea.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => setDragOverEstado(null)}
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
            })}
          </div>
        )}
      </div>

      <NuevaTareaDialog open={nuevaOpen} onOpenChange={setNuevaOpen} />
    </div>
  );
}
