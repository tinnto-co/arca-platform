/**
 * Importador de extractos bancarios (TIN-1634).
 *
 * Dos momentos, no uno: la cola —subir muchos y ver cómo avanzan— y la
 * revisión de uno ya leído. Antes eran lo mismo y había que esperar la
 * lectura con el diálogo abierto; ahora el servidor lee en segundo plano
 * (`extractos-worker`) y acá solo se revisa lo que ya está.
 *
 * La revisión es por cuenta: un extracto consolidado trae varias, cada una
 * con sus propios saldos, su propio cuadre y su propia tabla en el PDF.
 */
import { createContext, useContext, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { listCuentasBancarias } from '@/actions/bank';
import { confirmarExtracto, getExtracto } from '@/actions/extractos';
import { cuadreExtracto } from '@/lib/extracto-calc';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
  type CategoriaMovimiento,
} from '@/lib/clasificar-movimiento';
import { ColaExtractos } from '@/components/banco/ColaExtractos';

type Revision = Awaited<ReturnType<typeof getExtracto>>;
type CuentaExtraida = Revision['cuentas'][number];
/** Movimiento en revisión: su categoría se edita y la fila se puede excluir. */
type FilaEditable = CuentaExtraida['movimientos'][number] & {
  key: number;
  quitar: boolean;
};

/** Valor del select cuando la cuenta del PDF todavía no existe en el sistema. */
const NUEVA = '__nueva__';

const TIPO_CUENTA_LABEL: Record<string, string> = {
  caja_ahorro: 'Caja de ahorro',
  cuenta_corriente: 'Cuenta corriente',
  otra: 'Cuenta',
};

/**
 * Las cuentas ya cargadas de la empresa. El clienteId viene por contexto de
 * la card, así que el hook lo recibe por props del proveedor de más arriba.
 */
const ClienteIdContext = createContext<string>('');

function useCuentasDelCliente() {
  const clienteId = useContext(ClienteIdContext);
  const { data: cuentas = [] } = useQuery({
    queryKey: ['bankAccounts', clienteId],
    queryFn: () => listCuentasBancarias({ data: { clienteId } }),
    enabled: !!clienteId,
  });
  return { cuentas };
}

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

