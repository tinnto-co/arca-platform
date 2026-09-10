import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Banners. El crítico es card blanca con una barra izquierda roja de 4px —no
 * un bloque rosa a sangre—, así el rojo sólido se reserva para el borde y el
 * botón de la acción. El texto va siempre en el `-fg` del estado.
 */
const alertVariants = cva(
  'relative w-full rounded-[10px] border py-[10px] px-[14px] text-[13px] grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--arca-surface)] border-[var(--arca-border)] text-[var(--arca-ink)]',
        info: 'bg-[var(--arca-accent-bg)] border-[var(--arca-accent-ring)] text-[var(--arca-accent-hover)]',
        warning:
          'bg-[oklch(0.97_0.03_75)] border-[oklch(0.88_0.08_75)] text-[var(--arca-accent-warn-fg)]',
        destructive:
          'bg-[var(--arca-surface)] border-[oklch(0.85_0.08_25)] border-l-4 border-l-[var(--arca-accent-neg)] text-[var(--arca-accent-neg-fg)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'col-start-2 line-clamp-1 min-h-4 text-[13px] font-semibold tracking-tight',
        className
      )}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-[var(--arca-ink-2)] col-start-2 grid justify-items-start gap-1 text-[13px] [&_p]:leading-relaxed',
        className
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
