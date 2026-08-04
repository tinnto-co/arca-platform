import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClient } from '@/actions/profile';
import { updateClientFiscalData } from '@/actions/accounting';
import { toTitleCase } from '@/lib/format-name';
import { getInvoiceStatsByProfile } from '@/actions/invoice';
import { listOrgModules } from '@/actions/admin';
import { CopilotReadableEntity } from '@/components/copilot/CopilotReadableEntity';
import { InvoicesTable } from '@/components/invoices-table';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

interface ClientDetailProps {
  clientId: string;
  representativeId: string;
}

const chartConfig = {
  ventas: {
    label: 'Ventas',
    color: 'hsl(var(--chart-1))',
  },
  compras: {
    label: 'Compras',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

const COLORS = [
  '#1F2937', // gray-800
  '#374151', // gray-700
  '#4B5563', // gray-600
  '#6B7280', // gray-500
  '#9CA3AF', // gray-400
  '#111827', // gray-900
  '#1F2937', // gray-800 (repeat for more items)
  '#374151', // gray-700 (repeat for more items)
];

function FiscalDataCard({
  clientId,
  client,
}: {
  clientId: string;
  client: {
    address?: string | null;
    actividadPrincipal?: string | null;
    fechaInscripcion?: string | Date | null;
    numeroInscripcion?: string | null;
    accountingFramework?: 'rt54' | 'rt6' | null;
  };
}) {
  const qc = useQueryClient();
  const toDateInput = (v: string | Date | null | undefined): string => {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };
  const initial = () => ({
    address: client.address ?? '',
    actividadPrincipal: client.actividadPrincipal ?? '',
    fechaInscripcion: toDateInput(client.fechaInscripcion),
    numeroInscripcion: client.numeroInscripcion ?? '',
    accountingFramework: client.accountingFramework ?? 'rt54',
  });
  const [form, setForm] = useState(initial);
  useEffect(() => {
    setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    client.address,
    client.actividadPrincipal,
    client.fechaInscripcion,
    client.numeroInscripcion,
    client.accountingFramework,
  ]);

  const mut = useMutation({
    mutationFn: () =>
      updateClientFiscalData({
        data: {
          clientId,
          address: form.address,
          actividadPrincipal: form.actividadPrincipal,
          fechaInscripcion: form.fechaInscripcion || null,
          numeroInscripcion: form.numeroInscripcion,
          accountingFramework: form.accountingFramework,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      toast.success('Datos fiscales guardados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upd =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Datos para Estados Contables
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="fd-norma" className="text-xs">
              Norma contable aplicada
            </Label>
            <Select
              value={form.accountingFramework}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  accountingFramework: v as 'rt54' | 'rt6',
                }))
              }
            >
              <SelectTrigger id="fd-norma" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rt54">
                  RT 54 (T.O. RT 59) — entes pequeños
                </SelectItem>
                <SelectItem value="rt6">RT 6 — norma general</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define cómo se cita el ajuste por inflación en los Estados
              Contables. El cálculo es el mismo en las dos.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-actividad" className="text-xs">
              Actividad principal
            </Label>
            <Input
              id="fd-actividad"
              value={form.actividadPrincipal}
              onChange={upd('actividadPrincipal')}
              placeholder="Prestación de servicios de…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-domicilio" className="text-xs">
              Domicilio
            </Label>
            <Input
              id="fd-domicilio"
              value={form.address}
              onChange={upd('address')}
              placeholder="Av. Ejemplo 123, CABA"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-inscripcion" className="text-xs">
              Fecha de inscripción (Registro Público)
            </Label>
            <Input
              id="fd-inscripcion"
              type="date"
              value={form.fechaInscripcion}
              onChange={upd('fechaInscripcion')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fd-igj" className="text-xs">
              N° de inscripción IGJ
            </Label>
            <Input
              id="fd-igj"
              value={form.numeroInscripcion}
              onChange={upd('numeroInscripcion')}
              placeholder="1.704.378"
            />
          </div>
          <Button type="submit" size="sm" disabled={mut.isPending}>
            {mut.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ClientDetailView({
  clientId,
  representativeId,
}: ClientDetailProps) {
  const navigate = useNavigate();

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient({ data: { id: clientId } }),
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['clientStats', clientId],
    queryFn: () => getInvoiceStatsByProfile({ data: { profileId: clientId } }),
  });

  const { data: orgModules = [] } = useQuery({
    queryKey: ['orgModules'],
    queryFn: () => listOrgModules(),
  });
  const aiAgentEnabled =
    orgModules.find((m) => m.module === 'ai_agent')?.enabled ?? false;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline">Activo</Badge>;
      case 'inactive':
        return <Badge variant="outline">Inactivo</Badge>;
      case 'pending':
        return <Badge variant="outline">Pendiente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Map invoice type number to label
  const getInvoiceTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      '1': 'Factura A',
      '2': 'Nota de Débito A',
      '3': 'Nota de Crédito A',
      '4': 'Recibo A',
      '5': 'Nota de Venta al Contado A',
      '6': 'Factura B',
      '7': 'Nota de Débito B',
      '8': 'Nota de Crédito B',
      '9': 'Recibo B',
      '10': 'Nota de Venta al Contado B',
      '11': 'Factura C',
      '12': 'Nota de Débito C',
      '13': 'Nota de Crédito C',
      '15': 'Recibo C',
      '16': 'Nota de Venta al Contado C',
      '17': 'Liquidación',
      '18': 'Liquidación A',
      '19': 'Factura E',
      '20': 'Nota de Débito E',
      '21': 'Nota de Crédito E',
      '22': 'Factura – Crédito Fiscal',
      '34': 'Comprobante A del Sector Público',
      '35': 'Nota de Débito A del Sector Público',
      '36': 'Nota de Crédito A del Sector Público',
      '37': 'Recibo A del Sector Público',
      '38': 'Comprobante B del Sector Público',
      '39': 'Nota de Débito B del Sector Público',
      '40': 'Nota de Crédito B del Sector Público',
      '41': 'Recibo B del Sector Público',
      '51': 'Factura M',
      '52': 'Nota de Débito M',
      '53': 'Nota de Crédito M',
      '54': 'Recibo M',
      '81': 'Ticket Factura A',
      '82': 'Ticket Factura B',
      '83': 'Ticket',
      '110': 'Ticket Nota de Crédito',
      '201': 'Factura de Crédito Electrónica MiPyME A',
      '202': 'Nota de Débito Electrónica MiPyME A',
      '203': 'Nota de Crédito Electrónica MiPyME A',
      '206': 'Factura de Crédito Electrónica MiPyME B',
      '207': 'Nota de Débito Electrónica MiPyME B',
      '208': 'Nota de Crédito Electrónica MiPyME B',
      '211': 'Factura de Crédito Electrónica MiPyME C',
      '212': 'Nota de Débito Electrónica MiPyME C',
      '213': 'Nota de Crédito Electrónica MiPyME C',
    };

    return typeMap[type] || `Tipo ${type}`;
  };

  if (loadingClient) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Cargando cliente...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Cliente no encontrado</div>
      </div>
    );
  }

  const monthlyData = stats?.monthlyData || [];
  const typeDistribution = (stats?.typeDistribution || []).map((item: any) => ({
    ...item,
    typeLabel: getInvoiceTypeLabel(item.type),
  }));

  return (
    <div className="space-y-4 p-4 md:space-y-6 md:p-0 md:m-[3rem]">
      {aiAgentEnabled && (
        <CopilotReadableEntity
          description="Profile fiscal actualmente visible en pantalla"
          value={{
            id: client.id,
            name: client.name,
            identityNumber: client.identityNumber,
            representativeId: client.representativeId,
            status: client.status,
          }}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate({ to: `/clients/${representativeId}` })}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold truncate">{toTitleCase(client.name)}</h1>
        </div>
      </div>

      {/* Profile Information and Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Información del Perfil */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Información del Perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Número de Identidad
              </div>
              <div className="text-sm font-medium">
                {client.identityNumber || '-'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Tipo</div>
              <div className="text-sm">{client.identityType || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Teléfono</div>
              <div className="text-sm">{client.phone || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Email</div>
              <div className="text-sm">{client.email || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Dirección
              </div>
              <div className="text-sm">{client.address || '-'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Estado</div>
              <div>{getStatusBadge(client.status)}</div>
            </div>
          </CardContent>
        </Card>

        <FiscalDataCard clientId={clientId} client={client} />

        {/* Estadísticas Resumen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              Resumen Contable
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="text-sm text-muted-foreground">
                Cargando estadísticas...
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Total Facturas
                  </div>
                  <div className="text-2xl font-semibold">
                    {stats?.totalInvoices || 0}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Total Ventas
                  </div>
                  <div className="text-xl font-semibold">
                    {new Intl.NumberFormat('es-AR', {
                      style: 'currency',
                      currency: 'ARS',
                      minimumFractionDigits: 2,
                    }).format(stats?.totalOutbound || 0)}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="text-xs text-muted-foreground mb-1">
                    Total Compras
                  </div>
                  <div className="text-xl font-semibold">
                    {new Intl.NumberFormat('es-AR', {
                      style: 'currency',
                      currency: 'ARS',
                      minimumFractionDigits: 2,
                    }).format(stats?.totalInbound || 0)}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen de Saldo */}
        {!loadingStats && stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Resultado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Diferencia
                  </div>
                  <div
                    className={`text-2xl font-semibold ${
                      (stats?.totalOutbound || 0) -
                        (stats?.totalInbound || 0) >=
                      0
                        ? 'text-[var(--arca-ink)]'
                        : 'text-[var(--arca-ink)]'
                    }`}
                  >
                    {new Intl.NumberFormat('es-AR', {
                      style: 'currency',
                      currency: 'ARS',
                      minimumFractionDigits: 2,
                    }).format(
                      (stats?.totalOutbound || 0) - (stats?.totalInbound || 0)
                    )}
                  </div>
                </div>
                <div className="border-t pt-4">
                  <div className="text-xs text-muted-foreground">
                    Ventas - Compras
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts Section */}
      {!loadingStats &&
        stats &&
        (monthlyData.length > 0 || typeDistribution.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Monthly Evolution Chart */}
            {monthlyData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Evolución Mensual
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig}>
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="month" stroke="#6B7280" />
                      <YAxis stroke="#6B7280" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar dataKey="outbound" fill="#4B5563" name="Ventas" />
                      <Bar dataKey="inbound" fill="#9CA3AF" name="Compras" />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Type Distribution Chart */}
            {typeDistribution.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">
                    Distribución por Tipo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig}>
                    <PieChart>
                      <Pie
                        data={typeDistribution}
                        dataKey="amount"
                        nameKey="typeLabel"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={false}
                      >
                        {typeDistribution.map((_entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

      {/* Invoices Section */}
      <div className="pb-8">
        <InvoicesTable profileId={clientId} />
      </div>
    </div>
  );
}
