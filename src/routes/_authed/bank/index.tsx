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
  Loader2,
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
  listCuentasConResumen,
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
  return new Date(d).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
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
  const conciliacion = tx.conciliaciones[0];
  const queryClient = useQueryClient();

  // Recategorizar a mano pisa lo del clasificador (queda marcado 'manual').
  const recategorizar = useMutation({
    mutationFn: (categoria: CategoriaMovimiento) =>
      recategorizarMovimiento({ data: { movimientoId: tx.id, categoria } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
    },
    onError: () => toast.error('No se pudo cambiar la categoría'),
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
  // otra vista con una empresa elegida abre Banco ya parado en ella.
  const [clienteGlobal] = useClienteSeleccionado();
  const clienteId = clienteGlobal ?? '';
  // Vacío = todas las cuentas. El registro arranca completo.
  const [accountId, setAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [showManualMovement, setShowManualMovement] = useState(false);
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

  /* Resumen de conciliación */
  const { data: summary } = useQuery({
    queryKey: ['bankSummary', clienteId],
    queryFn: () => getResumenConciliacion({ data: { clienteId } }),
    enabled: !!clienteId,
  });

  /* Movimientos: de una cuenta o de todas */
  const { data: transactions = [], isFetching: txsFetching } = useQuery({
    queryKey: [
      'bankTransactions',
      accountId || clienteId,
      accountId ? 'cuenta' : 'todas',
    ],
    queryFn: () =>
      listMovimientos({
        data: accountId
          ? { cuentaBancariaId: accountId, limit: 500 }
          : { clienteId, limit: 500 },
      }),
    enabled: !!clienteId,
    placeholderData: (previo) => previo,
  });

  /* Auto-conciliación: por cuenta, así que necesita una elegida */
  const autoMatchMutation = useMutation({
    mutationFn: () => autoConciliar({ data: { cuentaBancariaId: accountId } }),
    onSuccess: ({ conciliados }) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
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
  const cuentaElegida = accounts.find((a) => a.id === accountId);

  // Los totales acompañan a lo que se está mirando: si hay una cuenta
  // elegida, son los de esa cuenta.
  const ingresos = accountId
    ? parseFloat(cuentaElegida?.ingresos ?? '0')
    : accounts.reduce((a, c) => a + parseFloat(c.ingresos), 0);
  const egresos = accountId
    ? parseFloat(cuentaElegida?.egresos ?? '0')
    : accounts.reduce((a, c) => a + parseFloat(c.egresos), 0);

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

      {/* Totales primero: es lo que se viene a ver */}
      <TotalesDelPeriodo
        ingresos={ingresos}
        egresos={egresos}
        movimientos={
          accountId
            ? (cuentaElegida?.movimientos ?? 0)
            : (summary?.movimientos ?? 0)
        }
        conciliados={summary?.conciliados ?? 0}
        porcentaje={summary?.porcentajeConciliado ?? 0}
        alcance={
          cuentaElegida
            ? `${cuentaElegida.banco} ${cuentaElegida.numero ?? ''}`.trim()
            : `${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''}`
        }
      />

      {/* Incongruencias: lo que entró al banco contra lo facturado */}
      <div className="mb-4">
        <BancoVsFacturacionCard clienteId={clienteId} />
      </div>

      {/* Las cuentas, a la vista y como filtro del registro */}
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
        <ImportarExtractoDialog clienteId={clienteId}>
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

      {/* El registro de movimientos, siempre visible */}
      {accounts.length > 0 && (
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
              {transactions.length} en pantalla · {unmatchedCount} sin conciliar
            </span>
            {accountId && (
              <button
                onClick={() => setAccountId('')}
                className="text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
              >
                Ver todas
              </button>
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
                <button
                  onClick={() => autoMatchMutation.mutate()}
                  disabled={autoMatchMutation.isPending || unmatchedCount === 0}
                  className="flex items-center gap-1.5 h-7 px-2.5 text-[11.5px] font-medium rounded-[8px] border border-[var(--arca-border)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)] disabled:opacity-50 transition-colors"
                >
                  <Zap className="w-3 h-3" strokeWidth={2} />
                  {autoMatchMutation.isPending
                    ? 'Conciliando...'
                    : `Auto-conciliar (${unmatchedCount})`}
                </button>
              )}
            </div>
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
            <div className="w-[60px]">Match</div>
            <div className="w-[130px] text-right">Importe</div>
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
            <div className="divide-y divide-[var(--arca-border)]">
              {transactions.map((tx) => (
                <TransactionItem
                  key={tx.id}
                  tx={tx}
                  mostrarCuenta={!accountId}
                />
              ))}
            </div>
          )}
        </ArcaCard>
      )}
    </PageShell>
  );
}
