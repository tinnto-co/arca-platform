import { createFileRoute, redirect } from '@tanstack/react-router';
import { listOrgModules } from '@/actions/admin';
import { useState } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { PageShell } from '@/components/shared/page-shell';
import { SelectorClienteGlobal } from '@/components/shared/selector-cliente';
import { useClienteSeleccionado } from '@/lib/cliente-seleccionado';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArcaCard } from '@/components/dashboard/shared';
import {
  listCuentasBancarias,
  listMovimientos,
  autoConciliar,
  getResumenConciliacion,
  createCuentaBancaria,
} from '@/actions/bank';
import {
  agregarMovimientoManual,
  excluirMovimiento,
  recategorizarMovimiento,
} from '@/actions/extractos';
import { ImportarExtractoDialog } from '@/components/banco/ImportarExtractoDialog';
import { BancoVsFacturacionCard } from '@/components/banco/BancoVsFacturacionCard';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
  type CategoriaMovimiento,
} from '@/lib/clasificar-movimiento';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authed/bank/')({
  beforeLoad: async () => {
    const modules = await listOrgModules();
    const enabled = modules.find((m) => m.module === 'banco')?.enabled ?? false;
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!enabled) throw redirect({ to: '/' });
  },
  component: BankPage,
});

/* ─── Types ─── */
type MovimientoRow = Awaited<ReturnType<typeof listMovimientos>>[number];
type ResumenConciliacion = Awaited<ReturnType<typeof getResumenConciliacion>>;

