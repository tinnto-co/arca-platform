import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, UserCircle } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Card, CardContent } from '@/components/ui/card';
import { getClientsForSueldos } from '@/actions/client';
import { listOrgModules } from '@/actions/admin';
import { PageHeader } from '@/components/shared/page-header';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import {
  getPeriodoMesActual,
  getPeriodoMesAnterior,
} from '@/lib/payroll-period-rules';

interface SueldosClientRow {
  id: string;
  clientId: string;
  profileId: string;
  name: string;
  label: string;
  type: 'profile';
}

export const Route = createFileRoute('/_authed/sueldos/')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientsForSueldos(),
  });

  const { data: orgModules } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled = orgModules?.ai_agent ?? false;

  const columns: ColumnDef<SueldosClientRow>[] = [
    {
      accessorKey: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'label',
      header: 'Identificación',
      cell: ({ row }) => {
        const label = row.original.label;
        const match = /\(([^)]+)\)$/.exec(label);
        return (
          <span className="text-muted-foreground tabular-nums">
            {match?.[1] ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'open',
      header: '',
      cell: () => (
        <div className="flex justify-end pr-2">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
  ];

  const isEmpty = !isLoading && clients.length === 0;

  return (
    <div className="p-[28px_36px_60px] max-w-[1440px]">
      {aiAgentEnabled && (
        <CopilotReadableEntity
          description="Listado de clientes habilitados para liquidación de sueldos. Usá profileId para abrir el detalle vía abrirSueldosCliente. mesLiquidable es el único período sobre el que se pueden calcular liquidaciones."
          value={{
            modulo: 'sueldos-listado',
            totalClientesDisponibles: clients.length,
            mesActual: getPeriodoMesActual(),
            mesLiquidable: getPeriodoMesAnterior(),
            clientes: clients.map((c) => ({
              clientId: c.clientId,
              profileId: c.profileId,
              nombre: c.name,
              label: c.label,
            })),
          }}
        />
      )}
      <PageHeader
        title="Liquidación de sueldos"
        subtitle="Clientes habilitados para gestionar sueldos"
      />
      {isEmpty ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold mb-2">Sin clientes</h2>
            <p className="text-muted-foreground max-w-md">
              No hay clientes con liquidación de sueldos habilitada en esta
              organización. Habilitá el flag <code>liquidaSueldos</code> en
              algún perfil para empezar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={clients}
          searchKey="name"
          searchPlaceholder="Buscar cliente..."
          onRowClick={(row) =>
            void navigate({
              to: '/sueldos/$profileId',
              params: { profileId: row.profileId },
            })
          }
        />
      )}
    </div>
  );
}
