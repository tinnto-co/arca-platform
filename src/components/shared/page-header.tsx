import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        {Icon && (
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
            style={{
              background: 'var(--arca-surface-2)',
              border: '1px solid var(--arca-border)',
            }}
          >
            <Icon
              className="w-[18px] h-[18px] text-[var(--arca-ink-2)]"
              strokeWidth={1.8}
            />
          </div>
        )}
        <div>
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-[var(--arca-ink)] leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] text-[var(--arca-ink-3)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
