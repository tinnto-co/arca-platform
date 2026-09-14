/**
 * Carga de despachos de importación (IVA aduanero, Concepto 415).
 *
 * Una sola estructura montada en Facturas y en Contabilidad: dropzone de
 * PDFs/fotos → la IA extrae los 3 datos (alícuota, IVA USD, TC) → una persona
 * revisa (editable, derivados en vivo) y confirma → se crea la compra
 * (`comprobante` tipo 66) y el crédito fiscal entra solo a IVA y balances.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Ship,
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
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Badge } from '@/components/ui/badge';
import { getClientes } from '@/actions/client';
import {
  confirmarDespacho,
  descartarDespacho,
  listarDespachos,
  subirYExtraerDespacho,
} from '@/actions/despachos';
import {
  alicuotaValida,
  calcularDespacho,
  nombreCompraDespacho,
} from '@/lib/despacho-calc';

type DespachoExtraido = Awaited<
  ReturnType<typeof subirYExtraerDespacho>
>['despacho'];

const fmt = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

const TIPO_LABEL: Record<string, string> = {
  importacion_directa: 'Importación Directa',
  destinacion_simplificada: 'Destinación Simplificada',
};

const ESTADO_LABEL: Record<string, string> = {
  extraido: 'Extraído',
  revision: 'A revisar',
  confirmado: 'Confirmado',
  descartado: 'Descartado',
};

function leerComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL siempre entrega string ("data:...;base64,....").
      const res = reader.result as string;
      resolve(res.slice(res.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/** Card de un despacho recién extraído: se revisa, se corrige y se confirma. */
function CardDespacho({
  despacho,
  duplicado,
  onListo,
  docAbierto,
  onVerDocumento,
}: {
  despacho: NonNullable<DespachoExtraido>;
  duplicado: boolean;
  onListo: () => void;
  docAbierto: boolean;
  onVerDocumento: (documentoId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [numero, setNumero] = useState(despacho.numero);
  const [fecha, setFecha] = useState(despacho.fecha ?? '');
  const [alicuota, setAlicuota] = useState(String(Number(despacho.alicuota)));
  const [ivaUsd, setIvaUsd] = useState(String(Number(despacho.ivaUsd)));
  const [tipoCambio, setTipoCambio] = useState(
    String(Number(despacho.tipoCambio))
  );

  const nums = {
    alicuota: Number(alicuota.replace(',', '.')) || 0,
    ivaUsd: Number(ivaUsd.replace(',', '.')) || 0,
    tipoCambio: Number(tipoCambio.replace(',', '.')) || 0,
  };
  const derivados = calcularDespacho(nums);
  const alicuotaRara = nums.alicuota > 0 && !alicuotaValida(nums.alicuota);
  const yaConfirmado = despacho.estado === 'confirmado';

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ['despachos'] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['libro-iva'] });
  };

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarDespacho({
        data: {
          despachoId: despacho.id,
          alicuota: nums.alicuota,
          ivaUsd: nums.ivaUsd,
          tipoCambio: nums.tipoCambio,
          numero: numero.trim(),
          fecha: fecha === '' ? null : fecha,
        },
      }),
    onSuccess: (r) => {
      invalidar();
      toast.success(`Compra creada: ${r.nombreCompra}`);
      onListo();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo confirmar'),
  });

  const descartar = useMutation({
    mutationFn: () => descartarDespacho({ data: { despachoId: despacho.id } }),
    onSuccess: () => {
      invalidar();
      onListo();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar'),
  });

  return (
    <div className="rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10.5px]">
          {TIPO_LABEL[despacho.tipo] ?? despacho.tipo}
        </Badge>
        {despacho.estado === 'revision' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--arca-accent-warn-bg)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--arca-accent-warn-fg)]">
            <AlertTriangle className="size-3" />
            Revisar:{' '}
            {alicuotaRara ? 'alícuota fuera de 21% / 10,5%' : 'lectura dudosa'}
          </span>
        )}
        {duplicado && (
          <span className="text-[11px] text-[var(--arca-ink-3)]">
            Ya estaba cargado — se muestra el existente.
          </span>
        )}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
          onClick={() =>
            onVerDocumento(docAbierto ? null : despacho.documentoId)
          }
        >
          <FileText className="size-3.5" />
          {docAbierto ? 'Ocultar documento' : 'Ver documento'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="col-span-2 flex flex-col gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          {despacho.tipo === 'importacion_directa'
            ? 'N° de despacho'
            : 'N° de manifiesto'}
          <Input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            disabled={yaConfirmado}
            className="h-8 text-[12.5px] font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          Fecha
          <Input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            disabled={yaConfirmado}
            className="h-8 text-[12.5px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          Alícuota %
          <Input
            value={alicuota}
            onChange={(e) => setAlicuota(e.target.value)}
            disabled={yaConfirmado}
            inputMode="decimal"
            className="h-8 text-[12.5px] tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          IVA (USD)
          <Input
            value={ivaUsd}
            onChange={(e) => setIvaUsd(e.target.value)}
            disabled={yaConfirmado}
            inputMode="decimal"
            className="h-8 text-[12.5px] tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11.5px] text-[var(--arca-ink-3)]">
          Tipo de cambio
          <Input
            value={tipoCambio}
            onChange={(e) => setTipoCambio(e.target.value)}
            disabled={yaConfirmado}
            inputMode="decimal"
            className="h-8 text-[12.5px] tabular-nums"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--arca-border)] pt-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[var(--arca-ink-3)]">
          <span>
            IVA en pesos{' '}
            <span className="font-semibold tabular-nums text-[var(--arca-ink)]">
              {fmt.format(derivados.ivaPesos)}
            </span>
          </span>
          <span>
            Neto gravado{' '}
            <span className="font-semibold tabular-nums text-[var(--arca-ink)]">
              {fmt.format(derivados.netoGravado)}
            </span>
          </span>
          <span>
            Total{' '}
            <span className="font-semibold tabular-nums text-[var(--arca-ink)]">
              {fmt.format(derivados.total)}
            </span>
          </span>
        </div>
        {!yaConfirmado && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={descartar.isPending || confirmar.isPending}
              onClick={() => descartar.mutate()}
            >
              <X className="size-3.5" />
              Descartar
            </Button>
            <Button
              size="sm"
              disabled={
                confirmar.isPending ||
                descartar.isPending ||
                !numero.trim() ||
                nums.alicuota <= 0 ||
                nums.ivaUsd <= 0 ||
                nums.tipoCambio <= 0
              }
              title={
                alicuotaRara
                  ? 'Alícuota fuera de 21% / 10,5%: confirmá solo si el documento realmente la usa'
                  : undefined
              }
              onClick={() => confirmar.mutate()}
            >
              {confirmar.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Confirmar compra
            </Button>
          </div>
        )}
        {yaConfirmado && (
          <span className="text-[12px] font-medium text-[var(--arca-accent-pos-fg)]">
            ✓ {nombreCompraDespacho(despacho.tipo, despacho.numero)}
          </span>
        )}
      </div>
    </div>
  );
}

