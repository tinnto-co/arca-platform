/**
 * Importador de extractos bancarios (TIN-1634).
 *
 * Dropzone de PDF → la IA lee banco, saldos y movimientos → control de cuadre
 * (inicial + ingresos − egresos = final, aritmética nuestra) → una persona
 * revisa con el PDF al costado, elige la cuenta y confirma → recién ahí se
 * guardan los movimientos (deduplicados: reimportar no duplica) y el PDF
 * queda en R2 como respaldo.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileText,
  Landmark,
  Loader2,
  Plus,
  Upload,
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
import { confirmarExtracto, extraerExtracto } from '@/actions/extractos';
import { cuadreExtracto } from '@/lib/extracto-calc';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
  type CategoriaMovimiento,
} from '@/lib/clasificar-movimiento';

type Extraccion = Awaited<ReturnType<typeof extraerExtracto>>;
type CuentaExtraida = Extraccion['cuentas'][number];
/** Movimiento en revisión: su categoría se edita y la fila se puede excluir. */
type FilaEditable = CuentaExtraida['movimientos'][number] & {
  key: number;
  quitar: boolean;
};

interface ExtractoPendiente {
  extraccion: Extraccion;
  fileName: string;
  mimeType: string;
  base64Data: string;
  /** Vista previa local del PDF (todavía no está en R2). */
  previewUrl: string;
}

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

function leerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.slice(res.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Línea de progreso mientras el modelo lee el PDF.
 *
 * Con el contador a la vista: un extracto de varias hojas puede tardar un
 * par de minutos y sin el segundero parece colgado.
 */
function LeyendoArchivo({ nombre }: { nombre: string }) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[var(--arca-border)] px-4 py-2.5 text-[12.5px] text-[var(--arca-ink-3)]">
      <Loader2 className="size-3.5 animate-spin" />
      <span className="min-w-0 truncate">Leyendo {nombre}…</span>
      <span className="ml-auto shrink-0 tabular-nums">
        {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}
      </span>
      {segundos > 45 && (
        <span className="shrink-0 text-[11.5px] text-[var(--arca-ink-4)]">
          los extractos largos tardan un par de minutos
        </span>
      )}
    </div>
  );
}

/**
 * Una cuenta del extracto: su cuadre, su destino y sus movimientos.
 *
 * Un extracto consolidado trae varias y cada una se revisa por separado,
 * porque cada una tiene sus propios saldos y su propia tabla en el PDF.
 */
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
                        categoria: v as CategoriaMovimiento,
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

