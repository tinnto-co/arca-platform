import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Jerarquía de botones. El énfasis es el acento petróleo, uno solo:
 * `default` (acento sólido) → `outline` (secundario) → `secondary` (terciario
 * tonal) → `ghost`. Ya no existe botón negro/navy. El rojo sólido queda para
 * `destructive` y nada más.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-ring)] focus-visible:border-[var(--arca-accent)] aria-invalid:border-[var(--arca-accent-neg)]",
  {
    variants: {
      variant: {
        default:
          'bg-[var(--arca-accent)] text-white hover:bg-[var(--arca-accent-hover)] active:bg-[var(--arca-accent-hover)]',
        destructive:
          'bg-[var(--arca-accent-neg)] text-white hover:bg-[var(--arca-accent-neg-hover)]',
        outline:
          'border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-bg)]',
        secondary:
          'bg-[var(--arca-surface-2)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2-hover)]',
        ghost:
          'text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)]',
        link: 'text-[var(--arca-accent)] underline-offset-4 hover:underline hover:text-[var(--arca-accent-hover)]',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-[30px] rounded-[7px] gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
