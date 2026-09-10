import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Percent,
  Wallet,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Pencil,
  CircleHelp,
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
import { Input } from '@/components/ui/input';
import { Ayuda } from '@/components/shared/ayuda';
import {
  SelectorPeriodo,
  aPeriodo,
  dePeriodo,
} from '@/components/shared/selector-periodo';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import { getClientes } from '@/actions/client';
import {
  getIvaResumenRI,
  getMonotributistasFacturacion,
  getClientesOtros,
  updateClienteCondicionIva,
  updateIvaDeclaracionManual,
} from '@/actions/iva';
import { cn } from '@/lib/utils';

/**
 * `tab` en la URL para que se pueda enlazar la solapa: el panel de Inicio
 * manda acá desde la fila de un monotributista, y caer en Responsable
 * Inscripto —donde esa empresa no está— se lee como que el link falló.
 */
interface Busqueda {
  tab?: 'ri' | 'monotributo' | 'otras';
}

const TABS = ['ri', 'monotributo', 'otras'] as const;

export const Route = createFileRoute('/_authed/iva/')({
  validateSearch: (s: Record<string, unknown>): Busqueda => ({
    tab: TABS.includes(s.tab as (typeof TABS)[number])
      ? (s.tab as Busqueda['tab'])
      : undefined,
  }),
  component: RouteComponent,
});

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

// Sin color propio: el encabezado hereda el blanco de la fila navy.
const thCls = 'px-3 py-2.5 font-semibold whitespace-nowrap';
const monoStyle = { fontFamily: 'var(--ff-mono)' } as const;

/** Fila del resumen RI, tal cual la devuelve `getIvaResumenRI`. */
type RiRow = Awaited<ReturnType<typeof getIvaResumenRI>>[number];
/** Fila de monotributistas, tal cual la devuelve `getMonotributistasFacturacion`. */
type MonoRow = Awaited<
  ReturnType<typeof getMonotributistasFacturacion>
>[number];
/** Valores del enum `condicion_iva` en BD (+ null = sin clasificar). */
type CondicionIva = RiRow['condicionIva'];

/** `date` de Drizzle llega como 'YYYY-MM-DD'; se muestra DD/MM/YYYY sin pasar por Date. */
function formatFechaISO(fecha: string | null): string {
  if (!fecha) return '—';
  const [yyyy, mm, dd] = fecha.slice(0, 10).split('-');
  return dd && mm && yyyy ? `${dd}/${mm}/${yyyy}` : fecha;
}

/**
 * Normaliza para buscar: sin acentos, sin mayúsculas y sin los guiones del
 * CUIT, así "30-71234567-8", "30712345678" y "3071234567" matchean igual.
 */
function normalizar(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-\s.]/g, '');
}

