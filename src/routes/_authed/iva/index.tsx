import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Percent,
  Wallet,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared/page-header';
import {
  getIvaResumenRI,
  getMonotributistasFacturacion,
  getClientesSinClasificar,
  updateClienteCondicionIva,
} from '@/actions/iva';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_authed/iva/')({
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

const thCls =
  'px-3 py-2.5 font-semibold text-[var(--arca-ink-2)] whitespace-nowrap';
const monoStyle = { fontFamily: 'var(--ff-mono)' } as const;

/** Fila del resumen RI, tal cual la devuelve `getIvaResumenRI`. */
type RiRow = Awaited<ReturnType<typeof getIvaResumenRI>>[number];
/** Fila de monotributistas, tal cual la devuelve `getMonotributistasFacturacion`. */
type MonoRow = Awaited<ReturnType<typeof getMonotributistasFacturacion>>[number];
/** Valores del enum `condicion_iva` en BD (+ null = sin clasificar). */
type CondicionIva = RiRow['condicionIva'];

/** `date` de Drizzle llega como 'YYYY-MM-DD'; se muestra DD/MM/YYYY sin pasar por Date. */
function formatFechaISO(fecha: string | null): string {
  if (!fecha) return '—';
  const [yyyy, mm, dd] = fecha.slice(0, 10).split('-');
  return dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : fecha;
}

interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}
type SortGetters<T> = Record<string, (r: T) => string | number | null>;

function sortRows<T>(rows: T[], sort: SortState, getters: SortGetters<T>): T[] {
  const get = getters[sort.key];
  if (!get) return rows;
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulls siempre al final
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number')
      return (va - vb) * mul;
    return String(va).localeCompare(String(vb), 'es') * mul;
  });
}

function toggleSort(prev: SortState, key: string): SortState {
  if (prev.key === key)
    return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: 'asc' };
}

