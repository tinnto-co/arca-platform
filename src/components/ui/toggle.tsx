import * as React from 'react';
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-[12.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] disabled:pointer-events-none disabled:opacity-40 data-[state=on]:bg-[var(--arca-surface)] data-[state=on]:text-[var(--arca-ink)] data-[state=on]:shadow-[0_1px_2px_rgba(16,23,32,0.08)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-[var(--arca-accent)] focus-visible:ring-[var(--arca-accent-ring)] focus-visible:ring-[3px] outline-none transition-[color,box-shadow] aria-invalid:border-[var(--arca-accent-neg)] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] hover:bg-[var(--arca-bg)]',
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
