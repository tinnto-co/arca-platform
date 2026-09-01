'use client';

/**
 * Alta de tarea dentro de la columna, como el "Add card" de Trello. Reemplaza
 * al botón global `Nueva tarea`: la columna en la que se escribe ES el destino,
 * así que no hay que elegirla en un formulario.
 *
 * Enter guarda y deja el composer abierto para la siguiente — cargar el trabajo
 * del mes es escribir varias líneas seguidas, no abrir un modal por tarea.
 */

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Check, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { createTarea, TIPOS_TAREA } from '@/actions/tareas';
import { TIPO_LABELS } from './utils';
import type { TipoTarea } from './utils';

interface ComposerTareaProps {
  columnaId: string | null;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  /** Valores que vienen de los filtros vigentes del tablero. */
  defaults: { tipo?: TipoTarea; periodo?: string };
}

const chip =
  'inline-flex items-center gap-1 rounded-[var(--arca-r-pill)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-2 py-[3px] text-[10.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] hover:border-[var(--arca-border-strong)]';

export function ComposerTarea({
  columnaId,
  abierto,
  onAbrir,
  onCerrar,
  defaults,
}: ComposerTareaProps) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<TipoTarea>(defaults.tipo ?? 'otro');
  const [vence, setVence] = useState<Date | undefined>();
  const [calendario, setCalendario] = useState(false);

  // Las altas se encolan: dos Enter seguidos calculan la posición contra el
  // mismo estado del tablero y la segunda tarea puede quedar arriba de la
  // primera. Encolar preserva el orden en que se tipearon.
  const cola = useRef<Promise<unknown>>(Promise.resolve());

  const alta = useMutation({
    mutationFn: (v: {
      titulo: string;
      tipo: TipoTarea;
      venceAt: string | null;
    }) =>
      createTarea({
        data: {
          titulo: v.titulo,
          tipo: v.tipo,
          columnaId,
          venceAt: v.venceAt,
          periodo: defaults.periodo ?? null,
          // Al final: acá se cargan varias seguidas y ponerlas primeras
          // invertiría el orden en que se tipearon.
          extremo: 'fin',
        },
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ['tareas'],
        exact: false,
      }),
    onError: () => toast.error('No se pudo crear la tarea'),
  });

  const guardar = () => {
    const limpio = titulo.trim();
    setTitulo('');
    if (!limpio) return;
    const datos = {
      titulo: limpio,
      tipo,
      venceAt: vence ? vence.toISOString() : null,
    };
    cola.current = cola.current
      .catch(() => undefined)
      .then(() => alta.mutateAsync(datos));
  };

  const cerrar = () => {
    setTitulo('');
    setVence(undefined);
    setTipo(defaults.tipo ?? 'otro');
    onCerrar();
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={onAbrir}
        className="flex w-full items-center gap-1.5 rounded-[var(--arca-r-md)] px-[10px] py-[9px] text-left text-[12.5px] font-medium text-[var(--arca-ink-3)] transition-colors duration-[120ms] ease-[ease] hover:bg-[var(--arca-surface)]"
      >
        <Plus className="size-3.5" />
        Añadir tarea
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-[9px] rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] p-[10px] shadow-[var(--arca-shadow-md)]">
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título de la tarea"
        aria-label="Título de la tarea nueva"
        className="w-full border-b border-dashed border-[var(--arca-border-strong)] bg-transparent pb-1 text-[12.5px] text-[var(--arca-ink)] outline-none placeholder:text-[var(--arca-ink-4)]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            guardar();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cerrar();
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger className={chip} aria-label="Tipo de obligación">
            {TIPO_LABELS[tipo]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {TIPOS_TAREA.map((t) => (
              <DropdownMenuItem
                key={t}
                onSelect={() => setTipo(t)}
                className="text-[12.5px]"
              >
                {TIPO_LABELS[t]}
                {t === tipo && (
                  <Check className="ml-auto size-3.5 text-[var(--arca-ink-3)]" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={calendario} onOpenChange={setCalendario}>
          <PopoverTrigger className={chip} aria-label="Fecha de vencimiento">
            <CalendarIcon className="size-3 text-[var(--arca-ink-4)]" />
            <span className="tabular-nums">
              {vence ? format(vence, 'dd/MM/yyyy') : 'Vence'}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="single"
              locale={es}
              selected={vence}
              onSelect={(d) => {
                setVence(d);
                setCalendario(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={!titulo.trim()}
          className="rounded-[var(--arca-r-md)] bg-[var(--arca-ink)] px-3 py-[5px] text-[12px] font-medium text-white transition-colors duration-[120ms] hover:bg-black disabled:opacity-40"
        >
          Añadir
        </button>
        <span className="text-[11px] text-[var(--arca-ink-4)]">
          Enter para guardar · Esc para salir
        </span>
      </div>
    </div>
  );
}
