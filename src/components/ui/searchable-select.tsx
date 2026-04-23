import { useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Width of both trigger and popover (default 280px) */
  width?: number | string;
  align?: 'start' | 'end' | 'center';
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Sin resultados',
  width = 280,
  align = 'start',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const widthClass = typeof width === 'number' ? `${width}px` : width;
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          style={{ width: widthClass }}
          className="inline-flex items-center justify-between gap-2 px-3 py-[7px] rounded-[var(--arca-r-md)] text-[13px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] disabled:opacity-50 disabled:pointer-events-none"
        >
          <span className={cn('truncate', !selected && 'text-[var(--arca-ink-3)]')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-[var(--arca-ink-4)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent style={{ width: widthClass }} className="p-0" align={align} sideOffset={6}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="text-[13px]" />
          <CommandList className="max-h-[220px]">
            <CommandEmpty className="py-6 text-center text-[12.5px] text-[var(--arca-ink-3)]">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onValueChange(o.value);
                    setOpen(false);
                  }}
                  className="text-[13px] gap-2"
                >
                  <Check
                    className={cn(
                      'w-3.5 h-3.5 shrink-0',
                      value === o.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
