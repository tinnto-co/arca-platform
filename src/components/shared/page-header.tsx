import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Encabezado de pantalla. Es el único lugar donde se decide el tamaño del H1,
 * el del subtítulo y el aire alrededor.
 *
 * Antes cada pantalla lo resolvía por su cuenta y había cinco tamaños de H1
 * conviviendo (22, 24, 28 y 30 px). El valor del design system es 30/600 con
 * `-0.025em`, que es además el que piden los handoffs, así que ese es el que
 * queda.
 *
 * Dos variantes, según cómo esté armada la pantalla:
 *
 *  · `plain` — sólo el bloque tipográfico. Para las pantallas que ya tienen su
 *    propio padding de página (`PageShell`). Es el default.
 *  · `bar` — barra con borde inferior y padding propio, para las pantallas a
 *    sangre que ocupan el alto completo y scrollean por dentro (el tablero de
 *    tareas, la bandeja). Admite una segunda fila de filtros.
 */
interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  /** Texto o nodos: el resumen suele llevar números resaltados. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Segunda fila, debajo del título. Sólo en `bar`. */
  filters?: ReactNode;
  variant?: 'plain' | 'bar';
  className?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  filters,
  variant = 'plain',
  className,
}: PageHeaderProps) {
  const bloque = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon && (
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
            style={{
              background: 'var(--arca-surface-2)',
              border: '1px solid var(--arca-border)',
            }}
          >
            <Icon
              className="size-[18px] text-[var(--arca-ink-2)]"
              strokeWidth={1.8}
            />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[12px] text-[var(--arca-ink-3)] tabular-nums">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );

  if (variant === 'plain') {
    return <div className={cn('mb-6', className)}>{bloque}</div>;
  }

  return (
    <header
      className={cn(
        'z-[5] flex shrink-0 flex-col gap-3 border-b border-[var(--arca-border)] bg-[var(--arca-bg)] px-6 pt-[18px] pb-3',
        className
      )}
    >
      {bloque}
      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}
    </header>
  );
}