/** Card de un extracto: cabecera del documento, sus cuentas y confirmación. */
function CardExtracto({
  pendiente,
  clienteId,
  onListo,
  docAbierto,
  onVerDocumento,
}: {
  pendiente: ExtractoPendiente;
  clienteId: string;
  onListo: () => void;
  docAbierto: boolean;
  onVerDocumento: (url: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { extraccion } = pendiente;

  // Estado editable: el destino elegido y las filas de cada cuenta. La clave
  // es el índice de la cuenta en la extracción.
  const [destinos, setDestinos] = useState<(string | null)[]>(
    extraccion.cuentas.map((c) => c.cuentaExistenteId)
  );
  const [filasPorCuenta, setFilasPorCuenta] = useState<FilaEditable[][]>(
    extraccion.cuentas.map((c) =>
      c.movimientos.map((m, i) => ({ ...m, key: i, quitar: false }))
    )
  );

  const aImportar = filasPorCuenta.map((filas) =>
    filas.filter((f) => !f.quitar)
  );
  const totalMovimientos = aImportar.reduce((a, f) => a + f.length, 0);
  const todoCuadra = extraccion.cuentas.every(
    (c, i) => cuadreExtracto(c.saldoInicial, c.saldoFinal, aImportar[i]).cuadra
  );
  const cuentasNuevas = destinos.filter((d) => d === null).length;

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarExtracto({
        data: {
          clienteId,
          fileName: pendiente.fileName,
          mimeType: pendiente.mimeType,
          base64Data: pendiente.base64Data,
          banco: extraccion.banco || 'Banco',
          cuentas: extraccion.cuentas
            .map((c, i) => ({
              cuentaBancariaId: destinos[i],
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
                categoria: f.categoria,
              })),
            }))
            // Una cuenta sin movimientos no se manda: el server los exige.
            .filter((c) => c.movimientos.length > 0),
        },
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
      void queryClient.invalidateQueries({ queryKey: ['bankAccountsResumen'] });
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bankSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
      const enCuentas = r.cuentas > 1 ? ` en ${r.cuentas} cuentas` : '';
      const creadas =
        r.cuentasCreadas > 0
          ? ` · ${r.cuentasCreadas} cuenta${r.cuentasCreadas > 1 ? 's' : ''} creada${r.cuentasCreadas > 1 ? 's' : ''}`
          : '';
      const repetidos = r.salteados > 0 ? ` · ${r.salteados} ya estaban` : '';
      toast.success(
        `${r.importados} movimientos importados${enCuentas}${creadas}${repetidos}`
      );
      onListo();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo importar'),
  });

  return (
    <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4">
      {/* Encabezado del documento: banco, período y PDF */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10.5px]">
          <Landmark className="mr-1 size-3" />
          {extraccion.banco || 'Banco sin identificar'}
        </Badge>
        <span className="text-[11.5px] text-[var(--arca-ink-3)]">
          {extraccion.periodoDesde} → {extraccion.periodoHasta}
          {extraccion.cuentas.length > 1
            ? ` · extracto consolidado, ${extraccion.cuentas.length} cuentas`
            : ''}
        </span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
          onClick={() =>
            onVerDocumento(docAbierto ? null : pendiente.previewUrl)
          }
        >
          <FileText className="size-3.5" />
          {docAbierto ? 'Ocultar documento' : 'Ver documento'}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {extraccion.cuentas.map((cuenta, i) => (
          <BloqueCuenta
            key={`${cuenta.numeroCuenta}-${i}`}
            cuenta={cuenta}
            banco={extraccion.banco || 'Banco'}
            filas={filasPorCuenta[i]}
            onCambiarFila={(key, cambio) =>
              setFilasPorCuenta((prev) =>
                prev.map((filas, j) =>
                  j === i
                    ? filas.map((f) =>
                        f.key === key ? { ...f, ...cambio } : f
                      )
                    : filas
                )
              )
            }
            onElegirCuenta={(id) =>
              setDestinos((prev) => prev.map((d, j) => (j === i ? id : d)))
            }
          />
        ))}
      </div>

      {/* Pie: totales de todo el extracto + acciones */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--arca-border)] pt-3">
        <span className="text-[12px] text-[var(--arca-ink-3)]">
          {totalMovimientos} movimiento{totalMovimientos !== 1 ? 's' : ''} a
          importar
          {extraccion.cuentas.length > 1
            ? ` en ${extraccion.cuentas.length} cuentas`
            : ''}
          {cuentasNuevas > 0
            ? ` · se crea${cuentasNuevas > 1 ? 'n' : ''} ${cuentasNuevas} cuenta${cuentasNuevas > 1 ? 's' : ''}`
            : ''}
        </span>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={confirmar.isPending}
            onClick={onListo}
          >
            <X className="size-3.5" />
            Descartar
          </Button>
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
    </div>
  );
}

