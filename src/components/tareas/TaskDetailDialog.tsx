'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Send, Trash2, Pencil, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  listTareaComments,
  listColumnas,
  listOrgMembers,
  toggleTareaCliente,
  moverTarea,
  addTareaComment,
  deleteTarea,
  updateTarea,
  updateEstadoTarea,
} from '@/actions/tareas';
import { TIPO_LABELS, TIPO_COLORS } from './utils';
import type { TareaConDetalle } from './utils';

interface TaskDetailDialogProps {
  tarea: TareaConDetalle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return '—';
  return format(new Date(d), 'd/MM/yyyy HH:mm', { locale: es });
}

const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  presentada: 'Presentada',
  verificada: 'Verificada',
};

const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  presentada: 'bg-blue-100 text-blue-700 border-blue-200',
  verificada: 'bg-green-100 text-green-700 border-green-200',
};

export function TaskDetailDialog({ tarea, open, onOpenChange }: TaskDetailDialogProps) {
  const queryClient = useQueryClient();
  const [comentario, setComentario] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Inline editing state for título and descripción
  const [editingTitulo, setEditingTitulo] = useState(false);
  const [tituloValue, setTituloValue] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const tituloRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (editingTitulo) tituloRef.current?.focus();
  }, [editingTitulo]);

  useLayoutEffect(() => {
    if (editingDesc) descRef.current?.focus();
  }, [editingDesc]);

  const { data: comments = [] } = useQuery({
    queryKey: ['tarea-comments', tarea.id],
    queryFn: () => listTareaComments({ data: { tareaId: tarea.id } }),
    enabled: open,
  });

  const { data: columnas = [] } = useQuery({
    queryKey: ['tareas-columnas'],
    queryFn: () => listColumnas(),
    enabled: open,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => listOrgMembers(),
    enabled: open,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['tareas'] });

  const updateMutation = useMutation({
    mutationFn: (data: Parameters<typeof updateTarea>[0]['data']) =>
      updateTarea({ data }),
    onSuccess: invalidate,
    onError: () => toast.error('Error al actualizar'),
  });

  const updateEstadoMutation = useMutation({
    mutationFn: (estado: 'pendiente' | 'presentada' | 'verificada') =>
      updateEstadoTarea({ data: { id: tarea.id, estado } }),
    onSuccess: invalidate,
    onError: () => toast.error('Error al actualizar estado'),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { tareaClienteId: string; completado: boolean }) =>
      toggleTareaCliente({ data: vars }),
    onSuccess: invalidate,
    onError: () => toast.error('Error al actualizar'),
  });

  const colMutation = useMutation({
    mutationFn: (columnaId: string | null) =>
      moverTarea({ data: { id: tarea.id, columnaId } }),
    onSuccess: () => {
      invalidate();
      toast.success('Columna actualizada');
    },
    onError: () => toast.error('Error al cambiar columna'),
  });

  const commentMutation = useMutation({
    mutationFn: (contenido: string) =>
      addTareaComment({ data: { tareaId: tarea.id, contenido } }),
    onSuccess: () => {
      setComentario('');
      void queryClient.invalidateQueries({ queryKey: ['tarea-comments', tarea.id] });
      invalidate();
    },
    onError: () => toast.error('Error al agregar comentario'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTarea({ data: { id: tarea.id } }),
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast.success('Tarea eliminada');
    },
    onError: () => toast.error('Error al eliminar tarea'),
  });

  const saveTitulo = () => {
    const trimmed = tituloValue.trim();
    if (!trimmed) { setTituloValue(tarea.titulo); setEditingTitulo(false); return; }
    if (trimmed !== tarea.titulo) {
      updateMutation.mutate({ id: tarea.id, titulo: trimmed });
    }
    setEditingTitulo(false);
  };

  const saveDesc = () => {
    const trimmed = descValue.trim();
    if (trimmed !== (tarea.descripcion ?? '')) {
      updateMutation.mutate({ id: tarea.id, descripcion: trimmed !== '' ? trimmed : null });
    }
    setEditingDesc(false);
  };

  const completados = tarea.clientes.filter((c) => c.completado).length;
  const total = tarea.clientes.length;
  const columnaActual = columnas.find((c) => c.id === tarea.columnaId);

  // Período helpers
  const periodoAno = tarea.periodo?.split('-')[0] ?? '';
  const periodoMes = tarea.periodo?.split('-')[1] ?? '';
  const now = new Date();
  const ANOS = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));
  const MESES = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, '0'),
    label: format(new Date(2000, i, 1), 'MMMM', { locale: es }),
  }));

  const updatePeriodo = (ano: string, mes: string) => {
    const periodo = ano && mes ? `${ano}-${mes}` : null;
    updateMutation.mutate({ id: tarea.id, periodo });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Tipo + estado badges */}
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Select
                  value={tarea.tipo}
                  onValueChange={(v) => updateMutation.mutate({ id: tarea.id, tipo: v as 'iva' | 'iibb' | 'ddjj' | 'sueldos' | 'convenios' | 'otro' })}
                  disabled={updateMutation.isPending}
                >
                  <SelectTrigger className="h-auto w-auto border-0 p-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                    <Badge variant="outline" className={TIPO_COLORS[tarea.tipo] ?? ''}>
                      {TIPO_LABELS[tarea.tipo] ?? tarea.tipo}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={tarea.estado}
                  onValueChange={(v) => updateEstadoMutation.mutate(v as 'pendiente' | 'presentada' | 'verificada')}
                  disabled={updateEstadoMutation.isPending}
                >
                  <SelectTrigger className="h-auto w-auto border-0 p-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden">
                    <Badge variant="outline" className={ESTADO_COLORS[tarea.estado] ?? ''}>
                      {ESTADO_LABELS[tarea.estado] ?? tarea.estado}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ESTADO_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {tarea.fuente === 'automatica' && (
                  <Badge variant="outline" className="text-xs">Auto</Badge>
                )}
              </div>

              {/* Título inline editable */}
              {editingTitulo ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={tituloRef}
                    value={tituloValue}
                    onChange={(e) => setTituloValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitulo();
                      if (e.key === 'Escape') { setTituloValue(tarea.titulo); setEditingTitulo(false); }
                    }}
                    onBlur={saveTitulo}
                    className="text-base font-semibold h-8 flex-1"
                  />
                  <button onClick={saveTitulo} className="text-green-600 hover:text-green-700 p-0.5 shrink-0">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setTituloValue(tarea.titulo); setEditingTitulo(false); }} className="text-muted-foreground hover:text-foreground p-0.5 shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  className="group/titulo flex items-start gap-1.5 text-left w-full"
                  onClick={() => { setTituloValue(tarea.titulo); setEditingTitulo(true); }}
                  title="Clic para editar"
                >
                  <DialogTitle className="text-base font-semibold leading-snug flex-1">
                    {tarea.titulo}
                  </DialogTitle>
                  <Pencil className="h-3.5 w-3.5 mt-0.5 text-muted-foreground opacity-0 group-hover/titulo:opacity-100 shrink-0 transition-opacity" />
                </button>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-4 space-y-5">
            {/* Metadata grid — todos los campos editables */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">

              {/* Columna */}
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Columna</span>
                <div className="mt-1">
                  <Select
                    value={tarea.columnaId ?? '__none__'}
                    onValueChange={(v) => colMutation.mutate(v === '__none__' ? null : v)}
                    disabled={colMutation.isPending}
                  >
                    <SelectTrigger className="h-7 text-sm border-muted hover:border-input focus:ring-1 focus:ring-ring">
                      <SelectValue>
                        {columnaActual?.nombre ?? 'Sin columna'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin columna</SelectItem>
                      {columnas.map((col) => (
                        <SelectItem key={col.id} value={col.id}>{col.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Asignado a */}
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Asignado a</span>
                <div className="mt-1">
                  <Select
                    value={tarea.asignadoA ?? '__none__'}
                    onValueChange={(v) => updateMutation.mutate({ id: tarea.id, asignadoA: v === '__none__' ? null : v })}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger className="h-7 text-sm border-muted hover:border-input focus:ring-1 focus:ring-ring">
                      <SelectValue>
                        {tarea.asignadoNombre ?? 'Sin asignar'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin asignar</SelectItem>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Período */}
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Período</span>
                <div className="mt-1 flex gap-1.5">
                  <Select
                    value={periodoAno}
                    onValueChange={(v) => updatePeriodo(v, periodoMes)}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger className="h-7 flex-1 text-xs border-muted hover:border-input focus:ring-1 focus:ring-ring">
                      <SelectValue placeholder="Año" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {ANOS.map((a) => (
                        <SelectItem key={a} value={a}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={periodoMes}
                    onValueChange={(v) => updatePeriodo(periodoAno, v)}
                    disabled={updateMutation.isPending}
                  >
                    <SelectTrigger className="h-7 flex-1 text-xs border-muted hover:border-input focus:ring-1 focus:ring-ring">
                      <SelectValue placeholder="Mes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {MESES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vencimiento */}
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Vencimiento</span>
                <div className="mt-1">
                  <Input
                    type="date"
                    className="h-7 text-sm border-muted hover:border-input focus:ring-1 focus:ring-ring"
                    value={tarea.venceAt ? format(new Date(tarea.venceAt), 'yyyy-MM-dd') : ''}
                    onChange={(e) =>
                      updateMutation.mutate({ id: tarea.id, venceAt: e.target.value !== '' ? e.target.value : null })
                    }
                    disabled={updateMutation.isPending}
                  />
                </div>
              </div>
            </div>

            {/* Descripción inline editable */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Descripción</p>
              {editingDesc ? (
                <div className="space-y-2">
                  <Textarea
                    ref={descRef}
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={saveDesc}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setDescValue(tarea.descripcion ?? ''); setEditingDesc(false); }
                    }}
                    rows={3}
                    className="resize-none text-sm"
                    placeholder="Agregar descripción..."
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs" onClick={saveDesc}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDescValue(tarea.descripcion ?? ''); setEditingDesc(false); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  className="group/desc w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors flex items-start gap-2"
                  onClick={() => { setDescValue(tarea.descripcion ?? ''); setEditingDesc(true); }}
                >
                  <p className="text-sm flex-1 whitespace-pre-wrap text-left">
                    {tarea.descripcion !== '' && tarea.descripcion != null
                      ? tarea.descripcion
                      : <span className="text-muted-foreground italic">Sin descripción — clic para agregar</span>}
                  </p>
                  <Pencil className="h-3.5 w-3.5 mt-0.5 text-muted-foreground opacity-0 group-hover/desc:opacity-100 shrink-0 transition-opacity" />
                </button>
              )}
            </div>

            {/* Empresas con checkboxes */}
            {total > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
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
                          tareaClienteId: c.id,
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
                        {c.clienteNombre ?? c.clienteId}
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
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Comentarios ({comments.length})
              </p>
              {comments.length > 0 && (
                <div className="space-y-3 mb-3">
                  {comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                        {(c.autorNombre ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium">{c.autorNombre ?? 'Usuario'}</span>
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
                  placeholder="Agregar comentario... (Ctrl+Enter para enviar)"
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

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar tarea?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. Se eliminará la tarea y todos sus comentarios.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate()}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  );
}
