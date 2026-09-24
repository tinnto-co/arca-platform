import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-[var(--arca-ink)] placeholder:text-[var(--arca-ink-4)] selection:bg-[var(--arca-accent)] selection:text-white h-9 w-full min-w-0 rounded-lg border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-1 text-[16px] text-[var(--arca-ink)] transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[13px] file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 md:text-[13px]',
        // 16px hasta md a propósito: por debajo de eso iOS hace zoom al foco.
        'focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)]',
        'aria-invalid:border-[var(--arca-accent-neg)] aria-invalid:focus-visible:ring-[var(--arca-accent-neg-bg)]',
        className
      )}
      {...props}
    />
  );
}

export { Input };
