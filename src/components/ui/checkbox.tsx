'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-3.5 shrink-0 rounded-[4px] border-[1.5px] border-[var(--arca-border-strong)] bg-[var(--arca-surface)] transition-shadow outline-none data-[state=checked]:border-[var(--arca-accent)] data-[state=checked]:bg-[var(--arca-accent)] data-[state=checked]:text-white data-[state=indeterminate]:border-[var(--arca-accent)] data-[state=indeterminate]:bg-[var(--arca-accent)] data-[state=indeterminate]:text-white focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-ring)] aria-invalid:border-[var(--arca-accent-neg)] disabled:cursor-not-allowed disabled:opacity-40',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current transition-none"
      >
        <CheckIcon className="size-3" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
