import { useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import {
  InvoicesTable,
  type FiltrosFacturas,
} from '@/components/invoices-table';
import { PageHeader } from '@/components/shared/page-header';
import { DespachosImportacionDialog } from '@/components/despachos/DespachosImportacion';
import { Button } from '@/components/ui/button';
import { Ship } from 'lucide-react';
import { PageShell } from '@/components/shared/page-shell';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import {
  guardarClienteSeleccionado,
  useClienteSeleccionado,
} from '@/lib/cliente-seleccionado';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Empresa y filtros viven en la URL, como en Banco: al recargar no se pierden
 * y el link se puede compartir. Un valor inválido se ignora en vez de romper.
 */
const facturasSearch = z.object({
  open: z.string().optional().catch(undefined),
  clientId: z.string().uuid().optional().catch(undefined),
  tipo: z.string().regex(/^\d+$/).optional().catch(undefined),
  direccion: z.enum(['emitido', 'recibido']).optional().catch(undefined),
  desde: fecha.optional().catch(undefined),
  hasta: fecha.optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  pagina: z.coerce.number().int().min(2).optional().catch(undefined),
  orden: z
    .enum(['fecha_asc', 'monto_desc', 'monto_asc', 'sin_orden'])
    .optional()
    .catch(undefined),
});
type FacturasSearch = z.infer<typeof facturasSearch>;

export const Route = createFileRoute('/_authed/invoices/')({
  validateSearch: (s: Record<string, unknown>) => facturasSearch.parse(s),
  component: RouteComponent,
});

function RouteComponent() {
  const search: FacturasSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const [clienteGlobal] = useClienteSeleccionado();

  // Cambiar un filtro es moverse dentro de la misma pantalla: no se vuelve
  // al principio de la página.
  const cambiar = (cambio: Partial<FacturasSearch>, replace = false) =>
    void navigate({
      resetScroll: false,
      replace,
      search: (prev: FacturasSearch) => ({ ...prev, ...cambio }),
    });

  // URL → selector del header. Sin `clientId` en la URL, se escribe el
  // recordado; con uno, manda el de la URL (un link compartido abre en su
  // empresa).
  useEffect(() => {
    if (search.clientId) {
      if (search.clientId !== clienteGlobal)
        guardarClienteSeleccionado(search.clientId);
    } else if (clienteGlobal) {
      cambiar({ clientId: clienteGlobal }, true);
    }
    // Solo cuando cambia la URL: el cambio del selector lo atiende el de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.clientId]);

  // Selector del header → URL. Otra empresa vuelve a la página 1.
  const clienteGlobalPrevio = useRef(clienteGlobal);
  useEffect(() => {
    if (clienteGlobalPrevio.current === clienteGlobal) return;
    clienteGlobalPrevio.current = clienteGlobal;
    if ((clienteGlobal ?? undefined) === search.clientId) return;
    cambiar({ clientId: clienteGlobal ?? undefined, pagina: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteGlobal]);

  const filtros: FiltrosFacturas = {
    tipo: search.tipo,
    direccion: search.direccion,
    desde: search.desde,
    hasta: search.hasta,
    q: search.q,
    pagina: search.pagina,
    orden: search.orden,
  };

  return (
    <PageShell>
      <PageHeader
        title="Facturas"
        subtitle="Comprobantes fiscales emitidos y recibidos."
        actions={
          <div className="flex items-center gap-2">
            <SelectorClienteGlobal />
            <DespachosImportacionDialog>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Ship className="size-3.5" />
                Despachos
              </Button>
            </DespachosImportacionDialog>
          </div>
        }
      />
      <InvoicesTable
        openInvoiceId={search.open}
        filtrosUrl={{ valor: filtros, onChange: (c) => cambiar(c) }}
      />
    </PageShell>
  );
}
