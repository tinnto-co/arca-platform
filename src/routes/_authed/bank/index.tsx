import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Landmark,
  CheckCircle2,
  CircleDashed,
  Zap,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Plus,
  Upload,
  EyeOff,
  Eye,
  Loader2,
  Check,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { Paginador } from '@/components/shared/paginador';
import { fechaLocal } from '@/components/inicio/compartido';
import {
  ChevronChip,
  LimpiarFiltros,
  chipFiltro,
} from '@/components/shared/filtros';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Checkbox } from '@/components/ui/checkbox';
import { nombreDistinto } from '@/lib/cruce-conciliacion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import {
  guardarClienteSeleccionado,
  useClienteSeleccionado,
} from '@/lib/cliente-seleccionado';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  listCuentasConResumen,
  listMovimientos,
  autoConciliar,
  resolverSugerencia,
  listarSugerencias,
  confirmarSugerencias,
  buscarFacturasParaMovimiento,
  conciliarLote,
  volverASugerir,
  desconciliarMovimiento,
  createCuentaBancaria,
} from '@/actions/bank';
import {
  agregarMovimientoManual,
  excluirMovimiento,
  recategorizarMovimiento,
} from '@/actions/extractos';
import { ImportarExtractoDialog } from '@/components/banco/ImportarExtractoDialog';
import { AvisoExtractosEnCurso } from '@/components/banco/AvisoExtractosEnCurso';
import { BandejaConciliacion } from '@/components/banco/BandejaConciliacion';
import { ControlBancarioCard } from '@/components/banco/ControlBancarioCard';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
  type CategoriaMovimiento,
} from '@/lib/clasificar-movimiento';
import { toast } from 'sonner';

/**
 * La empresa y el mes van en la URL: recargar no pierde dónde estabas y el
 * link se puede compartir. `mes` es 'YYYY-MM'; sin él, la bandeja arranca en
 * el último mes con movimientos.
 */
const bankSearchSchema = z.object({
  clientId: z.string().uuid().optional(),
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  /** Filtros del registro de movimientos. */
  categoria: z.enum(CATEGORIAS_MOVIMIENTO).optional(),
  estado: z.enum(['conciliado', 'sugerido', 'sin_conciliar']).optional(),
  /** Rango de importe en pesos, sin importar si entró o salió. */
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  /** Cuánto abarca el registro: el mes de arriba (por defecto) o más. */
  rango: z.enum(['mes', '3m', '12m', 'todo']).optional(),
  /** La conciliación factura por factura, plegada salvo que se pida. */
  conciliacion: z.enum(['abierta']).optional(),
});
type BankSearch = z.infer<typeof bankSearchSchema>;

export const Route = createFileRoute('/_authed/bank/')({
  validateSearch: bankSearchSchema,
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled = modules.find((m) => m.module === 'banco')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: BankPage,
});

/** Los períodos que puede abarcar el registro. */
const RANGO_LABEL = {
  mes: 'El mes elegido arriba',
  '3m': 'Últimos 3 meses',
  '12m': 'Últimos 12 meses',
  todo: 'Todo el historial',
} as const;
type Rango = keyof typeof RANGO_LABEL;

