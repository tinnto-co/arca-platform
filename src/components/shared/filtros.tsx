'use client';

/**
 * Piezas de la barra de filtros: el chip, el botón del header y el `Limpiar`.
 *
 * Estaban duplicadas carácter por carácter entre el header del tablero y el de
 * la bandeja —`CHIP_BASE`, `CHIP_OFF`, `CHIP_ON`, `BOTON`, `Limpiar`—, que es
 * exactamente la forma en que un sistema se desincroniza: se toca un tono en
 * una pantalla y la otra queda vieja.
 */

import type { ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** El tono del chip activo. El tablero usa el rojo del sistema; la bandeja, el azul. */
export type TonoFiltro = 'info' | 'negativo';

const BASE =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-pill)] border px-[10px] py-1 text-[11.5px] transition-colors duration-[120ms] ease-[ease]';

const INACTIVO =
  'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]';

const ACTIVO: Record<TonoFiltro, string> = {
  info: 'border-[var(--arca-accent-info)] bg-[var(--arca-accent-info-bg)] font-medium text-[var(--arca-accent-info-fg)]',
  negativo:
    'border-[var(--arca-accent-neg)] bg-[var(--arca-accent-neg-bg)] font-medium text-[var(--arca-accent-neg-fg)]',
};

/** Clases del chip, para los triggers de Radix que necesitan `className`. */
export function chipFiltro(activo: boolean, tono: TonoFiltro = 'info') {
  return cn(BASE, activo ? ACTIVO[tono] : INACTIVO);
}

/** Variante punteada: agrupa los filtros secundarios detrás de un popover. */
export function chipMasFiltros(cantidad: number, tono: TonoFiltro = 'info') {
  return cn(
    BASE,
    'border-dashed',
    cantidad > 0
      ? ACTIVO[tono]
      : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
  );
}

/** Botón del encabezado: buscar, marcar todas, el `···`. */
export const botonHeader =
  'inline-flex items-center gap-1.5 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-[11px] py-1.5 text-[12.5px] text-[var(--arca-ink-2)] transition-colors duration-[120ms] ease-[ease] hover:bg-[var(--arca-surface-2)] disabled:opacity-50';

/** Chevron del chip cuando no hay filtro puesto. */
export function ChevronChip() {
  return <ChevronDown className="size-3 text-[var(--arca-ink-4)]" />;
}

/**
 * La `x` que limpia un filtro sin abrir su popover.
 *
 * Va como `span` con `role="button"` y no como `<button>`: vive dentro del
 * trigger del chip, y un botón anidado dentro de otro es HTML inválido.
 */
export function QuitarFiltro({
  onQuitar,
  tono = 'info',
}: {
  onQuitar: () => void;
  tono?: TonoFiltro;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Quitar este filtro"
      className={cn(
        '-mr-0.5 grid size-3.5 place-items-center rounded-full',
        tono === 'info'
          ? 'hover:bg-[var(--arca-accent-info)]/15'
          : 'hover:bg-[var(--arca-accent-neg)]/15'
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onQuitar();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onQuitar();
        }
      }}
    >
      <X className="size-3" />
    </span>
  );
}

/** `Limpiar` al final de la barra. Sólo aparece con filtros puestos. */
export function LimpiarFiltros({ onLimpiar }: { onLimpiar: () => void }) {
  return (
    <button
      type="button"
      onClick={onLimpiar}
      className="text-[11.5px] font-medium text-[var(--arca-navy-700)] hover:underline"
    >
      Limpiar
    </button>
  );
}

/** Conteo del resultado, alineado a la derecha de la barra. */
export function ConteoResultados({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto text-[11.5px] text-[var(--arca-ink-3)] tabular-nums">
      {children}
    </span>
  );
}
