'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Send, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  listTareaComments,
  listColumnas,
  toggleTareaCliente,
  moverTarea,
  addTareaComment,
  deleteTarea,
} from '@/actions/tareas';
import { TIPO_LABELS, TIPO_COLORS } from './utils';
import type { TareaConDetalle } from './utils';

interface TaskDetailDialogProps {
  tarea: TareaConDetalle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return '—';
  return format(new Date(d), "d 'de' MMMM yyyy", { locale: es });
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return '—';
  return format(new Date(d), 'd/MM/yyyy HH:mm', { locale: es });
}

export function TaskDetailDialog({ tarea, open, onOpenChange }: TaskDetailDialogProps) {
  const queryClient = useQueryClient();
  const [comentario, setComentario] = useState('');

  const { data: comments = [] } = useQuery({
    queryKey: ['tarea-comments', tarea.id],
    queryFn: () => listTareaComments({ data: { taskId: tarea.id } }),
    enabled: open,
  });

  const { data: columnas = [] } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
    enabled: open,
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { taskClientId: string; completado: boolean }) =>
      toggleTareaCliente({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tareas'] }),
    onError: () => toast.error('Error al actualizar'),
  });

  const colMutation = useMutation({
    mutationFn: (columnaId: string | null) =>
      moverTarea({ data: { id: tarea.id, columnaId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
      toast.success('Columna actualizada');
    },
    onError: () => toast.error('Error al cambiar columna'),
  });

  const commentMutation = useMutation({
    mutationFn: (contenido: string) =>
      addTareaComment({ data: { taskId: tarea.id, contenido } }),
    onSuccess: () => {
      setComentario('');
      queryClient.invalidateQueries({ queryKey: ['tarea-comments', tarea.id] });
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
    },
    onError: () => toast.error('Error al agregar comentario'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTarea({ data: { id: tarea.id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tareas'] });
      onOpenChange(false);
      toast.success('Tarea eliminada');
    },
    onError: () => toast.error('Error al eliminar tarea'),
  });

  const completados = tarea.clientes.filter((c) => c.completado).length;
  const total = tarea.clientes.length;

  const columnaActual = columnas.find((c) => c.id === tarea.columnaId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge className={TIPO_COLORS[tarea.tipo] ?? ''}>
                  {TIPO_LABELS[tarea.tipo] ?? tarea.tipo}
                </Badge>
                {tarea.esAutoGenerada && (
                  <Badge variant="outline" className="text-xs">Auto</Badge>
                )}
              </div>
              <DialogTitle className="text-base font-semibold leading-snug">
                {tarea.titulo}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => {
                if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Columna</span>
                <div className="mt-1">
                  <Select
                    value={tarea.columnaId ?? '__none__'}
                    onValueChange={(v) => colMutation.mutate(v === '__none__' ? null : v)}
                    disabled={colMutation.isPending}
                  >
                    <SelectTrigger className="h-7 w-auto gap-1 text-xs border-0 p-0 shadow-none focus:ring-0">
                      <span className="font-medium">
                        {columnaActual?.nombre ?? 'Sin columna'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin columna</SelectItem>
                      {columnas.map((col) => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Asignado a</span>
                <p className="mt-1 font-medium">{tarea.asignadoNombre ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Período</span>
                <p className="mt-1 font-medium">{tarea.periodoMes ?? '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Vencimiento</span>
                <p className="mt-1 font-medium">{fmtDate(tarea.fechaVencimiento)}</p>
              </div>
            </div>

            {tarea.descripcion && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Descripción</p>
                <p className="text-sm whitespace-pre-wrap">{tarea.descripcion}</p>
              </div>
            )}

            {/* Empresas con checkboxes */}
            {total > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Empresas ({completados}/{total})
                  </p>
                  <div className="h-1.5 flex-1 mx-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{ width: total > 0 ? `${(completados / total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  {tarea.clientes.map((c) => (
                    <button
                      key={c.id}
                      className="flex items-center gap-2.5 w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors group"
                      onClick={() =>
                        toggleMutation.mutate({
                          taskClientId: c.id,
                          completado: !c.completado,
                        })
                      }
                      disabled={toggleMutation.isPending}
                    >
                      {c.completado ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground" />
                      )}
                      <span className={`text-sm flex-1 ${c.completado ? 'line-through text-muted-foreground' : ''}`}>
                        {c.representativeNombre ?? c.representativeId}
                      </span>
                      {c.completado && c.completadoAt && (
                        <span className="text-xs text-muted-foreground">
                          {fmtDateTime(c.completadoAt)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Comentarios */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Comentarios ({comments.length})
              </p>
              {comments.length > 0 && (
                <div className="space-y-3 mb-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                        {(c.userName ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium">{c.userName ?? 'Usuario'}</span>
                          <span className="text-xs text-muted-foreground">
                            {fmtDateTime(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm mt-0.5 whitespace-pre-wrap">{c.contenido}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Agregar comentario..."
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && comentario.trim()) {
                      commentMutation.mutate(comentario);
                    }
                  }}
                />
                <Button
                  size="icon"
                  disabled={!comentario.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate(comentario)}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