function BloqueCuenta({
  cuenta,
  banco,
  filas,
  onCambiarFila,
  onElegirCuenta,
}: {
  cuenta: CuentaExtraida;
  banco: string;
  filas: FilaEditable[];
  onCambiarFila: (key: number, cambio: Partial<FilaEditable>) => void;
  onElegirCuenta: (cuentaBancariaId: string | null) => void;
}) {
  const activos = filas.filter((f) => !f.quitar);
  // El cuadre se recalcula en vivo: quitar una fila puede romperlo (y eso
  // tiene que verse), no solo la lectura de la IA.
  const cuadre = cuadreExtracto(
    cuenta.saldoInicial,
    cuenta.saldoFinal,
    activos
  );

  return (
    <div className="rounded-[10px] border border-[var(--arca-border)]">
      {/* Identidad de la cuenta + a dónde van sus movimientos */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3.5 py-2.5">
        <span className="text-[12.5px] font-semibold text-[var(--arca-ink)]">
          Cuenta {cuenta.numeroCuenta || 'sin número'}
        </span>
        <span className="text-[11px] text-[var(--arca-ink-4)]">
          {TIPO_CUENTA_LABEL[cuenta.tipo] ?? cuenta.tipo} · {cuenta.moneda}
          {cuenta.cbu ? ` · CBU ${cuenta.cbu}` : ''}
        </span>
        <span className="ml-auto text-[11.5px]">
          {cuenta.cuentaExistenteId ? (
            <span className="text-[var(--arca-ink-3)]">
              Se importa en{' '}
              <span className="font-medium text-[var(--arca-ink)]">
                {cuenta.cuentaExistenteNombre}
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--arca-surface)] px-2 py-0.5 text-[var(--arca-ink-3)]">
              <Plus className="size-3" />
              Se crea la cuenta «{banco}» al confirmar
            </span>
          )}
        </span>
      </div>

      {/* Cuadre de ESTA cuenta. Verde cuadra, ámbar no. */}
      <div
        className={`flex items-start gap-2 px-3.5 py-2.5 text-[12px] leading-relaxed ${
          cuadre.cuadra
            ? 'bg-[var(--arca-accent-pos-bg,oklch(0.95_0.05_145))] text-[var(--arca-accent-pos-fg,oklch(0.4_0.12_145))]'
            : 'bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]'
        }`}
      >
        {cuadre.cuadra ? (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span>
          Saldo inicial{' '}
          <span className="font-semibold tabular-nums">
            {fmt.format(cuenta.saldoInicial)}
          </span>{' '}
          + ingresos{' '}
          <span className="font-semibold tabular-nums">
            {fmt.format(cuadre.totalIngresos)}
          </span>{' '}
          − egresos{' '}
          <span className="font-semibold tabular-nums">
            {fmt.format(cuadre.totalEgresos)}
          </span>{' '}
          ={' '}
          <span className="font-semibold tabular-nums">
            {fmt.format(cuadre.saldoCalculado)}
          </span>
          {cuadre.cuadra ? (
            <> — coincide con el saldo final del extracto. ✓</>
          ) : (
            <>
              , pero el extracto dice{' '}
              <span className="font-semibold tabular-nums">
                {fmt.format(cuenta.saldoFinal)}
              </span>{' '}
              (diferencia {fmt.format(cuadre.diferencia)}). Puede faltar un
              movimiento o haber una lectura errada: revisá contra el PDF antes
              de confirmar.
            </>
          )}
        </span>
      </div>

      {/* Cuenta ya cargada distinta de la reconocida: se puede cambiar */}
      <div className="border-t border-[var(--arca-border)] px-3.5 py-2">
        <SelectorCuentaDestino
          valor={cuenta.cuentaExistenteId}
          onCambio={onElegirCuenta}
          banco={banco}
        />
      </div>

      {/* Movimientos: categoría editable, fila descartable */}
      {/* El importe es el dato que no puede quedar fuera de pantalla: la
          tabla es de ancho fijo y la descripción es la que cede. */}
      <div className="max-h-[300px] overflow-auto border-t border-[var(--arca-border)]">
        <table className="w-full table-fixed text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-left text-[var(--arca-ink-3)]">
              <th className="w-[86px] px-3 py-2 font-medium">Fecha</th>
              {/* Sin ancho: es la única que cede cuando falta lugar. */}
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="w-[140px] px-3 py-2 font-medium">Categoría</th>
              <th className="w-[124px] px-3 py-2 text-right font-medium">
                Importe
              </th>
              <th className="w-[34px] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.key}
                className={`border-b border-[var(--arca-border)] last:border-0 ${
                  f.quitar ? 'opacity-40' : ''
                }`}
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11.5px]">
                  {f.fecha}
                </td>
                <td className="px-3 py-1.5">
                  {/* El truncate va en el div: en una celda de tabla no corta. */}
                  <div className="truncate" title={f.descripcion}>
                    {f.descripcion || '—'}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <Select
                    value={f.categoria}
                    onValueChange={(v) =>
                      onCambiarFila(f.key, {
                        categoria: v,
                      })
                    }
                    disabled={f.quitar}
                  >
                    <SelectTrigger className="h-6 w-full border-0 bg-transparent px-1.5 text-[11.5px] shadow-none">
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
                </td>
                <td
                  className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums"
                  style={{
                    color:
                      f.direccion === 'ingreso'
                        ? 'oklch(0.45 0.14 145)'
                        : 'var(--arca-accent-neg, oklch(0.55 0.18 25))',
                  }}
                >
                  {f.direccion === 'ingreso' ? '+' : '−'}
                  {fmt.format(Math.abs(f.importe))}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    type="button"
                    className="text-[var(--arca-ink-4)] hover:text-[var(--arca-ink)]"
                    title={
                      f.quitar ? 'Volver a incluir' : 'No importar esta fila'
                    }
                    onClick={() => onCambiarFila(f.key, { quitar: !f.quitar })}
                  >
                    {f.quitar ? (
                      <Plus className="size-3.5" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-[var(--arca-border)] px-3.5 py-2 text-[11.5px] text-[var(--arca-ink-3)]">
        {activos.length} movimiento{activos.length !== 1 ? 's' : ''} a importar
        {filas.length !== activos.length
          ? ` · ${filas.length - activos.length} excluidos`
          : ''}
      </div>
    </div>
  );
}

/** Elegir a mano otra cuenta ya cargada, si la reconocida no es la correcta. */
function SelectorCuentaDestino({
  valor,
  onCambio,
  banco,
}: {
  valor: string | null;
  onCambio: (id: string | null) => void;
  banco: string;
}) {
  const { cuentas } = useCuentasDelCliente();

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--arca-ink-4)]">
      <span>Destino</span>
      <Select
        value={valor ?? NUEVA}
        onValueChange={(v) => onCambio(v === NUEVA ? null : v)}
      >
        <SelectTrigger className="h-7 w-[300px] text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NUEVA} className="text-[12px]">
            Crear una cuenta nueva «{banco}»
          </SelectItem>
          {cuentas.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-[12px]">
              {c.banco}
              {c.alias ? ` · ${c.alias}` : ''}
              {c.numero ? ` (${c.numero})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ─────────────────────────── revisión de uno ──────────────────────────── */

/**
 * Un extracto ya leído: sus cuentas con el cuadre, a dónde va cada una y el
 * botón que importa todo. La lectura viene de la fila, no del navegador.
 */
function RevisarExtracto({
  extractoId,
  onVolver,
}: {
  extractoId: string;
  onVolver: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['extracto', extractoId],
    queryFn: () => getExtracto({ data: { extractoId } }),
  });

  if (!data) {
    return (
      <div className="flex items-center gap-2 px-1 py-8 text-[12.5px] text-[var(--arca-ink-3)]">
        <Loader2 className="size-3.5 animate-spin" />
        Abriendo la lectura…
      </div>
    );
  }

  // En su propio componente para que los hooks de la revisión no queden
  // detrás de este return: con los datos ya cargados, se llaman siempre.
  return (
    <RevisionCargada
      extractoId={extractoId}
      revision={data}
      onVolver={onVolver}
    />
  );
}

function RevisionCargada({
  extractoId,
  revision: data,
  onVolver,
}: {
  extractoId: string;
  revision: Revision;
  onVolver: () => void;
}) {
  const queryClient = useQueryClient();
  const [docAbierto, setDocAbierto] = useState(false);
  // El destino y las filas se editan; arrancan de la lectura guardada.
  const [destinos, setDestinos] = useState<(string | null)[] | null>(null);
  const [filasPorCuenta, setFilasPorCuenta] = useState<FilaEditable[][] | null>(
    null
  );

  const cuentas = data.cuentas;
  const destinosActuales =
    destinos ?? cuentas.map((c) => c.cuentaExistenteId ?? null);
  const filasActuales =
    filasPorCuenta ??
    cuentas.map((c) =>
      c.movimientos.map((m, i) => ({ ...m, key: i, quitar: false }))
    );

  const aImportar = filasActuales.map((filas) =>
    filas.filter((f) => !f.quitar)
  );
  const totalMovimientos = aImportar.reduce((a, f) => a + f.length, 0);
  const todoCuadra = cuentas.every(
    (c, i) => cuadreExtracto(c.saldoInicial, c.saldoFinal, aImportar[i]).cuadra
  );
  const cuentasNuevas = destinosActuales.filter((d) => d === null).length;
  const banco = data.extraccion?.banco ?? 'Banco';

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarExtracto({
        data: {
          extractoId,
          banco,
          cuentas: cuentas
            .map((c, i) => ({
              cuentaBancariaId: destinosActuales[i],
              numeroCuenta: c.numeroCuenta,
              cbu: c.cbu,
              tipo: c.tipo as 'caja_ahorro' | 'cuenta_corriente' | 'otra',
              moneda: c.moneda,
              movimientos: aImportar[i].map((f) => ({
                fecha: f.fecha,
                descripcion: f.descripcion,
                importe: Math.abs(f.importe),
                direccion: f.direccion,
                saldoPosterior: f.saldoPosterior ?? null,
                categoria: f.categoria as CategoriaMovimiento,
              })),
            }))
            .filter((c) => c.movimientos.length > 0),
        },
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['extractos'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccountsResumen'] });
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bankSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
      void queryClient.invalidateQueries({ queryKey: ['bandejaConciliacion'] });
      const enCuentas = r.cuentas > 1 ? ` en ${r.cuentas} cuentas` : '';
      const creadas =
        r.cuentasCreadas > 0
          ? ` · ${r.cuentasCreadas} cuenta${r.cuentasCreadas > 1 ? 's' : ''} creada${r.cuentasCreadas > 1 ? 's' : ''}`
          : '';
      const repetidos = r.salteados > 0 ? ` · ${r.salteados} ya estaban` : '';
      toast.success(
        `${r.importados} movimientos importados${enCuentas}${creadas}${repetidos}`
      );
      onVolver();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo importar'),
  });

  return (
    <div
      className={
        docAbierto
          ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]'
          : ''
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onVolver}>
            <ArrowLeft className="size-3.5" />
            Volver a la cola
          </Button>
          <Badge variant="outline" className="text-[10.5px]">
            <Landmark className="mr-1 size-3" />
            {banco}
          </Badge>
          <span className="text-[11.5px] text-[var(--arca-ink-3)]">
            {data.extraccion?.periodoDesde} → {data.extraccion?.periodoHasta}
            {cuentas.length > 1
              ? ` · consolidado, ${cuentas.length} cuentas`
              : ''}
          </span>
          {data.documentoId && (
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
              onClick={() => setDocAbierto((v) => !v)}
            >
              <FileText className="size-3.5" />
              {docAbierto ? 'Ocultar documento' : 'Ver documento'}
            </button>
          )}
        </div>

        {cuentas.map((cuenta, i) => (
          <BloqueCuenta
            key={`${cuenta.numeroCuenta}-${i}`}
            cuenta={cuenta}
            banco={banco}
            filas={filasActuales[i]}
            onCambiarFila={(key, cambio) =>
              setFilasPorCuenta(
                filasActuales.map((filas, j) =>
                  j === i
                    ? filas.map((f) =>
                        f.key === key ? { ...f, ...cambio } : f
                      )
                    : filas
                )
              )
            }
            onElegirCuenta={(id) =>
              setDestinos(destinosActuales.map((d, j) => (j === i ? id : d)))
            }
          />
        ))}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--arca-border)] pt-3">
          <span className="text-[12px] text-[var(--arca-ink-3)]">
            {totalMovimientos} movimiento{totalMovimientos !== 1 ? 's' : ''} a
            importar
            {cuentas.length > 1 ? ` en ${cuentas.length} cuentas` : ''}
            {cuentasNuevas > 0
              ? ` · se crea${cuentasNuevas > 1 ? 'n' : ''} ${cuentasNuevas} cuenta${cuentasNuevas > 1 ? 's' : ''}`
              : ''}
          </span>
          <Button
            size="sm"
            disabled={confirmar.isPending || totalMovimientos === 0}
            title={
              todoCuadra
                ? undefined
                : 'Alguna cuenta no cuadra: podés importar igual, pero revisala'
            }
            onClick={() => confirmar.mutate()}
          >
            {confirmar.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {todoCuadra ? 'Importar movimientos' : 'Importar igual'}
          </Button>
        </div>
      </div>

      {docAbierto && data.documentoId && (
        <div className="min-w-0 lg:sticky lg:top-0">
          <iframe
            title="Extracto bancario"
            src={`/api/documents/${data.documentoId}`}
            className="h-[62vh] w-full rounded-[12px] border border-[var(--arca-border)] bg-white"
          />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────── diálogo ─────────────────────────────── */

export function ImportarExtractoDialog({
  clienteId,
  children,
  abierto,
  onAbiertoChange,
}: {
  clienteId: string;
  /** Disparador propio. Se puede omitir si lo abre otro control. */
  children?: React.ReactNode;
  /** Abierto desde afuera —la franja de la página, por ejemplo—. */
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
}) {
  const [abiertoPropio, setAbiertoPropio] = useState(false);
  const controlado = abierto !== undefined;
  const open = controlado ? abierto : abiertoPropio;
  const setOpen = (o: boolean) => {
    if (controlado) onAbiertoChange?.(o);
    else setAbiertoPropio(o);
  };
  const [revisando, setRevisando] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setRevisando(null);
      }}
    >
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="!max-w-6xl w-[96vw] max-h-[88vh] overflow-y-auto">
        <ClienteIdContext.Provider value={clienteId}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="size-4" />
              Extractos bancarios
            </DialogTitle>
            <DialogDescription>
              Cargá todos los extractos —en una o varias tandas— y apretá
              «Extraer». Se leen en segundo plano, de a varios a la vez, así que
              podés cerrar esto y seguir trabajando; cuando estén, se revisan y
              se importan.
            </DialogDescription>
          </DialogHeader>

          {revisando ? (
            <RevisarExtracto
              key={revisando}
              extractoId={revisando}
              onVolver={() => setRevisando(null)}
            />
          ) : (
            <ColaExtractos clienteId={clienteId} onRevisar={setRevisando} />
          )}
        </ClienteIdContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
