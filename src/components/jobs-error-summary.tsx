import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Chip } from '@/components/dashboard/shared';
import {
  getJobErrorSummary,
  type ErrorGroup,
  type JobType,
} from '@/actions/job';

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  critical: {
    label: 'Crítica',
    className:
      'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
  },
  high: {
    label: 'Alta',
    className:
      'bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)]',
  },
  medium: {
    label: 'Media',
    className:
      'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]',
  },
  low: {
    label: 'Baja',
    className: 'bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]',
  },
};

function SummaryCard({
  label,
  value,
  chipText,
  chipVariant,
}: {
  label: string;
  value: string;
  chipText?: string;
  chipVariant?: 'default' | 'neg';
}) {
  return (
    <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] p-[14px_16px] flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="text-[12.5px] font-medium text-[var(--arca-ink-3)]">
          {label}
        </div>
        {chipText && <Chip variant={chipVariant}>{chipText}</Chip>}
      </div>
      <div className="font-display text-[24px] font-semibold tracking-[-0.025em] text-[var(--arca-ink)] tabular-nums leading-none truncate">
        {value}
      </div>
    </div>
  );
}

export function JobsErrorSummary({
  credencialId,
  type,
  date,
  fromTime,
}: {
  credencialId?: string;
  type?: JobType;
  date?: string;
  fromTime?: string;
}) {
  const [selectedGroup, setSelectedGroup] = useState<ErrorGroup | null>(null);

  const { data: summary } = useQuery({
    queryKey: ['job-error-summary', credencialId, type, date, fromTime],
    queryFn: () =>
      getJobErrorSummary({
        data: { credencialId, type, date, fromTime },
      }),
  });

  if (!summary) return null;

  // Sin fallas no hay tabla de errores, pero el silencio no contesta la
  // pregunta de la pantalla ("¿salió bien?"): se dice explícitamente.
  if (summary.totalFailed === 0) {
    if (summary.totalJobs === 0) return null;
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[var(--arca-border)] bg-[var(--arca-accent-pos-bg)] px-4 py-2.5 text-[13px] text-[var(--arca-accent-pos-fg)]">
        <span className="font-semibold">✓ Sin errores</span>
        <span>
          · {summary.totalJobs} job{summary.totalJobs !== 1 ? 's' : ''} en el
          período, ninguno fallido
        </span>
      </div>
    );
  }

  const failureRate =
    summary.totalJobs > 0
      ? ((summary.totalFailed / summary.totalJobs) * 100).toFixed(1)
      : null;
  const retryableCount = summary.groups
    .filter((g) => g.retryable)
    .reduce((acc, g) => acc + g.count, 0);

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard
          label="Jobs fallidos"
          value={String(summary.totalFailed)}
          chipText={failureRate ? `${failureRate}% del total` : undefined}
          chipVariant="neg"
        />
        <SummaryCard
          label="Causa principal"
          value={summary.topCategory?.label ?? '—'}
          chipText={
            summary.topCategory
              ? `${summary.topCategory.count} jobs`
              : undefined
          }
        />
        <SummaryCard
          label="Credenciales afectadas"
          value={String(summary.affectedCredenciales)}
        />
        <SummaryCard
          label="Reintentables"
          value={String(retryableCount)}
          chipText="fallas transitorias"
        />
      </div>

      <div className="bg-[var(--arca-surface)] border border-[var(--arca-border)] rounded-[14px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-[12.5px] font-medium text-[var(--arca-ink-3)]">
          <AlertTriangle className="h-3.5 w-3.5 text-[var(--arca-accent-neg-fg)]" />
          Errores agrupados por causa
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Causa</TableHead>
              <TableHead>Severidad</TableHead>
              <TableHead className="text-right">Jobs</TableHead>
              <TableHead className="text-right">Credenciales</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.groups.map((group) => {
              const severity =
                SEVERITY_META[group.severity] ?? SEVERITY_META.medium;
              return (
                <TableRow key={group.category}>
                  <TableCell className="font-medium">{group.label}</TableCell>
                  <TableCell>
                    <Badge className={severity.className}>
                      {severity.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.credenciales.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedGroup(group)}
                    >
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!selectedGroup}
        onOpenChange={(open) => {
          if (!open) setSelectedGroup(null);
        }}
      >
        <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup?.label}{' '}
              <span className="text-[var(--arca-ink-3)] font-normal">
                — {selectedGroup?.count} jobs fallidos
              </span>
            </DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[12px] font-medium text-[var(--arca-ink-3)] mb-1.5">
                  Ejemplos de error
                </div>
                <div className="flex flex-col gap-1.5">
                  {selectedGroup.sampleReasons.map((reason) => (
                    <div
                      key={reason}
                      className="rounded-md bg-[var(--arca-accent-neg-bg)] text-[var(--arca-accent-neg-fg)] px-3 py-2 text-[12.5px] break-words"
                    >
                      {reason}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[12px] font-medium text-[var(--arca-ink-3)] mb-1.5">
                  Credenciales afectadas
                </div>
                <ScrollArea className="max-h-72">
                  <div className="flex flex-col gap-2 pr-3">
                    {selectedGroup.credenciales.map((cred) => (
                      <div
                        key={cred.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-[var(--arca-border)] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
                            {cred.nombre ?? 'Sin nombre'}
                          </div>
                          {cred.clientes.length > 0 && (
                            <div className="text-[12px] text-[var(--arca-ink-3)] truncate">
                              {cred.clientes
                                .map((c) => c.razonSocial)
                                .join(', ')}
                            </div>
                          )}
                        </div>
                        <Badge className="shrink-0 bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
                          {cred.count} {cred.count === 1 ? 'job' : 'jobs'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
