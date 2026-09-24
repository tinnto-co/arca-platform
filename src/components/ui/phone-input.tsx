/**
 * Input de teléfono con selector de país y formato automático — adaptación
 * del shadcn-phone-input de omeralpi sobre react-phone-number-input.
 * Devuelve E.164 (+5411...) vía onChange; país por defecto: Argentina.
 */
import * as React from 'react';
import * as RPNInput from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import es from 'react-phone-number-input/locale/es.json';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type PhoneInputProps = Omit<
  React.ComponentProps<'input'>,
  'onChange' | 'value' | 'ref'
> &
  Omit<RPNInput.Props<typeof RPNInput.default>, 'onChange'> & {
    onChange?: (value: RPNInput.Value) => void;
  };

const PhoneInput: React.ForwardRefExoticComponent<PhoneInputProps> =
  React.forwardRef<React.ElementRef<typeof RPNInput.default>, PhoneInputProps>(
    ({ className, onChange, ...props }, ref) => (
      <RPNInput.default
        ref={ref}
        className={cn('flex', className)}
        flagComponent={FlagComponent}
        countrySelectComponent={CountrySelect}
        inputComponent={InputComponent}
        international={false}
        defaultCountry="AR"
        labels={es}
        // react-phone-number-input manda undefined cuando queda vacío; los
        // forms esperan string.
        onChange={(value) => onChange?.(value ?? '')}
        {...props}
      />
    )
  );
PhoneInput.displayName = 'PhoneInput';

const InputComponent = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'>
>(({ className, ...props }, ref) => (
  <Input
    className={cn('rounded-s-none rounded-e-lg', className)}
    {...props}
    ref={ref}
  />
));
InputComponent.displayName = 'InputComponent';

interface CountryEntry {
  label: string;
  value: RPNInput.Country | undefined;
}

interface CountrySelectProps {
  disabled?: boolean;
  value: RPNInput.Country;
  options: CountryEntry[];
  onChange: (country: RPNInput.Country) => void;
}

function CountrySelect({
  disabled,
  value: selectedCountry,
  options: countryList,
  onChange,
}: CountrySelectProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="flex gap-1 rounded-s-lg rounded-e-none border-r-0 px-3 focus:z-10"
          disabled={disabled}
        >
          <FlagComponent
            country={selectedCountry}
            countryName={selectedCountry}
          />
          <ChevronsUpDown
            className={cn(
              '-mr-2 size-4 opacity-50',
              disabled ? 'hidden' : 'opacity-100'
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar país…" className="text-[13px]" />
          <CommandList
            className="max-h-[220px]"
            style={{ maxHeight: 220, overflowY: 'auto' }}
          >
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {countryList.map(({ value, label }) =>
                value ? (
                  <CommandItem
                    key={value}
                    className="gap-2 text-[13px]"
                    onSelect={() => {
                      onChange(value);
                      setOpen(false);
                    }}
                  >
                    <FlagComponent country={value} countryName={label} />
                    <span className="flex-1 truncate">{label}</span>
                    <span className="text-[12px] text-[var(--arca-ink-4)]">
                      +{RPNInput.getCountryCallingCode(value)}
                    </span>
                    <Check
                      className={cn(
                        'size-3.5',
                        value === selectedCountry ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ) : null
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FlagComponent({ country, countryName }: RPNInput.FlagProps) {
  const Flag = flags[country];
  return (
    <span className="flex h-4 w-6 overflow-hidden rounded-sm [&_svg]:size-full">
      {Flag && <Flag title={countryName} />}
    </span>
  );
}

export { PhoneInput };
