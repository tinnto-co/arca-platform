'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MessageSquare, User, Calendar, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TaskDetailDialog } from './TaskDetailDialog';
import { TIPO_LABELS, TIPO_COLORS } from './utils';
import type { TareaConDetalle } from './utils';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  tarea: TareaConDetalle;
}

export function TaskCard({ tarea }: TaskCardProps) {
  const [open, setOpen] = useState(false);

  const completados = tarea.clientes.filter((c) => c.completado).length;
  const total = tarea.clientes.length;
  const hasClientes = total > 0;
  const progreso = hasClientes ? completados / total : null;

  const vencimiento = tarea.venceAt ? new Date(tarea.venceAt) : null;
  const hoy = new Date();
  const estaVencido = vencimiento && vencimiento < hoy;
  const venceHoy = vencimiento?.toDateString() === hoy.toDateString();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left bg-white border border-border rounded-lg p-3.5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all group"
      >
        {/* Tipo badge */}
        <div className="flex items-center gap-1.5 mb-2">
          <Badge
            variant="outline"
            className={cn('text-xs px-1.5 py-0', TIPO_COLORS[tarea.tipo])}
          >
            {TIPO_LABELS[tarea.tipo] ?? tarea.tipo}
          </Badge>
          {tarea.fuente === 'automatica' && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
              Auto
            </Badge>
          )}
          {(estaVencido || venceHoy) && (
            <AlertCircle
              className={cn(
                'h-3.5 w-3.5 ml-auto',
                estaVencido ? 'text-red-500' : 'text-amber-500'
              )}
            />
          )}
        </div>

        {/* Título */}
        <p className="text-sm font-medium leading-snug mb-2.5 group-hover:text-primary transition-colors line-clamp-2">
          {tarea.titulo}
        </p>

        {/* Progreso empresas */}
        {hasClientes && (
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">
                {completados}/{total} empresas
              </span>
              <span className="text-xs font-medium">
                {Math.round((progreso ?? 0) * 100)}%
              </span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${(progreso ?? 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {tarea.asignadoNombre && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {tarea.asignadoNombre.split(' ')[0]}
            </span>
          )}
          {vencimiento && (
            <span
              className={cn(
                'flex items-center gap-1',
                estaVencido && 'text-red-500 font-medium',
                venceHoy && 'text-amber-500 font-medium'
              )}
            >
              <Calendar className="h-3 w-3" />
              {format(vencimiento, 'd MMM', { locale: es })}
            </span>
          )}
          {tarea.comentariosCount > 0 && (
            <span className="flex items-center gap-1 ml-auto">
              <MessageSquare className="h-3 w-3" />
              {tarea.comentariosCount}
            </span>
          )}
        </div>
      </button>

      <TaskDetailDialog tarea={tarea} open={open} onOpenChange={setOpen} />
    </>
  );
}
