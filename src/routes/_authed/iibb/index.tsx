import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, MapPin } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/shared/page-header';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getClientesForIIBB } from '@/actions/client';
import {
  getClienteMultilateralResumen,
  getLiquidacionIibb,
  saveLiquidacionIibb,
} from '@/actions/comprobante';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/iibb/')({
  component: RouteComponent,
});

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
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

interface LiqRow {
  alicuota: number;
  saldoAFavor: number;
  percepcionesAgentes: number;
  percepcionesAduaneras: number;
  retencionesAgentes: number;
  retencionesBancarias: number;
}

const DEFAULT_LIQ: LiqRow = {
  alicuota: 0.01,
  saldoAFavor: 0,
  percepcionesAgentes: 0,
  percepcionesAduaneras: 0,
  retencionesAgentes: 0,
  retencionesBancarias: 0,
};

const inputCls =
  'w-[100px] rounded border border-[var(--arca-border)] bg-[var(--arca-surface)] px-1.5 py-0.5 text-right text-[12px] text-[var(--arca-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--arca-accent,#2563eb)] tabular-nums';

/** Cliente con régimen de IIBB que alimenta el selector. */
type ClienteIIBB = Awaited<ReturnType<typeof getClientesForIIBB>>[number];

/** Selector de empresa + periodo + tabla de desglose + liquidación IIBB por provincia. */
function IIBBDesglose({
  clients,
  emptyMessage,
}: {
  clients: ClienteIIBB[];
  emptyMessage: string;
}) {
  const now = new Date();
  const queryClient = useQueryClient();

  const [selectedRepId, setSelectedRepId] = useState('');
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const dateFrom = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const dateTo = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const periodo = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const { data: provinceSummary = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['iibb', 'summary', selectedRepId, dateFrom, dateTo],
    queryFn: () =>
      getClienteMultilateralResumen({
        data: { clienteId: selectedRepId, dateFrom, dateTo },
      }),
    enabled: !!selectedRepId,
  });

  const { data: liqData, isLoading: loadingLiq } = useQuery({
    queryKey: ['iibb', 'liq', selectedRepId, periodo],
    queryFn: () =>
      getLiquidacionIibb({ data: { clienteId: selectedRepId, periodo } }),
    enabled: !!selectedRepId,
  });

  // Local editable state keyed by provincia
  const [localLiq, setLocalLiq] = useState<Record<string, LiqRow>>({});
  const localLiqRef = useRef(localLiq);
  useEffect(() => {
    localLiqRef.current = localLiq;
  }, [localLiq]);

  // Sync server data → local state when it arrives or period changes
  useEffect(() => {
    if (!liqData) return;
    const next: Record<string, LiqRow> = {};
    for (const r of liqData.rows) {
      next[r.provincia] = {
        alicuota: r.alicuota,
        saldoAFavor: r.saldoAFavor,
        percepcionesAgentes: r.percepcionesAgentes,
        percepcionesAduaneras: r.percepcionesAduaneras,
        retencionesAgentes: r.retencionesAgentes,
        retencionesBancarias: r.retencionesBancarias,
      };
    }
    setLocalLiq(next);
  }, [liqData]);

  const saveMutation = useMutation({
    mutationFn: (vars: { provincia: string } & LiqRow) =>
      saveLiquidacionIibb({
        data: {
          clienteId: selectedRepId,
          periodo,
          provincia: vars.provincia,
          alicuota: vars.alicuota,
          saldoAFavor: vars.saldoAFavor,
          percepcionesAgentes: vars.percepcionesAgentes,
          percepcionesAduaneras: vars.percepcionesAduaneras,
          retencionesAgentes: vars.retencionesAgentes,
          retencionesBancarias: vars.retencionesBancarias,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['iibb', 'liq', selectedRepId, periodo],
      });
    },
  });

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );

  const handleChange = (
    provincia: string,
    field: keyof LiqRow,
    raw: string
  ) => {
    const value = parseFloat(raw) || 0;
    const current = localLiqRef.current[provincia] ?? { ...DEFAULT_LIQ };
    const updated = { ...current, [field]: value };
    setLocalLiq((prev) => ({ ...prev, [provincia]: updated }));

    if (debounceTimers.current[provincia])
      clearTimeout(debounceTimers.current[provincia]);
    debounceTimers.current[provincia] = setTimeout(() => {
      saveMutation.mutate({ provincia, ...localLiqRef.current[provincia] });
    }, 700);
  };

  const getLiq = (provincia: string): LiqRow => {
    if (localLiq[provincia]) return localLiq[provincia];
    // Usar carryOver como saldo a favor inicial si existe
    const carry = liqData?.carryOver?.[provincia] ?? 0;
    return { ...DEFAULT_LIQ, saldoAFavor: carry };
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const maxMonth = selectedYear === now.getFullYear() ? now.getMonth() : 11;
  const repOptions = clients.map((c) => ({
    value: c.id,
    label: `${c.razonSocial}${c.cuit ? ` (${c.cuit})` : ''}`,
  }));

  const rows = provinceSummary;
  const isLoading = loadingInvoices || loadingLiq;

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const prov = row.provincia ?? '';
        const liq = getLiq(prov);
        const base = Number(row.totalBase ?? 0);
        const impDet = base * liq.alicuota;
        const liquidacion =
          impDet -
          liq.saldoAFavor -
          liq.percepcionesAgentes -
          liq.percepcionesAduaneras -
          liq.retencionesAgentes -
          liq.retencionesBancarias;
        return {
          count: acc.count + (row.cantidad ?? 0),
          base: acc.base + base,
          impDet: acc.impDet + impDet,
          saldoAFavor: acc.saldoAFavor + liq.saldoAFavor,
          percepcionesAgentes:
            acc.percepcionesAgentes + liq.percepcionesAgentes,
          percepcionesAduaneras:
            acc.percepcionesAduaneras + liq.percepcionesAduaneras,
          retencionesAgentes: acc.retencionesAgentes + liq.retencionesAgentes,
          retencionesBancarias:
            acc.retencionesBancarias + liq.retencionesBancarias,
          liquidacion: acc.liquidacion + liquidacion,
        };
      },
      {
        count: 0,
        base: 0,
        impDet: 0,
        saldoAFavor: 0,
        percepcionesAgentes: 0,
        percepcionesAduaneras: 0,
        retencionesAgentes: 0,
        retencionesBancarias: 0,
        liquidacion: 0,
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, localLiq, liqData]);

  return (
    <div>
      {/* Selectors */}
      <div className="flex flex-wrap gap-3 mb-6">
        <SearchableSelect
          options={repOptions}
          value={selectedRepId}
          onValueChange={(v) => {
            setSelectedRepId(v);
            setLocalLiq({});
          }}
          placeholder="Seleccionar empresa..."
          width={320}
        />
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedMonth)}
            onValueChange={(v) => {
              setSelectedMonth(Number(v));
              setLocalLiq({});
            }}
          >
            <SelectTrigger className="w-[140px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: maxMonth + 1 }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  {MONTH_NAMES[i]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => {
              const y = Number(v);
              setSelectedYear(y);
              setLocalLiq({});
              if (y === now.getFullYear() && selectedMonth > now.getMonth()) {
                setSelectedMonth(now.getMonth());
              }
            }}
          >
            <SelectTrigger className="w-[100px] text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabla */}
      {!selectedRepId ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          {clients.length === 0
            ? emptyMessage
            : 'Seleccioná una empresa para ver el desglose por provincia.'}
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Sin comprobantes outbound para el período seleccionado.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--arca-border)',
            borderRadius: 8,
            overflowX: 'auto',
          }}
        >
          <table
            className="text-[12px]"
            style={{
              minWidth: 1100,
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--arca-border)',
                  background: 'var(--arca-surface-2)',
                }}
              >
                <th className="text-left px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Provincia
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Comp.
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Base imponible
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Alícuota %
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Imp. determinado
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Saldo a favor
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Perc. Agentes
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Perc. Aduaneras
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Ret. Agentes
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Ret. Bancarias
                </th>
                <th className="text-right px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap">
                  Liquidación
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const prov = row.provincia ?? '';
                const liq = getLiq(prov);
                const base = Number(row.totalBase ?? 0);
                const impDet = base * liq.alicuota;
                const liquidacion =
                  impDet -
                  liq.saldoAFavor -
                  liq.percepcionesAgentes -
                  liq.percepcionesAduaneras -
                  liq.retencionesAgentes -
                  liq.retencionesBancarias;

                return (
                  <tr
                    key={prov || '__sin__'}
                    style={{
                      borderTop:
                        i === 0 ? undefined : '1px solid var(--arca-border)',
                    }}
                  >
                    <td className="px-3 py-2 text-[var(--arca-ink)] whitespace-nowrap">
                      {prov || 'Capital Federal'}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--arca-ink-3)] tabular-nums">
                      {row.cantidad}
                    </td>
                    <td
                      className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                      style={{ fontFamily: 'var(--ff-mono)' }}
                    >
                      {formatARS(row.totalBase)}
                    </td>
                    {/* Alícuota editable — ingreso en % (ej. "1" = 1%) */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={(liq.alicuota * 100).toFixed(2)}
                        onChange={(e) =>
                          handleChange(
                            prov,
                            'alicuota',
                            String(parseFloat(e.target.value || '0') / 100)
                          )
                        }
                        className={inputCls}
                      />
                    </td>
                    <td
                      className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                      style={{ fontFamily: 'var(--ff-mono)' }}
                    >
                      {formatARS(impDet)}
                    </td>
                    {/* Saldo a favor editable */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={liq.saldoAFavor === 0 ? '' : liq.saldoAFavor}
                        placeholder="0,00"
                        onChange={(e) =>
                          handleChange(prov, 'saldoAFavor', e.target.value)
                        }
                        className={inputCls}
                      />
                    </td>
                    {/* Percepciones Agentes */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          liq.percepcionesAgentes === 0
                            ? ''
                            : liq.percepcionesAgentes
                        }
                        placeholder="0,00"
                        onChange={(e) =>
                          handleChange(
                            prov,
                            'percepcionesAgentes',
                            e.target.value
                          )
                        }
                        className={inputCls}
                      />
                    </td>
                    {/* Percepciones Aduaneras */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          liq.percepcionesAduaneras === 0
                            ? ''
                            : liq.percepcionesAduaneras
                        }
                        placeholder="0,00"
                        onChange={(e) =>
                          handleChange(
                            prov,
                            'percepcionesAduaneras',
                            e.target.value
                          )
                        }
                        className={inputCls}
                      />
                    </td>
                    {/* Retenciones Agentes */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          liq.retencionesAgentes === 0
                            ? ''
                            : liq.retencionesAgentes
                        }
                        placeholder="0,00"
                        onChange={(e) =>
                          handleChange(
                            prov,
                            'retencionesAgentes',
                            e.target.value
                          )
                        }
                        className={inputCls}
                      />
                    </td>
                    {/* Retenciones Bancarias */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          liq.retencionesBancarias === 0
                            ? ''
                            : liq.retencionesBancarias
                        }
                        placeholder="0,00"
                        onChange={(e) =>
                          handleChange(
                            prov,
                            'retencionesBancarias',
                            e.target.value
                          )
                        }
                        className={inputCls}
                      />
                    </td>
                    {/* Liquidación final */}
                    <td
                      className="px-3 py-2 text-right font-semibold tabular-nums"
                      style={{
                        fontFamily: 'var(--ff-mono)',
                        color:
                          liquidacion >= 0
                            ? 'var(--arca-ink)'
                            : 'var(--arca-green, #16a34a)',
                      }}
                    >
                      {formatARS(liquidacion)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: '2px solid var(--arca-border)',
                  background: 'var(--arca-surface-2)',
                }}
              >
                <td className="px-3 py-2 font-semibold text-[var(--arca-ink)]">
                  Total
                </td>
                <td className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums">
                  {totals.count}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.base)}
                </td>
                <td className="px-3 py-2" />
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.impDet)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.saldoAFavor)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.percepcionesAgentes)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.percepcionesAduaneras)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.retencionesAgentes)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={{ fontFamily: 'var(--ff-mono)' }}
                >
                  {formatARS(totals.retencionesBancarias)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold tabular-nums"
                  style={{
                    fontFamily: 'var(--ff-mono)',
                    color:
                      totals.liquidacion >= 0
                        ? 'var(--arca-ink)'
                        : 'var(--arca-green, #16a34a)',
                  }}
                >
                  {formatARS(totals.liquidacion)}
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
    queryFn: () => getClientesForIIBB(),
  });

  // `iibbRegimen` reemplazó a los dos booleanos regimenLocal/convenioMultilateral.
  const localClients = allClients.filter((c) => c.iibbRegimen === 'local');
  const multilateralClients = allClients.filter(
    (c) => c.iibbRegimen === 'convenio_multilateral'
  );

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader
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
