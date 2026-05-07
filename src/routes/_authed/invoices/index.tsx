import { createFileRoute } from '@tanstack/react-router';
import { InvoicesTable } from '@/components/invoices-table';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/invoices/')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        title="Facturas"
        subtitle="Comprobantes fiscales emitidos y recibidos."
      />
      <InvoicesTable />
    </div>
  );
}