export function DespachosImportacionDialog({
  clienteId: clienteIdProp,
  children,
}: {
  /** Empresa fija (Contabilidad la pasa); sin ella, selector propio. */
  clienteId?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [clienteElegido, setClienteElegido] = useState('');
  const clienteId = clienteIdProp ?? clienteElegido;

  const [procesando, setProcesando] = useState<string[]>([]);
  const [extraidos, setExtraidos] = useState<
    { despacho: NonNullable<DespachoExtraido>; duplicado: boolean }[]
  >([]);
  // El PDF se abre al costado de los números, en la misma vista.
  const [docAbierto, setDocAbierto] = useState<string | null>(null);
  // El dropzone se pliega mientras se analizan números; un click lo reabre.
  const [subirAbierto, setSubirAbierto] = useState(true);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
    enabled: open && !clienteIdProp,
  });
  const opciones = useMemo(
    () =>
      clientes.map((c) => ({
        value: c.id,
        label: `${c.razonSocial} · ${c.cuit}`,
      })),
    [clientes]
  );

  const { data: historial = [] } = useQuery({
    queryKey: ['despachos', clienteIdProp ?? null],
    queryFn: () =>
      listarDespachos({
        data: { clienteId: clienteIdProp },
      }),
    enabled: open,
  });

  const procesarArchivos = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!clienteId) {
      toast.error('Elegí primero la empresa importadora');
      return;
    }
    // En serie a propósito: cada PDF es una llamada al modelo.
    for (const file of Array.from(files)) {
      setProcesando((p) => [...p, file.name]);
      try {
        const base64Data = await leerComoBase64(file);
        const r = await subirYExtraerDespacho({
          data: {
            clienteId,
            fileName: file.name,
            mimeType: file.type === '' ? 'application/pdf' : file.type,
            base64Data,
          },
        });
        if (r.despacho) {
          setExtraidos((prev) => [
            { despacho: r.despacho, duplicado: r.duplicado },
            ...prev,
          ]);
          setSubirAbierto(false);
          setDocAbierto((d) => d ?? r.despacho.documentoId);
          if (r.duplicado) toast.info(`${file.name}: ya estaba cargado`);
          if (r.aviso) toast.warning(r.aviso, { duration: 9000 });
        }
      } catch (e) {
        toast.error(
          `${file.name}: ${e instanceof Error ? e.message : 'no se pudo procesar'}`
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
            <Ship className="size-4" />
            Despachos de importación
          </DialogTitle>
          <DialogDescription>
            Subí el PDF (o foto) del despacho: se lee el Concepto 415 (IVA
            aduanero), revisás los datos y se genera la compra. El crédito
            fiscal entra solo al IVA y a los balances.
          </DialogDescription>
        </DialogHeader>

        {!clienteIdProp && (
          <SearchableSelect
            options={opciones}
            value={clienteElegido}
            onValueChange={setClienteElegido}
            placeholder="Empresa importadora"
            searchPlaceholder="Buscar por nombre o CUIT…"
            emptyMessage="No se encontraron empresas"
            width={360}
          />
        )}

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
                : 'Arrastrá o hacé click para subir despachos (PDF, JPG, PNG — hasta 15 MB)'}
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
              {arrastrando ? 'Soltá para subir' : 'Subir más despachos'}
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
              <div
                key={nombre}
                className="flex items-center gap-2 rounded-[10px] border border-[var(--arca-border)] px-4 py-2.5 text-[12.5px] text-[var(--arca-ink-3)]"
              >
                <Loader2 className="size-3.5 animate-spin" />
                Leyendo {nombre}…
              </div>
            ))}

            {extraidos.map(({ despacho, duplicado }) => (
              <CardDespacho
                key={despacho.id}
                despacho={despacho}
                duplicado={duplicado}
                docAbierto={docAbierto === despacho.documentoId}
                onVerDocumento={setDocAbierto}
                onListo={() =>
                  setExtraidos((prev) =>
                    prev.filter((e) => e.despacho.id !== despacho.id)
                  )
                }
              />
            ))}

            {historial.length > 0 && (
              <div className="mt-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--arca-ink-4)]">
                  Cargados recientemente
                </p>
                <div className="overflow-x-auto rounded-[10px] border border-[var(--arca-border)]">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-[var(--arca-border)] bg-[var(--arca-surface-2)] text-left text-[var(--arca-ink-3)]">
                        <th className="px-3 py-2 font-medium">Empresa</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Número</th>
                        <th className="px-3 py-2 text-right font-medium">
                          Total
                        </th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {historial.slice(0, 12).map((d) => (
                        <tr
                          key={d.id}
                          className="border-b border-[var(--arca-border)] last:border-0"
                        >
                          <td className="max-w-[180px] truncate px-3 py-2">
                            {d.clienteNombre}
                          </td>
                          <td className="px-3 py-2 text-[var(--arca-ink-3)]">
                            {TIPO_LABEL[d.tipo] ?? d.tipo}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11.5px]">
                            {d.numero}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {fmt.format(Number(d.total))}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                d.estado === 'confirmado'
                                  ? 'outline'
                                  : 'secondary'
                              }
                              className="text-[10px]"
                            >
                              {ESTADO_LABEL[d.estado] ?? d.estado}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {(d.estado === 'extraido' ||
                                d.estado === 'revision' ||
                                d.estado === 'descartado') && (
                                <button
                                  type="button"
                                  className="text-[11.5px] font-medium text-[var(--arca-ink)] hover:underline"
                                  onClick={() => {
                                    setExtraidos((prev) =>
                                      prev.some((e) => e.despacho.id === d.id)
                                        ? prev
                                        : [
                                            { despacho: d, duplicado: false },
                                            ...prev,
                                          ]
                                    );
                                    setDocAbierto(d.documentoId);
                                    setSubirAbierto(false);
                                  }}
                                >
                                  Revisar
                                </button>
                              )}
                              <button
                                type="button"
                                className="text-[11.5px] text-[var(--arca-ink-3)] hover:underline"
                                onClick={() =>
                                  setDocAbierto(
                                    docAbierto === d.documentoId
                                      ? null
                                      : d.documentoId
                                  )
                                }
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {docAbierto && (
            <div className="min-w-0 lg:sticky lg:top-0">
              <iframe
                title="Documento del despacho"
                src={`/api/documents/${docAbierto}`}
                className="h-[62vh] w-full rounded-[12px] border border-[var(--arca-border)] bg-white"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
