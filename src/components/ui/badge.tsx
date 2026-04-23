import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[#efeeef] text-[#232c50] [a&]:hover:bg-[#efeeef]/80',
        secondary:
          'border-transparent bg-[#139ed9]/10 text-[#139ed9] [a&]:hover:bg-[#139ed9]/20',
        destructive:
          'border-transparent bg-[#dc2626]/10 text-[#dc2626] [a&]:hover:bg-[#dc2626]/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
        info: 'border-transparent bg-[#139ed9]/10 text-[#139ed9]',
        success: 'border-transparent bg-[#16a34a]/10 text-[#16a34a]',
        warning: 'border-transparent bg-[#f59e0b]/10 text-[#f59e0b]',
        error: 'border-transparent bg-[#dc2626]/10 text-[#dc2626]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
