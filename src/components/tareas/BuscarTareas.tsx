'use client';

/**
 * Paleta ⌘K: busca por título o empresa y salta directo a la tarea.
 *
 * Busca sobre las tareas ya cargadas, que son las del recorte vigente. No pega
 * contra el servidor: si algo está filtrado fuera del tablero, tampoco debería
 * aparecer acá — el resultado sería una tarea que la paleta encuentra y el
 * tablero no muestra.
 */

import { useEffect } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { TIPO_LABELS, empresaDeLaCard } from './utils';
import type { TareaConDetalle } from './utils';

interface BuscarTareasProps {
  tareas: TareaConDetalle[];
  abierto: boolean;
  onAbrirChange: (v: boolean) => void;
  onElegir: (id: string) => void;
}

export function BuscarTareas({
  tareas,
  abierto,
  onAbrirChange,
  onElegir,
}: BuscarTareasProps) {
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onAbrirChange(!abierto);
      }
    };
    document.addEventListener('keydown', atajo);
    return () => document.removeEventListener('keydown', atajo);
  }, [abierto, onAbrirChange]);

  return (
    <CommandDialog
      open={abierto}
      onOpenChange={onAbrirChange}
      title="Buscar tareas"
      description="Buscá por título o empresa"
    >
      <CommandInput placeholder="Buscar por título o empresa…" />
      <CommandList>
        <CommandEmpty className="py-6 text-center text-[12.5px] text-[var(--arca-ink-3)]">
          Sin resultados
        </CommandEmpty>
        <CommandGroup>
          {tareas.map((t) => {
            const empresa = empresaDeLaCard(t.clientes);
            return (
              <CommandItem
                key={t.id}
                // `value` es lo que filtra el Command: título y empresa juntos.
                value={`${t.titulo} ${empresa ?? ''} ${TIPO_LABELS[t.tipo] ?? ''}`}
                onSelect={() => {
                  onAbrirChange(false);
                  onElegir(t.id);
                }}
                className="flex items-center gap-2 text-[12.5px]"
              >
                <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                {empresa && (
                  <span className="shrink-0 text-[11px] text-[var(--arca-ink-3)]">
                    {empresa}
                  </span>
                )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
