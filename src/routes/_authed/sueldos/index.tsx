/**
 * Portada de Sueldos: la tabla de empresas que liquidan.
 *
 * El detalle de una empresa es una subruta real (/sueldos/$clienteId), no un
 * reemplazo de componente: así el botón «atrás» del navegador y el scroll
 * funcionan como en cualquier página, y la URL se puede compartir.
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import { getClientes, getClientesForSueldos } from '@/actions/client';
import {
  AgregarEmpresaDialog,
  EmpresasSueldosTable,
} from '@/components/sueldos/EmpresasSueldosTable';

export const Route = createFileRoute('/_authed/sueldos/')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [clienteGlobal] = useClienteSeleccionado();

  const { data: clients = [], isLoading: clientsQueryLoading } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
  });

  // Nombre de la empresa global cuando NO está entre las que liquidan
  // sueldos, para avisarlo en vez de que la selección parezca no hacer nada.
  // La query comparte cache con el selector global del header.
  const { data: todosLosClientes = [], isSuccess: clientesListos } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });

  const globalConSueldos = clienteGlobal
    ? clients.find((c) => c.id === clienteGlobal)
    : undefined;
  const nombreGlobalSinSueldos =
    clientesListos && !clientsQueryLoading && clienteGlobal && !globalConSueldos
      ? (todosLosClientes.find((c) => c.id === clienteGlobal)?.razonSocial ??
        null)
      : null;

  return (
    <div className="space-y-0 overflow-x-clip">
      <div className="px-9 pt-7 pb-0">
        <PageHeader
          title="Liquidación de sueldos"
          subtitle="Elegí una empresa para gestionar sus sueldos"
          actions={
            <div className="flex items-center gap-2">
              <SelectorClienteGlobal />
              <AgregarEmpresaDialog />
            </div>
          }
        />
      </div>

      <div className="px-9 pt-6 pb-8">
        {/* La empresa global liquida sueldos: acceso directo a su detalle.
            Es un link y no una redirección automática a propósito — la
            redirección rompía el botón «atrás» (volver a la portada te
            devolvía al detalle). */}
        {globalConSueldos && (
          <Link
            to="/sueldos/$clienteId"
            params={{ clienteId: globalConSueldos.id }}
            className="mb-4 flex items-center justify-between rounded-[10px] border px-4 py-2.5 text-[13px] hover:bg-[var(--arca-surface-2)] transition-colors"
            style={{
              background: 'var(--arca-surface)',
              borderColor: 'var(--arca-border-strong)',
              color: 'var(--arca-ink)',
            }}
          >
            <span>
              Estás trabajando con{' '}
              <span className="font-semibold">{globalConSueldos.name}</span> —
              abrir sus sueldos
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        )}

        {/* La empresa global existe pero no liquida sueldos: sin este aviso
            la selección del header parece no hacer nada. */}
        {nombreGlobalSinSueldos && (
          <div
            className="mb-4 flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[13px]"
            style={{
              background: 'var(--arca-accent-warn-bg)',
              borderColor: 'var(--arca-border)',
              color: 'var(--arca-accent-warn-fg)',
            }}
          >
            <span className="font-semibold">{nombreGlobalSinSueldos}</span>
            <span>
              no liquida sueldos por ahora — agregala con «Agregar empresa» para
              gestionarla acá.
            </span>
          </div>
        )}

        <EmpresasSueldosTable
          onSelect={(id) =>
            void navigate({
              to: '/sueldos/$clienteId',
              params: { clienteId: id },
            })
          }
        />
      </div>
    </div>
  );
}
