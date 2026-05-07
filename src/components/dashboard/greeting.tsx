import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar } from 'lucide-react';
import { type DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUser } from '@/actions/user';
import { getGreetingPart } from './shared';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

interface DashboardGreetingProps {
  dateRange: { from: Date; to: Date };
  onDateRangeChange: (range: { from: Date; to: Date }) => void;
}

export function DashboardGreeting({
  dateRange,
  onDateRangeChange,
}: DashboardGreetingProps) {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  });

  const [open, setOpen] = useState(false);
  const now = new Date();

  // Convert internal { from, to } to DateRange for the picker
  const pickerRange: DateRange = { from: dateRange.from, to: dateRange.to };

  const formatRange = (from: Date, to: Date) => {
    const opts = { locale: es };
    if (from.toDateString() === to.toDateString()) {
      return format(from, 'd MMM yyyy', opts);
    }
    if (from.getFullYear() === to.getFullYear()) {
      return `${format(from, 'd MMM', opts)} – ${format(to, 'd MMM yyyy', opts)}`;
    }
    return `${format(from, 'd MMM yyyy', opts)} – ${format(to, 'd MMM yyyy', opts)}`;
  };

  return (
    <section className="flex items-end justify-between gap-6 mb-6 flex-wrap">
      <div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-[var(--arca-ink)]">
          {getGreetingPart()},{' '}
          <span className="font-medium text-[var(--arca-ink-3)]">
            {user?.name ?? 'Cargando...'}
          </span>
        </h1>
        <p className="text-[13.5px] text-[var(--arca-ink-3)] mt-1.5 max-w-[560px]">
          Resumen general de tus clientes y actividad contable · periodo{' '}
          <b className="text-[var(--arca-ink)]">
            {formatRange(dateRange.from, dateRange.to)}
          </b>
        </p>
      </div>

      <div className="flex gap-2.5 items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--arca-r-md)] text-[13px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
              <Calendar className="w-[13px] h-[13px] shrink-0" />
              {formatRange(dateRange.from, dateRange.to)}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
            <CalendarPicker
              mode="range"
              selected={pickerRange}
              onSelect={(r) => {
                if (r?.from && r?.to) {
                  onDateRangeChange({ from: r.from, to: r.to });
                  setOpen(false);
                } else if (r?.from) {
                  // partial selection: only update from, wait for to
                  onDateRangeChange({ from: r.from, to: r.from });
                }
              }}
              numberOfMonths={2}
              defaultMonth={dateRange.from}
              locale={es}
              disabled={{ after: now }}
            />
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
