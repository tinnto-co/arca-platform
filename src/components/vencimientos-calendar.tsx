import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { getCalendarDueDates } from '@/actions/dashboard';
import { cn } from '@/lib/utils';

/* ─── Types ─── */

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  kind: 'due' | 'debt';
  clientName: string | null;
  balance?: string;
}

/* ─── Helpers ─── */

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Build the 6×7 grid of days for the given month (Mon start). */
function buildCalendarGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  const startWeekday = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startWeekday);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return days;
}

/* ─── Main component ─── */

export function VencimientosCalendar() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);

  const from = startOfMonth(currentMonth);
  // Fetch a bit extra for the grid edges (prev/next month days visible in grid)
  const gridDays = useMemo(
    () => buildCalendarGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth]
  );
  const fetchFrom = gridDays[0];
  const fetchTo = gridDays[gridDays.length - 1];

  const { data, isLoading } = useQuery({
    queryKey: [
      'calendarDueDates',
      fetchFrom.toISOString(),
      fetchTo.toISOString(),
    ],
    queryFn: () =>
      getCalendarDueDates({
        data: {
          from: fetchFrom.toISOString(),
          to: fetchTo.toISOString(),
        },
      }),
  });

  // Map events by day key
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!data) return map;

    for (const dd of data.dueDates) {
      const d = new Date(dd.dueDate);
      const key = dateKey(d);
      const list = map.get(key) ?? [];
      list.push({
        id: dd.id,
        date: d,
        title: dd.tax || 'Vencimiento',
        subtitle: dd.concept || '',
        kind: 'due',
        clientName: dd.clientName,
      });
      map.set(key, list);
    }

    for (const debt of data.debts) {
      const d = new Date(debt.dueDate);
      const key = dateKey(d);
      const list = map.get(key) ?? [];
      list.push({
        id: debt.id,
        date: d,
        title: debt.tax || 'Deuda',
        subtitle: debt.concept || '',
        kind: 'debt',
        clientName: debt.clientName,
        balance: debt.balance,
      });
      map.set(key, list);
    }

    return map;
  }, [data]);

  // Events for selected date
  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDay.get(dateKey(selectedDate)) ?? [];
  }, [selectedDate, eventsByDay]);

  function prevMonth() {
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1)
    );
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth(
      (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1)
    );
    setSelectedDate(null);
  }

  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  }

  const totalDue = data?.dueDates.length ?? 0;
  const totalDebt = data?.debts.length ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 lg:items-start">
      {/* Sidebar: selected day detail + stats */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-180px)]">
        {/* Month stats */}
        <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] p-5">
          <h3
            className="text-[13px] font-semibold text-[var(--arca-ink)] mb-3"
            style={{ fontFamily: 'var(--ff-display)' }}
          >
            Resumen del mes
          </h3>
          {isLoading ? (
            <div className="text-[12.5px] text-[var(--arca-ink-3)]">Cargando...</div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--arca-ink-2)]">
                  <Clock className="w-3.5 h-3.5 text-[var(--arca-accent-info)]" />
                  Vencimientos
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                  {totalDue}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--arca-ink-2)]">
                  <AlertTriangle className="w-3.5 h-3.5 text-[var(--arca-accent-neg)]" />
                  Deudas
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--arca-ink)]">
                  {totalDebt}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Selected day events */}
        <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="px-5 py-3.5 border-b border-[var(--arca-border)] shrink-0">
            <h3
              className="text-[13px] font-semibold text-[var(--arca-ink)]"
              style={{ fontFamily: 'var(--ff-display)' }}
            >
              {selectedDate
                ? selectedDate.toLocaleDateString('es-AR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
                : 'Seleccioná un día'}
            </h3>
          </div>
          <div className="p-2 overflow-y-auto min-h-0 flex-1">
            {!selectedDate ? (
              <div className="px-3 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
                Hacé clic en un día del calendario para ver sus vencimientos
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="px-3 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
                Sin vencimientos este día
              </div>
            ) : (
              <div className="space-y-1">
                {selectedEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className={cn(
                      'rounded-[var(--arca-r-md)] p-3 border',
                      ev.kind === 'due'
                        ? 'border-[var(--arca-accent-info-bg)] bg-[var(--arca-accent-info-bg)]'
                        : 'border-[var(--arca-accent-neg-bg)] bg-[var(--arca-accent-neg-bg)]'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'w-6 h-6 rounded-[5px] inline-flex items-center justify-center shrink-0 mt-0.5',
                          ev.kind === 'due'
                            ? 'bg-[var(--arca-accent-info)] text-white'
                            : 'bg-[var(--arca-accent-neg)] text-white'
                        )}
                      >
                        {ev.kind === 'due' ? (
                          <FileText className="w-3 h-3" />
                        ) : (
                          <AlertTriangle className="w-3 h-3" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-[var(--arca-ink)] leading-tight">
                          {ev.title}
                        </div>
                        {ev.subtitle && (
                          <div className="text-[11.5px] text-[var(--arca-ink-3)] mt-0.5 truncate">
                            {ev.subtitle}
                          </div>
                        )}
                        <div className="text-[11px] text-[var(--arca-ink-4)] mt-1">
                          {ev.clientName || 'General'}
                          {ev.balance && (
                            <span className="ml-2 font-semibold text-[var(--arca-accent-neg-fg)]">
                              $ {parseFloat(ev.balance).toLocaleString('es-AR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--arca-border)]">
          <div className="flex items-center gap-3">
            <h2
              className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)]"
              style={{ fontFamily: 'var(--ff-display)' }}
            >
              {MONTH_NAMES[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h2>
            <div className="flex items-center gap-0.5">
              <button
                onClick={prevMonth}
                className="w-7 h-7 rounded-[var(--arca-r-sm)] inline-flex items-center justify-center text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextMonth}
                className="w-7 h-7 rounded-[var(--arca-r-sm)] inline-flex items-center justify-center text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-ink)] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-1.5 rounded-[var(--arca-r-md)] text-[12.5px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors cursor-pointer"
          >
            Hoy
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-[var(--arca-border)]">
          {WEEKDAY_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)] py-2"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {gridDays.map((day, i) => {
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = isSameDay(day, today);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const events = eventsByDay.get(dateKey(day)) ?? [];
            const hasDue = events.some((e) => e.kind === 'due');
            const hasDebt = events.some((e) => e.kind === 'debt');
            const isPast = day < today && !isToday;

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  'relative min-h-[80px] p-1.5 border-b border-r border-[var(--arca-border)] text-left transition-colors cursor-pointer',
                  i % 7 === 0 && 'border-l-0',
                  !isCurrentMonth && 'bg-[var(--arca-surface-2)]',
                  isSelected && 'bg-[var(--arca-accent-info-bg)]',
                  !isSelected && isCurrentMonth && 'hover:bg-[var(--arca-surface-2)]'
                )}
              >
                {/* Day number */}
                <span
                  className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12.5px] font-medium',
                    isToday &&
                    'bg-[var(--arca-ink)] text-white',
                    !isToday && isCurrentMonth && 'text-[var(--arca-ink)]',
                    !isToday && !isCurrentMonth && 'text-[var(--arca-ink-4)]'
                  )}
                >
                  {day.getDate()}
                </span>

                {/* Event dots / pills */}
                {events.length > 0 && (
                  <div className="mt-0.5 flex flex-col gap-0.5">
                    {events.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          'text-[9.5px] font-medium leading-tight px-1 py-px rounded truncate',
                          ev.kind === 'due' && !isPast &&
                          'bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]',
                          ev.kind === 'due' && isPast &&
                          'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
                          ev.kind === 'debt' &&
                          'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]'
                        )}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {events.length > 2 && (
                      <span className="text-[9px] text-[var(--arca-ink-4)] px-1">
                        +{events.length - 2} más
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
