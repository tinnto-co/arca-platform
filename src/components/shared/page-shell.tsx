import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Contenedor de pantalla. Acá vive el aire de página, para que no lo repita
 * cada ruta con su propio `p-[28px_36px_60px]`, `p-6` o `p-5`.
 *
 * El padding horizontal es el mismo en las dos formas: es lo que hace que el
 * título arranque exactamente en el mismo lugar al pasar de una vista a otra.
 *
 *  · `documento` — el default. Scrollea con la página y tiene ancho máximo.
 *  · `panel` — pantallas que ocupan el alto completo y scrollean por dentro
 *    (el tablero, la bandeja). Sin borde ni marco: son la pantalla, no una
 *    tarjeta dentro de la pantalla.
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
      <div
        className={cn('flex h-full min-h-0 flex-col px-9 pt-7 pb-6', className)}
      >
        {children}
      </div>
    );
  }

  // Sin `pb` grande: el layout autenticado ya reserva `pb-28` para que el
  // input del asistente no tape el final de la página. Sumarle otro dejaba a
  // Banco, Facturas o Balances con el doble de aire abajo que la ficha del
  // cliente, que no lo repite.
  return (
    <div className={cn('max-w-[1440px] px-9 pt-7 pb-2', className)}>
      {children}
    </div>
  );
}
