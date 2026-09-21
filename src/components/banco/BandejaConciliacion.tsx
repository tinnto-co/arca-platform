/**
 * Bandeja de conciliación (TIN-1634).
 *
 * La vista de Banco es una bandeja que se vacía: a la izquierda la plata que
 * entró y todavía no tiene comprobante, a la derecha las facturas del mes sin
 * cobro identificado. El sistema propone los cruces con su motivo a la vista
 * y una persona confirma; cuando las dos columnas quedan vacías, el mes está
 * conciliado.
 *
 * El criterio de cruce vive en el server (`getBandejaConciliacion`): mismo
 * importe con un peso de tolerancia y fecha cercana.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  EyeOff,
  Loader2,
  Scale,
  Sparkles,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  conciliarLote,
  desconciliarMovimiento,
  getBandejaConciliacion,
} from '@/actions/bank';
import { excluirMovimiento } from '@/actions/extractos';
import { MesPicker } from '@/components/shared/mes-picker';
import { fechaLocal } from '@/components/inicio/compartido';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CATEGORIA_MOVIMIENTO_LABEL } from '@/lib/clasificar-movimiento';

type Bandeja = Awaited<ReturnType<typeof getBandejaConciliacion>>;
type MovimientoPendiente = Bandeja['movimientos'][number];
type ComprobantePendiente = Bandeja['comprobantes'][number];

const pesos = (n: number) =>
  `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

/** `date` de la base leído como fecha local: por UTC se vería un día antes. */
const fecha = (d: string) =>
  fechaLocal(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
  });

/** El mes anterior en 'YYYY-MM': los extractos llegan a mes vencido. */
function mesAnterior(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Pide lo mínimo: también nombra el comprobante de una conciliación hecha. */
function nombreComprobante(c: {
  tipoNombre: string | null;
  tipo?: number;
  puntoVenta: number;
  numero: number;
}): string {
  const nro = `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`;
  return `${c.tipoNombre ?? `Tipo ${c.tipo}`} ${nro}`;
}

/** Un tramo de la barra de progreso, con su explicación al pasar el mouse. */
function Tramo({
  clase,
  ancho,
  texto,
}: {
  clase: string;
  ancho: number;
  texto: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`h-full ${clase}`} style={{ width: `${ancho}%` }} />
      </TooltipTrigger>
      <TooltipContent className="text-[12px]">{texto}</TooltipContent>
    </Tooltip>
  );
}

/* ─────────────────────────── progreso del mes ─────────────────────────── */