/** 'YYYY-MM' → "enero de 2026". */
function nombreMes(mes: string): string {
  return fechaLocal(`${mes}-15`).toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

/** 'YYYY-MM' menos `n` meses. */
function mesMenos(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Desde y hasta ('YYYY-MM') del registro, a partir del mes de arriba. */
function periodoDelRango(
  mes: string | undefined,
  rango: Rango
): { periodo?: string; hasta?: string } {
  if (!mes || rango === 'todo') return {};
  if (rango === '3m') return { periodo: mesMenos(mes, 2), hasta: mes };
  if (rango === '12m') return { periodo: mesMenos(mes, 11), hasta: mes };
  return { periodo: mes };
}

/** Filas por página del registro de movimientos. */
const MOVIMIENTOS_POR_PAGINA = 50;

/* ─── Types ─── */
type MovimientoRow = Awaited<
  ReturnType<typeof listMovimientos>
>['filas'][number];
type CuentaConResumen = Awaited<
  ReturnType<typeof listCuentasConResumen>
>[number];

const TIPO_CUENTA: Record<string, string> = {
  caja_ahorro: 'Caja de ahorro',
  cuenta_corriente: 'Cuenta corriente',
  otra: 'Cuenta',
};

/* ─── Helpers ─── */
function fmtAmount(importe: string, direccion: string) {
  const n = parseFloat(importe);
  const sign = direccion === 'ingreso' ? '+' : '-';
  return `${sign}$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Sin centavos: en los totales grandes el ruido decimal no aporta. */
function fmtPesos(n: number) {
  return `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string | Date) {
  // Un `date` de la base (YYYY-MM-DD) se lee como fecha local: con
  // `new Date()` se toma como medianoche UTC y en Argentina se ve un día antes.
  const fecha =
    typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? fechaLocal(d)
      : new Date(d);
  return fecha.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Tooltip del sistema alrededor de un elemento (en vez de `title`). */
function ConAyuda({
  texto,
  children,
}: {
  texto: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-[12px] leading-snug">
        {texto}
      </TooltipContent>
    </Tooltip>
  );
}

const ESTADO_LABEL = {
  conciliado: 'Conciliados',
  sugerido: 'Sugeridos',
  sin_conciliar: 'Sin conciliar',
} as const;

/** "1234,5" o "1.234,50" → 1234.5. Vacío o inválido → undefined. */
function leerPesos(texto: string): number | undefined {
  const limpio = texto
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  if (limpio === '') return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Filtro por monto: "desde" y "hasta" en un popover, que se aplica al
 * confirmar y no con cada tecla (cada cambio es un pedido al servidor).
 */
function FiltroMonto({
  min,
  max,
  onAplicar,
}: {
  min: number | undefined;
  max: number | undefined;
  onAplicar: (rango: { min?: number; max?: number }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const activo = min != null || max != null;

  const etiqueta = !activo
    ? 'Monto'
    : min != null && max != null
      ? `Monto: ${fmtPesos(min)} – ${fmtPesos(max)}`
      : min != null
        ? `Monto: desde ${fmtPesos(min)}`
        : `Monto: hasta ${fmtPesos(max ?? 0)}`;

  const aplicar = () => {
    let a = leerPesos(desde);
    let b = leerPesos(hasta);
    // Si los cargaron al revés, se ordenan en vez de devolver nada.
    if (a != null && b != null && a > b) [a, b] = [b, a];
    onAplicar({ min: a, max: b });
    setAbierto(false);
  };

  return (
    <Popover
      open={abierto}
      onOpenChange={(v) => {
        // Al abrir, los campos muestran lo que está aplicado.
        if (v) {
          setDesde(min != null ? String(min).replace('.', ',') : '');
          setHasta(max != null ? String(max).replace('.', ',') : '');
        }
        setAbierto(v);
      }}
    >
      <PopoverTrigger className={chipFiltro(activo)}>
        {etiqueta}
        {!activo && <ChevronChip />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-[280px] flex-col gap-3 p-3"
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar();
          }}
        >
          <span className="text-[12px] text-[var(--arca-ink-3)]">
            Importe del movimiento, sin importar si entró o salió.
          </span>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1" htmlFor="filtro-monto-desde">
              <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                Desde $
              </span>
              <input
                id="filtro-monto-desde"
                inputMode="decimal"
                autoFocus
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                placeholder="0"
                className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-2 text-[12.5px] tabular-nums text-[var(--arca-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--arca-accent)]/30"
              />
            </label>
            <label className="flex flex-col gap-1" htmlFor="filtro-monto-hasta">
              <span className="text-[10.5px] font-semibold tracking-[0.06em] text-[var(--arca-ink-3)] uppercase">
                Hasta $
              </span>
              <input
                id="filtro-monto-hasta"
                inputMode="decimal"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                placeholder="Sin tope"
                className="h-8 rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-2 text-[12.5px] tabular-nums text-[var(--arca-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--arca-accent)]/30"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--arca-border)] pt-2">
            <button
              type="submit"
              className="rounded-[var(--arca-r-md)] bg-[var(--arca-accent)] px-3 py-1 text-[12px] font-medium text-white hover:bg-[var(--arca-accent-hover)]"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => {
                onAplicar({});
                setAbierto(false);
              }}
              className="rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] px-3 py-1 text-[12px] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]"
            >
              Limpiar
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** "Factura A 0002-00008198 · ANNONI PABLO ESTEBAN · $204.490 · 09/01/2026" */
function describirFactura(c: MovimientoRow['conciliaciones'][number]): string {
  const nro = `${String(c.comprobantePuntoVenta).padStart(4, '0')}-${String(c.comprobanteNumero).padStart(8, '0')}`;
  return [
    `${c.comprobanteTipo ?? 'Comprobante'} ${nro}`,
    c.comprobanteContraparte ?? 'sin contraparte',
    fmtPesos(Number(c.comprobanteTotal)),
    fmtDate(c.comprobanteFecha),
  ].join(' · ');
}

/** Desde qué seguridad una sugerencia viene marcada para confirmar. */
const UMBRAL_PRESELECCION = 0.9;

/**
 * Aprobación masiva de las sugerencias de «Auto-conciliar». Se revisa antes
 * de escribir: cada una muestra el movimiento, la factura que propone y el
 * %, y solo vienen marcadas las de 90% o más. Las de importe sin contraparte
 * (ventas a consumidor final, 50–60%) hay que marcarlas a propósito.
 */
function RevisarSugerencias({
  alcance,
}: {
  /** Empresa o cuenta, y el mes que se está mirando. */
  alcance:
    | { cuentaBancariaId: string; periodo?: string }
    | { clienteId: string; periodo?: string };
}) {
  const queryClient = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());

  const { data: sugerencias = [], isFetching } = useQuery({
    queryKey: ['sugerencias', alcance],
    queryFn: () => listarSugerencias({ data: alcance }),
    enabled: abierto,
  });

  // Al llegar la lista, se marcan las de alta seguridad (una vez por
  // apertura: después manda lo que la persona toque).
  const [preseleccionado, setPreseleccionado] = useState(false);
  if (abierto && !preseleccionado && sugerencias.length > 0) {
    setPreseleccionado(true);
    setElegidos(
      new Set(
        sugerencias
          .filter((s) => Number(s.confianza ?? 0) >= UMBRAL_PRESELECCION)
          .map((s) => s.movimientoId)
      )
    );
  }

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarSugerencias({ data: { movimientoIds: [...elegidos] } }),
    onSuccess: ({ confirmados, salteados }) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      void queryClient.invalidateQueries({ queryKey: ['sugerencias'] });
      toast.success(
        `${confirmados} cruce${confirmados === 1 ? '' : 's'} confirmado${confirmados === 1 ? '' : 's'}` +
          (salteados > 0
            ? ` · ${salteados} salteado${salteados === 1 ? '' : 's'}: la factura ya estaba conciliada`
            : '')
      );
      setAbierto(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudieron confirmar'),
  });

  const total = sugerencias
    .filter((s) => elegidos.has(s.movimientoId))
    .reduce((a, s) => a + Number(s.importe), 0);
  const marcar = (ids: string[]) => setElegidos(new Set(ids));

  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) setPreseleccionado(false);
      }}
    >
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 transition-opacity"
        >
          <Check className="w-3 h-3" strokeWidth={2.4} />
          Revisar sugeridos
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="!max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirmar sugerencias
            {sugerencias.length > 0 ? ` (${sugerencias.length})` : ''}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Cada fila une un movimiento del banco con la factura que lo
            explicaría. Vienen marcadas las de 90% o más; las de menos coinciden
            solo en el importe, así que conviene mirarlas una por una.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="text-[var(--arca-ink-3)]">Marcar:</span>
          <button
            type="button"
            className="rounded-[6px] border border-[var(--arca-border)] px-2 py-0.5 hover:bg-[var(--arca-surface-2)]"
            onClick={() => marcar(sugerencias.map((s) => s.movimientoId))}
          >
            Todas
          </button>
          <button
            type="button"
            className="rounded-[6px] border border-[var(--arca-border)] px-2 py-0.5 hover:bg-[var(--arca-surface-2)]"
            onClick={() =>
              marcar(
                sugerencias
                  .filter(
                    (s) => Number(s.confianza ?? 0) >= UMBRAL_PRESELECCION
                  )
                  .map((s) => s.movimientoId)
              )
            }
          >
            90% o más
          </button>
          <button
            type="button"
            className="rounded-[6px] border border-[var(--arca-border)] px-2 py-0.5 hover:bg-[var(--arca-surface-2)]"
            onClick={() => marcar([])}
          >
            Ninguna
          </button>
          {isFetching && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--arca-ink-4)]" />
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-[10px] border border-[var(--arca-border)]">
          {sugerencias.map((s) => {
            const pct = Math.round(Number(s.confianza ?? 0) * 100);
            const nro = `${String(s.comprobantePuntoVenta).padStart(4, '0')}-${String(s.comprobanteNumero).padStart(8, '0')}`;
            const id = `sugerencia-${s.movimientoId}`;
            return (
              <label
                key={s.movimientoId}
                htmlFor={id}
                className="grid cursor-pointer grid-cols-[auto_1fr_auto_1fr] items-center gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 text-[12px] first:border-t-0 hover:bg-[var(--arca-surface-2)]"
              >
                <Checkbox
                  id={id}
                  checked={elegidos.has(s.movimientoId)}
                  onCheckedChange={(v) => {
                    const nuevo = new Set(elegidos);
                    if (v === true) nuevo.add(s.movimientoId);
                    else nuevo.delete(s.movimientoId);
                    setElegidos(nuevo);
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--arca-ink)]">
                    {s.descripcion ?? 'Sin descripción'}
                  </span>
                  <span className="block text-[10.5px] text-[var(--arca-ink-4)]">
                    {fmtDate(s.fecha)} · {fmtAmount(s.importe, s.direccion)}
                    {s.contraparteTexto ? ` · ${s.contraparteTexto}` : ''}
                  </span>
                  {(s.contraparteId === null ||
                    s.contraparteId !== s.comprobanteContraparteId) &&
                    nombreDistinto(s.descripcion, s.comprobanteContraparte) && (
                      <span className="block text-[10.5px] font-medium text-[var(--arca-accent-warn-fg)]">
                        Ojo: el banco nombra a otra persona que la de la factura
                      </span>
                    )}
                </span>
                <span
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${
                    pct >= UMBRAL_PRESELECCION * 100
                      ? 'bg-[var(--arca-accent-pos-bg,oklch(0.95_0.05_145))] text-[oklch(0.45_0.14_145)]'
                      : 'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]'
                  }`}
                >
                  {pct}%
                </span>
                <span className="min-w-0 text-right">
                  <span className="block truncate font-medium text-[var(--arca-ink)]">
                    {s.comprobanteTipo ?? 'Comprobante'} {nro}
                  </span>
                  <span className="block truncate text-[10.5px] text-[var(--arca-ink-4)]">
                    {fmtDate(s.comprobanteFecha)} ·{' '}
                    {s.comprobanteContraparte ?? 'sin contraparte'} ·{' '}
                    {fmtPesos(Number(s.comprobanteTotal))}
                  </span>
                </span>
              </label>
            );
          })}
          {!isFetching && sugerencias.length === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
              No hay sugerencias pendientes.
            </p>
          )}
        </div>

        <p className="text-[11.5px] text-[var(--arca-ink-3)]">
          Se van a confirmar{' '}
          <span className="font-medium tabular-nums text-[var(--arca-ink)]">
            {elegidos.size}
          </span>{' '}
          de {sugerencias.length}, por{' '}
          <span className="font-medium tabular-nums text-[var(--arca-ink)]">
            {fmtPesos(total)}
          </span>
          . Se pueden deshacer una por una después.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={elegidos.size === 0 || confirmar.isPending}
            onClick={(e) => {
              e.preventDefault();
              confirmar.mutate();
            }}
          >
            {confirmar.isPending
              ? 'Confirmando…'
              : `Confirmar ${elegidos.size} cruce${elegidos.size === 1 ? '' : 's'}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Conciliar a mano: para un movimiento sin cruce, elegir la factura que lo
 * explica, de cualquier mes. Del lado que corresponde (cobro → emitidas,
 * pago → recibidas); sin búsqueda trae las de importe más parecido cerca de
 * la fecha. Confirma con las mismas reglas que la bandeja (`conciliarLote`):
 * una factura no se concilia dos veces.
 */
function ElegirFactura({
  tx,
  abierto,
  onAbiertoChange,
  descartada,
  actual,
}: {
  tx: MovimientoRow;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  /** La sugerencia que se descartó para este movimiento, si hubo una. */
  descartada?: MovimientoRow['conciliaciones'][number];
  /** La factura con la que ya está conciliado: se puede cambiar o deshacer. */
  actual?: MovimientoRow['conciliaciones'][number];
}) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');

  // Se busca cuando se deja de escribir, no con cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 350);
    return () => clearTimeout(t);
  }, [texto]);

  const { data: facturas = [], isFetching } = useQuery({
    queryKey: ['facturasParaMovimiento', tx.id, busqueda],
    queryFn: () =>
      buscarFacturasParaMovimiento({
        data: { movimientoId: tx.id, texto: busqueda || undefined },
      }),
    enabled: abierto,
    placeholderData: (previo) => previo,
  });

  const conciliar = useMutation({
    mutationFn: (comprobanteId: string) =>
      conciliarLote({
        data: { pares: [{ movimientoId: tx.id, comprobanteId }] },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      void queryClient.invalidateQueries({ queryKey: ['sugerencias'] });
      toast.success(actual ? 'Factura cambiada' : 'Movimiento conciliado');
      onAbiertoChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo conciliar'),
  });

  // Deshacer la conciliación: el movimiento vuelve a quedar sin factura y la
  // factura, libre para otro movimiento.
  const deshacer = useMutation({
    mutationFn: () => desconciliarMovimiento({ data: { movimientoId: tx.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      void queryClient.invalidateQueries({ queryKey: ['sugerencias'] });
      toast.success('Conciliación deshecha');
      onAbiertoChange(false);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo deshacer'),
  });

  // Si el descarte fue un error, se deshace desde acá.
  const reSugerir = useMutation({
    mutationFn: () => volverASugerir({ data: { movimientoId: tx.id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['sugerencias'] });
      toast.success('La factura volvió a quedar sugerida');
      onAbiertoChange(false);
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'No se pudo volver a sugerir'
      ),
  });

  const esCobro = tx.direccion === 'ingreso';
  const importe = parseFloat(tx.importe);

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="!max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {actual
              ? 'Cambiar o deshacer la conciliación'
              : 'Elegir la factura'}
          </DialogTitle>
          <DialogDescription>
            {fmtDate(tx.fecha)} · {tx.descripcion ?? 'Sin descripción'} ·{' '}
            <span className="font-medium tabular-nums text-[var(--arca-ink)]">
              {fmtAmount(tx.importe, tx.direccion)}
            </span>
            <br />
            {esCobro
              ? 'Es plata que entró: se busca entre las facturas que emitió la empresa.'
              : 'Es plata que salió: se busca entre las facturas que recibió la empresa.'}
          </DialogDescription>
        </DialogHeader>

        {actual && (
          <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[oklch(0.45_0.14_145)]/30 bg-[var(--arca-accent-pos-bg,oklch(0.95_0.05_145))] px-3 py-2 text-[12px] text-[oklch(0.35_0.1_145)]">
            <span className="min-w-0 flex-1">
              Hoy está conciliado con{' '}
              <span className="font-medium">{describirFactura(actual)}</span>.
              Elegí otra factura abajo para cambiarla, o deshacé la
              conciliación.
            </span>
            <button
              type="button"
              onClick={() => deshacer.mutate()}
              disabled={deshacer.isPending}
              className="shrink-0 rounded-[6px] border border-current px-2 py-0.5 text-[11.5px] font-medium hover:bg-[var(--arca-surface)] disabled:opacity-50"
            >
              Deshacer conciliación
            </button>
          </div>
        )}

        {descartada && (
          <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--arca-accent-warn)]/40 bg-[var(--arca-accent-warn-bg)] px-3 py-2 text-[12px] text-[var(--arca-accent-warn-fg)]">
            <span className="min-w-0 flex-1">
              Descartaste la sugerencia{' '}
              <span className="font-medium">
                {describirFactura(descartada)}
              </span>
              {descartada.revisadoAt
                ? ` el ${fmtDate(new Date(descartada.revisadoAt))}`
                : ''}
              . Si fue un error, podés volver a sugerirla o elegirla abajo.
            </span>
            <button
              type="button"
              onClick={() => reSugerir.mutate()}
              disabled={reSugerir.isPending}
              className="shrink-0 rounded-[6px] border border-current px-2 py-0.5 text-[11.5px] font-medium hover:bg-[var(--arca-surface)] disabled:opacity-50"
            >
              Volver a sugerirla
            </button>
          </div>
        )}

        <div className="relative">
          <input
            id={`buscar-factura-${tx.id}`}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por número, cliente o proveedor, CUIT o importe"
            className="h-9 w-full rounded-[var(--arca-r-md)] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 text-[13px] text-[var(--arca-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--arca-accent)]/30"
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-[var(--arca-ink-4)]" />
          )}
        </div>
        <p className="text-[11.5px] text-[var(--arca-ink-3)]">
          {busqueda
            ? `Resultados para "${busqueda}", de cualquier mes.`
            : 'Las de importe más parecido, de tres meses antes a un mes después del movimiento.'}
        </p>

        <div className="max-h-[50vh] overflow-y-auto rounded-[10px] border border-[var(--arca-border)]">
          {facturas.map((f) => {
            const nro = `${String(f.puntoVenta).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`;
            const total = Number(f.total);
            const mismoImporte = Math.abs(total - importe) < 1;
            const esLaActual = actual?.comprobanteId === f.id;
            const tomada = f.conciliadaConFecha !== null && !esLaActual;
            return (
              <div
                key={f.id}
                className={`flex items-center gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0 ${
                  tomada ? 'opacity-50' : 'hover:bg-[var(--arca-surface-2)]'
                }`}
              >
                <span className="w-[82px] shrink-0 font-mono text-[11.5px] text-[var(--arca-ink-3)]">
                  {fmtDate(f.fechaEmision)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-[var(--arca-ink)]">
                    {f.tipoNombre ?? 'Comprobante'} {nro}
                  </span>
                  <span className="block truncate text-[10.5px] text-[var(--arca-ink-4)]">
                    {f.contraparteNombre ?? 'Sin contraparte'}
                    {tomada
                      ? ` · ya conciliada con un movimiento del ${fmtDate(f.conciliadaConFecha!)}`
                      : ''}
                    {esLaActual && (
                      <span className="font-medium text-[oklch(0.45_0.14_145)]">
                        {' '}
                        · es la factura actual
                      </span>
                    )}
                    {descartada?.comprobanteId === f.id && (
                      <span className="text-[var(--arca-accent-warn-fg)]">
                        {' '}
                        · la descartaste, pero se puede elegir
                      </span>
                    )}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[13px] font-semibold tabular-nums ${
                    mismoImporte
                      ? 'text-[oklch(0.45_0.14_145)]'
                      : 'text-[var(--arca-ink)]'
                  }`}
                >
                  {fmtPesos(total)}
                </span>
                <button
                  type="button"
                  disabled={tomada || esLaActual || conciliar.isPending}
                  onClick={() => conciliar.mutate(f.id)}
                  className="shrink-0 rounded-[8px] bg-[var(--arca-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  Conciliar
                </button>
              </div>
            );
          })}
          {!isFetching && facturas.length === 0 && (
            <p className="px-4 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
              {busqueda
                ? 'No hay facturas que coincidan con la búsqueda.'
                : 'No hay facturas cerca de esta fecha. Probá buscar por número, nombre o importe.'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Transaction row ─── */
function TransactionItem({
  tx,
  mostrarCuenta = false,
}: {
  tx: MovimientoRow;
  /** Con el registro completo hay que decir de qué cuenta es cada fila. */
  mostrarCuenta?: boolean;
}) {
  const isIngreso = tx.direccion === 'ingreso';
  // Lo confirmado manda; si no hay, la sugerencia del cálculo (si la hay).
  const conciliacion =
    tx.conciliaciones.find((c) => c.estado === 'confirmada') ??
    tx.conciliaciones.find((c) => c.estado === 'sugerida');
  const confianza = conciliacion?.confianza
    ? Math.round(parseFloat(conciliacion.confianza) * 100)
    : null;
  // El banco nombra a otra persona que la de la factura: se sugiere igual
  // (quien cobra no siempre es quien factura), pero se avisa.
  const avisoOtroNombre =
    conciliacion?.estado === 'sugerida' &&
    (tx.contraparteId === null ||
      tx.contraparteId !== conciliacion.comprobanteContraparteId) &&
    nombreDistinto(tx.descripcion, conciliacion.comprobanteContraparte);
  // La última sugerencia descartada: se muestra para poder revertir un error.
  const descartada = conciliacion
    ? undefined
    : tx.conciliaciones
        .filter((c) => c.estado === 'rechazada')
        .sort((a, b) =>
          String(b.revisadoAt ?? '').localeCompare(String(a.revisadoAt ?? ''))
        )[0];
  const queryClient = useQueryClient();
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [eligiendoFactura, setEligiendoFactura] = useState(false);

  // Recategorizar a mano pisa lo del clasificador (queda marcado 'manual').
  const recategorizar = useMutation({
    mutationFn: (categoria: CategoriaMovimiento) =>
      recategorizarMovimiento({ data: { movimientoId: tx.id, categoria } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    },
    onError: () => toast.error('No se pudo cambiar la categoría'),
  });

  // Una sugerencia de «Auto-conciliar» no cuenta hasta que alguien la
  // confirma; descartarla evita que el cálculo la vuelva a proponer.
  const resolver = useMutation({
    mutationFn: (aceptar: boolean) =>
      resolverSugerencia({ data: { movimientoId: tx.id, aceptar } }),
    onSuccess: (_, aceptar) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      toast.success(aceptar ? 'Cruce confirmado' : 'Sugerencia descartada');
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'No se pudo resolver la sugerencia'
      ),
  });

  // Excluir saca el movimiento de la comparación Banco vs Facturación
  // (transferencias entre cuentas propias, ajustes) sin borrarlo.
  const excluir = useMutation({
    mutationFn: (excluido: boolean) =>
      excluirMovimiento({ data: { movimientoId: tx.id, excluido } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccountsResumen'] });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      setConfirmarExcluir(false);
    },
    onError: () => toast.error('No se pudo actualizar el movimiento'),
  });

  return (
    <div
      className={`px-5 py-3.5 flex items-center gap-4 hover:bg-[var(--arca-surface-2)] transition-colors duration-[120ms] ${
        tx.excluido ? 'opacity-45' : ''
      }`}
    >
      {/* Match indicator */}
      <div className="shrink-0">
        {tx.conciliado ? (
          <CheckCircle2
            className="w-4 h-4"
            style={{ color: 'oklch(0.55 0.12 145)' }}
            strokeWidth={2}
          />
        ) : (
          <CircleDashed
            className="w-4 h-4 text-[var(--arca-ink-3)]"
            strokeWidth={1.8}
          />
        )}
      </div>

      {/* Date */}
      <div className="w-[90px] shrink-0 text-[12px] text-[var(--arca-ink-3)] font-mono">
        {fmtDate(tx.fecha)}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[var(--arca-ink)] truncate">
          {tx.descripcion ?? '—'}
        </div>
        {/* Con quién fue: asignada por el CUIT de la descripción, o solo
            posible por el importe exacto de una factura. */}
        {tx.contraparteId ? (
          <ConAyuda texto="Con quién fue el movimiento. Sale del CUIT que el banco escribió en la descripción.">
            <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
              {tx.contraparteTexto}
            </div>
          </ConAyuda>
        ) : tx.contraparteSugerida ? (
          <ConAyuda
            texto={`Podría ser ${tx.contraparteSugerida.nombre ?? 'esta contraparte'}: ${tx.contraparteSugerida.comprobanteIds.length === 1 ? 'tiene una factura' : `tiene ${tx.contraparteSugerida.comprobanteIds.length} facturas`} con exactamente este importe. Es solo una pista: no se asigna sola.`}
          >
            <div className="text-[11.5px] italic text-[var(--arca-ink-4)] truncate">
              Posible: {tx.contraparteSugerida.nombre ?? 'sin nombre'} · importe
              exacto de una factura
            </div>
          </ConAyuda>
        ) : (
          tx.contraparteTexto && (
            <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
              {tx.contraparteTexto}
            </div>
          )
        )}
      </div>

      {/* De qué cuenta es, cuando se ven todas juntas */}
      {mostrarCuenta && (
        <div className="w-[120px] shrink-0 text-[11.5px] text-[var(--arca-ink-3)]">
          <div className="truncate">{tx.cuentaBanco}</div>
          <div className="truncate font-mono text-[10.5px] text-[var(--arca-ink-4)]">
            {tx.cuentaNumero ?? '—'}
          </div>
        </div>
      )}

      {/* Categoría (editable: el select pisa al clasificador) */}
      {/* 172px: entra "Comisiones bancarias", la categoría más larga. */}
      <div className="w-[172px] shrink-0">
        <Select
          value={tx.categoria ?? 'varios'}
          onValueChange={(v) => recategorizar.mutate(v as CategoriaMovimiento)}
          disabled={recategorizar.isPending}
        >
          <SelectTrigger className="h-6 w-full border-0 bg-transparent px-1.5 text-[11.5px] text-[var(--arca-ink-3)] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS_MOVIMIENTO.map((c) => (
              <SelectItem key={c} value={c} className="text-[12px]">
                {CATEGORIA_MOVIMIENTO_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Match. La columna tiene ancho fijo y siempre se dibuja —con o sin
          cruce— para que las filas no se corran respecto de los encabezados.
          Una sugerencia del cálculo se ve distinta y se resuelve acá mismo. */}
      <div className="w-[148px] shrink-0 flex items-center gap-1">
        {conciliacion?.estado === 'confirmada' ? (
          <ConAyuda
            texto={`${
              conciliacion.fuente === 'manual'
                ? `Conciliado a mano con ${describirFactura(conciliacion)}.`
                : `Conciliado con ${describirFactura(conciliacion)}. Lo sugirió el sistema (${confianza}% de seguridad) y alguien lo confirmó.`
            } Click para cambiar la factura o deshacer.`}
          >
            <button
              type="button"
              onClick={() => setEligiendoFactura(true)}
              className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10.5px] font-medium hover:ring-1 hover:ring-[oklch(0.45_0.14_145)] transition-shadow"
              style={{
                background: 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))',
                color: 'oklch(0.45 0.14 145)',
              }}
            >
              Conciliado
            </button>
          </ConAyuda>
        ) : conciliacion?.estado === 'sugerida' ? (
          <>
            <ConAyuda
              texto={
                <div className="flex flex-col gap-1.5">
                  <span>
                    Podría ser <b>{describirFactura(conciliacion)}</b>. No
                    cuenta como conciliado hasta que lo confirmes.
                  </span>
                  <span className="opacity-80">
                    Cómo se calcula la seguridad:
                    <br />· 50% porque el importe es igual
                    <br />· +40% si es el mismo cliente o proveedor
                    <br />· hasta +10% según lo cerca de las fechas (10% el
                    mismo día, hasta 5 días)
                    <br />· si la factura es de 6 a 30 días antes, no suma por
                    fecha y resta hasta 5% (solo se sugiere si es el mismo
                    cliente o proveedor, o la única factura posible)
                  </span>
                  <span className="font-semibold">Total: {confianza}%</span>
                  {avisoOtroNombre && (
                    <span className="rounded-[6px] bg-[var(--arca-accent-warn-bg)] px-2 py-1 text-[var(--arca-accent-warn-fg)]">
                      Ojo: el banco nombra a otra persona y la factura es de{' '}
                      {conciliacion.comprobanteContraparte}. Puede estar bien
                      (un administrador, un cónyuge), pero revisalo. Por eso
                      resta 20%.
                    </span>
                  )}
                </div>
              }
            >
              <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10.5px] font-medium bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]">
                Sugerido {confianza}%
              </span>
            </ConAyuda>
            <ConAyuda texto="Confirmar: esta factura explica el movimiento">
              <button
                type="button"
                onClick={() => resolver.mutate(true)}
                disabled={resolver.isPending}
                aria-label="Confirmar el cruce"
                className="shrink-0 rounded p-0.5 text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] hover:text-[oklch(0.45_0.14_145)] disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={2.2} />
              </button>
            </ConAyuda>
            <ConAyuda texto="Descartar: no es esta factura. No se vuelve a sugerir.">
              <button
                type="button"
                onClick={() => resolver.mutate(false)}
                disabled={resolver.isPending}
                aria-label="Descartar la sugerencia"
                className="shrink-0 rounded p-0.5 text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface-2)] hover:text-[var(--arca-accent-neg,oklch(0.55_0.18_25))] disabled:opacity-40"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.2} />
              </button>
            </ConAyuda>
          </>
        ) : tx.excluido ? (
          <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full border border-[var(--arca-border)] text-[10.5px] font-medium text-[var(--arca-ink-4)]">
            Excluido
          </span>
        ) : (
          <>
            {descartada ? (
              <ConAyuda
                texto={`Descartaste la sugerencia ${describirFactura(descartada)}. No se vuelve a sugerir sola. Si fue un error, abrí para volver a sugerirla o elegir cualquier factura.`}
              >
                <button
                  type="button"
                  onClick={() => setEligiendoFactura(true)}
                  className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full border border-dashed border-[var(--arca-accent-warn)] text-[10.5px] font-medium text-[var(--arca-accent-warn-fg)] hover:bg-[var(--arca-accent-warn-bg)] transition-colors"
                >
                  Descartado · elegir
                </button>
              </ConAyuda>
            ) : (
              <ConAyuda texto="Sin factura asignada. Elegí a mano la factura que explica este movimiento, de cualquier mes.">
                <button
                  type="button"
                  onClick={() => setEligiendoFactura(true)}
                  className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full border border-dashed border-[var(--arca-border-strong)] text-[10.5px] font-medium text-[var(--arca-ink-3)] hover:border-[var(--arca-accent)] hover:text-[var(--arca-accent)] transition-colors"
                >
                  Elegir factura
                </button>
              </ConAyuda>
            )}
          </>
        )}
        {/* Una sola ventana para elegir, cambiar o deshacer la factura. */}
        {eligiendoFactura && (
          <ElegirFactura
            tx={tx}
            abierto={eligiendoFactura}
            onAbiertoChange={setEligiendoFactura}
            descartada={descartada}
            actual={
              conciliacion?.estado === 'confirmada' ? conciliacion : undefined
            }
          />
        )}
      </div>

      {/* Amount */}
      <div
        className="w-[130px] text-right shrink-0 text-[13.5px] font-semibold tabular-nums"
        style={{
          color: isIngreso
            ? 'oklch(0.45 0.14 145)'
            : 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
        }}
      >
        {fmtAmount(tx.importe, tx.direccion)}
      </div>

      {/* Excluir de la conciliación. Volver a incluir no pregunta: es la
          dirección segura. Excluir sí, porque saca plata de la comparación. */}
      {tx.excluido ? (
        <ConAyuda texto="Excluido de la conciliación. Click para volver a incluirlo.">
          <button
            type="button"
            className="shrink-0 text-[var(--arca-ink-4)] hover:text-[var(--arca-ink)] transition-colors"
            aria-label="Volver a incluir en la conciliación"
            disabled={excluir.isPending}
            onClick={() => excluir.mutate(false)}
          >
            <EyeOff className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        </ConAyuda>
      ) : (
        <AlertDialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
          <ConAyuda texto="Excluir de la conciliación: para lo que no es una venta ni una compra, como una transferencia entre cuentas propias.">
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="shrink-0 text-[var(--arca-ink-4)] hover:text-[var(--arca-ink)] transition-colors"
                aria-label="Excluir de la conciliación"
                disabled={excluir.isPending}
              >
                <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </AlertDialogTrigger>
          </ConAyuda>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Excluir este movimiento de la conciliación?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="flex flex-col gap-2.5">
                  <span>
                    <span className="font-medium text-[var(--arca-ink)]">
                      {tx.descripcion ?? 'Sin descripción'}
                    </span>{' '}
                    por{' '}
                    <span className="font-medium tabular-nums text-[var(--arca-ink)]">
                      {fmtAmount(tx.importe, tx.direccion)}
                    </span>{' '}
                    del {fmtDate(tx.fecha)}.
                  </span>
                  <span>
                    Deja de contar en «Banco vs Facturación» y sale de la
                    bandeja de conciliación. Se usa para lo que pasó por el
                    banco pero no es una venta: transferencias entre cuentas
                    propias, préstamos, devoluciones.
                  </span>
                  <span>
                    El movimiento no se borra: queda atenuado en esta lista y se
                    puede volver a incluir con el mismo botón.
                  </span>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  excluir.mutate(true);
                }}
                disabled={excluir.isPending}
              >
                {excluir.isPending ? 'Excluyendo…' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/* ─── Movimiento manual (ajuste) ─── */
function ManualMovementForm({
  cuentaBancariaId,
  clienteId,
  onDone,
}: {
  cuentaBancariaId: string;
  clienteId: string;
  onDone: () => void;
}) {
  const [fecha, setFecha] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [importe, setImporte] = useState('');
  const [direccion, setDireccion] = useState<'ingreso' | 'egreso'>('ingreso');
  const queryClient = useQueryClient();

  const crear = useMutation({
    mutationFn: () =>
      agregarMovimientoManual({
        data: {
          cuentaBancariaId,
          fecha,
          descripcion,
          importe: Number(importe.replace(',', '.')),
          direccion,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccountsResumen'] });
      void queryClient.invalidateQueries({
        queryKey: ['bankSummary', clienteId],
      });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
      toast.success('Movimiento agregado');
      onDone();
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'No se pudo agregar el movimiento'
      ),
  });

  const importeNum = Number(importe.replace(',', '.'));

  return (
    <div className="px-5 py-3 flex flex-wrap items-end gap-2 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-[var(--arca-ink-3)]">Fecha *</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label className="text-[11px] text-[var(--arca-ink-3)]">
          Descripción *
        </label>
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Ej: Ajuste por diferencia de cierre"
          className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] text-[var(--arca-ink-3)]">
          Importe *
        </label>
        <input
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          inputMode="decimal"
          placeholder="0,00"
          className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-28 tabular-nums"
        />
      </div>
      <Select
        value={direccion}
        onValueChange={(v) => setDireccion(v as 'ingreso' | 'egreso')}
      >
        <SelectTrigger className="h-8 w-[110px] text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ingreso">Ingreso</SelectItem>
          <SelectItem value="egreso">Egreso</SelectItem>
        </SelectContent>
      </Select>
      <button
        onClick={() => crear.mutate()}
        disabled={
          !fecha || !descripcion.trim() || !(importeNum > 0) || crear.isPending
        }
        className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {crear.isPending ? 'Guardando...' : 'Agregar'}
      </button>
    </div>
  );
}

/* ─── Create account dialog ─── */
function CreateAccountForm({
  clienteId,
  onCreated,
}: {
  clienteId: string;
  onCreated: () => void;
}) {
  const [banco, setBanco] = useState('');
  const [numero, setNumero] = useState('');
  const [alias, setAlias] = useState('');
  const [cbu, setCbu] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      createCuentaBancaria({
        data: {
          clienteId,
          banco,
          numero: numero || undefined,
          alias: alias || undefined,
          cbu: cbu || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccountsResumen'] });
      toast.success('Cuenta bancaria creada');
      setBanco('');
      setNumero('');
      setAlias('');
      setCbu('');
      onCreated();
    },
    onError: () => toast.error('Error al crear cuenta'),
  });

  return (
    <div className="p-5 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
      <div className="text-[12.5px] font-semibold text-[var(--arca-ink)] mb-3">
        Nueva cuenta bancaria
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            Banco *
          </label>
          <input
            value={banco}
            onChange={(e) => setBanco(e.target.value)}
            placeholder="Ej: Banco Nación"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">
            N° de cuenta
          </label>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">Alias</label>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[var(--arca-ink-3)]">CBU</label>
          <input
            value={cbu}
            onChange={(e) => setCbu(e.target.value)}
            placeholder="Opcional"
            className="h-8 px-2.5 text-[12.5px] border border-[var(--arca-border)] rounded-[8px] bg-[var(--arca-surface)] text-[var(--arca-ink)] focus:outline-none w-44"
          />
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={!banco || createMutation.isPending}
          className="h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {createMutation.isPending ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

/* ─── Totales: lo primero que se lee ─── */
function TotalesDelPeriodo({
  ingresos,
  egresos,
  movimientos,
  conciliados,
  porcentaje,
  alcance,
}: {
  ingresos: number;
  egresos: number;
  movimientos: number;
  conciliados: number;
  porcentaje: number;
  /** Qué abarcan los números: una cuenta puntual o todas. */
  alcance: string;
}) {
  const neto = ingresos - egresos;
  return (
    <div className="mb-4 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-5 py-4">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--arca-ink-3)]">
            <TrendingUp
              className="w-3 h-3"
              style={{ color: 'oklch(0.55 0.12 145)' }}
              strokeWidth={2}
            />
            Entró
          </div>
          <div
            className="text-[26px] font-semibold tracking-tight tabular-nums"
            style={{
              fontFamily: 'var(--ff-display)',
              color: 'oklch(0.45 0.14 145)',
            }}
          >
            {fmtPesos(ingresos)}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--arca-ink-3)]">
            <TrendingDown
              className="w-3 h-3"
              style={{ color: 'var(--arca-accent-neg, oklch(0.55 0.18 25))' }}
              strokeWidth={2}
            />
            Salió
          </div>
          <div
            className="text-[26px] font-semibold tracking-tight tabular-nums"
            style={{
              fontFamily: 'var(--ff-display)',
              color: 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
            }}
          >
            {fmtPesos(egresos)}
          </div>
        </div>
        {/* El neto es la lectura que el contador hace de los dos anteriores. */}
        <div className="border-l border-[var(--arca-border)] pl-10">
          <div className="text-[11px] font-medium text-[var(--arca-ink-3)]">
            Resultado del período
          </div>
          <div
            className="text-[26px] font-semibold tracking-tight tabular-nums text-[var(--arca-ink)]"
            style={{ fontFamily: 'var(--ff-display)' }}
          >
            {neto >= 0 ? '+' : '−'}
            {fmtPesos(Math.abs(neto))}
          </div>
        </div>

        {/* La conciliación es el estado del trabajo, no el dato principal. */}
        <div className="ml-auto flex flex-col items-end gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          <span>
            {movimientos} movimiento{movimientos !== 1 ? 's' : ''} · {alcance}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2
              className="w-3 h-3"
              style={{ color: 'oklch(0.55 0.12 145)' }}
              strokeWidth={2}
            />
            {conciliados} conciliado{conciliados !== 1 ? 's' : ''} ({porcentaje}
            %)
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Las cuentas, visibles ─── */
function TarjetaCuenta({
  cuenta,
  activa,
  onClick,
}: {
  cuenta: CuentaConResumen;
  activa: boolean;
  onClick: () => void;
}) {
  const ingresos = parseFloat(cuenta.ingresos);
  const egresos = parseFloat(cuenta.egresos);
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-[12px] border px-4 py-3 text-left transition-colors ${
        activa
          ? 'border-[var(--arca-ink)] bg-[var(--arca-surface)]'
          : 'border-[var(--arca-border)] bg-[var(--arca-surface)] hover:bg-[var(--arca-surface-2)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <Landmark
          className="w-3.5 h-3.5 shrink-0 text-[var(--arca-ink-3)]"
          strokeWidth={2}
        />
        <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
          {cuenta.banco}
        </span>
        {activa && (
          <span className="ml-auto text-[10.5px] font-medium text-[var(--arca-ink-3)]">
            viendo
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-[var(--arca-ink-3)] font-mono">
        {cuenta.numero ?? 'sin número'}
        {cuenta.alias ? ` · ${cuenta.alias}` : ''}
      </div>
      <div className="text-[10.5px] text-[var(--arca-ink-4)]">
        {TIPO_CUENTA[cuenta.tipo ?? ''] ?? 'Cuenta'} · {cuenta.moneda}
        {cuenta.cbu ? ` · CBU ${cuenta.cbu}` : ''}
      </div>
      <div className="flex items-center gap-3 border-t border-[var(--arca-border)] pt-2 text-[11.5px] tabular-nums">
        <span style={{ color: 'oklch(0.45 0.14 145)' }}>
          +{fmtPesos(ingresos)}
        </span>
        <span style={{ color: 'var(--arca-accent-neg, oklch(0.55 0.18 25))' }}>
          −{fmtPesos(egresos)}
        </span>
      </div>
      <div className="text-[10.5px] text-[var(--arca-ink-4)]">
        {cuenta.movimientos} movimiento{cuenta.movimientos !== 1 ? 's' : ''}
        {cuenta.ultimoMovimiento
          ? ` · último ${fmtDate(cuenta.ultimoMovimiento)}`
          : ' · sin movimientos'}
        {cuenta.saldoUltimo
          ? ` · saldo ${fmtPesos(parseFloat(cuenta.saldoUltimo))}`
          : ''}
      </div>
    </button>
  );
}

/* ─── Page ─── */
function BankPage() {
  // La empresa es la global del header (store cliente-seleccionado): venir de
  // otra vista con una empresa elegida abre Banco ya parado en ella. La URL
  // manda si la trae —un link compartido abre en la empresa del link— y el
  // store la sigue, para que el selector del header muestre lo mismo.
  // Empresa, mes y filtros viven en la URL, pero cambiarlos es moverse
  // dentro de la misma pantalla: por eso cada `navigate` de acá lleva
  // `resetScroll: false`, para no saltar al principio de la página.
  const search: BankSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const [clienteGlobal] = useClienteSeleccionado();
  const clienteId = search.clientId ?? clienteGlobal ?? '';

  // URL → store. Sin `clientId` en la URL, se escribe el recordado.
  useEffect(() => {
    if (search.clientId) {
      if (search.clientId !== clienteGlobal)
        guardarClienteSeleccionado(search.clientId);
    } else if (clienteGlobal) {
      void navigate({
        resetScroll: false,
        search: (prev: BankSearch) => ({ ...prev, clientId: clienteGlobal }),
        replace: true,
      });
    }
    // Solo cuando cambia la URL: el cambio del store lo atiende el de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.clientId]);

  // Store → URL: elegir otra empresa en el header. Se compara contra el valor
  // anterior para no pisar la URL con el store viejo al montar. El mes se
  // suelta: la bandeja vuelve a buscar el último mes con movimientos de la
  // empresa nueva.
  const clienteGlobalPrevio = useRef(clienteGlobal);
  useEffect(() => {
    if (clienteGlobalPrevio.current === clienteGlobal) return;
    clienteGlobalPrevio.current = clienteGlobal;
    if ((clienteGlobal ?? undefined) === search.clientId) return;
    void navigate({
      resetScroll: false,
      search: (prev: BankSearch) => ({
        ...prev,
        clientId: clienteGlobal ?? undefined,
        mes: undefined,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteGlobal]);
  // Vacío = todas las cuentas. El registro arranca completo.
  const [accountId, setAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showManualMovement, setShowManualMovement] = useState(false);
  // El registro completo arranca plegado: la vista es la conciliación.
  const [showRegistro, setShowRegistro] = useState(false);
  // El importador se abre desde dos lados: el botón de Cuentas y la franja de
  // extractos en curso, que si no anuncia trabajo pendiente sin dar la puerta.
  const [importarAbierto, setImportarAbierto] = useState(false);
  const queryClient = useQueryClient();

  // Si la empresa cambia (desde acá o desde otra vista), el filtro de cuenta
  // deja de tener sentido. Ajuste durante el render, no en un efecto.
  const [prevCliente, setPrevCliente] = useState(clienteId);
  if (prevCliente !== clienteId) {
    setPrevCliente(clienteId);
    setAccountId('');
    setShowCreateAccount(false);
    setShowManualMovement(false);
  }

  /* Cuentas con su actividad */
  const { data: accounts = [] } = useQuery({
    queryKey: ['bankAccountsResumen', clienteId],
    queryFn: () => listCuentasConResumen({ data: { clienteId } }),
    enabled: !!clienteId,
  });

  // El registro se pagina en el servidor. Cambiar de empresa, de cuenta o de
  // mes vuelve a la primera página (ajuste durante el render, como el de
  // `prevCliente`).
  const [pagina, setPagina] = useState(1);
  const claveLista = `${clienteId}|${accountId}|${search.mes ?? ''}|${search.categoria ?? ''}|${search.estado ?? ''}|${search.min ?? ''}|${search.max ?? ''}|${search.rango ?? ''}`;
  const [prevLista, setPrevLista] = useState(claveLista);
  if (prevLista !== claveLista) {
    setPrevLista(claveLista);
    setPagina(1);
  }

  // El registro abarca el mes de arriba o un rango que termina en él.
  const rango: Rango = search.rango ?? 'mes';
  const periodoRegistro = periodoDelRango(search.mes, rango);

  /* Movimientos del período, de una cuenta o de todas, con los totales de
     todo lo filtrado (no solo de la página). */
  const { data: listado, isFetching: txsFetching } = useQuery({
    queryKey: [
      'bankTransactions',
      accountId || clienteId,
      accountId ? 'cuenta' : 'todas',
      search.mes,
      search.categoria,
      search.estado,
      search.min,
      search.max,
      rango,
      pagina,
    ],
    queryFn: () =>
      listMovimientos({
        data: {
          ...(accountId ? { cuentaBancariaId: accountId } : { clienteId }),
          ...periodoRegistro,
          categoria: search.categoria,
          estado: search.estado,
          importeMin: search.min,
          importeMax: search.max,
          pagina,
          porPagina: MOVIMIENTOS_POR_PAGINA,
        },
      }),
    // Espera al mes: la bandeja lo resuelve y lo escribe en la URL.
    enabled: !!clienteId && !!search.mes,
    placeholderData: (previo) => previo,
  });
  const transactions = listado?.filas ?? [];
  const totalesRegistro = listado?.totales;

  /* Auto-conciliación: de la cuenta elegida, o de toda la empresa */
  const autoMatchMutation = useMutation({
    mutationFn: () =>
      autoConciliar({
        data: accountId ? { cuentaBancariaId: accountId } : { clienteId },
      }),
    onSuccess: ({ sugeridos, reasignados, porMes }) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      void queryClient.invalidateQueries({ queryKey: ['sugerencias'] });
      // El cálculo abarca todos los meses: se dice cuántas son del mes que
      // se está mirando, para que el número coincida con la tabla.
      const enEsteMes = search.mes ? (porMes[search.mes] ?? 0) : sugeridos;
      const desglose =
        search.mes && enEsteMes !== sugeridos
          ? `: ${enEsteMes} en ${nombreMes(search.mes)} y ${sugeridos - enEsteMes} en otros meses`
          : '';
      // Solo propone: lo dice así para que nadie crea que ya quedó conciliado.
      toast.success(
        sugeridos === 0
          ? 'No se encontraron cruces para sugerir'
          : `${sugeridos} cruce${sugeridos !== 1 ? 's' : ''} sugerido${sugeridos !== 1 ? 's' : ''}${desglose}` +
              (reasignados > 0
                ? ` · ${reasignados} pasaron a un movimiento que les corresponde mejor`
                : '') +
              '. Revisalos y confirmalos en la tabla.'
      );
    },
    onError: () => toast.error('Error en la conciliación automática'),
  });

  const movimientosFiltrados = totalesRegistro?.movimientos ?? 0;
  const unmatchedCount = totalesRegistro?.sinConciliar ?? 0;
  const totalPaginas = Math.max(
    1,
    Math.ceil(movimientosFiltrados / MOVIMIENTOS_POR_PAGINA)
  );
  const cuentaElegida = accounts.find((a) => a.id === accountId);

  const mesLabel = !periodoRegistro.periodo
    ? 'todo el historial'
    : periodoRegistro.hasta
      ? `${nombreMes(periodoRegistro.periodo)} a ${nombreMes(periodoRegistro.hasta)}`
      : nombreMes(periodoRegistro.periodo);

  if (!clienteId) {
    return (
      <PageShell>
        <PageHeader
          title="Banco"
          subtitle="Conciliación bancaria"
          actions={<SelectorClienteGlobal />}
        />
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <Landmark className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">Seleccioná un cliente para comenzar</p>
          </div>
        </ArcaCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Banco"
        subtitle="Conciliación bancaria"
        actions={<SelectorClienteGlobal />}
      />

      {/* Lo que el servidor está leyendo ahora mismo. Va primero porque, si
          hay extractos en curso, eso cambia lo que se puede conciliar. */}
      {clienteId && (
        <AvisoExtractosEnCurso
          clienteId={clienteId}
          onAbrirCola={() => setImportarAbierto(true)}
        />
      )}

      {/* El control ES la vista (reunión del 23/9): si los totales cierran y,
          si no, por qué. Unir pago con factura pasó a ser una herramienta
          manual, así que la bandeja queda abajo y plegada. */}
      {accounts.length > 0 && clienteId && (
        <div className="mb-4">
          <ControlBancarioCard
            clienteId={clienteId}
            periodo={search.mes}
            onPeriodoChange={(mes) =>
              void navigate({
                resetScroll: false,
                search: (prev: BankSearch) => ({ ...prev, mes }),
              })
            }
          />
        </div>
      )}

      {accounts.length > 0 && (
        <div className="mb-5">
          <details open={search.conciliacion === 'abierta'}>
            <summary
              className="cursor-pointer list-none text-[11.5px] font-medium text-[var(--arca-ink-3)] hover:text-[var(--arca-ink)]"
              onClick={(e) => {
                e.preventDefault();
                void navigate({
                  resetScroll: false,
                  search: (prev: BankSearch) => ({
                    ...prev,
                    conciliacion:
                      prev.conciliacion === 'abierta' ? undefined : 'abierta',
                  }),
                });
              }}
            >
              {search.conciliacion === 'abierta' ? 'Ocultar' : 'Ver'} la
              conciliación factura por factura
            </summary>
            <div className="mt-3">
              <BandejaConciliacion
                clienteId={clienteId}
                periodo={search.mes}
                onPeriodoChange={(mes, { reemplazar } = {}) =>
                  void navigate({
                    resetScroll: false,
                    search: (prev: BankSearch) => ({ ...prev, mes }),
                    replace: reemplazar,
                  })
                }
              />
            </div>
          </details>
        </div>
      )}

      {/* Las cuentas: qué son y cuánto movieron. También filtran el registro. */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
          Cuentas
        </span>
        <div className="flex-1 h-px bg-[var(--arca-border)]" />
        <button
          onClick={() => setShowCreateAccount((v) => !v)}
          className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
        >
          <Plus className="w-3 h-3" strokeWidth={2} />
          Nueva cuenta
        </button>
        <ImportarExtractoDialog
          clienteId={clienteId}
          abierto={importarAbierto}
          onAbiertoChange={setImportarAbierto}
        >
          <button className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 transition-opacity">
            <Upload className="w-3.5 h-3.5" strokeWidth={2} />
            Importar extracto
          </button>
        </ImportarExtractoDialog>
      </div>

      {showCreateAccount && (
        <div className="mb-4 rounded-[12px] border border-[var(--arca-border)] overflow-hidden">
          <CreateAccountForm
            clienteId={clienteId}
            onCreated={() => setShowCreateAccount(false)}
          />
        </div>
      )}

      {accounts.length === 0 ? (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-10 text-[var(--arca-ink-3)]">
            <Landmark className="w-7 h-7 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">
              Esta empresa todavía no tiene cuentas bancarias
            </p>
            <p className="text-[12px] mt-1">
              Importá un extracto: la cuenta se crea con los datos del PDF
            </p>
          </div>
        </ArcaCard>
      ) : (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((c) => (
            <TarjetaCuenta
              key={c.id}
              cuenta={c}
              activa={accountId === c.id}
              onClick={() => {
                // Volver a clickear la cuenta activa muestra todas de nuevo.
                setAccountId((prev) => (prev === c.id ? '' : c.id));
                setShowManualMovement(false);
              }}
            />
          ))}
        </div>
      )}

      {/* Totales de caja y registro: el respaldo, no el foco. */}
      {accounts.length > 0 && (
        <div className="mb-3 mt-5 flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
            Registro y totales
          </span>
          <div className="flex-1 h-px bg-[var(--arca-border)]" />
          <button
            onClick={() => setShowRegistro((v) => !v)}
            className="text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
          >
            {showRegistro
              ? 'Ocultar'
              : `Ver los ${movimientosFiltrados} movimientos de ${mesLabel}`}
          </button>
        </div>
      )}

      {accounts.length > 0 && showRegistro && (
        <div className="mb-4">
          {/* Mismo filtro que la tabla: empresa, cuenta y mes. */}
          <TotalesDelPeriodo
            ingresos={totalesRegistro?.ingresos ?? 0}
            egresos={totalesRegistro?.egresos ?? 0}
            movimientos={movimientosFiltrados}
            conciliados={totalesRegistro?.conciliados ?? 0}
            porcentaje={
              movimientosFiltrados > 0
                ? Math.round(
                    ((totalesRegistro?.conciliados ?? 0) /
                      movimientosFiltrados) *
                      100
                  )
                : 0
            }
            alcance={`${mesLabel} · ${
              cuentaElegida
                ? `${cuentaElegida.banco} ${cuentaElegida.numero ?? ''}`.trim()
                : `${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''}`
            }`}
          />
        </div>
      )}

      {accounts.length > 0 && showRegistro && (
        <ArcaCard>
          <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b border-[var(--arca-border)]">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Movimientos
            </span>
            <span className="text-[11.5px] text-[var(--arca-ink-3)]">
              {cuentaElegida
                ? `${cuentaElegida.banco} ${cuentaElegida.numero ?? ''}`
                : 'todas las cuentas'}
              {' · '}
              {mesLabel} · {movimientosFiltrados} movimientos ·{' '}
              {totalesRegistro?.conciliados ?? 0} conciliados
              {(totalesRegistro?.sugeridos ?? 0) > 0 && (
                <span className="text-[var(--arca-accent-warn-fg)]">
                  {' · '}
                  {totalesRegistro?.sugeridos} sugerido
                  {totalesRegistro?.sugeridos === 1 ? '' : 's'} para revisar
                </span>
              )}
              {' · '}
              {unmatchedCount} sin conciliar
            </span>
            {accountId && (
              <ConAyuda texto="Ahora ves solo esta cuenta porque hiciste click en su tarjeta. Esto vuelve a mostrar todas las cuentas de la empresa.">
                <button
                  onClick={() => setAccountId('')}
                  className="text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
                >
                  ✕ Quitar filtro: ver todas las cuentas
                </button>
              </ConAyuda>
            )}
            {txsFetching && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--arca-ink-4)]" />
            )}
            <div className="ml-auto flex items-center gap-3">
              {(totalesRegistro?.sugeridos ?? 0) > 0 && (
                <RevisarSugerencias
                  alcance={
                    accountId
                      ? { cuentaBancariaId: accountId, ...periodoRegistro }
                      : { clienteId, ...periodoRegistro }
                  }
                />
              )}
              {accountId && (
                <button
                  onClick={() => setShowManualMovement((v) => !v)}
                  className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
                >
                  <Plus className="w-3 h-3" strokeWidth={2} />
                  Movimiento manual
                </button>
              )}
              <ConAyuda
                texto={`Busca, para cada movimiento ${accountId ? 'de esta cuenta' : 'de todas las cuentas de la empresa'} y de todos los meses, una factura con el mismo importe (cobros contra emitidas, pagos contra recibidas): hasta 5 días de diferencia, o hasta 30 días antes si es el mismo cliente o proveedor o la única factura posible. Si varios movimientos pueden ser la misma factura, se la da al que mejor corresponde: misma contraparte, después la fecha más cercana. Cada vez recalcula las sugerencias pendientes; lo confirmado y lo descartado no se toca.`}
              >
                <button
                  onClick={() => autoMatchMutation.mutate()}
                  disabled={autoMatchMutation.isPending}
                  className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] disabled:opacity-50 transition-colors"
                >
                  <Zap className="w-3 h-3" strokeWidth={2} />
                  {autoMatchMutation.isPending
                    ? 'Buscando cruces…'
                    : 'Auto-conciliar'}
                </button>
              </ConAyuda>
            </div>
          </div>

          {/* Filtros de la tabla. Los totales de arriba los siguen: con
              "Impuestos" elegido, "Salió" es lo que se fue en impuestos. */}
          <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-[var(--arca-border)]">
            <SearchableSelect
              size="sm"
              value={rango}
              onValueChange={(v) =>
                void navigate({
                  resetScroll: false,
                  search: (prev: BankSearch) => ({
                    ...prev,
                    rango: v === 'mes' ? undefined : (v as Rango),
                  }),
                })
              }
              placeholder="Período"
              searchPlaceholder="Buscar período..."
              width={190}
              options={(Object.keys(RANGO_LABEL) as Rango[]).map((r) => ({
                value: r,
                label: RANGO_LABEL[r],
              }))}
            />
            <SearchableSelect
              size="sm"
              value={search.categoria ?? 'all'}
              onValueChange={(v) =>
                void navigate({
                  resetScroll: false,
                  search: (prev: BankSearch) => ({
                    ...prev,
                    categoria:
                      v === 'all' ? undefined : (v as CategoriaMovimiento),
                  }),
                })
              }
              placeholder="Categoría"
              searchPlaceholder="Buscar categoría..."
              width={210}
              options={[
                { value: 'all', label: 'Todas las categorías' },
                ...CATEGORIAS_MOVIMIENTO.map((c) => ({
                  value: c,
                  label: CATEGORIA_MOVIMIENTO_LABEL[c],
                })),
              ]}
            />
            <SearchableSelect
              size="sm"
              value={search.estado ?? 'all'}
              onValueChange={(v) =>
                void navigate({
                  resetScroll: false,
                  search: (prev: BankSearch) => ({
                    ...prev,
                    estado:
                      v === 'all'
                        ? undefined
                        : (v as NonNullable<BankSearch['estado']>),
                  }),
                })
              }
              placeholder="Estado"
              searchPlaceholder="Buscar estado..."
              width={190}
              options={[
                { value: 'all', label: 'Todos los estados' },
                ...(
                  Object.keys(ESTADO_LABEL) as (keyof typeof ESTADO_LABEL)[]
                ).map((e) => ({ value: e, label: ESTADO_LABEL[e] })),
              ]}
            />
            <FiltroMonto
              min={search.min}
              max={search.max}
              onAplicar={({ min, max }) =>
                void navigate({
                  resetScroll: false,
                  search: (prev: BankSearch) => ({ ...prev, min, max }),
                })
              }
            />
            {(search.categoria ??
              search.estado ??
              search.min ??
              search.max ??
              search.rango) != null && (
              <LimpiarFiltros
                onLimpiar={() =>
                  void navigate({
                    resetScroll: false,
                    search: (prev: BankSearch) => ({
                      ...prev,
                      categoria: undefined,
                      estado: undefined,
                      min: undefined,
                      max: undefined,
                      rango: undefined,
                    }),
                  })
                }
              />
            )}
          </div>

          {showManualMovement && accountId && (
            <ManualMovementForm
              cuentaBancariaId={accountId}
              clienteId={clienteId}
              onDone={() => setShowManualMovement(false)}
            />
          )}

          {/* Encabezados */}
          <div className="px-5 py-2 flex items-center gap-4 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-[11px] font-semibold uppercase tracking-wide text-[var(--arca-ink-3)]">
            <div className="w-4 shrink-0" />
            <div className="w-[90px] shrink-0">Fecha</div>
            <div className="flex-1">Descripción / Contraparte</div>
            {!accountId && <div className="w-[120px] shrink-0">Cuenta</div>}
            <div className="w-[172px] shrink-0">Categoría</div>
            <div className="w-[148px] shrink-0">Match</div>
            <div className="w-[130px] shrink-0 text-right">Importe</div>
            <div className="w-[14px] shrink-0" />
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
              <ArrowLeftRight
                className="w-8 h-8 mb-2 opacity-40"
                strokeWidth={1.5}
              />
              <p className="text-[13px]">
                {accountId
                  ? 'Esta cuenta no tiene movimientos'
                  : 'Todavía no hay movimientos importados'}
              </p>
              <p className="text-[12px] mt-1">
                Importá el extracto del banco para empezar
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-[var(--arca-border)]">
                {transactions.map((tx) => (
                  <TransactionItem
                    key={tx.id}
                    tx={tx}
                    mostrarCuenta={!accountId}
                  />
                ))}
              </div>
              {totalPaginas > 1 && (
                <Paginador
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  onPagina={setPagina}
                  className="w-full min-w-0 border-t border-[var(--arca-border)] px-[18px] py-[11px]"
                />
              )}
            </>
          )}
        </ArcaCard>
      )}
    </PageShell>
  );
}
