import { createFileRoute } from '@tanstack/react-router';
import { JobsTable } from '@/components/jobs-table';
import { Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/jobs/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        icon={Clock}
        title="Trabajos"
        subtitle="Historial de jobs de scraping por cliente, tipo y estado."
      />
      <JobsTable />
    </div>
  );
}