/** Filtra por razón social o CUIT. Con la búsqueda vacía devuelve todo. */
function filtrarPorTexto<T extends { razonSocial: string; cuit: string }>(
  rows: T[],
  search: string
): T[] {
  const q = normalizar(search);
  if (!q) return rows;
  return rows.filter(
    (r) =>
      normalizar(r.razonSocial).includes(q) || normalizar(r.cuit).includes(q)
  );
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
        'cursor-pointer select-none hover:bg-white/10'
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

/**
 * "1.234,56" / "1234.56" / "1234" → número. Vacío → null (borra el dato).
 * Devuelve undefined si no se puede interpretar.
 */
function parsearImporte(s: string): number | null | undefined {
  const limpio = s.trim();
  if (!limpio) return null;
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : undefined;
}

type CampoDeclaracion =
  | 'saldoTecnicoFavor'
  | 'saldoLibreDisponibilidadFavor'
  | 'retencionesPercepcionesPeriodo';

/**
 * Celda de un importe que solo existe del lado de AFIP: si el scrapeo no lo
 * trajo, el estudio lo completa a mano acá (persiste en iva_declaracion con
 * fuente manual; la declaración real lo pisa cuando llega).
 */
function CeldaImporteEditable({
  clienteId,
  periodo,
  campo,
  valor,
}: {
  clienteId: string;
  periodo: string;
  campo: CampoDeclaracion;
  valor: string | null;
}) {
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  const queryClient = useQueryClient();

  const guardar = useMutation({
    mutationFn: (v: number | null) =>
      updateIvaDeclaracionManual({
        data: { clienteId, periodo, campo, valor: v },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['iva', 'ri'] });
      setEditando(false);
      toast.success('Importe guardado');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

  if (editando) {
    return (
      <Input
        autoFocus
        defaultValue={valor ?? ''}
        onChange={(e) => setBorrador(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditando(false);
          if (e.key === 'Enter') {
            const n = parsearImporte(borrador || (valor ?? ''));
            if (n === undefined) {
              toast.error('Importe inválido');
              return;
            }
            guardar.mutate(n);
          }
        }}
        onBlur={() => {
          if (!guardar.isPending) setEditando(false);
        }}
        disabled={guardar.isPending}
        className="h-7 w-[120px] text-right text-[12px] tabular-nums ml-auto"
        placeholder="0,00"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setBorrador(valor ?? '');
        setEditando(true);
      }}
      title="Editar (dato de ARCA faltante o a corregir)"
      className="group/celda inline-flex w-full items-center justify-end gap-1.5 cursor-pointer"
    >
      <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover/celda:opacity-60" />
      <span className="tabular-nums" style={monoStyle}>
        {formatARS(valor)}
      </span>
    </button>
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
 * Diferencia tolerada entre lo calculado y lo declarado, en pesos. AFIP redondea
 * comprobante por comprobante, así que unos centavos no son una discrepancia.
 */
const TOLERANCIA_ARS = 1;

/**
 * Estado de la fila: de dónde salen los números y si cierran contra AFIP.
 *
 * Las columnas siempre muestran el cálculo propio (el mismo de la ficha del
 * cliente). La declaración scrapeada, cuando existe, sirve de control: si el
 * débito o el crédito se apartan, la fila lo dice en vez de dejar pasar la
 * diferencia en silencio.
 */
function EstadoBadge({ row }: { row: RiRow }) {
  const cls = (extra: string) =>
    `inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${extra}`;

  if (!row.declaracionId) {
    return row.comprobantes === 0 ? (
      <span
        className={cls('bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)]')}
        title="No hay comprobantes cargados para este período ni declaración de ARCA."
      >
        Sin datos
      </span>
    ) : (
      <span
        className={cls('bg-sky-50 text-sky-700')}
        title={`Calculado sobre ${row.comprobantes} comprobante${
          row.comprobantes === 1 ? '' : 's'
        }. Todavía no se trajo la declaración de ARCA.`}
      >
        Calculado
      </span>
    );
  }

  const difDebito = row.calcDebitoFiscal - Number(row.debitoFiscal ?? 0);
  const difCredito = row.calcCreditoFiscal - Number(row.creditoFiscal ?? 0);
  const difiere =
    Math.abs(difDebito) > TOLERANCIA_ARS ||
    Math.abs(difCredito) > TOLERANCIA_ARS;

  if (!difiere) {
    return (
      <span className={cls('bg-emerald-50 text-emerald-700')}>
        Coincide ARCA
      </span>
    );
  }
  return (
    <span
      className={cls('bg-amber-50 text-amber-700')}
      title={[
        `Débito — calculado ${formatARS(row.calcDebitoFiscal)} · ARCA ${formatARS(row.debitoFiscal)}`,
        `Crédito — calculado ${formatARS(row.calcCreditoFiscal)} · ARCA ${formatARS(row.creditoFiscal)}`,
      ].join('\n')}
    >
      Difiere de ARCA
    </span>
  );
}

/** Tab Responsable Inscripto: resumen de posición IVA por empresa para un período. */
function IvaResumenRI({ search }: { search: string }) {
  const now = new Date();
  // Default: mes anterior (el período IVA presentado más reciente)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selectedYear, setSelectedYear] = useState(prev.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(prev.getMonth());

  const periodo = `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['iva', 'ri', periodo],
    queryFn: () => getIvaResumenRI({ data: { periodo } }),
  });
  const rows = useMemo(
    () => filtrarPorTexto(allRows, search),
    [allRows, search]
  );

  const [sort, setSort] = useState<SortState>({ key: 'empresa', dir: 'asc' });
  const onSort = (key: string) => setSort((prev) => toggleSort(prev, key));

  const num = (v: string | null) => (v == null ? null : Number(v));
  /**
   * Saldo final del período, con la misma fórmula que el cuadro F2051:
   * saldo técnico menos el saldo a favor del período anterior, el saldo de
   * libre disponibilidad y las retenciones y percepciones. Positivo es a pagar.
   *
   * El saldo técnico sale de los comprobantes cargados y los otros tres de la
   * declaración de AFIP, igual que las columnas de las que se derivan: si la
   * declaración todavía no se scrapeó, esos términos son cero y el saldo final
   * queda igual al técnico.
   */
  const saldoFinalDe = (r: RiRow) => {
    // `num` devuelve null cuando la declaración no está scrapeada; acá un dato
    // ausente vale cero, que es distinto de no poder calcular el saldo.
    const cero = (v: string | null) => Number(v ?? 0);
    return (
      r.calcSaldoTecnico -
      cero(r.saldoTecnicoFavor) -
      cero(r.saldoLibreDisponibilidadFavor) -
      cero(r.retencionesPercepcionesPeriodo)
    );
  };

  const riGetters: SortGetters<RiRow> = {
    empresa: (r) => r.razonSocial,
    cuit: (r) => r.cuit,
    debito: (r) => r.calcDebitoFiscal,
    credito: (r) => r.calcCreditoFiscal,
    saldoFavorAnt: (r) => num(r.saldoTecnicoFavor),
    saldoTecnico: (r) => r.calcSaldoTecnico,
    saldoLibre: (r) => num(r.saldoLibreDisponibilidadFavor),
    retPerc: (r) => num(r.retencionesPercepcionesPeriodo),
    saldoFinal: saldoFinalDe,
    // `presentadaAt` ya viene como 'YYYY-MM-DD': ordena cronológicamente tal cual.
    presentacion: (r) => r.presentadaAt,
    estado: (r) => (r.declaracionId ? 1 : 0),
  };
  const sortedRows = useMemo(
    () => sortRows(rows, sort, riGetters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort]
  );

  // Los totales siguen a lo que está filtrado en pantalla: si se busca una
  // empresa, el pie muestra su posición y no la de toda la cartera.
  const totals = rows.reduce(
    (acc, r) => ({
      debito: acc.debito + r.calcDebitoFiscal,
      credito: acc.credito + r.calcCreditoFiscal,
      saldoFavorAnt: acc.saldoFavorAnt + Number(r.saldoTecnicoFavor ?? 0),
      saldoTecnico: acc.saldoTecnico + r.calcSaldoTecnico,
      saldoLibre: acc.saldoLibre + Number(r.saldoLibreDisponibilidadFavor ?? 0),
      retPerc: acc.retPerc + Number(r.retencionesPercepcionesPeriodo ?? 0),
      saldoFinal: acc.saldoFinal + saldoFinalDe(r),
    }),
    {
      debito: 0,
      credito: 0,
      saldoFavorAnt: 0,
      saldoTecnico: 0,
      saldoLibre: 0,
      retPerc: 0,
      saldoFinal: 0,
    }
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <SelectorPeriodo
          periodo={aPeriodo(selectedYear, selectedMonth)}
          onPeriodo={(p) => {
            const { anio, mes } = dePeriodo(p);
            setSelectedYear(anio);
            setSelectedMonth(mes);
          }}
        />
        <Ayuda titulo="De dónde sale cada número" etiqueta="Cómo se calcula">
          <p>
            <strong>Débito, crédito y saldo técnico</strong> se calculan sobre
            los comprobantes cargados del período — los mismos números que la
            ficha de cada empresa. El saldo técnico es débito menos crédito:
            positivo es a pagar.
          </p>
          <p>
            <strong>Saldo libre disponibilidad</strong> y{' '}
            <strong>retenciones/percepciones</strong> vienen de la declaración
            de ARCA y no se pueden derivar de comprobantes. Mientras no se
            traigan, esas dos columnas muestran un guion y se pueden completar a
            mano: hacé click sobre el guion y escribí el importe. Cuando llega
            la declaración real, ese valor se reemplaza por el de ARCA.
          </p>
        </Ayuda>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          {allRows.length > 0
            ? 'La empresa elegida en el header no es Responsable Inscripto.'
            : 'No hay empresas clasificadas como Responsable Inscripto. Asignales una condición fiscal desde la tab “Otras empresas”.'}
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
              minWidth: 1260,
              width: '100%',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr className="bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] border-b border-[var(--arca-border)]">
                <SortableTh
                  label="Cliente"
                  colKey="empresa"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="CUIT"
                  colKey="cuit"
                  sort={sort}
                  onSort={onSort}
                />
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
                  label="Saldo a favor per. ant."
                  colKey="saldoFavorAnt"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Saldo técnico"
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
                  label="Total Ret y Perc"
                  colKey="retPerc"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Saldo final"
                  colKey="saldoFinal"
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
                    {r.credencialId ? (
                      <Link
                        to="/clients/$clientId"
                        params={{ clientId: r.credencialId }}
                        search={{ tab: 'iva', empresa: r.clienteId }}
                        className="text-[var(--arca-ink)] hover:underline"
                      >
                        {r.razonSocial}
                      </Link>
                    ) : (
                      <span className="text-[var(--arca-ink)]">
                        {r.razonSocial}
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-[var(--arca-ink-3)] tabular-nums whitespace-nowrap"
                    style={monoStyle}
                  >
                    {r.cuit}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.calcDebitoFiscal)}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink)] tabular-nums"
                    style={monoStyle}
                  >
                    {formatARS(r.calcCreditoFiscal)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--arca-ink)]">
                    <CeldaImporteEditable
                      clienteId={r.clienteId}
                      periodo={periodo}
                      campo="saldoTecnicoFavor"
                      valor={r.saldoTecnicoFavor}
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-right font-medium tabular-nums"
                    style={{
                      ...monoStyle,
                      color:
                        r.calcSaldoTecnico > 0
                          ? 'var(--arca-accent-neg-fg, var(--arca-accent-neg-fg))'
                          : r.calcSaldoTecnico < 0
                            ? 'var(--arca-green, var(--arca-accent-pos))'
                            : 'var(--arca-ink)',
                    }}
                    title={
                      r.calcSaldoTecnico > 0
                        ? 'A pagar (débito mayor que crédito)'
                        : r.calcSaldoTecnico < 0
                          ? 'A favor (crédito mayor que débito)'
                          : undefined
                    }
                  >
                    {formatARS(r.calcSaldoTecnico)}
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--arca-ink)]">
                    <CeldaImporteEditable
                      clienteId={r.clienteId}
                      periodo={periodo}
                      campo="saldoLibreDisponibilidadFavor"
                      valor={r.saldoLibreDisponibilidadFavor}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-[var(--arca-ink)]">
                    <CeldaImporteEditable
                      clienteId={r.clienteId}
                      periodo={periodo}
                      campo="retencionesPercepcionesPeriodo"
                      valor={r.retencionesPercepcionesPeriodo}
                    />
                  </td>
                  <td
                    className="px-3 py-2 text-right font-semibold tabular-nums"
                    style={{
                      ...monoStyle,
                      color:
                        saldoFinalDe(r) > 0
                          ? 'var(--arca-accent-neg-fg, var(--arca-accent-neg-fg))'
                          : saldoFinalDe(r) < 0
                            ? 'var(--arca-green, var(--arca-accent-pos))'
                            : 'var(--arca-ink)',
                    }}
                    title={
                      saldoFinalDe(r) > 0
                        ? 'A pagar'
                        : saldoFinalDe(r) < 0
                          ? 'A favor del contribuyente'
                          : undefined
                    }
                  >
                    {formatARS(String(saldoFinalDe(r)))}
                  </td>
                  <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap">
                    {formatFechaISO(r.presentadaAt)}
                  </td>
                  <td className="px-3 py-2">
                    <EstadoBadge row={r} />
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
                  className="px-3 py-2 text-right tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(String(totals.saldoFavorAnt))}
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
                <td
                  className="px-3 py-2 text-right font-semibold tabular-nums"
                  style={monoStyle}
                >
                  {formatARS(String(totals.saldoFinal))}
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

/** Tab Monotributista: facturación de los 12 meses que terminan en el período elegido. */
function MonotributistasTab({ search }: { search: string }) {
  const now = new Date();
  // Default: mes anterior, como en RI — los últimos 12 meses cerrados, que es
  // contra lo que se mira el tope de categoría.
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selectedYear, setSelectedYear] = useState(prev.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(prev.getMonth());
  const periodo = `${String(selectedMonth + 1).padStart(2, '0')}/${selectedYear}`;

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['iva', 'monotributo', periodo],
    queryFn: () => getMonotributistasFacturacion({ data: { periodo } }),
  });
  const rows = useMemo(
    () => filtrarPorTexto(allRows, search),
    [allRows, search]
  );

  const [sort, setSort] = useState<SortState>({
    key: 'facturacion',
    dir: 'desc',
  });
  const onSort = (key: string) => setSort((prev) => toggleSort(prev, key));

  const monoGetters: SortGetters<MonoRow> = {
    empresa: (r) => r.razonSocial,
    cuit: (r) => r.cuit,
    representante: (r) => r.credenciales,
    categoria: (r) => r.categoria,
    cuota: (r) => (r.cuotaMensual ? Number(r.cuotaMensual) : null),
    facturacion: (r) => Number(r.facturacion12m),
  };
  const sortedRows = useMemo(
    () => sortRows(rows, sort, monoGetters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort]
  );

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <SelectorPeriodo
          periodo={aPeriodo(selectedYear, selectedMonth)}
          onPeriodo={(p) => {
            const { anio, mes } = dePeriodo(p);
            setSelectedYear(anio);
            setSelectedMonth(mes);
          }}
        />
        <Ayuda titulo="Qué mide esta facturación" etiqueta="Qué mide">
          <p>
            Facturación emitida de los doce meses que terminan en el período
            elegido, tomada de los comprobantes cargados. Las notas de crédito
            restan.
          </p>
          <p>Sirve para vigilar el tope de la categoría de monotributo.</p>
        </Ayuda>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          Cargando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
          {allRows.length > 0
            ? 'La empresa elegida en el header no es monotributista.'
            : 'No hay empresas clasificadas como monotributistas.'}
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
            style={{ minWidth: 940, width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr className="bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] border-b border-[var(--arca-border)]">
                <SortableTh
                  label="Cliente"
                  colKey="empresa"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="CUIT"
                  colKey="cuit"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Login ARCA"
                  colKey="representante"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Categoría"
                  colKey="categoria"
                  sort={sort}
                  onSort={onSort}
                />
                <SortableTh
                  label="Cuota mensual"
                  colKey="cuota"
                  sort={sort}
                  onSort={onSort}
                  align="right"
                />
                <SortableTh
                  label="Monto facturación anual"
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
                  <td className="px-3 py-2 text-[var(--arca-ink)] whitespace-nowrap">
                    {r.razonSocial}
                  </td>
                  <td
                    className="px-3 py-2 text-[var(--arca-ink-3)] tabular-nums whitespace-nowrap"
                    style={monoStyle}
                  >
                    {r.cuit}
                  </td>
                  <td className="px-3 py-2 text-[var(--arca-ink-3)] whitespace-nowrap">
                    {r.credenciales ?? '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.categoria ? (
                      <span
                        className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-1.5 text-[11.5px] font-medium text-[var(--arca-ink)]"
                        style={monoStyle}
                      >
                        {r.categoria}
                      </span>
                    ) : (
                      // Sin dato: lo trae el scrapper de la constancia de AFIP,
                      // así que un guion acá significa «todavía no se leyó»,
                      // no «no tiene categoría».
                      <span className="text-[var(--arca-ink-4)]">—</span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-right text-[var(--arca-ink-2)] tabular-nums"
                    style={monoStyle}
                  >
                    {r.cuotaMensual ? formatARS(r.cuotaMensual) : '—'}
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

/**
 * Las empresas que no salen en ninguna de las dos tablas de liquidación.
 *
 * Son dos casos distintos y por eso van en dos bloques: las que nadie
 * clasificó todavía —que podrían ser cualquier cosa, y hasta que no se diga
 * qué son no se liquidan— y las exentas o no alcanzadas, que sí están
 * clasificadas y simplemente no tienen posición mensual de IVA.
 *
 * Antes esto era un bloque ámbar colgado abajo de las dos tabs, que aparecía
 * repetido en las dos y empujaba la tabla real fuera de la pantalla. Y las
 * exentas no estaban en ningún lado: marcarlas era hacerlas desaparecer.
 */
function OtrasEmpresasTab({ search }: { search: string }) {
  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ['iva', 'otras'],
    queryFn: () => getClientesOtros(),
  });
  const rows = useMemo(
    () => filtrarPorTexto(allRows, search),
    [allRows, search]
  );

  const sinClasificar = rows.filter((r) => r.condicionIva == null);
  const fueraDeIva = rows.filter((r) => r.condicionIva != null);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
        Cargando...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-[13px] text-[var(--arca-ink-3)]">
        {allRows.length === 0
          ? 'Todas las empresas están clasificadas y liquidan IVA.'
          : 'Ninguna empresa acá coincide con la que elegiste arriba.'}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sinClasificar.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-[var(--arca-ink)]">
            {sinClasificar.length}{' '}
            {sinClasificar.length === 1
              ? 'empresa sin condición asignada'
              : 'empresas sin condición asignada'}
          </h2>
          <p className="mt-1 mb-3 text-[12px] text-[var(--arca-ink-3)]">
            No aparecen en Responsable Inscripto ni en Monotributista hasta que
            alguien diga qué son. Elegí la condición en la última columna.
          </p>
          <TablaOtras rows={sinClasificar} />
        </section>
      )}

      {fueraDeIva.length > 0 && (
        <section>
          <h2 className="text-[13px] font-semibold text-[var(--arca-ink)]">
            {fueraDeIva.length}{' '}
            {fueraDeIva.length === 1
              ? 'empresa exenta o no alcanzada'
              : 'empresas exentas o no alcanzadas'}
          </h2>
          <p className="mt-1 mb-3 text-[12px] text-[var(--arca-ink-3)]">
            No liquidan IVA, así que no tienen posición mensual. Están acá para
            que no se pierdan de vista y para poder corregir la condición si
            quedó mal puesta.
          </p>
          <TablaOtras rows={fueraDeIva} />
        </section>
      )}
    </div>
  );
}

type FilaOtras = Awaited<ReturnType<typeof getClientesOtros>>[number];

function TablaOtras({ rows }: { rows: FilaOtras[] }) {
  return (
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
          <tr className="bg-[var(--arca-bg)] text-[var(--arca-ink-3)] uppercase tracking-[0.06em] border-b border-[var(--arca-border)]">
            <th className={cn(thCls, 'text-left')}>Cliente</th>
            <th className={cn(thCls, 'text-left')}>CUIT</th>
            <th className={cn(thCls, 'text-left')}>Login ARCA</th>
            <th className={cn(thCls, 'text-left')}>Condición</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.clienteId}
              style={{
                borderTop: i === 0 ? undefined : '1px solid var(--arca-border)',
              }}
            >
              <td className="px-3 py-2 text-[var(--arca-ink)] whitespace-nowrap">
                {r.razonSocial}
              </td>
              <td className="px-3 py-2 text-[var(--arca-ink-3)] tabular-nums [font-family:var(--ff-mono)] whitespace-nowrap">
                {r.cuit}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RouteComponent() {
  // El filtro es el selector global de empresa (mismo patrón que Sueldos y
  // Contabilidad): elegir una empresa acota los tres bloques a la vez, y la
  // elección viaja con vos a las demás vistas. Se filtra por CUIT —único por
  // empresa— reusando el filtro de texto que las tablas ya tenían. Si la
  // empresa elegida no está en una tab (una RI en Monotributista), esa tab
  // muestra su estado vacío: limitación conocida y aceptada.
  const [seleccionado] = useClienteSeleccionado();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab }: Busqueda = Route.useSearch();
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });
  const search = clientes.find((c) => c.id === seleccionado)?.cuit ?? '';

  // Sin clasificar es lo único accionable de la tab "Otras": el badge lo
  // cuenta para que se vea desde afuera que hay trabajo pendiente ahí.
  const { data: otras = [] } = useQuery({
    queryKey: ['iva', 'otras'],
    queryFn: () => getClientesOtros(),
  });
  const sinClasificar = otras.filter((r) => r.condicionIva == null).length;

  return (
    <PageShell>
      <PageHeader
        title="IVA"
        subtitle="Posición mensual de IVA por empresa y monitoreo de monotributo"
        actions={<SelectorClienteGlobal />}
      />

      <Tabs
        value={tab ?? 'ri'}
        onValueChange={(v) =>
          void navigate({
            search: { tab: v === 'ri' ? undefined : (v as Busqueda['tab']) },
            replace: true,
          })
        }
      >
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
            <TabsTrigger value="otras" className={tabCls()}>
              <CircleHelp className="w-[13px] h-[13px]" />
              Otras empresas
              {sinClasificar > 0 && (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-px text-[10.5px] font-semibold text-amber-800 tabular-nums">
                  {sinClasificar}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ri" className="mt-6">
          <IvaResumenRI search={search} />
        </TabsContent>

        <TabsContent value="monotributo" className="mt-6">
          <MonotributistasTab search={search} />
        </TabsContent>

        <TabsContent value="otras" className="mt-6">
          <OtrasEmpresasTab search={search} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
