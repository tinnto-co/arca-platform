/**
 * Importador de extractos bancarios (TIN-1634).
 *
 * Dropzone de PDF → la IA lee banco, saldos y movimientos → control de cuadre
 * (inicial + ingresos − egresos = final, aritmética nuestra) → una persona
 * revisa con el PDF al costado, elige la cuenta y confirma → recién ahí se
 * guardan los movimientos (deduplicados: reimportar no duplica) y el PDF
 * queda en R2 como respaldo.
 */
import { useEffect, useRef, useState } from 'react';
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
import { createCuentaBancaria, listCuentasBancarias } from '@/actions/bank';
import { confirmarExtracto, extraerExtracto } from '@/actions/extractos';
import { cuadreExtracto } from '@/lib/extracto-calc';
import {
  CATEGORIAS_MOVIMIENTO,
  CATEGORIA_MOVIMIENTO_LABEL,
  type CategoriaMovimiento,
} from '@/lib/clasificar-movimiento';

type Extraccion = Awaited<ReturnType<typeof extraerExtracto>>;

interface ExtractoPendiente {
  extraccion: Extraccion;
  fileName: string;
  mimeType: string;
  base64Data: string;
  /** Vista previa local del PDF (todavía no está en R2). */
  previewUrl: string;
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

/** Card de un extracto extraído: cuadre, cuenta destino, filas y confirmación. */
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
  const [cuentaId, setCuentaId] = useState('');
  // Cada fila conserva su categoría (editable) y puede quitarse de la
  // importación sin tocar el resto.
  const [filas, setFilas] = useState(
    extraccion.movimientos.map((m, i) => ({ ...m, key: i, quitar: false }))
  );

  const { data: cuentas = [] } = useQuery({
    queryKey: ['bankAccounts', clienteId],
    queryFn: () => listCuentasBancarias({ data: { clienteId } }),
  });

  const activos = filas.filter((f) => !f.quitar);
  // El cuadre se recalcula en vivo: quitar una fila puede romperlo (y eso
  // tiene que verse), no solo la lectura de la IA.
  const cuadre = cuadreExtracto(
    extraccion.saldoInicial,
    extraccion.saldoFinal,
    activos
  );

  const crearCuenta = useMutation({
    mutationFn: () =>
      createCuentaBancaria({
        data: {
          clienteId,
          banco: extraccion.banco || 'Banco',
          numero: extraccion.numeroCuenta || undefined,
          moneda: (extraccion.moneda || 'ARS').slice(0, 3).toUpperCase(),
        },
      }),
    onSuccess: (cuenta) => {
      void queryClient.invalidateQueries({
        queryKey: ['bankAccounts', clienteId],
      });
      setCuentaId(cuenta.id);
      toast.success(`Cuenta creada: ${cuenta.banco}`);
    },
    onError: (e) =>
      toast.error(
        e instanceof Error ? e.message : 'No se pudo crear la cuenta'
      ),
  });

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarExtracto({
        data: {
          clienteId,
          cuentaBancariaId: cuentaId,
          fileName: pendiente.fileName,
          mimeType: pendiente.mimeType,
          base64Data: pendiente.base64Data,
          movimientos: activos.map((f) => ({
            fecha: f.fecha,
            descripcion: f.descripcion,
            importe: Math.abs(f.importe),
            direccion: f.direccion,
            saldoPosterior: f.saldoPosterior ?? null,
            categoria: f.categoria,
          })),
        },
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
      void queryClient.invalidateQueries({ queryKey: ['bankSummary'] });
      void queryClient.invalidateQueries({ queryKey: ['bancoVsFacturacion'] });
      toast.success(
        r.salteados > 0
          ? `${r.importados} movimientos importados (${r.salteados} ya estaban)`
          : `${r.importados} movimientos importados`
      );
      onListo();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo importar'),
  });

