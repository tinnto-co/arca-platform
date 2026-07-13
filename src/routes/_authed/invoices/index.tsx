import { createFileRoute } from '@tanstack/react-router';
import { InvoicesTable } from '@/components/invoices-table';
import { PageHeader } from '@/components/shared/page-header';

export const Route = createFileRoute('/_authed/invoices/')({
  validateSearch: (s: Record<string, unknown>): { open?: string } => ({
    open: typeof s.open === 'string' ? s.open : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { open } = Route.useSearch();
  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      <PageHeader
        title="Facturas"
        subtitle="Comprobantes fiscales emitidos y recibidos."
      />
      <InvoicesTable openInvoiceId={open} />
    </div>
  );
}
