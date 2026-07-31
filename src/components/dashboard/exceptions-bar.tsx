import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { getExceptionsSummary } from '@/actions/dashboard';

interface ExceptionCardProps {
  count: number;
  label: string;
  description: string;
  href: string;
  colorVar: string;
  bgVar: string;
  icon: React.ReactNode;
}

function ExceptionCard({
  count,
  label,
  description,
  href,
  colorVar,
  bgVar,
  icon,
}: ExceptionCardProps) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 px-4 py-3 rounded-[12px] border transition-all duration-[120ms] hover:-translate-y-px hover:shadow-[var(--arca-shadow-md)] cursor-pointer no-underline"
      style={{
        background: bgVar,
        borderColor: colorVar,
      }}
    >
      <span
        className="inline-flex items-center justify-center rounded-[8px] w-9 h-9 shrink-0"
        style={{ background: colorVar, color: '#fff' }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div
          className="text-[22px] font-semibold tabular-nums leading-none"
          style={{ color: colorVar }}
        >
          {count}
        </div>
        <div className="text-[12px] font-medium text-[var(--arca-ink)] leading-tight mt-0.5">
          {label}
        </div>
        <div className="text-[11px] text-[var(--arca-ink-3)] leading-tight">
          {description}
        </div>
      </div>
    </Link>
  );
}

export function ExceptionsBar() {
  const { data } = useQuery({
    queryKey: ['exceptionsSummary'],
    queryFn: () => getExceptionsSummary(),
    staleTime: 60_000,
  });

  if (!data) return null;

  const { notificacionesUrgentesCount } = data;

  const cards = [
    // {
    //   count: data.deudasVencidasCount,
    //   label: 'Deudas vencidas',
    //   description: 'deudas abiertas y vencidas',
    //   href: '/clients' as const,
    //   colorVar: 'var(--arca-accent-neg)',
    //   bgVar: 'var(--arca-accent-neg-bg)',
    //   icon: <AlertTriangle size={16} />,
    // },
    {
      count: notificacionesUrgentesCount,
      label: 'Notificaciones críticas',
      description: 'sin resolver',
      href: '/notifications' as const,
      colorVar: 'var(--arca-accent-neg)',
      bgVar: 'var(--arca-accent-neg-bg)',
      icon: <Bell size={16} />,
    },
    // {
    //   count: data.vencimientosProximosCount,
    //   label: 'Vencimientos próximos',
    //   description: 'en los próximos 3 días',
    //   href: '/vencimientos' as const,
    //   colorVar: 'var(--arca-accent-warn)',
    //   bgVar: 'var(--arca-accent-warn-bg)',
    //   icon: <Calendar size={16} />,
    // },
    // {
    //   count: data.credencialesConErrorCount,
    //   label: 'Errores de scraping',
    //   description: 'credenciales con fallos',
    //   href: '/clients' as const,
    //   colorVar: 'var(--arca-accent-warn)',
    //   bgVar: 'var(--arca-accent-warn-bg)',
    //   icon: <AlertTriangle size={16} />,
    // },
  ].filter((c) => c.count > 0);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3.5">
      {cards.map((card) => (
        <ExceptionCard key={card.label} {...card} />
      ))}
    </div>
  );
}