  return (
    <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4">
      {/* Encabezado: banco detectado + período + PDF */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10.5px]">
          <Landmark className="mr-1 size-3" />
          {extraccion.banco || 'Banco sin identificar'}
        </Badge>
        <span className="text-[11.5px] text-[var(--arca-ink-3)]">
          {extraccion.periodoDesde} → {extraccion.periodoHasta} ·{' '}
          {extraccion.moneda}
          {extraccion.numeroCuenta ? ` · Cta ${extraccion.numeroCuenta}` : ''}
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

      {/* Cuadre: la red de seguridad. Verde cuadra, ámbar no. */}
      <div
        className={`mt-3 flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12px] leading-relaxed ${
          cuadre.cuadra
            ? 'border-[var(--arca-border)] bg-[var(--arca-accent-pos-bg,oklch(0.95_0.05_145))] text-[var(--arca-accent-pos-fg,oklch(0.4_0.12_145))]'
            : 'border-[var(--arca-border)] bg-[var(--arca-accent-warn-bg)] text-[var(--arca-accent-warn-fg)]'
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
            {fmt.format(extraccion.saldoInicial)}
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
                {fmt.format(extraccion.saldoFinal)}
              </span>{' '}
              (diferencia {fmt.format(cuadre.diferencia)}). Puede faltar un
              movimiento o haber una lectura errada: revisá contra el PDF antes
              de confirmar.
            </>
          )}
        </span>
      </div>

      {/* Cuenta destino */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={cuentaId} onValueChange={setCuentaId}>
          <SelectTrigger className="h-8 w-[280px] text-[12.5px]">
            <SelectValue placeholder="¿A qué cuenta corresponde?" />
          </SelectTrigger>
          <SelectContent>
            {cuentas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.banco}
                {c.alias ? ` · ${c.alias}` : ''}
                {c.numero ? ` (${c.numero})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={crearCuenta.isPending}
          onClick={() => crearCuenta.mutate()}
        >
          {crearCuenta.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Crear cuenta «{extraccion.banco || 'Banco'}»
        </Button>
      </div>

      {/* Movimientos: categoría editable, fila descartable */}
      <div className="mt-3 max-h-[320px] overflow-y-auto rounded-[10px] border border-[var(--arca-border)]">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-left text-[var(--arca-ink-3)]">
              <th className="px-3 py-2 font-medium">Fecha</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 text-right font-medium">Importe</th>
              <th className="px-2 py-2" />
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
                <td className="max-w-[320px] truncate px-3 py-1.5">
                  {f.descripcion || '—'}
                </td>
                <td className="px-3 py-1.5">
                  <Select
                    value={f.categoria}
                    onValueChange={(v) =>
                      setFilas((prev) =>
                        prev.map((x) =>
                          x.key === f.key
                            ? { ...x, categoria: v as CategoriaMovimiento }
                            : x
                        )
                      )
                    }
                    disabled={f.quitar}
                  >
                    <SelectTrigger className="h-6 w-[170px] border-0 bg-transparent px-1.5 text-[11.5px] shadow-none">
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
                    onClick={() =>
                      setFilas((prev) =>
                        prev.map((x) =>
                          x.key === f.key ? { ...x, quitar: !x.quitar } : x
                        )
                      )
                    }
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

      {/* Pie: totales + acciones */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--arca-border)] pt-3">
        <span className="text-[12px] text-[var(--arca-ink-3)]">
          {activos.length} movimiento{activos.length !== 1 ? 's' : ''} a
          importar
          {filas.length !== activos.length
            ? ` · ${filas.length - activos.length} excluidos`
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
            disabled={confirmar.isPending || !cuentaId || activos.length === 0}
            title={
              !cuentaId
                ? 'Elegí primero la cuenta bancaria'
                : !cuadre.cuadra
                  ? 'El extracto no cuadra: podés confirmar igual, pero revisalo'
                  : undefined
            }
            onClick={() => confirmar.mutate()}
          >
            {confirmar.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {cuadre.cuadra ? 'Importar movimientos' : 'Importar igual'}
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
      </DialogContent>
    </Dialog>
  );
}