function Progreso({ totales }: { totales: Bandeja['totales'] }) {
  const pctFacturado =
    totales.facturado > 0
      ? Math.min(100, (totales.facturadoConciliado / totales.facturado) * 100)
      : 0;
  const base = totales.ingresos || 1;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tabular-nums text-[var(--arca-ink)]">
            {pesos(totales.facturadoConciliado)}
          </span>
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            de {pesos(totales.facturado)} facturados, conciliados
          </span>
        </div>
        <div className="flex h-[9px] overflow-hidden rounded-full bg-[var(--arca-surface-2)]">
          <span
            className="h-full bg-[var(--arca-accent-pos)]"
            style={{ width: `${pctFacturado}%` }}
          />
        </div>
        <span className="text-[11px] text-[var(--arca-ink-4)]">
          {Math.round(pctFacturado)}% ·{' '}
          {totales.comprobantesSinCobro === 0
            ? 'todas las facturas del mes tienen su cobro'
            : `quedan ${totales.comprobantesSinCobro} comprobante${totales.comprobantesSinCobro === 1 ? '' : 's'} sin cobro identificado`}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tabular-nums text-[var(--arca-ink)]">
            {pesos(totales.sinExplicar)}
          </span>
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            entraron al banco sin explicar
          </span>
        </div>
        {/* Una sola escala: lo que entró en el mes, partido en tres estados. */}
        <div className="flex h-[9px] overflow-hidden rounded-full bg-[var(--arca-surface-2)]">
          <Tramo
            clase="bg-[var(--arca-accent-pos)]"
            ancho={(totales.conciliado / base) * 100}
            texto={`Conciliado: ${pesos(totales.conciliado)} ya tienen su factura`}
          />
          <Tramo
            clase="bg-[var(--arca-ink-4)]"
            ancho={(totales.excluido / base) * 100}
            texto={`Excluido: ${pesos(totales.excluido)} que no son ventas (por ejemplo, transferencias entre cuentas propias)`}
          />
          <Tramo
            clase="bg-[var(--arca-accent-warn)]"
            ancho={(totales.sinExplicar / base) * 100}
            texto={`Sin explicar: ${pesos(totales.sinExplicar)} que entraron y todavía no tienen factura`}
          />
        </div>
        <span className="text-[11px] text-[var(--arca-ink-4)]">
          {totales.ingresos > 0
            ? `${Math.round((totales.sinExplicar / base) * 100)}% del dinero que entró todavía no tiene factura asignada`
            : 'sin ingresos bancarios en el mes'}
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────────── filas de cada lado ───────────────────────── */

function FilaMovimiento({
  mov,
  elegido,
  onElegir,
  onExcluir,
  excluyendo,
}: {
  mov: MovimientoPendiente;
  elegido: boolean;
  onElegir: () => void;
  onExcluir: () => void;
  excluyendo: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0 ${
        elegido
          ? 'bg-[var(--arca-accent-bg)]'
          : 'hover:bg-[var(--arca-surface-2)]'
      }`}
    >
      <button
        type="button"
        onClick={onElegir}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-[42px] shrink-0 font-mono text-[11.5px] text-[var(--arca-ink-3)]">
          {fecha(mov.fecha)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-[var(--arca-ink)]">
            {mov.descripcion ?? 'Sin descripción'}
          </span>
          <span className="block truncate text-[10.5px] text-[var(--arca-ink-4)]">
            {mov.cuentaNumero ?? mov.cuentaBanco}
            {mov.categoria
              ? ` · ${CATEGORIA_MOVIMIENTO_LABEL[mov.categoria as keyof typeof CATEGORIA_MOVIMIENTO_LABEL] ?? mov.categoria}`
              : ''}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13.5px] font-semibold tabular-nums text-[var(--arca-accent-pos-fg)]">
            +{pesos(Number(mov.importe))}
          </span>
          {mov.candidatos.length > 0 ? (
            <span className="text-[10.5px] text-[var(--arca-accent-pos-fg)]">
              {mov.candidatos.length} candidato
              {mov.candidatos.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="text-[10.5px] text-[var(--arca-ink-4)]">
              sin candidato
            </span>
          )}
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onExcluir}
            disabled={excluyendo}
            aria-label="Excluir de la conciliación"
            className="shrink-0 text-[var(--arca-ink-4)] transition-colors hover:text-[var(--arca-ink)]"
          >
            <EyeOff className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] text-[12px] leading-snug">
          No es una venta: excluir de la conciliación y de la comparación con
          facturación.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function FilaComprobante({
  comp,
  esCandidato,
  puedeConciliar,
  onConciliar,
  conciliando,
}: {
  comp: ComprobantePendiente;
  esCandidato: boolean;
  puedeConciliar: boolean;
  onConciliar: () => void;
  conciliando: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0 ${
        esCandidato
          ? 'bg-[var(--arca-accent-bg)]'
          : 'hover:bg-[var(--arca-surface-2)]'
      }`}
    >
      <span className="w-[42px] shrink-0 font-mono text-[11.5px] text-[var(--arca-ink-3)]">
        {fecha(comp.fechaEmision)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-[var(--arca-ink)]">
          {nombreComprobante(comp)}
        </span>
        <span className="block truncate text-[10.5px] text-[var(--arca-ink-4)]">
          {comp.contraparteNombre ?? 'Sin contraparte'}
        </span>
      </span>
      <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-[var(--arca-ink)]">
        {pesos(Number(comp.total))}
      </span>
      {puedeConciliar && (
        <button
          type="button"
          onClick={onConciliar}
          disabled={conciliando}
          className="shrink-0 rounded-[8px] bg-[var(--arca-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {conciliando ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            'Conciliar'
          )}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────────── bandeja ────────────────────────────── */

export function BandejaConciliacion({
  clienteId,
  periodo: periodoElegido,
  onPeriodoChange,
}: {
  clienteId: string;
  /** 'YYYY-MM' que viene de la URL; sin él, se busca el mes que corresponde. */
  periodo: string | undefined;
  onPeriodoChange: (periodo: string, opts?: { reemplazar?: boolean }) => void;
}) {
  const queryClient = useQueryClient();
  const periodo = periodoElegido ?? mesAnterior();
  const [movElegido, setMovElegido] = useState<string | null>(null);
  // Excluir saca plata de la comparación con facturación: se pregunta antes.
  const [aExcluir, setAExcluir] = useState<MovimientoPendiente | null>(null);
  const [verExcluidos, setVerExcluidos] = useState(false);
  // El lote no se escribe sin que se vea qué se va a escribir.
  const [revisandoLote, setRevisandoLote] = useState(false);
  const [verConciliados, setVerConciliados] = useState(false);

  const { data, isFetching, isPlaceholderData } = useQuery({
    queryKey: ['bandejaConciliacion', clienteId, periodo],
    queryFn: () => getBandejaConciliacion({ data: { clienteId, periodo } }),
    enabled: !!clienteId,
    placeholderData: (previo) => previo,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
    void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    void queryClient.invalidateQueries({ queryKey: ['bankSummary'] });
    void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
  };

  const conciliar = useMutation({
    mutationFn: (pares: { movimientoId: string; comprobanteId: string }[]) =>
      conciliarLote({ data: { pares } }),
    onSuccess: ({ conciliados, salteados }) => {
      invalidar();
      setMovElegido(null);
      setRevisandoLote(false);
      toast.success(
        conciliados === 1
          ? 'Movimiento conciliado'
          : `${conciliados} movimientos conciliados`,
        salteados > 0
          ? {
              description: `${salteados} quedaron sin conciliar porque su factura ya tenía un cobro asignado.`,
            }
          : undefined
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo conciliar'),
  });

  const desconciliar = useMutation({
    mutationFn: (movimientoId: string) =>
      desconciliarMovimiento({ data: { movimientoId } }),
    onSuccess: () => {
      invalidar();
      toast.success('Conciliación deshecha: el movimiento vuelve a la bandeja');
    },
    onError: () => toast.error('No se pudo deshacer la conciliación'),
  });

  const excluir = useMutation({
    mutationFn: ({
      movimientoId,
      excluido,
    }: {
      movimientoId: string;
      excluido: boolean;
    }) => excluirMovimiento({ data: { movimientoId, excluido } }),
    onSuccess: (_r, { excluido }) => {
      invalidar();
      setMovElegido(null);
      setAExcluir(null);
      toast.success(
        excluido
          ? 'Movimiento excluido de la conciliación'
          : 'Movimiento de vuelta en la bandeja'
      );
    },
    onError: () => toast.error('No se pudo actualizar el movimiento'),
  });

  // Los extractos se cargan con atraso, así que el mes anterior suele estar
  // vacío: sin mes en la URL, la bandeja se corre al último mes con
  // movimientos y lo deja escrito, así recargar vuelve al mismo lugar. Con
  // `replace`, para que el botón atrás no pase por el mes vacío.
  useEffect(() => {
    if (periodoElegido || !data || isPlaceholderData) return;
    const destino =
      data.totales.ingresos === 0 && data.ultimoPeriodoConDatos
        ? data.ultimoPeriodoConDatos
        : periodo;
    onPeriodoChange(destino, { reemplazar: true });
  }, [periodoElegido, data, isPlaceholderData, periodo, onPeriodoChange]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-5 py-8 text-[12.5px] text-[var(--arca-ink-3)]">
        <Loader2 className="size-3.5 animate-spin" />
        Buscando lo que falta conciliar…
      </div>
    );
  }

  const { totales, movimientos, comprobantes } = data;
  const elegido = movimientos.find((m) => m.id === movElegido) ?? null;
  const candidatosDelElegido = new Set(
    elegido?.candidatos.map((c) => c.comprobanteId) ?? []
  );
  const mejorCandidato = elegido?.candidatos[0];
  const comprobantePorId = new Map(comprobantes.map((c) => [c.id, c]));

  // Los cruces de un solo candidato, para confirmarlos de una vez. Si dos
  // movimientos apuntan a la misma factura, ninguno entra al lote: el importe
  // no alcanza para saber cuál es cuál y eso lo resuelve una persona.
  const crucesExactos = (() => {
    const unicos = movimientos.filter((m) => m.candidatos.length === 1);
    const cuantosLaReclaman = new Map<string, number>();
    for (const m of unicos) {
      const id = m.candidatos[0].comprobanteId;
      cuantosLaReclaman.set(id, (cuantosLaReclaman.get(id) ?? 0) + 1);
    }
    return unicos
      .filter((m) => cuantosLaReclaman.get(m.candidatos[0].comprobanteId) === 1)
      .map((m) => ({
        movimientoId: m.id,
        comprobanteId: m.candidatos[0].comprobanteId,
      }));
  })();

  const terminado =
    movimientos.length === 0 && totales.comprobantesSinCobro === 0;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Cabecera: el mes y cuánto falta de cada lado */}
      <div className="flex flex-col gap-3.5 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <Scale className="size-4 text-[var(--arca-ink-2)]" strokeWidth={2} />
          <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
            Conciliación del mes
          </span>
          {isFetching && (
            <Loader2 className="size-3.5 animate-spin text-[var(--arca-ink-4)]" />
          )}
          <div className="ml-auto flex items-center gap-2">
            <MesPicker
              size="sm"
              ano={periodo.slice(0, 4)}
              mes={periodo.slice(5, 7)}
              maxPeriodo={mesAnterior()}
              onChange={(ano, mes) => {
                onPeriodoChange(`${ano}-${mes}`);
                setMovElegido(null);
              }}
            />
            {crucesExactos.length > 0 && (
              <button
                type="button"
                onClick={() => setRevisandoLote(true)}
                disabled={conciliar.isPending}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--arca-accent)] px-3 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {conciliar.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Revisar {crucesExactos.length} cruce
                {crucesExactos.length === 1 ? '' : 's'} exacto
                {crucesExactos.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>

        <Progreso totales={totales} />
      </div>

      {/* El cruce propuesto para el movimiento elegido */}
      {elegido && mejorCandidato && (
        <div className="flex flex-col gap-2.5 rounded-[12px] border border-[var(--arca-accent-pos)] bg-[var(--arca-accent-pos-bg)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--arca-accent-pos-fg)]">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--arca-surface)] px-2 py-0.5 text-[10.5px] font-medium">
              <CheckCircle2 className="size-3" />
              {mejorCandidato.motivo}
            </span>
            <span className="font-semibold">{elegido.descripcion}</span>
            <span className="tabular-nums">
              {pesos(Number(elegido.importe))}
            </span>
            <ArrowRight className="size-3.5" />
            <span className="font-semibold">
              {(() => {
                const c = comprobantePorId.get(mejorCandidato.comprobanteId);
                return c ? nombreComprobante(c) : 'Comprobante';
              })()}
            </span>
            <span className="tabular-nums">
              {(() => {
                const c = comprobantePorId.get(mejorCandidato.comprobanteId);
                return c ? pesos(Number(c.total)) : '';
              })()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={conciliar.isPending}
              onClick={() =>
                conciliar.mutate([
                  {
                    movimientoId: elegido.id,
                    comprobanteId: mejorCandidato.comprobanteId,
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--arca-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {conciliar.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Confirmar este cruce
            </button>
            <button
              type="button"
              onClick={() => setMovElegido(null)}
              className="rounded-[8px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--arca-ink-2)]"
            >
              No es esta
            </button>
            <span className="text-[11px] text-[var(--arca-accent-pos-fg)]">
              o elegí otra factura de la derecha
            </span>
          </div>
        </div>
      )}

      {terminado ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-[12px] border border-[var(--arca-accent-pos)] bg-[var(--arca-accent-pos-bg)] px-5 py-10">
          <CheckCircle2 className="size-6 text-[var(--arca-accent-pos-fg)]" />
          <p className="text-[13px] font-semibold text-[var(--arca-accent-pos-fg)]">
            El mes está conciliado
          </p>
          <p className="text-[12px] text-[var(--arca-accent-pos-fg)]">
            No quedan ingresos sin explicar ni facturas sin cobro identificado.
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-3.5 lg:grid-cols-2">
          {/* Izquierda: la plata que entró sin identificar */}
          <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--arca-border)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                Entró al banco, sin identificar
              </span>
              <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                {movimientos.length} movimiento
                {movimientos.length === 1 ? '' : 's'} ·{' '}
                {pesos(totales.sinExplicar)}
              </span>
            </div>
            {movimientos.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
                Todo lo que entró en el mes está identificado.
              </p>
            ) : (
              <div className="max-h-[440px] overflow-y-auto">
                {movimientos.map((m) => (
                  <FilaMovimiento
                    key={m.id}
                    mov={m}
                    elegido={movElegido === m.id}
                    onElegir={() =>
                      setMovElegido((prev) => (prev === m.id ? null : m.id))
                    }
                    onExcluir={() => setAExcluir(m)}
                    excluyendo={excluir.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Derecha: las facturas que esperan su cobro */}
          <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-[var(--arca-border)] px-4 py-2.5">
              <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
                Facturas sin cobro identificado
              </span>
              <span className="text-[11.5px] text-[var(--arca-ink-3)]">
                {comprobantes.length} comprobante
                {comprobantes.length === 1 ? '' : 's'} ·{' '}
                {pesos(totales.facturadoSinCobro)}
              </span>
              {elegido && candidatosDelElegido.size > 0 && (
                <span className="ml-auto text-[11px] text-[var(--arca-accent-fg)]">
                  {candidatosDelElegido.size} coincide
                  {candidatosDelElegido.size === 1 ? '' : 'n'} con el movimiento
                  elegido
                </span>
              )}
            </div>
            {comprobantes.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-[var(--arca-ink-3)]">
                {totales.comprobantes === 0
                  ? 'No hay comprobantes emitidos en este mes.'
                  : 'Todas las facturas del mes tienen su cobro identificado.'}
              </p>
            ) : (
              <div className="max-h-[440px] overflow-y-auto">
                {/* Los candidatos del movimiento elegido van primero. */}
                {[...comprobantes]
                  .sort(
                    (a, b) =>
                      Number(candidatosDelElegido.has(b.id)) -
                      Number(candidatosDelElegido.has(a.id))
                  )
                  .map((c) => (
                    <FilaComprobante
                      key={c.id}
                      comp={c}
                      esCandidato={candidatosDelElegido.has(c.id)}
                      puedeConciliar={elegido !== null}
                      conciliando={conciliar.isPending}
                      onConciliar={() =>
                        elegido &&
                        conciliar.mutate([
                          { movimientoId: elegido.id, comprobanteId: c.id },
                        ])
                      }
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lo ya resuelto del mes, para saber que no se perdió */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11.5px] text-[var(--arca-ink-3)]">
        {data.conciliados.length > 0 ? (
          <button
            type="button"
            onClick={() => setVerConciliados((v) => !v)}
            className="inline-flex items-center gap-1.5 hover:text-[var(--arca-ink)]"
          >
            <CheckCircle2 className="size-3.5 text-[var(--arca-accent-pos)]" />
            {data.conciliados.length} conciliado
            {data.conciliados.length === 1 ? '' : 's'} en el mes{' '}
            <span className="font-medium tabular-nums text-[var(--arca-ink)]">
              {pesos(totales.conciliado)}
            </span>
            <span className="underline">
              {verConciliados ? 'ocultar' : 'ver y deshacer'}
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[var(--arca-ink-4)]">
            <CheckCircle2 className="size-3.5" />
            nada conciliado todavía
          </span>
        )}
        {data.excluidos.length > 0 ? (
          <button
            type="button"
            onClick={() => setVerExcluidos((v) => !v)}
            className="inline-flex items-center gap-1.5 hover:text-[var(--arca-ink)]"
          >
            <EyeOff className="size-3.5 text-[var(--arca-ink-4)]" />
            {data.excluidos.length} excluido
            {data.excluidos.length === 1 ? '' : 's'} por no ser venta{' '}
            <span className="font-medium tabular-nums text-[var(--arca-ink)]">
              {pesos(totales.excluido)}
            </span>
            <span className="underline">
              {verExcluidos ? 'ocultar' : 'ver y revertir'}
            </span>
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[var(--arca-ink-4)]">
            <EyeOff className="size-3.5" />
            sin movimientos excluidos
          </span>
        )}
        <span className="text-[var(--arca-ink-4)]">
          {totales.comprobantes} comprobante
          {totales.comprobantes === 1 ? '' : 's'} emitidos por{' '}
          {pesos(totales.facturado)}
        </span>
      </div>

      {/* Lo conciliado, con su deshacer: confirmar no es definitivo */}
      {verConciliados && data.conciliados.length > 0 && (
        <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
          <div className="border-b border-[var(--arca-border)] px-4 py-2.5 text-[12.5px] text-[var(--arca-ink-3)]">
            Movimientos con su factura asignada
          </div>
          {data.conciliados.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0"
            >
              <span className="w-[42px] shrink-0 font-mono text-[11.5px] text-[var(--arca-ink-3)]">
                {fecha(m.fecha)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--arca-ink)]">
                {m.descripcion ?? 'Sin descripción'}
              </span>
              <ArrowRight className="size-3 shrink-0 text-[var(--arca-ink-4)]" />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--arca-ink-2)]">
                {m.comprobante
                  ? `${nombreComprobante(m.comprobante)} · ${m.comprobante.contraparteNombre ?? 'sin contraparte'}`
                  : 'comprobante no encontrado'}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--arca-accent-pos-fg)]">
                {pesos(Number(m.importe))}
              </span>
              <button
                type="button"
                disabled={desconciliar.isPending}
                onClick={() => desconciliar.mutate(m.id)}
                className="shrink-0 rounded-[8px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]"
              >
                Deshacer
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Los excluidos, con la puerta de vuelta */}
      {verExcluidos && data.excluidos.length > 0 && (
        <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
          <div className="border-b border-[var(--arca-border)] px-4 py-2.5 text-[12.5px] text-[var(--arca-ink-3)]">
            Fuera de la conciliación y de la comparación con facturación
          </div>
          {data.excluidos.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 border-t border-[var(--arca-border)] px-3.5 py-2.5 first:border-t-0"
            >
              <span className="w-[42px] shrink-0 font-mono text-[11.5px] text-[var(--arca-ink-3)]">
                {fecha(m.fecha)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--arca-ink-2)]">
                {m.descripcion ?? 'Sin descripción'}
              </span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--arca-ink-3)]">
                {pesos(Number(m.importe))}
              </span>
              <button
                type="button"
                disabled={excluir.isPending}
                onClick={() =>
                  excluir.mutate({ movimientoId: m.id, excluido: false })
                }
                className="shrink-0 rounded-[8px] border border-[var(--arca-border-strong)] bg-[var(--arca-surface)] px-2.5 py-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]"
              >
                Volver a incluir
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Revisión del lote: qué se va a conciliar, uno por uno, antes de
          escribir nada. Confirmar de golpe sin ver el detalle deja al estudio
          con conciliaciones que no eligió. */}
      <AlertDialog open={revisandoLote} onOpenChange={setRevisandoLote}>
        <AlertDialogContent className="!max-w-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revisá los {crucesExactos.length} cruces antes de confirmar
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cada movimiento coincide con una sola factura del mes en importe y
              fecha. Si alguno no corresponde, cancelá y conciliá de a uno desde
              la bandeja.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[50vh] overflow-y-auto rounded-[10px] border border-[var(--arca-border)]">
            {crucesExactos.map((par) => {
              const mov = movimientos.find((m) => m.id === par.movimientoId);
              const comp = comprobantePorId.get(par.comprobanteId);
              if (!mov || !comp) return null;
              return (
                <div
                  key={par.movimientoId}
                  className="flex flex-col gap-1 border-t border-[var(--arca-border)] px-3.5 py-2.5 text-[12px] first:border-t-0"
                >
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <span className="min-w-0">
                      {/* La descripción va completa: el CUIT del ordenante
                          suele estar acá y es lo que valida el cruce. */}
                      <span className="block font-medium text-[var(--arca-ink)]">
                        {mov.descripcion ?? 'Sin descripción'}
                      </span>
                      <span className="block text-[10.5px] text-[var(--arca-ink-4)]">
                        {fecha(mov.fecha)} ·{' '}
                        {mov.cuentaNumero ?? mov.cuentaBanco} ·{' '}
                        {pesos(Number(mov.importe))}
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 text-[var(--arca-ink-4)]" />
                    <span className="min-w-0 text-right">
                      <span className="block font-medium text-[var(--arca-ink)]">
                        {nombreComprobante(comp)}
                      </span>
                      <span className="block text-[10.5px] text-[var(--arca-ink-4)]">
                        {fecha(comp.fechaEmision)} ·{' '}
                        {comp.contraparteNombre ?? 'sin contraparte'} ·{' '}
                        {pesos(Number(comp.total))}
                      </span>
                    </span>
                  </div>
                  <span className="text-[10.5px] text-[var(--arca-ink-3)]">
                    {mov.candidatos[0]?.motivo}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-[11.5px] text-[var(--arca-ink-3)]">
            Se van a conciliar{' '}
            <span className="font-medium tabular-nums text-[var(--arca-ink)]">
              {pesos(
                crucesExactos.reduce((a, par) => {
                  const mov = movimientos.find(
                    (m) => m.id === par.movimientoId
                  );
                  return a + Number(mov?.importe ?? 0);
                }, 0)
              )}
            </span>{' '}
            en {crucesExactos.length} movimiento
            {crucesExactos.length === 1 ? '' : 's'}. Se puede deshacer uno por
            uno después.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                conciliar.mutate(crucesExactos);
              }}
              disabled={conciliar.isPending}
            >
              {conciliar.isPending
                ? 'Conciliando…'
                : `Conciliar los ${crucesExactos.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de exclusión: es plata que sale de la comparación */}
      <AlertDialog
        open={aExcluir !== null}
        onOpenChange={(abierto) => !abierto && setAExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Excluir este movimiento de la conciliación?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2.5">
                <span>
                  <span className="font-medium text-[var(--arca-ink)]">
                    {aExcluir?.descripcion ?? 'Sin descripción'}
                  </span>{' '}
                  por{' '}
                  <span className="font-medium tabular-nums text-[var(--arca-ink)]">
                    {pesos(Number(aExcluir?.importe ?? 0))}
                  </span>
                  {aExcluir ? ` del ${fecha(aExcluir.fecha)}` : ''}.
                </span>
                <span>
                  Deja de contar como ingreso en «Banco vs Facturación» y sale
                  de esta bandeja. Se usa para lo que entró al banco pero no es
                  una venta: transferencias entre cuentas propias, préstamos,
                  devoluciones.
                </span>
                <span>
                  El movimiento no se borra y esto se puede revertir desde «ver
                  y revertir», al pie de la bandeja.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (aExcluir)
                  excluir.mutate({
                    movimientoId: aExcluir.id,
                    excluido: true,
                  });
              }}
              disabled={excluir.isPending}
            >
              {excluir.isPending ? 'Excluyendo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
