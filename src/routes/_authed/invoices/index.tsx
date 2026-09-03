import { createFileRoute } from '@tanstack/react-router';
import { InvoicesTable } from '@/components/invoices-table';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';

export const Route = createFileRoute('/_authed/invoices/')({
  validateSearch: (s: Record<string, unknown>): { open?: string } => ({
    open: typeof s.open === 'string' ? s.open : undefined,
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { open } = Route.useSearch();
  return (
    <PageShell>
      <PageHeader
        title="Facturas"
        subtitle="Comprobantes fiscales emitidos y recibidos."
        actions={<SelectorClienteGlobal />}
      />
      <InvoicesTable openInvoiceId={open} />
    </PageShell>
  );
}
