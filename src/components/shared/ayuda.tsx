/**
 * Explicación de una pantalla, guardada detrás de un botón.
 *
 * Los textos que cuentan cómo se calcula algo se leen una vez y después
 * estorban todos los días: ocupan tres renglones arriba de la tabla y empujan
 * los datos hacia abajo. Acá quedan a un click, para quien los necesite.
 *
 * El botón lleva etiqueta —"Cómo se calcula"— y no solo un ícono: un `?` suelto
 * se lee como decorado y nadie lo toca, así que el texto queda escondido para
 * siempre. Sin etiqueta, el tooltip avisa que hay algo para abrir.
 *
 * No sirve para avisos que haya que ver sí o sí —un error, un dato que falta—:
 * eso va en la pantalla.
 */
import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function Ayuda({
  titulo,
  etiqueta,
  children,
  className,
}: {
  /** Qué explica, en pocas palabras. Encabeza el panel. */
  titulo: string;
  /** Texto del botón. Sin esto queda solo el ícono, para lugares apretados. */
  etiqueta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const boton = (
    <PopoverTrigger
      aria-label={etiqueta ? undefined : titulo}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[var(--arca-r-md)] text-[var(--arca-ink-3)] transition-colors duration-[120ms] hover:bg-[var(--arca-border)] hover:text-[var(--arca-ink)]',
        etiqueta ? 'h-9 px-2.5 text-[12px]' : 'grid size-7 place-items-center',
        className
      )}
    >
      <HelpCircle className="size-4" />
      {etiqueta}
    </PopoverTrigger>
  );

  return (
    <Popover>
      {etiqueta ? (
        boton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{boton}</TooltipTrigger>
          <TooltipContent>{titulo} — click para leerlo</TooltipContent>
        </Tooltip>
      )}

      <PopoverContent align="start" className="w-[380px] p-4">
        <p className="mb-1.5 text-[12.5px] font-semibold text-[var(--arca-ink)]">
          {titulo}
        </p>
        <div className="space-y-2 text-[12px] leading-[1.6] text-[var(--arca-ink-2)]">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
