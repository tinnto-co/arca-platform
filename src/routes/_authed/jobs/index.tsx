import { createFileRoute } from '@tanstack/react-router';
import { JobsTable } from '@/components/jobs-table';
import z from 'zod';

export const Route = createFileRoute('/_authed/jobs/')({
  validateSearch: z.object({
    page: z.number().int().positive().catch(1),
    status: z
      .enum(['all', 'pending', 'running', 'finished', 'failed'])
      .catch('all'),
    type: z
      .enum([
        'all',
        'iva',
        'comprobantes',
        'comprobantes_full',
        'notificaciones',
        'deuda',
        'vencimientos',
      ])
      .catch('all'),
    clientId: z.string().catch('all'),
    search: z.string().catch(''),
    date: z.string().catch(''),
    fromTime: z.string().catch(''),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <JobsTable />
    </div>
  );
}
