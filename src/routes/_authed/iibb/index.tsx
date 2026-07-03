import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Globe, MapPin } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { getRepresentativesForIIBB } from '@/actions/client';
import { getClientMultilateralSummary } from '@/actions/invoice';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/iibb/')({
  component: RouteComponent,
});

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatARS(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

const tabCls = () =>
  cn(
    'relative h-auto flex-none px-[18px] py-[10px] text-[13px] font-medium rounded-[8px_8px_0_0] border whitespace-nowrap gap-[7px] cursor-pointer',
    'border-transparent text-[var(--arca-ink-3)] hover:bg-transparent hover:text-[var(--arca-ink)]',
    'data-[state=active]:bg-[var(--arca-surface)] data-[state=active]:border-[var(--arca-border)] data-[state=active]:[border-bottom-color:var(--arca-bg)] data-[state=active]:text-[var(--arca-ink)] data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:top-px'
  );

/** Selector de empresa + periodo + tabla de desglose por provincia. Reutilizado en ambas solapas. */
function IIBBDesglose({
  clients,
  emptyMessage,
}: {
  clients: {
    id: string;
    name: string | null;
    cuit: string | null;
    clients: { id: string; name: string | null; identityNumber: string | null }[];
  }[];
  emptyMessage: string;
}) {
  const now = new Date();

  const [selectedRepId, setSelectedRepId] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const selectedRep = clients.find((c) => c.id === selectedRepId);

  const profileOptions = useMemo(() => {
    if (!selectedRep) return [];
    return (selectedRep.clients ?? []).map((c) => ({
      value: c.id,
      label: c.name ?? c.identityNumber ?? c.id,
    }));
  }, [selectedRep]);

  const effectiveProfileId = selectedProfileId || profileOptions[0]?.value;

  const dateFrom = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const dateTo = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data: provinceSummary = [], isLoading } = useQuery({
    queryKey: ['iibb', 'summary', selectedRepId, effectiveProfileId, dateFrom, dateTo],
    queryFn: () =>
      getClientMultilateralSummary({
        data: {
          clientId: selectedRepId,
          profileId: effectiveProfileId,
          dateFrom,
          dateTo,
        },
      }),
    enabled: !!selectedRepId,
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const maxMonth = selectedYear === now.getFullYear() ? now.getMonth() : 11;

  const repOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.name}${c.cuit ? ` (${c.cuit})` : ''}`,
  }));

  const totals = useMemo(
    () =>
      (provinceSummary as any[]).reduce(
        (acc, row) => ({
          count: acc.count + (row.invoiceCount ?? 0),
          iva: acc.iva + Number(row.totalIVA ?? 0),
          base: acc.base + Number(row.totalTaxed ?? 0),
        }),
        { count: 0, iva: 0, base: 0 }
      ),
    [provinceSummary]
  );

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 mb-6">
        <SearchableSelect
          options={repOptions}
          value={selectedRepId}
          onValueChange={(v) => {
            setSelectedRepId(v);
            setSelectedProfileId('');
          }}
          placeholder="Seleccionar empresa..."
          width={320}
        />

        {profileOptions.length > 1 && (
          <SearchableSelect
            options={profileOptions}
            value={effectiveProfileId ?? ''}
            onValueChange={setSelectedProfileId}
            placeholder="Seleccionar perfil..."
            width={260}
          />
        )}

        <div className="flex items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="h-9 rounded-md border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2.5 text-[13px] text-[var(--arca-ink)] focus:outline-none"
          >
            {Array.from({ length: maxMonth + 1 }, (_, i) => (
              <option key={i} value={i}>
                {MONTH_NAMES[i]}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setSelectedYear(y);
              if (y === now.getFullYear() && selectedMonth > now.getMonth()) {
                setSelectedMonth(now.getMonth());
              }
            }}
            className="h-9 rounded-md border border-[var(--arca-border)] bg-[var(--arca-surface)] px-2.5 text-[13px] text-[var(--arca-ink)] focus:outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      {!selectedRepId ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          {clients.length === 0 ? emptyMessage : 'Seleccioná una empresa para ver el desglose por provincia.'}
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">Cargando...</div>
      ) : (provinceSummary as any[]).length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Sin comprobantes outbound para el período seleccionado.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--arca-border)', borderRadius: 8, overflow: 'hidden' }}>
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--arca-border)', background: 'var(--arca-surface-2)' }}>
                <th className="text-left px-4 py-2.5 font-semibold text-[var(--arca-ink-2)]">Provincia</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--arca-ink-2)]">Comprobantes</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--arca-ink-2)]">Base imponible</th>
                <th className="text-right px-4 py-2.5 font-semibold text-[var(--arca-ink-2)]">IVA</th>
              </tr>
            </thead>
            <tbody>
              {(provinceSummary as any[]).map((row, i) => (
                <tr
                  key={row.receiptProvince ?? '__sin__'}
                  style={{ borderTop: i === 0 ? undefined : '1px solid var(--arca-border)' }}
                >
                  <td className="px-4 py-2.5 text-[var(--arca-ink)]">{row.receiptProvince || 'Sin datos'}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--arca-ink-3)]">{row.invoiceCount}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--arca-ink)]" style={{ fontFamily: 'var(--ff-mono)' }}>
                    {formatARS(row.totalTaxed)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-[var(--arca-ink)]" style={{ fontFamily: 'var(--ff-mono)' }}>
                    {formatARS(row.totalIVA)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--arca-border)', background: 'var(--arca-surface-2)' }}>
                <td className="px-4 py-2.5 font-semibold text-[var(--arca-ink)]">Total</td>
                <td className="px-4 py-2.5 text-right font-semibold text-[var(--arca-ink)]">{totals.count}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-[var(--arca-ink)]" style={{ fontFamily: 'var(--ff-mono)' }}>
                  {formatARS(totals.base)}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-[var(--arca-ink)]" style={{ fontFamily: 'var(--ff-mono)' }}>
                  {formatARS(totals.iva)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function RouteComponent() {
  const { data: allClients = [] } = useQuery({
    queryKey: ['iibb', 'representatives'],
    queryFn: () => getRepresentativesForIIBB(),
  });

  const localClients = allClients.filter((c) => c.regimenLocal);
  const multilateralClients = allClients.filter((c) => c.convenioMultilateral);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader
        icon={Globe}
        title="IIBB / Convenio Multilateral"
        subtitle="Ingresos brutos por régimen local y convenio multilateral"
      />

      <Tabs defaultValue="local">
        <div style={{ borderBottom: '1px solid var(--arca-border)' }}>
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            <TabsTrigger value="local" className={tabCls()}>
              <MapPin className="w-[13px] h-[13px]" />
              Régimen Local
            </TabsTrigger>
            <TabsTrigger value="multilateral" className={tabCls()}>
              <Globe className="w-[13px] h-[13px]" />
              Convenio Multilateral
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="local" className="mt-6">
          <IIBBDesglose
            clients={localClients}
            emptyMessage="No hay clientes con régimen local configurado."
          />
        </TabsContent>

        <TabsContent value="multilateral" className="mt-6">
          <IIBBDesglose
            clients={multilateralClients}
            emptyMessage="No hay clientes con convenio multilateral configurado."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
