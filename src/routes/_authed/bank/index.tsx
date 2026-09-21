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
import { LimpiarFiltros } from '@/components/shared/filtros';
import { SearchableSelect } from '@/components/ui/searchable-select';
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
  const queryClient = useQueryClient();
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

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
      <div className="w-[150px] shrink-0">
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
            texto={
              conciliacion.fuente === 'manual'
                ? 'Conciliado a mano: alguien eligió la factura que explica este movimiento.'
                : `Lo sugirió el sistema (${confianza}% de seguridad) y alguien lo confirmó.`
            }
          >
            <span
              className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
              style={{
                background: 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))',
                color: 'oklch(0.45 0.14 145)',
              }}
            >
              Conciliado
            </span>
          </ConAyuda>
        ) : conciliacion?.estado === 'sugerida' ? (
          <>
            <ConAyuda
              texto={
                <div className="flex flex-col gap-1.5">
                  <span>
                    Hay una factura que podría explicar este movimiento. No
                    cuenta como conciliado hasta que lo confirmes.
                  </span>
                  <span className="opacity-80">
                    Cómo se calcula la seguridad:
                    <br />· 50% porque el importe es igual
                    <br />· +40% si es el mismo cliente o proveedor
                    <br />· hasta +10% según lo cerca de las fechas (10% el
                    mismo día)
                  </span>
                  <span className="font-semibold">Total: {confianza}%</span>
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
        ) : (
          <span className="inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-full border border-[var(--arca-border)] text-[10.5px] font-medium text-[var(--arca-ink-4)]">
            Sin match
          </span>
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
  const claveLista = `${clienteId}|${accountId}|${search.mes ?? ''}|${search.categoria ?? ''}|${search.estado ?? ''}`;
  const [prevLista, setPrevLista] = useState(claveLista);
  if (prevLista !== claveLista) {
    setPrevLista(claveLista);
    setPagina(1);
  }

  /* Movimientos del mes de la bandeja, de una cuenta o de todas, con los
     totales de todo lo filtrado (no solo de la página). */
  const { data: listado, isFetching: txsFetching } = useQuery({
    queryKey: [
      'bankTransactions',
      accountId || clienteId,
      accountId ? 'cuenta' : 'todas',
      search.mes,
      search.categoria,
      search.estado,
      pagina,
    ],
    queryFn: () =>
      listMovimientos({
        data: {
          ...(accountId ? { cuentaBancariaId: accountId } : { clienteId }),
          periodo: search.mes,
          categoria: search.categoria,
          estado: search.estado,
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

  /* Auto-conciliación: por cuenta, así que necesita una elegida */
  const autoMatchMutation = useMutation({
    mutationFn: () => autoConciliar({ data: { cuentaBancariaId: accountId } }),
    onSuccess: ({ sugeridos }) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      // Solo propone: lo dice así para que nadie crea que ya quedó conciliado.
      toast.success(
        sugeridos === 0
          ? 'No se encontraron cruces nuevos'
          : `${sugeridos} cruce${sugeridos !== 1 ? 's' : ''} sugerido${sugeridos !== 1 ? 's' : ''}: revisalos y confirmalos en la tabla`
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
  const mesLabel = search.mes
    ? fechaLocal(`${search.mes}-15`).toLocaleDateString('es-AR', {
        month: 'long',
        year: 'numeric',
      })
    : 'todo el historial';

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

      {/* La bandeja ES la vista: el trabajo del mes, no el resumen de caja. */}
      {accounts.length > 0 && (
        <div className="mb-5">
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
              {accountId && (
                <button
                  onClick={() => setShowManualMovement((v) => !v)}
                  className="flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
                >
                  <Plus className="w-3 h-3" strokeWidth={2} />
                  Movimiento manual
                </button>
              )}
              {accountId && (
                <ConAyuda texto="Busca, para cada movimiento de esta cuenta, una factura con el mismo importe y fecha cercana (cobros contra facturas emitidas, pagos contra recibidas). Solo propone: cada sugerencia la confirmás o descartás en la tabla.">
                  <button
                    onClick={() => autoMatchMutation.mutate()}
                    disabled={
                      autoMatchMutation.isPending || unmatchedCount === 0
                    }
                    className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] disabled:opacity-50 transition-colors"
                  >
                    <Zap className="w-3 h-3" strokeWidth={2} />
                    {autoMatchMutation.isPending
                      ? 'Conciliando...'
                      : `Auto-conciliar (${unmatchedCount})`}
                  </button>
                </ConAyuda>
              )}
            </div>
          </div>

          {/* Filtros de la tabla. Los totales de arriba los siguen: con
              "Impuestos" elegido, "Salió" es lo que se fue en impuestos. */}
          <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-[var(--arca-border)]">
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
            {(search.categoria ?? search.estado) && (
              <LimpiarFiltros
                onLimpiar={() =>
                  void navigate({
                    resetScroll: false,
                    search: (prev: BankSearch) => ({
                      ...prev,
                      categoria: undefined,
                      estado: undefined,
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
            <div className="w-[150px] shrink-0">Categoría</div>
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
