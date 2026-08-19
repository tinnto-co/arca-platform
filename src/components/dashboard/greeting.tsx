import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { getUser } from '@/actions/user';
import { getGreetingPart } from './shared';

export function DashboardGreeting() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => getUser(),
  });

  const today = new Date();

  return (
    <section className="mb-6">
      <h1 className="font-display text-[30px] font-semibold tracking-[-0.025em] leading-[1.15] text-[var(--arca-ink)]">
        {getGreetingPart()},{' '}
        <span className="font-medium text-[var(--arca-ink-3)]">
          {user?.name ?? 'Cargando...'}
        </span>
      </h1>
      <p className="text-[13.5px] text-[var(--arca-ink-3)] mt-1.5">
        Resumen de tareas y vencimientos ·{' '}
        <span className="font-medium text-[var(--arca-ink)] capitalize">
          {format(today, "EEEE d 'de' MMMM yyyy", { locale: es })}
        </span>
      </p>
    </section>
  );
}