export function ImportarExtractoDialog({
  clienteId,
  children,
}: {
  clienteId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [procesando, setProcesando] = useState<string[]>([]);
  const [extraidos, setExtraidos] = useState<ExtractoPendiente[]>([]);
  const [docAbierto, setDocAbierto] = useState<string | null>(null);
  const [subirAbierto, setSubirAbierto] = useState(true);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Los object URLs de la vista previa se liberan al cerrar.
  useEffect(() => {
    if (!open) return;
    return () => {
      extraidos.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const procesarArchivos = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!clienteId) {
      toast.error('Elegí primero la empresa');
      return;
    }
    // En serie a propósito: cada PDF es una llamada al modelo.
    for (const file of Array.from(files)) {
      setProcesando((p) => [...p, file.name]);
      try {
        const base64Data = await leerComoBase64(file);
        const mimeType = file.type === '' ? 'application/pdf' : file.type;
        const extraccion = await extraerExtracto({
          data: { clienteId, fileName: file.name, mimeType, base64Data },
        });
        const previewUrl = URL.createObjectURL(file);
        setExtraidos((prev) => [
          { extraccion, fileName: file.name, mimeType, base64Data, previewUrl },
          ...prev,
        ]);
        setSubirAbierto(false);
        setDocAbierto((d) => d ?? previewUrl);
      } catch (e) {
        toast.error(
          `${file.name}: ${e instanceof Error ? e.message : 'no se pudo procesar'}`,
          { duration: 9000 }
        );
      } finally {
        setProcesando((p) => p.filter((n) => n !== file.name));
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          extraidos.forEach((e) => URL.revokeObjectURL(e.previewUrl));
          setExtraidos([]);
          setDocAbierto(null);
          setSubirAbierto(true);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="!max-w-6xl w-[96vw] max-h-[88vh] overflow-y-auto">
        <ClienteIdContext.Provider value={clienteId}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="size-4" />
              Importar extracto bancario
            </DialogTitle>
            <DialogDescription>
              Subí el PDF del extracto (banco o billetera): se leen los
              movimientos, se controla que los saldos cuadren, revisás y recién
              ahí se guardan. Reimportar el mismo extracto no duplica.
            </DialogDescription>
          </DialogHeader>

          {(() => {
            // Sin preventDefault en dragover/drop, el navegador navega al
            // archivo en vez de entregarlo.
            const dragProps = {
              onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                setArrastrando(true);
              },
              onDragLeave: () => setArrastrando(false),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                setArrastrando(false);
                void procesarArchivos(e.dataTransfer.files);
              },
            };
            return subirAbierto ? (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                {...dragProps}
                className={`flex flex-col items-center gap-2 rounded-[12px] border border-dashed px-6 py-8 text-[13px] transition-colors ${
                  arrastrando
                    ? 'border-[var(--arca-ink)] bg-[var(--arca-surface)] text-[var(--arca-ink)]'
                    : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)]'
                }`}
              >
                <Upload className="size-5 text-[var(--arca-ink-4)]" />
                {arrastrando
                  ? 'Soltá para subir'
                  : 'Arrastrá o hacé click para subir extractos (PDF — hasta 20 MB)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSubirAbierto(true);
                  inputRef.current?.click();
                }}
                {...dragProps}
                className={`inline-flex w-fit items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[12.5px] ${
                  arrastrando
                    ? 'border-[var(--arca-ink)] bg-[var(--arca-surface-2)] text-[var(--arca-ink)]'
                    : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface)] text-[var(--arca-ink-2)] hover:bg-[var(--arca-surface-2)]'
                }`}
              >
                <Upload className="size-3.5" />
                {arrastrando ? 'Soltá para subir' : 'Subir otro extracto'}
              </button>
            );
          })()}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              void procesarArchivos(e.target.files);
              e.target.value = '';
            }}
          />

          <div
            className={
              docAbierto
                ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,44%)]'
                : ''
            }
          >
            <div className="flex min-w-0 flex-col gap-3">
              {procesando.map((nombre) => (
                <LeyendoArchivo key={nombre} nombre={nombre} />
              ))}

              {extraidos.map((p) => (
                <CardExtracto
                  key={p.previewUrl}
                  pendiente={p}
                  clienteId={clienteId}
                  docAbierto={docAbierto === p.previewUrl}
                  onVerDocumento={setDocAbierto}
                  onListo={() => {
                    setExtraidos((prev) =>
                      prev.filter((e) => e.previewUrl !== p.previewUrl)
                    );
                    setDocAbierto((d) => (d === p.previewUrl ? null : d));
                    URL.revokeObjectURL(p.previewUrl);
                  }}
                />
              ))}

              {extraidos.length === 0 && procesando.length === 0 && (
                <p className="text-[12px] text-[var(--arca-ink-4)]">
                  Bancos y billeteras: BBVA, Galicia, Santander, ICBC, Macro,
                  Coinag, Mercado Pago y más. Si uno no se lee bien, avisá al
                  equipo con el archivo.
                </p>
              )}
            </div>

            {docAbierto && (
              <div className="min-w-0 lg:sticky lg:top-0">
                <iframe
                  title="Extracto bancario"
                  src={docAbierto}
                  className="h-[62vh] w-full rounded-[12px] border border-[var(--arca-border)] bg-white"
                />
              </div>
            )}
          </div>
        </ClienteIdContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
