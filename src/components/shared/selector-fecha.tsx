/**
 * Selector de fecha de la plataforma.
 *
 * Reemplaza a `<input type="date">`, que dibuja el calendario del sistema
 * operativo: cambia de aspecto según el navegador, no respeta los tokens ni el
 * castellano y en Safari directamente no muestra calendario.
 *
 * Se puede **escribir** además de elegir en el calendario: para un empleado
 * dado de alta en 2010 hay que retroceder casi doscientos meses a mano, y el
 * estudio teclea la fecha más rápido de lo que navega.
 *
 * El campo tiene máscara: se teclean solo dígitos y las barras aparecen solas
 * (`18092026` → `18/09/2026`). Como la máscara es posicional, el día y el mes
 * van con sus dos dígitos —`01032010`, no `1/3/2010`—, que es el precio de que
 * el campo no acepte cualquier cosa. El año de dos cifras sí vale:
 * `18/09/26` se guarda como 2026.
 *
 * Habla en `YYYY-MM-DD`, que es lo que ya guardan los formularios y viaja en
 * las URLs, así que reemplazar un input nativo es cambiar el elemento y nada
 * más.
 */
import { useRef, useState } from 'react';
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

/**
 * Máscara de DD/MM/AAAA: deja solo dígitos, corta en ocho y pone las barras
 * sola. Es lo que hace que el campo no acepte un chorizo de números —
 * `100000028889999` queda `10/00/0002`— y que no haya que escribir las barras.
 *
 * La barra recién aparece con el tercer dígito (y con el quinto), para que
 * borrar con la tecla de retroceso no se pelee con la máscara.
 */
export function enmascararFecha(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * Interpreta lo tecleado. Tolera separadores (`/`, `-`, `.`), un solo dígito
 * en día y mes, y el año en dos cifras: 00–69 es 2000, 70–99 es 1900, que es
 * el corte habitual y el que corresponde a fechas de alta de empleados.
 */
export function fechaDesdeTexto(texto: string): Date | undefined {
  const limpio = texto.trim();
  if (!limpio) return undefined;

  const partes = limpio.split(/[/\-. ]+/).filter(Boolean);
  let dia: number, mes: number, anio: number;

  if (partes.length === 3) {
    [dia, mes, anio] = partes.map(Number);
  } else if (partes.length === 1 && /^\d{6,8}$/.test(limpio)) {
    // Tecleado de corrido: ddmmyyyy o ddmmyy.
    dia = Number(limpio.slice(0, 2));
    mes = Number(limpio.slice(2, 4));
    anio = Number(limpio.slice(4));
  } else {
    return undefined;
  }

  if (!Number.isFinite(dia) || !Number.isFinite(mes) || !Number.isFinite(anio))
    return undefined;
  if (anio < 100) anio += anio <= 69 ? 2000 : 1900;

  const d = new Date(anio, mes - 1, dia);
  // `new Date(2026, 1, 31)` no falla, se corre al 3 de marzo: hay que
  // comprobar que la fecha construida sea la que se escribió.
  if (
    !isValid(d) ||
    d.getDate() !== dia ||
    d.getMonth() !== mes - 1 ||
    d.getFullYear() !== anio
  )
    return undefined;
  return d;
}

export function SelectorFecha({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
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
  const [texto, setTexto] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const fecha = fechaDesdeIso(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mientras se escribe manda lo tecleado; el resto del tiempo, el valor
  // formateado. Derivado y no en un efecto: así el campo no se pelea con el
  // valor que llega de afuera ni encadena renders.
  const textoMostrado = escribiendo
    ? texto
    : fecha
      ? format(fecha, 'dd/MM/yyyy')
      : '';

  const dentroDeRango = (d: Date) => {
    const desde = fechaDesdeIso(min);
    const hasta = fechaDesdeIso(max);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  };

  /** Al salir del campo: lo escrito se acepta, o se vuelve al valor previo. */
  const confirmarTexto = () => {
    if (!escribiendo) return; // no se tocó el campo: nada que interpretar
    setEscribiendo(false);
    if (texto.trim() === '') {
      if (value) onChange('');
      return;
    }
    const d = fechaDesdeTexto(texto);
    if (d && dentroDeRango(d)) {
      onChange(isoDesdeFecha(d));
      setTexto(format(d, 'dd/MM/yyyy'));
    }
    // Si no se entiende lo escrito no se toca el valor: al dejar de escribir,
    // el campo vuelve a mostrar la fecha que había.
  };

  return (
    <div className={cn('relative', className)}>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <div
          className={cn(
            'flex w-full items-center gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 transition-colors duration-[120ms] focus-within:border-[var(--arca-ink-3)]',
            size === 'sm' ? 'h-8' : 'h-9',
            disabled && 'opacity-50'
          )}
        >
          {/* El ícono abre el calendario; el resto del campo es para teclear. */}
          <PopoverTrigger
            disabled={disabled}
            aria-label="Abrir el calendario"
            className="shrink-0 text-[var(--arca-ink-4)] transition-colors hover:text-[var(--arca-ink-2)]"
          >
            <CalendarIcon className="size-3.5" />
          </PopoverTrigger>
          <input
            ref={inputRef}
            id={id}
            aria-label={ariaLabel ?? placeholder}
            disabled={disabled}
            value={textoMostrado}
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            placeholder={placeholder}
            onChange={(e) => {
              setEscribiendo(true);
              setTexto(enmascararFecha(e.target.value));
            }}
            onBlur={confirmarTexto}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirmarTexto();
                inputRef.current?.blur();
              }
              if (e.key === 'Escape' && escribiendo) setEscribiendo(false);
            }}
            className={cn(
              'w-full min-w-0 bg-transparent text-[12.5px] tabular-nums outline-none placeholder:text-[var(--arca-ink-4)]',
              limpiable && fecha ? 'pr-5' : ''
            )}
          />
        </div>

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
              setEscribiendo(false);
              onChange(d ? isoDesdeFecha(d) : '');
              setAbierto(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {limpiable && fecha && !disabled && (
        <button
          type="button"
          aria-label="Quitar la fecha"
          onClick={() => {
            setEscribiendo(false);
            onChange('');
          }}
          className="absolute right-2 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-[var(--arca-ink-4)] hover:bg-[var(--arca-border)] hover:text-[var(--arca-ink)]"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
