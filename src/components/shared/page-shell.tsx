import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Contenedor de pantalla. Acá vive el padding de página y el ancho máximo, para
 * que no lo repita cada ruta con su propio `p-[28px_36px_60px]`.
 *
 * Dos formas:
 *
 *  · `documento` — el default. Scrollea con la página, ancho máximo 1440 y el
 *    padding del design system (28 / 36 / 60).
 *  · `panel` — pantallas que ocupan el alto completo y scrollean por dentro
 *    (el tablero, la bandeja). Quedan como un panel con borde, separado del
 *    sidebar por padding del contenedor: con margen propio, un `h-full` mide
 *    el alto entero Y ADEMÁS empuja, y el pie se corta abajo.
 */
export function PageShell({
  children,
  variant = 'documento',
  className,
}: {
  children: ReactNode;
  variant?: 'documento' | 'panel';
  className?: string;
}) {
  if (variant === 'panel') {
    return (
      <div className={cn('h-full min-h-0 p-3 md:p-4', className)}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--arca-r-lg)] border border-[var(--arca-border)] bg-[var(--arca-bg)]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('max-w-[1440px] p-[28px_36px_60px]', className)}>
      {children}
    </div>
  );
}
