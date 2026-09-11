import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { getCalendarDueDates } from '@/actions/dashboard';
import { getClientes } from '@/actions/client';
import { markVencimientoCompletado } from '@/actions/client';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';

/* ─── Types ─── */

interface CalendarEvent {
  id: string;
  date: Date;
  title: string;
  subtitle: string;
  kind: 'due' | 'debt';
  clienteId: string | null;
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

/**
 * Los vencimientos vienen titulados "301 - SUSS": el código de impuesto es
 * una cifra y va en mono, el nombre en sans. Si el título no trae código,
 * se dibuja tal cual.
 */
function CodigoYNombre({ titulo }: { titulo: string }) {
  const m = /^(\d+)\s*-\s*(.+)$/.exec(titulo);
  if (!m) return <>{titulo}</>;
  return (
    <>
      <span className="tabular-nums [font-family:var(--ff-mono)]">{m[1]}</span>
      <span className="opacity-60"> · </span>
      {m[2]}
    </>
  );
}

export function VencimientosCalendar() {
  const today = new Date();
  const queryClient = useQueryClient();
  const [currentMonth, setCurrentMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date | null>(today);
  // El filtro es el selector global de empresa del header: la elección viaja
  // con el usuario a las demás vistas (mismo patrón que Contabilidad).
  const [clienteGlobal] = useClienteSeleccionado();

  // Solo para nombrar la empresa en el subtítulo: decir "toda tu cartera"
  // mientras se ve una sola empresa es mentir sobre lo que hay en pantalla.
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });
  const nombreCliente = clienteGlobal
    ? (clientes.find((c) => c.id === clienteGlobal)?.razonSocial ?? null)
    : null;

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
        clienteId: dd.clienteId,
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
        clienteId: debt.clienteId,
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

  /**
   * "Hoy" es navegación, no una acción sobre los datos: va en secundario,
   * junto a las flechas de mes, y no en el acento —que queda para la acción
   * principal de cada pantalla—.
   *
   * Queda siempre habilitado a propósito: deshabilitarlo en el mes actual
   * lo dejaba gris apenas entrabas, que se lee como roto, y encima no es un
   * no-op: estando en el mes actual con otro día elegido, vuelve a hoy.
   */
  function goToday() {
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  }

  // Filtered events
  const filteredEventsByDay = useMemo(() => {
    if (!clienteGlobal) return eventsByDay;
    const filtered = new Map<string, CalendarEvent[]>();
    eventsByDay.forEach((events, key) => {
      const f = events.filter((e) => e.clienteId === clienteGlobal);
      if (f.length > 0) filtered.set(key, f);
    });
    return filtered;
  }, [eventsByDay, clienteGlobal]);

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
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Calendario de vencimientos"
        subtitle={
          nombreCliente
            ? `Obligaciones fiscales y deudas de ${nombreCliente}, por fecha`
            : 'Obligaciones fiscales y deudas de toda tu cartera, por fecha'
        }
        actions={<SelectorClienteGlobal />}
      />

