'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Las piezas con las que se dibujan las respuestas del asistente.
 *
 * Son la card del sistema (`ArcaCard`) llevada al ancho del panel: el panel
 * mide entre 340 y 560 px, así que el padding de 20 px y el título de 15 px de
 * una card de tablero dejan sin lugar a los números, que son lo único que el
 * usuario vino a leer. Acá el encabezado es un micro-label en versalitas y el
 * cuerpo va a 12–13 px, como las filas densas de las tablas.
 *
 * Que estén todas acá es el punto: cada tool dibujaba su propia caja con
 * `bg-muted/30`, `border` y `text-destructive` —los tokens genéricos de
 * shadcn, que en esta app no están mapeados a la paleta— y el chat terminaba
 * siendo el único lugar del producto con grises fríos y rojos de otro sistema.
 */

export function ChatCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-surface)]',
        className
      )}
    >
      {children}
    </div>
  );
}

/** Encabezado de card: título, y a la derecha lo que haga falta (un Badge). */
export function ChatCardHead({
  title,
  sub,
  trailing,
}: {
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-[var(--arca-border)] px-3 py-2.5">
      <div className="min-w-0">
        <div className="truncate font-display text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]">
          {title}
        </div>
        {sub && (
          <div className="mt-0.5 truncate text-[11.5px] text-[var(--arca-ink-3)]">
            {sub}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

/** Micro-label de sección: versalitas, como los `<thead>` de las tablas. */
export function ChatCardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[var(--arca-ink-3)]">
      {children}
    </div>
  );
}

/** Fila etiqueta → valor. El valor va tabular, siempre. */
export function ChatRow({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: Tono;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-[7px] text-[12.5px]">
      <span className="min-w-0 truncate text-[var(--arca-ink-2)]">{label}</span>
      <span
        className={cn(
          'shrink-0 font-medium tabular-nums',
          tone ? TONO_TEXTO[tone] : 'text-[var(--arca-ink)]'
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Las filas de una card, separadas por la línea de fila de las tablas. */
export function ChatRows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-[var(--arca-border-row)]">{children}</div>
  );
}

export type Tono = 'pos' | 'neg' | 'warn' | 'info' | 'neutro';

const TONO_TEXTO: Record<Tono, string> = {
  pos: 'text-[var(--arca-accent-pos-fg)]',
  neg: 'text-[var(--arca-accent-neg-fg)]',
  warn: 'text-[var(--arca-accent-warn-fg)]',
  info: 'text-[var(--arca-accent-info-fg)]',
  neutro: 'text-[var(--arca-ink-3)]',
};

/**
 * Celda de KPI. Va a dos columnas incluso en el panel más angosto: un número
 * por renglón desperdicia el alto, que es lo caro en una conversación.
 */
export function ChatKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tono;
}) {
  return (
    <div className="min-w-0 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2.5 py-2">
      <div className="truncate text-[11px] font-medium text-[var(--arca-ink-3)]">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 truncate font-display text-[16px] font-semibold leading-none tracking-[-0.02em] tabular-nums',
          tone ? TONO_TEXTO[tone] : 'text-[var(--arca-ink)]'
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate text-[11px] tabular-nums text-[var(--arca-ink-4)]">
          {sub}
        </div>
      )}
    </div>
  );
}

export function ChatKpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/** "Calculando…" mientras corre la tool. */
export function ChatCargando({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-[var(--arca-ink-3)]">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--arca-accent)]" />
      <span>{children}</span>
    </div>
  );
}

/**
 * Un "no se pudo". Va en ámbar, no en rojo: que una empresa no aparezca o que
 * un período no tenga datos no es un error del sistema, es una respuesta.
 */
export function ChatAviso({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-accent-warn-bg)] px-3 py-2 text-[12.5px] text-[var(--arca-accent-warn-fg)]">
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Una respuesta vacía: "no hay recibos en este período". */
export function ChatVacio({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2 text-[12.5px] text-[var(--arca-ink-3)]">
      {children}
    </div>
  );
}

/** `$ 1.234.567` — el formato de moneda del sistema, sin decimales. */
export function formatArs(monto: number): string {
  const abs = Math.abs(Math.round(monto));
  const entero = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return monto < 0 ? `-$ ${entero}` : `$ ${entero}`;
}
