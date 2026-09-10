import * as React from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'placeholder:text-[var(--arca-ink-4)] flex field-sizing-content min-h-16 w-full rounded-lg border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-2 text-[16px] text-[var(--arca-ink)] transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-40 md:text-[13px]',
        'focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)]',
        'aria-invalid:border-[var(--arca-accent-neg)] aria-invalid:focus-visible:ring-[var(--arca-accent-neg-bg)]',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
