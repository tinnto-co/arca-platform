import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Badges de estado y numéricos.
 *
 * El texto va siempre en el `-fg` del estado, no en el color del punto: los
 * `text-[#16a34a]` sobre fondo `/10` que había antes no llegaban a 4.5:1.
 * Cuando el badge lleva punto, el color del punto entra por `--badge-dot` y
 * se dibuja con `<BadgeDot />`.
 *
 * Las variantes numéricas (`count-solid`, `count-soft`, `code`, `code-muted`)
 * son mono tabular: contadores, códigos de impuesto, formularios.
 */
const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-[var(--arca-accent)] focus-visible:ring-[var(--arca-accent-ring)] focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)] [--badge-dot:var(--arca-ink-3)]',
        secondary:
          'border-transparent bg-[var(--arca-accent-bg)] text-[var(--arca-accent-hover)] [--badge-dot:var(--arca-accent)]',
        info: 'border-transparent bg-[var(--arca-accent-bg)] text-[var(--arca-accent-hover)] [--badge-dot:var(--arca-accent)]',
        success:
          'border-transparent bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)] [--badge-dot:var(--arca-accent-pos)]',
        warning:
          'border-transparent bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)] [--badge-dot:var(--arca-accent-warn)]',
        error:
          'border-transparent bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)] [--badge-dot:var(--arca-accent-neg)]',
        destructive:
          'border-transparent bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)] [--badge-dot:var(--arca-accent-neg)]',
        outline:
          'border-[var(--arca-border-strong)] bg-transparent text-[var(--arca-ink-2)] [--badge-dot:var(--arca-ink-3)]',
        /* Contador urgente: "70 vencidos". Rojo sólido = vencido/crítico. */
        'count-solid':
          'border-transparent rounded-full bg-[var(--arca-accent-neg)] text-white',
        /* Contador atenuado: "61 críticos". */
        'count-soft':
          'border-transparent rounded-full bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
        /* Código de impuesto (931) sobre la tinta oscura del sidebar. */
        code: 'border-transparent bg-[var(--arca-sidebar)] text-white',
        /* Código neutro: "F. 8600/V". */
        'code-muted':
          'border-transparent bg-[var(--arca-surface-2)] text-[var(--arca-ink-2)]',
      },
      size: {
        default: 'h-6 gap-1.5 px-[9px] text-[12px] font-medium',
        /* Inline en celda de tabla. */
        sm: 'h-5 gap-1 px-2 text-[11px] font-medium',
        /* Numéricas: mono tabular, 22px. */
        num: 'h-[22px] gap-1 px-2 text-[11.5px] font-semibold tabular-nums [font-family:var(--ff-mono)]',
      },
    },
    compoundVariants: [
      /* Las numéricas traen su propio tamaño: no hace falta pedir size="num". */
      {
        variant: ['count-solid', 'count-soft', 'code', 'code-muted'],
        size: 'default',
        class:
          'h-[22px] px-2 text-[11.5px] font-semibold tabular-nums [font-family:var(--ff-mono)]',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/** Punto de 6px que precede al texto. Toma el color de la variante. */
function BadgeDot({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge-dot"
      aria-hidden
      className={cn(
        'size-1.5 shrink-0 rounded-full bg-[var(--badge-dot,currentColor)]',
        className
      )}
      {...props}
    />
  );
}

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, BadgeDot, badgeVariants };
