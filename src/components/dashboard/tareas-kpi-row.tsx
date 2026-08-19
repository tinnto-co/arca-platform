import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ClipboardList, AlertCircle, CalendarClock } from 'lucide-react';
import { getHomeKpis } from '@/actions/dashboard';

export function TareasKpiRow() {
  const { data } = useQuery({
    queryKey: ['home-kpis'],
    queryFn: () => getHomeKpis(),
    staleTime: 30_000,
  });

  const cards = [
    {
      label: 'Tareas pendientes',
      count: data?.pendientes ?? 0,
      icon: <ClipboardList size={16} />,
      color: 'var(--arca-accent-warn)',
      bg: 'var(--arca-accent-warn-bg)',
    },
    {
      label: 'Vencen esta semana',
      count: data?.semana ?? 0,
      icon: <CalendarClock size={16} />,
      color: 'var(--arca-accent-pos)',
      bg: 'var(--arca-accent-pos-bg)',
    },
    {
      label: 'Tareas vencidas',
      count: data?.vencidas ?? 0,
      icon: <AlertCircle size={16} />,
      color: 'var(--arca-accent-neg)',
      bg: 'var(--arca-accent-neg-bg)',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3.5">
      {cards.map((card) => (
        <Link
          key={card.label}
          to="/tareas"
          className="flex items-center gap-3 px-4 py-3 rounded-[12px] border transition-all duration-[120ms] hover:-translate-y-px hover:shadow-[var(--arca-shadow-md)] no-underline"
          style={{ background: card.bg, borderColor: card.color }}
        >
          <span
            className="inline-flex items-center justify-center rounded-[8px] w-9 h-9 shrink-0"
            style={{ background: card.color, color: '#fff' }}
          >
            {card.icon}
          </span>
          <div className="min-w-0">
            <div
              className="text-[22px] font-semibold tabular-nums leading-none"
              style={{ color: card.color }}
            >
              {card.count}
            </div>
            <div className="text-[12px] font-medium text-[var(--arca-ink)] leading-tight mt-0.5">
              {card.label}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
