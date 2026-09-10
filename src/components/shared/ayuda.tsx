/**
 * Explicación de una pantalla, guardada detrás de un ícono.
 *
 * Los textos que cuentan cómo se calcula algo se leen una vez y después
 * estorban todos los días: ocupan tres renglones arriba de la tabla y empujan
 * los datos hacia abajo. Acá quedan a un click, para quien los necesite.
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
  children,
  className,
}: {
  /** Qué explica, en pocas palabras. Encabeza el panel. */
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger
            aria-label={titulo}
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-[var(--arca-r-md)] text-[var(--arca-ink-4)] transition-colors duration-[120ms] hover:bg-[var(--arca-border)] hover:text-[var(--arca-ink-2)]',
              className
            )}
          >
            <HelpCircle className="size-4" />
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{titulo}</TooltipContent>
      </Tooltip>

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
