import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { format, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { getUpcomingDueDates } from '@/actions/dashboard';
import { cn } from '@/lib/utils';

const TAX_COLORS: [string, string][] = [
  ['iva', 'bg-blue-100 text-blue-700'],
  ['iibb', 'bg-purple-100 text-purple-700'],
  ['ganancias', 'bg-orange-100 text-orange-700'],
  ['sueldos', 'bg-green-100 text-green-700'],
  ['convenios', 'bg-teal-100 text-teal-700'],
];

function getTaxColor(tax: string): string {
  const n = tax.toLowerCase();
  for (const [key, color] of TAX_COLORS) {
    if (n.includes(key)) return color;
  }
  return 'bg-gray-100 text-gray-600';
}

function dayLabel(date: Date): string {
  if (isToday(date)) return 'Hoy';
  if (isTomorrow(date)) return 'Mañana';
  return format(date, "EEEE d 'de' MMMM", { locale: es });
}

type DueItem = Awaited<ReturnType<typeof getUpcomingDueDates>>[number];

export function VencimientosSemanales() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['upcoming-due-dates-home'],
    queryFn: () => getUpcomingDueDates({ data: { days: 14, limit: 60 } }),
    staleTime: 60_000,
  });

  // Group by date string
  const grouped: [string, DueItem[]][] = [];
  const seen = new Map<string, DueItem[]>();
  for (const v of items) {
    const key = new Date(v.venceAt).toDateString();
    if (!seen.has(key)) {
      seen.set(key, []);
      grouped.push([key, seen.get(key)!]);
    }
    seen.get(key)!.push(v);
  }

  return (
    <div className="bg-white border border-[var(--arca-border)] rounded-[var(--arca-r-lg)] p-5 mb-3.5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[var(--arca-ink-3)]" />
          <h2 className="text-[14px] font-semibold text-[var(--arca-ink)]">
            Próximos vencimientos
          </h2>
          <span className="text-[11px] text-[var(--arca-ink-3)]">14 días</span>
        </div>
        <Link
          to="/vencimientos"
          className="flex items-center gap-1 text-[12px] text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)] transition-colors no-underline"
        >
          Ver todos <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <div className="text-[13px] text-[var(--arca-ink-3)] py-4 text-center">Cargando...</div>
      ) : grouped.length === 0 ? (
        <div className="text-[13px] text-[var(--arca-ink-3)] py-8 text-center">
          No hay vencimientos en los próximos 14 días
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([_key, dayItems]) => {
            const date = new Date(new Date(dayItems[0]!.venceAt).toDateString());
            const hoy = isToday(date);
            return (
              <div key={key}>
                <p
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-wide mb-1.5 capitalize',
                    hoy ? 'text-red-500' : 'text-[var(--arca-ink-3)]'
                  )}
                >
                  {dayLabel(date)}
                </p>
                <div className="space-y-0.5">
                  {dayItems.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-[var(--arca-surface-2)] transition-colors"
                    >
                      <span
                        className={cn(
                          'inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium shrink-0',
                          getTaxColor(v.impuesto)
                        )}
                      >
                        {v.impuesto}
                      </span>
                      <span className="text-[13px] text-[var(--arca-ink)] flex-1 truncate">
                        {v.clienteNombre ?? '—'}
                      </span>
                      {v.concepto && (
                        <span className="text-[11px] text-[var(--arca-ink-3)] truncate max-w-[140px] hidden sm:block">
                          {v.concepto}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