function SortableTh({
  label,
  colKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  colKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === colKey;
  return (
    <th
      className={cn(
        thCls,
        align === 'right' ? 'text-right' : 'text-left',
        'cursor-pointer select-none hover:text-[var(--arca-ink)]'
      )}
      onClick={() => onSort(colKey)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

/** Select inline para cambiar la condición fiscal de una empresa. */
function FiscalConditionSelect({
  clienteId,
  value,
}: {
  clienteId: string;
  value: CondicionIva;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (condicionIva: CondicionIva) =>
      updateClienteCondicionIva({ data: { clienteId, condicionIva } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['iva'] });
      toast.success('Condición fiscal actualizada');
    },
    onError: (e: Error) => toast.error(e.message || 'Error al actualizar'),
  });

  return (
    <Select
      value={value ?? 'none'}
      disabled={mutation.isPending}
      onValueChange={(v) =>
        mutation.mutate(v === 'none' ? null : (v as NonNullable<CondicionIva>))
      }
    >
      <SelectTrigger size="sm" className="w-[150px] text-[12px]">
        <SelectValue placeholder="Sin clasificar" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Sin clasificar</SelectItem>
        <SelectItem value="responsable_inscripto">Resp. Inscripto</SelectItem>
        <SelectItem value="monotributista">Monotributista</SelectItem>
        <SelectItem value="exento">Exento</SelectItem>
        <SelectItem value="no_alcanzado">No alcanzado</SelectItem>
      </SelectContent>
    </Select>
  );
}

/**
 * Estado de la declaración del período. En BD_IDEAL `iva_declaracion` ya no
 * guarda un flag de éxito del scrape: o existe la declaración o no hay datos.
 */
function EstadoBadge({ declaracionId }: { declaracionId: string | null }) {
  if (!declaracionId) {
    return (
      <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]">
        Sin datos
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-50 text-emerald-700">
      Presentada
    </span>
  );
}

/** Tab Responsable Inscripto: resumen de posición IVA por empresa para un período. */
function IvaResumenRI() {
  const now = new Date();
  // Default: mes anterior (el período IVA presentado más reciente)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selectedYear, setSelectedYear] = useState(prev.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(prev.getMonth());

  const periodo = `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['iva', 'ri', periodo],
    queryFn: () => getIvaResumenRI({ data: { periodo } }),
  });

  const [sort, setSort] = useState<SortState>({ key: 'empresa', dir: 'asc' });
  const onSort = (key: string) => setSort((prev) => toggleSort(prev, key));

  const num = (v: string | null) => (v == null ? null : Number(v));
  const riGetters: SortGetters<RiRow> = {
    empresa: (r) => r.razonSocial,
    debito: (r) => num(r.debitoFiscal),
    credito: (r) => num(r.creditoFiscal),
    saldoTecnico: (r) => num(r.saldoTecnicoFavor),
    saldoLibre: (r) => num(r.saldoLibreDisponibilidadFavor),
    retPerc: (r) => num(r.retencionesPercepcionesPeriodo),
    // `presentadaAt` ya viene como 'YYYY-MM-DD': ordena cronológicamente tal cual.
    presentacion: (r) => r.presentadaAt,
    estado: (r) => (r.declaracionId ? 1 : 0),
  };
  const sortedRows = useMemo(
    () => sortRows(rows, sort, riGetters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort]
  );

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const maxMonth = selectedYear === now.getFullYear() ? now.getMonth() : 11;

  const totals = rows.reduce(
    (acc, r) => ({
      debito: acc.debito + Number(r.debitoFiscal ?? 0),
      credito: acc.credito + Number(r.creditoFiscal ?? 0),
      saldoTecnico: acc.saldoTecnico + Number(r.saldoTecnicoFavor ?? 0),
      saldoLibre:
        acc.saldoLibre + Number(r.saldoLibreDisponibilidadFavor ?? 0),
      retPerc: acc.retPerc + Number(r.retencionesPercepcionesPeriodo ?? 0),
    }),
    { debito: 0, credito: 0, saldoTecnico: 0, saldoLibre: 0, retPerc: 0 }
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Select
          value={String(selectedMonth)}
          onValueChange={(v) => setSelectedMonth(Number(v))}
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

      {isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          No hay empresas clasificadas como Responsable Inscripto. Asignales una
          condición fiscal desde el bloque &ldquo;Sin clasificar&rdquo;.
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
                <SortableTh
                  label="Empresa"
                  colKey="empresa"
                  sort={sort}
                  onSort={onSort}
                />
                <th className={cn(thCls, 'text-left')}>Condición</th>
                <SortableTh
                  label="Débito fiscal"
                  colKey="debito"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Crédito fiscal"
                  colKey="credito"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Saldo técnico a favor"
                  colKey="saldoTecnico"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Saldo libre disp."
                  colKey="saldoLibre"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Ret./Perc. período"
                  colKey="retPerc"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Presentación"
                  colKey="presentacion"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Estado"
                  colKey="estado"
                  sort={sort}
                  onSort={onSort}
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <tr
                  key={r.clienteId}
                  style={{
                    borderTop:
                      i === 0 ? undefined : '1px solid var(--arca-border)',
                  }}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-[var(--arca-ink)]">
                      {r.razonSocial}
                    </div>
                    <div className="text-[11px] text-[var(--arca-ink-3)] tabular-nums">
                      {r.cuit}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <FiscalConditionSelect
                      clienteId={r.clienteId}
                      value={r.condicionIva}
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.debitoFiscal)}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.creditoFiscal)}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-medium tabular-nums"
                    style={{
                      ...monoStyle,
                      color:
                        Number(r.saldoTecnicoFavor ?? 0) > 0
                          ? 'var(--arca-green, #16a34a)'
                          : 'var(--arca-ink)',
                    }}
                  >
                    {formatARS(r.saldoTecnicoFavor)}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.saldoLibreDisponibilidadFavor)}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.retencionesPercepcionesPeriodo)}
                  </td>
                  <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap">
                    {formatFechaISO(r.presentadaAt)}
                  </td>
                  <td className="px-3 py-2">
                    <EstadoBadge declaracionId={r.declaracionId} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: '2px solid var(--arca-border)',
                  background: 'var(--arca-surface-2)',
                }}
              >
                <td className="px-3 py-2 font-semibold text-[var(--arca-ink)]">
                  Total ({rows.length})
                </td>
                <td className="px-3 py-2" />
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(totals.debito)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(totals.credito)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(totals.saldoTecnico)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(totals.saldoLibre)}
                </td>
                <td
                  className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(totals.retPerc)}
                </td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** Tab Monotributista: facturación emitida acumulada últimos 12 meses por empresa. */
function MonotributistasTab() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['iva', 'monotributo'],
    queryFn: () => getMonotributistasFacturacion(),
  });

  const [sort, setSort] = useState<SortState>({
    key: 'facturacion',
    dir: 'desc',
  });
  const onSort = (key: string) => setSort((prev) => toggleSort(prev, key));

  const monoGetters: SortGetters<MonoRow> = {
    empresa: (r) => r.razonSocial,
    representante: (r) => r.credenciales,
    comprobantes: (r) => r.comprobanteCount,
    ultimaFactura: (r) => r.ultimoComprobante,
    facturacion: (r) => Number(r.facturacion12m),
  };
  const sortedRows = useMemo(
    () => sortRows(rows, sort, monoGetters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort]
  );

  return (
    <div>
      <p className="text-[12px] text-[var(--arca-ink-3)] mb-4">
        Facturación emitida de los últimos 12 meses (desde comprobantes
        cargados; las notas de crédito restan). Útil para monitorear límites de
        categoría.
      </p>

      {isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          No hay empresas clasificadas como monotributistas.
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
            style={{ minWidth: 800, width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--arca-border)',
                  background: 'var(--arca-surface-2)',
                }}
              >
                <SortableTh
                  label="Empresa"
                  colKey="empresa"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Login AFIP"
                  colKey="representante"
                  sort={sort}
                  onSort={onSort}
                />
                <th className={cn(thCls, 'text-left')}>Condición</th>
                <SortableTh
                  label="Comprobantes (12m)"
                  colKey="comprobantes"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Última factura"
                  colKey="ultimaFactura"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Facturación 12 meses"
                  colKey="facturacion"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => (
                <tr
                  key={r.clienteId}
                  style={{
                    borderTop:
                      i === 0 ? undefined : '1px solid var(--arca-border)',
                  }}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-[var(--arca-ink)]">
                      {r.razonSocial}
                    </div>
                    <div className="text-[11px] text-[var(--arca-ink-3)] tabular-nums">
                      {r.cuit}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap">
                    {r.credenciales ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <FiscalConditionSelect
                      clienteId={r.clienteId}
                      value={r.condicionIva}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--arca-ink-3)] tabular-nums">
                    {r.comprobanteCount}
                  </td>
                  <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap tabular-nums">
                    {r.ultimoComprobante
                      ? r.ultimoComprobante.slice(0, 10)
                      : '—'}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-semibold text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.facturacion12m)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Bloque de empresas sin condición fiscal asignada. */
function SinClasificarBlock() {
  const { data: rows = [] } = useQuery({
    queryKey: ['iva', 'sin-clasificar'],
    queryFn: () => getClientesSinClasificar(),
  });

  if (rows.length === 0) return null;

  return (
    <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50/40 p-4">
      <div className="text-[13px] font-semibold text-[var(--arca-ink)] mb-3">
        {rows.length} {rows.length === 1 ? 'empresa' : 'empresas'} sin condición
        fiscal asignada
      </div>
      <div
        style={{
          border: '1px solid var(--arca-border)',
          borderRadius: 8,
          overflowX: 'auto',
          background: 'var(--arca-surface)',
        }}
      >
        <table
          className="text-[12px]"
          style={{ width: '100%', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--arca-border)',
                background: 'var(--arca-surface-2)',
              }}
            >
              <th className={cn(thCls, 'text-left')}>Empresa</th>
              <th className={cn(thCls, 'text-left')}>CUIT</th>
              <th className={cn(thCls, 'text-left')}>Login AFIP</th>
              <th className={cn(thCls, 'text-left')}>Condición</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.clienteId}
                style={{
                  borderTop:
                    i === 0 ? undefined : '1px solid var(--arca-border)',
                }}
              >
                <td className="px-3 py-2 text-[var(--arca-ink)] whitespace-nowrap">
                  {r.razonSocial}
                </td>
                <td className="px-3 py-2 text-[var(--arca-ink-3)] tabular-nums whitespace-nowrap">
                  {r.cuit}
                </td>
                <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap">
                  {r.credenciales ?? '—'}
                </td>
                <td className="px-3 py-2">
                  <FiscalConditionSelect clienteId={r.clienteId} value={null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <PageHeader
        title="IVA"
        subtitle="Posición mensual de IVA por empresa y monitoreo de monotributo"
      />

      <Tabs defaultValue="ri">
        <div style={{ borderBottom: '1px solid var(--arca-border)' }}>
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            <TabsTrigger value="ri" className={tabCls()}>
              <Percent className="w-[13px] h-[13px]" />
              Responsable Inscripto
            </TabsTrigger>
            <TabsTrigger value="monotributo" className={tabCls()}>
              <Wallet className="w-[13px] h-[13px]" />
              Monotributista
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ri" className="mt-6">
          <IvaResumenRI />
        </TabsContent>

        <TabsContent value="monotributo" className="mt-6">
          <MonotributistasTab />
        </TabsContent>
      </Tabs>

      <SinClasificarBlock />
    </div>
  );
}
