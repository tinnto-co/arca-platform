import { useQuery } from '@tanstack/react-query';
import { Calendar, SlidersHorizontal } from 'lucide-react';
import { getUser } from '@/actions/user';
import { getGreetingPart, getCurrentPeriod } from './shared';

export function DashboardGreeting() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  });

  const now = new Date();
  const dayStart = 1;
  const dayCurrent = now.getDate();
  const monthName = now.toLocaleDateString('es-AR', { month: 'short' });
  const monthNameCap = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const year = now.getFullYear();

  return (
    <section className="flex items-end justify-between gap-6 mb-6 flex-wrap">
      <div>
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-[var(--arca-ink)]">
          {getGreetingPart()},{' '}
          <span className="font-medium text-[var(--arca-ink-3)]">
            {user?.name || 'Cargando...'}
          </span>
        </h1>
        <p className="text-[13.5px] text-[var(--arca-ink-3)] mt-1.5 max-w-[560px]">
          Resumen general de tus clientes y actividad contable · periodo{' '}
          <b className="text-[var(--arca-ink)]">{getCurrentPeriod()}</b>,
          comparado con mes anterior.
        </p>
      </div>
      <div className="flex gap-2.5 items-center">
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--arca-r-md)] text-[13px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
          <Calendar className="w-[13px] h-[13px]" />
          {monthNameCap} {dayStart} – {dayCurrent}, {year}
        </button>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[var(--arca-r-md)] text-[13px] font-medium border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink)] hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms]">
          <SlidersHorizontal className="w-[13px] h-[13px]" />
          Filtros
        </button>
      </div>
    </section>
  );
}