      {/* ── Body grid ──
          Alto completo y recorte acá: cada columna scrollea por dentro, como
          la bandeja de notificaciones. Antes la columna era `sticky` y el
          scroll lo hacía la página entera, así que leer el detalle de un día
          cargado te movía el calendario de al lado. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-[26px] overflow-y-auto lg:grid-cols-[320px_1fr] lg:overflow-hidden">
        {/* ── Left column: summary + day detail ── */}
        <div className="flex min-h-0 flex-col gap-0 lg:h-full lg:overflow-hidden">
          {/* Month summary */}
          <div>
            <h3 className="font-[family-name:var(--ff-display)] font-semibold text-[15px] text-[var(--arca-ink)] mb-1.5">
              Resumen del mes
            </h3>
            {isLoading ? (
              <div className="text-[12.5px] text-[var(--arca-ink-4)]">
                Cargando...
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between py-[5px]">
                  <div className="flex items-center gap-2 text-[13px] text-[var(--arca-ink-2)]">
                    <Clock
                      className="w-4 h-4"
                      style={{ color: 'var(--arca-accent)' }}
                    />
                    Vencimientos
                  </div>
                  <span className="text-[20px] font-semibold tabular-nums text-[var(--arca-ink)] [font-family:var(--ff-mono)]">
                    {totalDue}
                  </span>
                </div>
                <div className="flex items-center justify-between py-[5px]">
                  <div className="flex items-center gap-2 text-[13px] text-[var(--arca-ink-2)]">
                    <AlertTriangle
                      className="w-4 h-4"
                      style={{ color: 'var(--arca-accent-neg)' }}
                    />
                    Deudas
                  </div>
                  <span
                    className="text-[20px] font-semibold tabular-nums [font-family:var(--ff-mono)]"
                    style={{ color: 'var(--arca-accent-neg-fg)' }}
                  >
                    {totalDebt}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Selected day detail */}
          <div className="pt-[12px] pb-[12px] border-t border-b border-[var(--arca-border)] mt-[12px] flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="mb-2 shrink-0">
              <span className="text-[13px] font-medium text-[var(--arca-ink-3)]">
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
              <div className="py-8 text-center text-[13px] text-[var(--arca-ink-4)]">
                Hacé clic en un día del calendario
              </div>
            ) : filteredSelectedEvents.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[var(--arca-ink-4)]">
                Sin vencimientos ni deudas este día.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto overscroll-contain flex-1 min-h-0 pr-1">
                {filteredSelectedEvents.map((ev) => {
                  const isCompleted = ev.kind === 'due' && !!ev.completedAt;
                  return (
                    <div
                      key={ev.id}
                      className={cn(
                        'bg-white border border-[var(--arca-border)] rounded-[10px] p-[13px_14px]',
                        isCompleted && 'opacity-60'
                      )}
                    >
                      {/* Top: client name + status tag */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[13px] font-semibold text-[var(--arca-ink)] truncate flex-1">
                          {ev.clientName || 'General'}
                        </span>
                        <Badge
                          variant={ev.kind === 'due' ? 'info' : 'error'}
                          size="sm"
                          className="shrink-0"
                        >
                          <BadgeDot />
                          {ev.kind === 'due' ? 'Vencimiento' : 'Deuda'}
                        </Badge>
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
                            className="shrink-0 mt-0.5 cursor-pointer text-[var(--arca-ink-4)] hover:text-[var(--arca-accent-pos-fg)] transition-colors"
                            title={
                              isCompleted
                                ? 'Marcar como pendiente'
                                : 'Marcar como completado'
                            }
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-[var(--arca-accent-pos-fg)]" />
                            ) : (
                              <Circle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <div className="min-w-0 flex-1">
                          <div
                            className={cn(
                              'text-[14px] font-semibold text-[var(--arca-ink)]',
                              isCompleted &&
                                'line-through text-[var(--arca-ink-4)]'
                            )}
                          >
                            <CodigoYNombre titulo={ev.title} />
                          </div>
                          {ev.subtitle && (
                            <div
                              className={cn(
                                'text-[12.5px] text-[var(--arca-ink-4)] mt-0.5',
                                isCompleted && 'line-through'
                              )}
                            >
                              {ev.subtitle}
                            </div>
                          )}
                          {ev.balance && (
                            <div
                              className="mt-1 text-[12px] font-semibold tabular-nums [font-family:var(--ff-mono)]"
                              style={{ color: 'var(--arca-accent-neg-fg)' }}
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
        <div className="min-h-0 self-start max-h-full overflow-y-auto overscroll-contain bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px]">
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={prevMonth}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={nextMonth}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={goToday}>
              Hoy
            </Button>
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
              const events = filteredEventsByDay.get(dateKey(day)) ?? [];
              const isPast = day < today && !isToday;
              const isFinde = day.getDay() === 0 || day.getDay() === 6;

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    'relative min-h-[80px] p-1.5 border-b border-r border-[var(--arca-border)] text-left transition-colors cursor-pointer',
                    i % 7 === 0 && 'border-l-0',
                    !isCurrentMonth && 'bg-[var(--arca-surface-2)]',
                    isCurrentMonth &&
                      isFinde &&
                      !isToday &&
                      'bg-[var(--arca-surface-hover)]',
                    // Hoy gana sobre el finde y sobre el hover.
                    isToday && 'bg-[var(--arca-accent-bg)]',
                    isSelected && 'bg-[var(--arca-accent-bg)]',
                    !isSelected &&
                      !isToday &&
                      isCurrentMonth &&
                      'hover:bg-[var(--arca-surface-hover)]'
                  )}
                >
                  {isToday && (
                    <span
                      aria-hidden
                      className="absolute top-0 right-0 left-0 h-[3px] bg-[var(--arca-accent)]"
                    />
                  )}

                  {/* Day number */}
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] tabular-nums [font-family:var(--ff-mono)]',
                      isToday &&
                        'bg-[var(--arca-accent)] font-semibold text-white',
                      !isToday &&
                        isCurrentMonth &&
                        !isFinde &&
                        'font-medium text-[var(--arca-ink)]',
                      !isToday &&
                        isCurrentMonth &&
                        isFinde &&
                        'font-medium text-[var(--arca-ink-4)]',
                      !isCurrentMonth && 'font-medium text-[var(--arca-ink-4)]'
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
                              'truncate rounded-md px-1.5 py-px text-[10px] leading-tight font-medium',
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
                            <CodigoYNombre titulo={ev.title} />
                          </div>
                        );
                      })}
                      {events.length > 2 && (
                        <span className="px-1 text-[10px] tabular-nums text-[var(--arca-ink-3)] [font-family:var(--ff-mono)]">
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
