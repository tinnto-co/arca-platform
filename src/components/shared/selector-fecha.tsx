/**
 * Selector de fecha de la plataforma.
 *
 * Reemplaza a `<input type="date">`, que dibuja el calendario del sistema
 * operativo: cambia de aspecto según el navegador, no respeta los tokens ni el
 * castellano y en Safari directamente no muestra calendario.
 *
 * Habla en `YYYY-MM-DD`, que es lo que ya guardan los formularios y viaja en
 * las URLs, así que reemplazar un input nativo es cambiar el elemento y nada
 * más.
 */
import { useState } from 'react';
import { format, parse, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` → Date local. Sin `new Date(iso)`, que interpreta UTC y resta un día. */
export function fechaDesdeIso(
  iso: string | null | undefined
): Date | undefined {
  if (!iso) return undefined;
  const d = parse(iso.slice(0, 10), 'yyyy-MM-dd', new Date());
  return isValid(d) ? d : undefined;
}

/** Date → `YYYY-MM-DD` en hora local. */
export const isoDesdeFecha = (d: Date): string => format(d, 'yyyy-MM-dd');

export function SelectorFecha({
  value,
  onChange,
  placeholder = 'Elegir fecha',
  disabled = false,
  /** Muestra una X para vaciar cuando hay fecha puesta. */
  limpiable = true,
  /** Topes, en `YYYY-MM-DD`, como el `min`/`max` del input nativo. */
  min,
  max,
  className,
  id,
  /** `sm` (32px) para barras de filtro; el default es 36px. */
  size = 'default',
  'aria-label': ariaLabel,
}: {
  /** `YYYY-MM-DD`, o vacío. */
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  limpiable?: boolean;
  min?: string;
  max?: string;
  className?: string;
  id?: string;
  size?: 'default' | 'sm';
  'aria-label'?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const fecha = fechaDesdeIso(value);

  return (
    <div className={cn('relative', className)}>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            'flex w-full items-center gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 text-[12.5px] transition-colors duration-[120ms] hover:bg-[var(--arca-surface-2)] disabled:opacity-50',
            size === 'sm' ? 'h-8' : 'h-9',
            // Sitio para la X, así el texto no queda debajo.
            limpiable && fecha ? 'pr-8' : '',
            fecha ? 'text-[var(--arca-ink)]' : 'text-[var(--arca-ink-4)]'
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-[var(--arca-ink-4)]" />
          <span className="truncate tabular-nums">
            {fecha ? format(fecha, 'dd/MM/yyyy') : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={es}
            selected={fecha}
            defaultMonth={fecha ?? fechaDesdeIso(max) ?? fechaDesdeIso(min)}
            disabled={[
              ...(fechaDesdeIso(min) ? [{ before: fechaDesdeIso(min)! }] : []),
              ...(fechaDesdeIso(max) ? [{ after: fechaDesdeIso(max)! }] : []),
            ]}
            onSelect={(d) => {
              onChange(d ? isoDesdeFecha(d) : '');
              setAbierto(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Fuera del trigger: adentro, el popover se abre en `pointerdown` y el
          click de limpiar llega tarde. */}
      {limpiable && fecha && !disabled && (
        <button
          type="button"
          aria-label="Quitar la fecha"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-[var(--arca-ink-4)] hover:bg-[var(--arca-border)] hover:text-[var(--arca-ink)]"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