/* ─── Helpers ─── */
function fmtAmount(importe: string, direccion: string) {
  const n = parseFloat(importe);
  const sign = direccion === 'ingreso' ? '+' : '-';
  return `${sign}$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/* ─── Summary cards ─── */
function SummaryCards({ summary }: { summary: ResumenConciliacion }) {
  const cards = [
    {
      label: 'Cuentas',
      value: summary.cuentas,
      icon: Landmark,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Movimientos',
      value: summary.movimientos,
      icon: ArrowLeftRight,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Conciliados',
      value: summary.conciliados,
      icon: CheckCircle2,
      color: 'oklch(0.55 0.12 145)',
    },
    {
      label: 'Pendientes',
      value: summary.pendientes,
      icon: CircleDashed,
      color: 'var(--arca-accent-warn)',
    },
    {
      label: 'Tasa de conciliación',
      value: `${summary.porcentajeConciliado}%`,
      icon: ArrowLeftRight,
      color: 'var(--arca-ink-2)',
    },
    {
      label: 'Total ingresos',
      value: `$${parseFloat(summary.totalIngresos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: 'oklch(0.55 0.12 145)',
    },
    {
      label: 'Total egresos',
      value: `$${parseFloat(summary.totalEgresos).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      icon: TrendingDown,
      color: 'var(--arca-accent-neg)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col gap-1 px-4 py-3 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]"
        >
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--arca-ink-3)] font-medium">
            <card.icon
              className="w-3 h-3 shrink-0"
              style={{ color: card.color }}
              strokeWidth={2}
            />
            {card.label}
          </div>
          <div
            className="text-[18px] font-semibold tracking-tight text-[var(--arca-ink)]"
            style={{ fontFamily: 'var(--ff-display)' }}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Transaction row ─── */
function TransactionItem({
  tx,
  accountId,
}: {
  tx: MovimientoRow;
  accountId: string;
}) {
  const isIngreso = tx.direccion === 'ingreso';
  const conciliacion = tx.conciliaciones[0];
  const queryClient = useQueryClient();

  // Recategorizar a mano pisa lo del clasificador (queda marcado 'manual').
  const recategorizar = useMutation({
    mutationFn: (categoria: CategoriaMovimiento) =>
      recategorizarMovimiento({ data: { movimientoId: tx.id, categoria } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bankTransactions', accountId],
      });
    },
    onError: () => toast.error('No se pudo cambiar la categoría'),
  });

  // Excluir saca el movimiento de la comparación Banco vs Facturación
  // (transferencias entre cuentas propias, ajustes) sin borrarlo.
  const excluir = useMutation({
    mutationFn: (excluido: boolean) =>
      excluirMovimiento({ data: { movimientoId: tx.id, excluido } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bankTransactions', accountId],
      });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
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
        {tx.contraparteTexto && (
          <div className="text-[11.5px] text-[var(--arca-ink-3)] truncate">
            {tx.contraparteTexto}
          </div>
        )}
      </div>

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

      {/* Match type badge */}
      {conciliacion && (
        <span
          className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-medium"
          style={{
            background:
              conciliacion.fuente === 'manual'
                ? 'var(--arca-accent-pos-bg, oklch(0.95 0.05 145))'
                : 'var(--arca-surface-2)',
            color:
              conciliacion.fuente === 'manual'
                ? 'oklch(0.45 0.14 145)'
                : 'var(--arca-ink-3)',
          }}
        >
          {conciliacion.fuente === 'manual' ? 'Manual' : 'Auto'}
          {/* `confianza` viene 0–1 (numeric), no en porcentaje. */}
          {conciliacion.confianza &&
            ` ${Math.round(parseFloat(conciliacion.confianza) * 100)}%`}
        </span>
      )}

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

      {/* Excluir de Banco vs Facturación */}
      <button
        type="button"
        className="shrink-0 text-[var(--arca-ink-4)] hover:text-[var(--arca-ink)] transition-colors"
        title={
          tx.excluido
            ? 'Excluido de Banco vs Facturación — volver a incluir'
            : 'Excluir de Banco vs Facturación (ej. transferencia entre cuentas propias)'
        }
        disabled={excluir.isPending}
        onClick={() => excluir.mutate(!tx.excluido)}
      >
        {tx.excluido ? (
          <EyeOff className="w-3.5 h-3.5" strokeWidth={1.8} />
        ) : (
          <Eye className="w-3.5 h-3.5" strokeWidth={1.8} />
        )}
      </button>
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
      void queryClient.invalidateQueries({
        queryKey: ['bankTransactions', cuentaBancariaId],
      });
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
      void queryClient.invalidateQueries({
        queryKey: ['bankAccounts', clienteId],
      });
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

/* ─── Page ─── */
function BankPage() {
  // La empresa es la global del header (store cliente-seleccionado): venir de
  // otra vista con una empresa elegida abre Banco ya parado en ella.
  const [clienteGlobal] = useClienteSeleccionado();
  const clienteId = clienteGlobal ?? '';
  const [accountId, setAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showManualMovement, setShowManualMovement] = useState(false);
  const queryClient = useQueryClient();

  // Si la empresa cambia (desde acá o desde otra vista), la cuenta elegida
  // deja de tener sentido: sin esto, las transacciones mostradas serían de la
  // cuenta de la empresa anterior. Ajuste durante el render, no en un efecto.
  const [prevCliente, setPrevCliente] = useState(clienteId);
  if (prevCliente !== clienteId) {
    setPrevCliente(clienteId);
    setAccountId('');
    setShowCreateAccount(false);
    setShowManualMovement(false);
  }

  /* Bank accounts */
  const { data: accounts = [] } = useQuery({
    queryKey: ['bankAccounts', clienteId],
    queryFn: () => listCuentasBancarias({ data: { clienteId } }),
    enabled: !!clienteId,
  });

  /* Summary */
  const { data: summary } = useQuery({
    queryKey: ['bankSummary', clienteId],
    queryFn: () => getResumenConciliacion({ data: { clienteId } }),
    enabled: !!clienteId,
  });

  /* Movimientos */
  const { data: transactions = [], isFetching: txsFetching } = useQuery({
    queryKey: ['bankTransactions', accountId],
    queryFn: () =>
      listMovimientos({ data: { cuentaBancariaId: accountId, limit: 200 } }),
    enabled: !!accountId,
  });

  /* Auto-conciliación */
  const autoMatchMutation = useMutation({
    mutationFn: () => autoConciliar({ data: { cuentaBancariaId: accountId } }),
    onSuccess: ({ conciliados }) => {
      void queryClient.invalidateQueries({
        queryKey: ['bankTransactions', accountId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['bankSummary', clienteId],
      });
      toast.success(
        `${conciliados} movimiento${conciliados !== 1 ? 's' : ''} conciliado${conciliados !== 1 ? 's' : ''} automáticamente`
      );
    },
    onError: () => toast.error('Error en la conciliación automática'),
  });

  const unmatchedCount = transactions.filter((t) => !t.conciliado).length;
  const matchedCount = transactions.filter((t) => t.conciliado).length;

  return (
    <PageShell>
      <PageHeader
        title="Banco"
        subtitle="Conciliación bancaria"
        actions={<SelectorClienteGlobal />}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {clienteId && (
          <Select
            value={accountId}
            onValueChange={(v) => {
              setAccountId(v);
              setShowManualMovement(false);
            }}
          >
            <SelectTrigger className="w-[260px] text-[13px]">
              <SelectValue placeholder="Seleccionar cuenta..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.banco}
                  {a.alias ? ` · ${a.alias}` : ''}
                  {a.numero ? ` (${a.numero})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {clienteId && (
          <button
            onClick={() => setShowCreateAccount((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nueva cuenta
          </button>
        )}

        {clienteId && (
          <ImportarExtractoDialog clienteId={clienteId}>
            <button className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 transition-opacity">
              <Upload className="w-3.5 h-3.5" strokeWidth={2} />
              Importar extracto
            </button>
          </ImportarExtractoDialog>
        )}

        {accountId && (
          <button
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending || unmatchedCount === 0}
            className="flex items-center gap-1.5 h-8 px-3 text-[12.5px] font-medium rounded-[8px] bg-[var(--arca-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity ml-auto"
          >
            <Zap className="w-3.5 h-3.5" strokeWidth={2} />
            {autoMatchMutation.isPending
              ? 'Conciliando...'
              : `Auto-conciliar (${unmatchedCount})`}
          </button>
        )}
      </div>

      {/* Summary stats */}
      {clienteId && summary && <SummaryCards summary={summary} />}

      {/* Incongruencias: lo que entró al banco vs lo facturado */}
      {clienteId && (
        <div className="mb-5">
          <BancoVsFacturacionCard clienteId={clienteId} />
        </div>
      )}

      {/* Create account form */}
      {showCreateAccount && clienteId && (
        <div className="mb-4 rounded-[12px] border border-[var(--arca-border)] overflow-hidden">
          <CreateAccountForm
            clienteId={clienteId}
            onCreated={() => setShowCreateAccount(false)}
          />
        </div>
      )}

      {/* Transactions */}
      {accountId ? (
        <ArcaCard>
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3 border-b border-[var(--arca-border)]">
            <span className="text-[13px] font-semibold text-[var(--arca-ink)]">
              Movimientos
            </span>
            <span className="text-[11.5px] text-[var(--arca-ink-3)]">
              {transactions.length} total · {matchedCount} conciliados ·{' '}
              {unmatchedCount} pendientes
            </span>
            <button
              onClick={() => setShowManualMovement((v) => !v)}
              className="ml-auto flex items-center gap-1 text-[11.5px] font-medium text-[var(--arca-ink-2)] hover:text-[var(--arca-ink)] transition-colors"
            >
              <Plus className="w-3 h-3" strokeWidth={2} />
              Movimiento manual
            </button>
            {txsFetching && (
              <span className="text-[11px] text-[var(--arca-ink-3)]">
                Cargando...
              </span>
            )}
          </div>

          {showManualMovement && (
            <ManualMovementForm
              cuentaBancariaId={accountId}
              clienteId={clienteId}
              onDone={() => setShowManualMovement(false)}
            />
          )}

          {/* Column headers */}
          <div className="px-5 py-2 flex items-center gap-4 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)]">
            <div className="w-4 shrink-0" />
            <div className="w-[90px] shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Fecha
            </div>
            <div className="flex-1 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Descripción / Contraparte
            </div>
            <div className="w-[150px] shrink-0 text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Categoría
            </div>
            <div className="w-[60px] text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Match
            </div>
            <div className="w-[130px] text-right text-[11px] font-semibold text-[var(--arca-ink-3)] uppercase tracking-wide">
              Importe
            </div>
          </div>

          {transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
              <ArrowLeftRight
                className="w-8 h-8 mb-2 opacity-40"
                strokeWidth={1.5}
              />
              <p className="text-[13px]">No hay movimientos para esta cuenta</p>
              <p className="text-[12px] mt-1 text-[var(--arca-ink-3)]">
                Importá movimientos para comenzar la conciliación
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--arca-border)]">
              {transactions.map((tx) => (
                <TransactionItem key={tx.id} tx={tx} accountId={accountId} />
              ))}
            </div>
          )}
        </ArcaCard>
      ) : clienteId ? (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <Landmark className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">
              Seleccioná una cuenta para ver movimientos
            </p>
          </div>
        </ArcaCard>
      ) : (
        <ArcaCard>
          <div className="flex flex-col items-center justify-center py-14 text-[var(--arca-ink-3)]">
            <Landmark className="w-8 h-8 mb-2 opacity-40" strokeWidth={1.5} />
            <p className="text-[13px]">Seleccioná un cliente para comenzar</p>
          </div>
        </ArcaCard>
      )}
    </PageShell>
  );
}
