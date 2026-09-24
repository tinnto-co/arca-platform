/**
 * Selector de período mensual estilo date-picker de shadcn: un botón con
 * ícono de calendario que abre un popover con navegación por año y grilla
 * de meses. Reemplaza a los pares de <Select> año + mes.
 *
 * Es un picker de MES a propósito (no de rango ni de día): los períodos de
 * sueldos e IVA son mensuales.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MESES_CORTOS = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), 'MMM', { locale: es }).replace('.', '')
);

export function MesPicker({
  ano,
  mes,
  onChange,
  maxPeriodo,
  minAno,
  className,
  placeholder,
  onLimpiar,
  size = 'default',
}: {
  /** Año seleccionado, ej. "2026". Vacío = sin período elegido. */
  ano: string;
  /** Mes seleccionado, "01".."12". Vacío = sin período elegido. */
  mes: string;
  onChange: (ano: string, mes: string) => void;
  /** Último período elegible, "YYYY-MM". Meses posteriores se deshabilitan. */
  maxPeriodo?: string;
  /** Primer año navegable (default: 5 años atrás del máximo). */
  minAno?: number;
  className?: string;
  /** Qué decir cuando no hay período elegido, ej. "Periodo: todos". */
  placeholder?: string;
  /** Si se pasa, el popover ofrece volver a "sin período". */
  onLimpiar?: () => void;
  /** `sm` (32px) para barras de filtro; el default es 36px. */
  size?: 'default' | 'sm';
}) {
  const [open, setOpen] = useState(false);

  const maxAno = maxPeriodo
    ? Number(maxPeriodo.slice(0, 4))
    : new Date().getFullYear();
  const pisoAno = minAno ?? maxAno - 5;
  const [anoVista, setAnoVista] = useState(Number(ano) || maxAno);

  const vacio = !ano || !mes;
  const label = vacio
    ? (placeholder ?? 'Sin período')
    : format(new Date(Number(ano), Number(mes) - 1, 1), 'MMMM yyyy', {
        locale: es,
      });

  const deshabilitado = (m: number) =>
    maxPeriodo != null &&
    `${anoVista}-${String(m).padStart(2, '0')}` > maxPeriodo;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setAnoVista(Number(ano) || maxAno);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start gap-2 rounded-lg border-[var(--arca-border-strong)] bg-white px-3 font-normal capitalize shadow-none',
            size === 'sm' ? 'h-8 text-[12.5px]' : 'text-[13px]',
            vacio && 'text-[var(--arca-ink-3)] normal-case',
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-[var(--arca-ink-4)]" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[248px] p-3" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={anoVista <= pisoAno}
            aria-label="Año anterior"
            onClick={() => setAnoVista((a) => a - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[13.5px] font-semibold tabular-nums">
            {anoVista}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={anoVista >= maxAno}
            aria-label="Año siguiente"
            onClick={() => setAnoVista((a) => a + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MESES_CORTOS.map((nombre, i) => {
            const m = i + 1;
            const valor = String(m).padStart(2, '0');
            const activo = !vacio && String(anoVista) === ano && valor === mes;
            return (
              <button
                key={valor}
                type="button"
                disabled={deshabilitado(m)}
                onClick={() => {
                  onChange(String(anoVista), valor);
                  setOpen(false);
                }}
                className={cn(
                  'h-8 rounded-[8px] text-[12.5px] capitalize transition-colors',
                  activo
                    ? 'bg-[var(--arca-accent)] font-medium text-white'
                    : 'text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]',
                  'disabled:pointer-events-none disabled:opacity-35'
                )}
              >
                {nombre}
              </button>
            );
          })}
        </div>
        {onLimpiar && (
          <button
            type="button"
            onClick={() => {
              onLimpiar();
              setOpen(false);
            }}
            className="mt-2 w-full rounded-[8px] border-t border-[var(--arca-border)] pt-2 text-[12px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
          >
            Sin período
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
