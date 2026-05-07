import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

/* ─── Currency formatting (ARS) ─── */
export function formatArs(amount: number): string {
  if (amount === 0) return '$ 0';
  const abs = Math.abs(amount);
  const formatted = abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return amount < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

export function formatArsParts(amount: number): {
  sign: string;
  integer: string;
} {
  const abs = Math.abs(amount);
  const integer = abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { sign: '$', integer };
}

/* ─── Relative time (Spanish) ─── */
export function relativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days === 1) {
    return `ayer, ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

/* ─── Greeting part of day ─── */
export function getGreetingPart(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/* ─── Current period label ─── */
export function getCurrentPeriod(): string {
  const now = new Date();
  const month = now.toLocaleDateString('es-AR', { month: 'short' });
  return `${month} ${now.getFullYear()}`;
}

/* ─── Delta badge ─── */
export function Delta({
  kind,
  children,
}: {
  kind: 'pos' | 'neg' | 'warn';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-[7px] py-[2px] rounded-[20px] text-[11.5px] font-semibold tabular-nums',
        kind === 'pos' &&
          'text-[var(--arca-accent-pos-fg)] bg-[var(--arca-accent-pos-bg)]',
        kind === 'neg' &&
          'text-[var(--arca-accent-neg-fg)] bg-[var(--arca-accent-neg-bg)]',
        kind === 'warn' &&
          'text-[var(--arca-accent-warn-fg)] bg-[var(--arca-accent-warn-bg)]'
      )}
    >
      {children}
    </span>
  );
}

/* ─── Status tag ─── */
export function StatusTag({
  kind,
  children,
}: {
  kind: 'ok' | 'pend' | 'late';
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] px-2 py-[2px] rounded-[20px] text-[11px] font-medium',
        kind === 'ok' &&
          'text-[var(--arca-accent-pos-fg)] bg-[var(--arca-accent-pos-bg)]',
        kind === 'pend' &&
          'text-[var(--arca-accent-warn-fg)] bg-[var(--arca-accent-warn-bg)]',
        kind === 'late' &&
          'text-[var(--arca-accent-neg-fg)] bg-[var(--arca-accent-neg-bg)]'
      )}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          kind === 'ok' && 'bg-[var(--arca-accent-pos)]',
          kind === 'pend' && 'bg-[var(--arca-accent-warn)]',
          kind === 'late' && 'bg-[var(--arca-accent-neg)]'
        )}
      />
      {children}
    </span>
  );
}

/* ─── Card wrapper (Arca style) ─── */
export function ArcaCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ArcaCardHead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-[var(--arca-border)]',
        className
      )}
    >
      {children}
    </div>
  );
}

export function ArcaCardFoot({
  leftText,
  linkText,
  linkHref,
}: {
  leftText: string;
  linkText: string;
  linkHref?: string;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-xs text-[var(--arca-ink-3)]">
      <span>{leftText}</span>
      <a
        href={linkHref || '#'}
        className="text-[var(--arca-ink)] font-medium inline-flex items-center gap-1 hover:underline"
      >
        {linkText}
      </a>
    </div>
  );
}

/* ─── Icon tile (for card titles, KPI labels, feed) ─── */
export function IconTile({
  children,
  size = 22,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[6px] bg-[var(--arca-surface-2)] border border-[var(--arca-border)] text-[var(--arca-ink-2)]',
        className
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

/* ─── Progress bar ─── */
export function ProgressBar({
  kind,
  pct,
}: {
  kind: 'pos' | 'neg' | 'warn' | 'info';
  pct: number;
}) {
  const colorMap = {
    pos: 'var(--arca-accent-pos)',
    neg: 'var(--arca-accent-neg)',
    warn: 'var(--arca-accent-warn)',
    info: 'var(--arca-accent-info)',
  };
  return (
    <div className="h-1 rounded-sm bg-[var(--arca-surface-2)] border border-[var(--arca-border)] overflow-hidden">
      <div
        className="h-full rounded-sm"
        style={{ width: `${Math.min(pct, 100)}%`, background: colorMap[kind] }}
      />
    </div>
  );
}

/* ─── Chip ─── */
export function Chip({
  children,
  swatchColor,
  variant,
}: {
  children: ReactNode;
  swatchColor?: string;
  variant?: 'default' | 'neg';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] px-2 py-[3px] rounded-[20px] text-[11px] font-medium',
        variant === 'neg'
          ? 'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]'
          : 'bg-[var(--arca-surface-2)] border border-[var(--arca-border)] text-[var(--arca-ink-3)]'
      )}
    >
      {swatchColor && (
        <span
          className="w-[7px] h-[7px] rounded-full inline-block"
          style={{ background: swatchColor }}
        />
      )}
      {children}
    </span>
  );
}

/* ─── Tab bar ─── */
export function TabBar({
  options,
  active,
  onChange,
}: {
  options: string[];
  active: string;
  onChange?: (val: string) => void;
}) {
  return (
    <div className="inline-flex bg-[var(--arca-surface-2)] border border-[var(--arca-border)] rounded-[var(--arca-r-md)] p-0.5 text-xs font-medium">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange?.(opt)}
          className={cn(
            'px-2.5 py-1 rounded-[6px] text-[var(--arca-ink-3)] transition-all duration-[120ms]',
            active === opt &&
              'bg-[var(--arca-surface)] text-[var(--arca-ink)] shadow-[var(--arca-shadow-sm)]'
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
