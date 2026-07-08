import { Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useActiveJobs } from '@/hooks/use-active-jobs';
import { JOB_TYPE_LABELS } from '@/lib/job-types';
import type { JobType } from '@/actions/job';

/**
 * Pill con las actualizaciones (jobs del scrapper) en curso para el org.
 * No renderiza nada si no hay jobs activos.
 */
export function ActiveJobsIndicator() {
  const { activeJobs } = useActiveJobs();

  if (activeJobs.length === 0) return null;

  const clientCount = new Set(activeJobs.map((j) => j.representativeId)).size;

  const countsByType = new Map<JobType, number>();
  for (const j of activeJobs) {
    countsByType.set(j.type, (countsByType.get(j.type) ?? 0) + 1);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface)]"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {activeJobs.length} actualización
          {activeJobs.length > 1 ? 'es' : ''} en curso · {clientCount} cliente
          {clientCount > 1 ? 's' : ''}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold text-[var(--arca-ink)]">
          Actualizaciones en curso
        </p>
        <ul className="space-y-1">
          {[...countsByType.entries()].map(([type, count]) => (
            <li
              key={type}
              className="flex items-center justify-between text-xs text-[var(--arca-ink-2)]"
            >
              <span>{JOB_TYPE_LABELS[type] ?? type}</span>
              <span className="font-mono">{count}</span>
            </li>
          ))}
        </ul>
        <Link
          to="/jobs"
          className="mt-3 block text-xs font-medium text-[var(--arca-ink)] underline underline-offset-2"
        >
          Ver detalle en Jobs
        </Link>
      </PopoverContent>
    </Popover>
  );
}
