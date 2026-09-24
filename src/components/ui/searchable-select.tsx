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
  /** `sm` (32px) para barras de filtro, donde alinea con los chips; el
      default (36px) es la altura de control del sistema. */
  size?: 'default' | 'sm';
  /** Micro-label que encabeza el popover, como el "ESTADO" de la referencia. */
  label?: string;
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
  size = 'default',
  label,
  align = 'start',
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const widthClass = typeof width === 'number' ? `${width}px` : width;
  const selected = options.find((o) => o.value === value);

  return (
    // modal: sin esto, dentro de un Dialog el bloqueo de scroll de Radix se
    // come la rueda del mouse sobre la lista (la barra andaba, la rueda no).
    <Popover modal open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          style={{ width: widthClass }}
          className={cn(
            'inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--arca-border-strong)] px-3',
            'bg-[var(--arca-surface)] text-[var(--arca-ink)] transition-colors duration-[120ms] hover:bg-[var(--arca-bg)] disabled:pointer-events-none disabled:opacity-40',
            'focus-visible:border-[var(--arca-accent)] focus-visible:ring-[3px] focus-visible:ring-[var(--arca-accent-bg)] focus-visible:outline-none',
            size === 'sm' ? 'h-8 text-[12.5px]' : 'h-9 text-[13px]'
          )}
        >
          <span
            className={cn('truncate', !selected && 'text-[var(--arca-ink-3)]')}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-[var(--arca-ink-4)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        style={{ width: widthClass }}
        className="p-0"
        align={align}
        sideOffset={6}
      >
        <Command>
          {label && (
            <div className="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.08em] text-[var(--arca-ink-3)] uppercase">
              {label}
            </div>
          )}
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-[13px]"
          />
          {/* maxHeight inline: dentro de un Dialog la clase max-h se pierde
              en la cascada y la lista se desborda sin scroll. */}
          <CommandList
            className="max-h-[220px]"
            style={{ maxHeight: 220, overflowY: 'auto' }}
          >
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
                  className={cn(
                    'gap-2 text-[13px]',
                    value === o.value &&
                      'bg-[var(--arca-accent-bg)] font-medium text-[var(--arca-accent-hover)]'
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  <Check
                    className={cn(
                      'size-3.5 shrink-0 text-[var(--arca-accent)]',
                      value === o.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
