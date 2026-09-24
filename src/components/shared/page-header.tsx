import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Encabezado de pantalla. Es igual en todas las vistas: mismo H1, mismo
 * subtítulo, mismo aire, sin ícono y sin borde.
 *
 * Antes cada pantalla lo resolvía por su cuenta —cinco tamaños de H1 (22, 24,
 * 28 y 30 px), cuatro paddings distintos, y unas con tile de ícono y otras
 * no—, así que pasar de Clientes a Notificaciones se sentía como cambiar de
 * aplicación. El valor del design system es 30/600 con `-0.025em`.
 *
 * No lleva padding propio: el aire lo pone `PageShell`, que es el mismo para
 * las pantallas que scrollean con la página y para las que ocupan el alto
 * completo.
 */
interface PageHeaderProps {
  title: string;
  /** Texto o nodos: el resumen suele llevar números resaltados. */
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Segunda fila, para la barra de filtros. */
  filters?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  filters,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-5 flex shrink-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        {/* `basis` y no `min-w-0`: con `min-w-0` el bloque del título se
            aplasta hasta cero antes de que las acciones bajen de línea, y el
            buscador termina encima del H1. Con un ancho base, cuando no entran
            las dos columnas las acciones se van abajo. */}
        <div className="min-w-[min(100%,260px)] flex-1">
          <h1 className="text-[30px] leading-none font-semibold tracking-[-0.025em] text-[var(--arca-ink)] [font-family:var(--ff-display)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[12px] text-[var(--arca-ink-3)] tabular-nums">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {filters && (
        <div className="flex flex-wrap items-center gap-2">{filters}</div>
      )}
    </div>
  );
}
