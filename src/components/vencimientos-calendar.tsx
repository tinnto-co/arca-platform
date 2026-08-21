import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Filter,
  ChevronDown,
} from 'lucide-react';
import { getCalendarDueDates } from '@/actions/dashboard';
import { markVencimientoCompletado } from '@/actions/client';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';

/* ─── Types ─── */

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  kind: 'due' | 'debt';
  clientName: string | null;
  balance?: string;
  completedAt?: Date | null;
}

/* ─── Helpers ─── */

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

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
    days.push(
      new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i
      )
    );
  }
  return days;
}

/* ─── Main component ─── */

export function VencimientosCalendar() {
  const today = new Date();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  const [clientFilter, setClientFilter] = useState<string>('__all__');

  // Fetch a bit extra for the grid edges (prev/next month days visible in grid)
  const gridDays = useMemo(
    () =>
      buildCalendarGrid(currentMonth.getFullYear(), currentMonth.getMonth()),
    [currentMonth]
  );
  const fetchFrom = gridDays[0];
  const fetchTo = gridDays[gridDays.length - 1];

  const calendarQueryKey = [
    'calendarDueDates',
    fetchFrom.toISOString(),
    fetchTo.toISOString(),
  ];

  const { data, isLoading } = useQuery({
    queryKey: calendarQueryKey,
    queryFn: () =>
      getCalendarDueDates({
        data: {
          from: fetchFrom.toISOString(),
          to: fetchTo.toISOString(),
        },
      }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      markVencimientoCompletado({ data: { id, completed } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: calendarQueryKey });
    },
  });

  // Map events by day key
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!data) return map;

    for (const dd of data.vencimientos) {
      const d = new Date(dd.venceAt);
      const key = dateKey(d);
      const list = map.get(key) ?? [];
      list.push({
        id: dd.id,
        date: d,
        title: dd.impuesto || 'Vencimiento',
        subtitle: dd.concepto || '',
        kind: 'due',
        clientName: dd.clienteNombre,
        completedAt: dd.completadoAt ? new Date(dd.completadoAt) : null,
      });
      map.set(key, list);
    }

    for (const debt of data.deudas) {
      // `deuda.vence_at` es nullable: sin fecha no hay día donde ubicarla.
      if (!debt.venceAt) continue;
      const d = new Date(debt.venceAt);
      const key = dateKey(d);
      const list = map.get(key) ?? [];
      list.push({
        id: debt.id,
        date: d,
        title: debt.impuesto || 'Deuda',
        subtitle: debt.concepto || '',
        kind: 'debt',
        clientName: debt.clienteNombre,
        balance: debt.saldo,
      });
      map.set(key, list);
    }

    return map;
  }, [data]);

  function prevMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDate(null);
  }

  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  }

  // Unique client names from events for filter
  const clientNames = useMemo(() => {
    const names = new Set<string>();
    eventsByDay.forEach((events) =>
      events.forEach((e) => {
        if (e.clientName) names.add(e.clientName);
      })
    );
    return Array.from(names).sort();
  }, [eventsByDay]);

  // Filtered events
  const filteredEventsByDay = useMemo(() => {
    if (clientFilter === '__all__') return eventsByDay;
    const filtered = new Map<string, CalendarEvent[]>();
    eventsByDay.forEach((events, key) => {
      const f = events.filter((e) => e.clientName === clientFilter);
      if (f.length > 0) filtered.set(key, f);
    });
    return filtered;
  }, [eventsByDay, clientFilter]);

  const filteredSelectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    return filteredEventsByDay.get(dateKey(selectedDate)) ?? [];
  }, [selectedDate, filteredEventsByDay]);

  const totalDue = useMemo(() => {
    let count = 0;
    filteredEventsByDay.forEach((events) =>
      events.forEach((e) => {
        if (e.kind === 'due') count++;
      })
    );
    return count;
  }, [filteredEventsByDay]);

  const totalDebt = useMemo(() => {
    let count = 0;
    filteredEventsByDay.forEach((events) =>
      events.forEach((e) => {
        if (e.kind === 'debt') count++;
      })
    );
    return count;
  }, [filteredEventsByDay]);

  return (
    <div>
      <PageHeader
        title="Calendario de vencimientos"
        subtitle="Obligaciones fiscales y deudas de toda tu cartera, por fecha"
        actions={
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="bg-white border border-[#DFDCD3] rounded-[10px] px-[14px] py-[9px] h-auto w-auto min-w-[180px] gap-2 shadow-none focus:ring-0 [&>svg]:hidden">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
                <span className="text-[13.5px] text-[#9B9CA3]">Cliente</span>
                <span className="text-[13.5px] font-semibold text-[#12131A]">
                  {clientFilter === '__all__' ? 'Todos' : clientFilter}
                </span>
                <ChevronDown className="h-3.5 w-3.5 stroke-[#9B9CA3] shrink-0" />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="__all__">Todos</SelectItem>
              {clientNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* ── Body grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-[26px] lg:items-start">
        {/* ── Left column: summary + day detail ── */}
        <div className="flex flex-col gap-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-140px)]">
          {/* Month summary */}
          <div>
            <h3 className="font-[family-name:var(--ff-display)] font-semibold text-[15px] text-[#12131A] mb-3">
              Resumen del mes
            </h3>
            {isLoading ? (
              <div className="text-[12.5px] text-[#9B9CA3]">Cargando...</div>
            ) : (
              <div>
                <div className="flex items-center justify-between py-[11px] border-b border-[#ECEAE3]">
                  <div className="flex items-center gap-2 text-[13px] text-[#3E404A]">
                    <Clock
                      className="w-4 h-4"
                      style={{ color: 'oklch(0.55 0.10 240)' }}
                    />
                    Vencimientos
                  </div>
                  <span className="font-[family-name:var(--ff-display)] font-bold text-[20px] tabular-nums text-[#12131A]">
                    {totalDue}
                  </span>
                </div>
                <div className="flex items-center justify-between py-[11px] border-b border-[#ECEAE3]">
                  <div className="flex items-center gap-2 text-[13px] text-[#3E404A]">
                    <AlertTriangle
                      className="w-4 h-4"
                      style={{ color: 'oklch(0.58 0.15 25)' }}
                    />
                    Deudas
                  </div>
                  <span
                    className="font-[family-name:var(--ff-display)] font-bold text-[20px] tabular-nums"
                    style={{ color: 'oklch(0.50 0.15 25)' }}
                  >
                    {totalDebt}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Selected day detail */}
          <div className="pt-[18px] border-t border-[#ECEAE3] mt-[18px] flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="mb-3 shrink-0">
              <span className="text-[13px] font-medium text-[#6E7079]">
                {selectedDate
                  ? selectedDate.toLocaleDateString('es-AR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  : 'Seleccioná un día'}
              </span>
            </div>
            {!selectedDate ? (
              <div className="py-8 text-center text-[13px] text-[#9B9CA3]">
                Hacé clic en un día del calendario
              </div>
            ) : filteredSelectedEvents.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#9B9CA3]">
                Sin vencimientos ni deudas este día.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
                {filteredSelectedEvents.map((ev) => {
                  const isCompleted = ev.kind === 'due' && !!ev.completedAt;
                  return (
                    <div
                      key={ev.id}
                      className={cn(
                        'bg-white border border-[#ECEAE3] rounded-[10px] p-[13px_14px]',
                        isCompleted && 'opacity-60'
                      )}
                    >
                      {/* Top: client name + status tag */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[13px] font-semibold text-[#12131A] truncate flex-1">
                          {ev.clientName || 'General'}
                        </span>
                        <span
                          className="text-[10.5px] font-semibold rounded-full px-[8px] py-[2px] shrink-0"
                          style={
                            ev.kind === 'due'
                              ? {
                                  color: 'oklch(0.42 0.12 240)',
                                  backgroundColor: 'oklch(0.94 0.04 240)',
                                }
                              : {
                                  color: 'oklch(0.47 0.14 25)',
                                  backgroundColor: 'oklch(0.94 0.04 25)',
                                }
                          }
                        >
                          {ev.kind === 'due' ? 'Vencimiento' : 'Deuda'}
                        </span>
                      </div>
                      {/* Obligation */}
                      <div className="flex items-start gap-2">
                        {ev.kind === 'due' && (
                          <button
                            onClick={() =>
                              completeMutation.mutate({
                                id: ev.id,
                                completed: !isCompleted,
                              })
                            }
                            disabled={completeMutation.isPending}
                            className="shrink-0 mt-0.5 cursor-pointer text-[#9B9CA3] hover:text-[#2f7d55] transition-colors"
                            title={
                              isCompleted
                                ? 'Marcar como pendiente'
                                : 'Marcar como completado'
                            }
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-[#2f7d55]" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              'text-[14px] font-semibold text-[#12131A]',
                              isCompleted && 'line-through text-[#9B9CA3]'
                            )}
                          >
                            {ev.title}
                          </div>
                          {ev.subtitle && (
                            <div
                              className={cn(
                                'text-[12.5px] text-[#9B9CA3] mt-0.5',
                                isCompleted && 'line-through'
                              )}
                            >
                              {ev.subtitle}
                            </div>
                          )}
                          {ev.balance && (
                            <div
                              className="text-[12px] font-semibold mt-1"
                              style={{ color: 'oklch(0.50 0.15 25)' }}
                            >
                              $ {parseFloat(ev.balance).toLocaleString('es-AR')}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                {MONTH_NAMES[currentMonth.getMonth()]}{' '}
                {currentMonth.getFullYear()}
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
                    !isSelected &&
                      isCurrentMonth &&
                      'hover:bg-[var(--arca-surface-2)]'
                  )}
                >
                  {/* Day number */}
                  <span
                    className={cn(
                      'inline-flex items-center justify-center w-6 h-6 rounded-full text-[12.5px] font-medium',
                      isToday && 'bg-[var(--arca-ink)] text-white',
                      !isToday && isCurrentMonth && 'text-[var(--arca-ink)]',
                      !isToday && !isCurrentMonth && 'text-[var(--arca-ink-4)]'
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {/* Event dots / pills */}
                  {events.length > 0 && (
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {events.slice(0, 2).map((ev) => {
                        const evCompleted =
                          ev.kind === 'due' && !!ev.completedAt;
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              'text-[9.5px] font-medium leading-tight px-1 py-px rounded truncate',
                              evCompleted &&
                                'bg-[var(--arca-accent-pos-bg)] text-[var(--arca-accent-pos-fg)] line-through',
                              !evCompleted &&
                                ev.kind === 'due' &&
                                !isPast &&
                                'bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent-info-fg)]',
                              !evCompleted &&
                                ev.kind === 'due' &&
                                isPast &&
                                'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
                              ev.kind === 'debt' &&
                                'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]'
                            )}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
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
    </div>
  );
}
