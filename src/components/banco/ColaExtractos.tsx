/**
 * Cola de extractos: subir muchos, ver cómo avanzan, revisar los que están.
 *
 * Subir y revisar dejaron de ser el mismo momento. Los PDFs se suben de una
 * (eso es rápido: solo viaja el archivo), el servidor los lee de a varios en
 * paralelo y esta lista muestra en qué va cada uno. Mientras haya algo en
 * curso se repregunta sola y avisa por toast cuántos terminaron, así el
 * estudio puede irse a otra pantalla y volver cuando estén.
 *
 * La revisión de un extracto ya leído vive en `RevisarExtracto`, que lee la
 * extracción guardada en la fila.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RotateCcw,
  Upload,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  descartarExtracto,
  encolarExtractos,
  listarExtractos,
  reintentarExtracto,
  subirExtracto,
} from '@/actions/extractos';

type ExtractoEnCola = Awaited<ReturnType<typeof listarExtractos>>[number];

/** Estados en los que el servidor todavía está trabajando. */
const EN_CURSO = ['pendiente', 'procesando'] as const;

const ESTADO: Record<
  string,
  { label: string; clase: string; icono: typeof Clock }
> = {
  cargado: {
    label: 'Sin extraer',
    clase: 'text-[var(--arca-ink-4)]',
    icono: FileText,
  },
  pendiente: {
    label: 'En cola',
    clase: 'text-[var(--arca-ink-3)]',
    icono: Clock,
  },
  procesando: {
    label: 'Leyendo…',
    clase: 'text-[var(--arca-accent-fg)]',
    icono: Loader2,
  },
  extraido: {
    label: 'Listo para revisar',
    clase: 'text-[var(--arca-accent-pos-fg)]',
    icono: CheckCircle2,
  },
  error: {
    label: 'No se pudo leer',
    clase: 'text-[var(--arca-accent-warn-fg)]',
    icono: AlertTriangle,
  },
};

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

export function ColaExtractos({
  clienteId,
  onRevisar,
}: {
  clienteId: string;
  /** Abrir un extracto ya leído para revisarlo e importarlo. */
  onRevisar: (extractoId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [subiendo, setSubiendo] = useState<string[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: cola = [] } = useQuery({
    queryKey: ['extractos', clienteId],
    queryFn: () => listarExtractos({ data: { clienteId } }),
    enabled: !!clienteId,
    // Mientras el servidor esté leyendo algo, se repregunta; cuando la cola
    // se queda quieta, deja de consultar sola.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) =>
        (EN_CURSO as readonly string[]).includes(e.estado)
      )
        ? 4000
        : false,
  });

  const cargados = cola.filter((e) => e.estado === 'cargado');
  const enCurso = cola.filter((e) =>
    (EN_CURSO as readonly string[]).includes(e.estado)
  ).length;
  const listos = cola.filter((e) => e.estado === 'extraido').length;
  const conError = cola.filter((e) => e.estado === 'error').length;

  // Avisar cuando algo termina, sin repetir el aviso en cada repregunta: se
  // compara contra lo último informado.
  const avisado = useRef({ listos: 0, conError: 0, arrancado: false });
  useEffect(() => {
    const previo = avisado.current;
    // La primera vuelta solo toma la foto: entrar a la pantalla con cosas ya
    // procesadas no es una novedad que merezca un toast.
    if (!previo.arrancado) {
      avisado.current = { listos, conError, arrancado: true };
      return;
    }
    if (listos > previo.listos) {
      const nuevos = listos - previo.listos;
      toast.success(
        nuevos === 1
          ? 'Un extracto quedó listo para revisar'
          : `${nuevos} extractos quedaron listos para revisar`,
        {
          description:
            enCurso > 0
              ? `Faltan ${enCurso} de ${cola.length}.`
              : 'Terminó toda la cola.',
        }
      );
    }
    if (conError > previo.conError) {
      toast.error(
        conError - previo.conError === 1
          ? 'Un extracto no se pudo leer'
          : `${conError - previo.conError} extractos no se pudieron leer`,
        { description: 'Podés reintentarlos desde la lista.' }
      );
    }
    avisado.current = { listos, conError, arrancado: true };
  }, [listos, conError, enCurso, cola.length]);

  /** El botón "Extraer": manda a leer toda la tanda cargada. */
  const extraer = useMutation({
    mutationFn: () => encolarExtractos({ data: { clienteId } }),
    onSuccess: ({ encolados }) => {
      void queryClient.invalidateQueries({ queryKey: ['extractos'] });
      toast.success(
        encolados === 1
          ? 'Extrayendo 1 extracto'
          : `Extrayendo ${encolados} extractos`,
        {
          description:
            'Se leen en segundo plano, de a tres a la vez: podés cerrar esto y seguir trabajando.',
        }
      );
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo arrancar'),
  });

  const reintentar = useMutation({
    mutationFn: (extractoId: string) =>
      reintentarExtracto({ data: { extractoId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extractos'] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo reintentar'),
  });

  const descartar = useMutation({
    mutationFn: (extractoId: string) =>
      descartarExtracto({ data: { extractoId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['extractos'] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar'),
  });

  /**
   * Sube los archivos en paralelo: cada subida es solo el archivo viajando,
   * así que veinte tardan lo que la más lenta y no la suma de todas. La
   * lectura, que es lo caro, la ordena el servidor.
   */
  const subirTodos = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!clienteId) {
      toast.error('Elegí primero la empresa');
      return;
    }
    const archivos = Array.from(files);
    setSubiendo(archivos.map((f) => f.name));

    const resultados = await Promise.allSettled(
      archivos.map(async (file) => {
        const base64Data = await leerComoBase64(file);
        return subirExtracto({
          data: {
            clienteId,
            fileName: file.name,
            mimeType: file.type === '' ? 'application/pdf' : file.type,
            base64Data,
          },
        });
      })
    );

    setSubiendo([]);
    void queryClient.invalidateQueries({ queryKey: ['extractos'] });

    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    const fallaron = resultados.length - ok;
    if (ok > 0) {
      toast.success(
        ok === 1 ? 'Extracto cargado' : `${ok} extractos cargados`,
        {
          description:
            'Podés seguir agregando. Cuando estén todos, apretá «Extraer».',
        }
      );
    }
    if (fallaron > 0) {
      const primero = resultados.find((r) => r.status === 'rejected');
      toast.error(
        fallaron === 1
          ? 'Un archivo no se pudo subir'
          : `${fallaron} archivos no se pudieron subir`,
        {
          description:
            primero?.status === 'rejected' && primero.reason instanceof Error
              ? primero.reason.message
              : undefined,
        }
      );
    }
  };

  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setArrastrando(true);
    },
    onDragLeave: () => setArrastrando(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setArrastrando(false);
      void subirTodos(e.dataTransfer.files);
    },
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Zona de subida */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        {...dragProps}
        disabled={subiendo.length > 0}
        className={`flex flex-col items-center gap-2 rounded-[12px] border border-dashed px-6 py-7 text-[13px] transition-colors disabled:opacity-60 ${
          arrastrando
            ? 'border-[var(--arca-ink)] bg-[var(--arca-surface)] text-[var(--arca-ink)]'
            : 'border-[var(--arca-border-strong)] bg-[var(--arca-surface-2)] text-[var(--arca-ink-3)] hover:bg-[var(--arca-surface)]'
        }`}
      >
        {subiendo.length > 0 ? (
          <>
            <Loader2 className="size-5 animate-spin text-[var(--arca-ink-4)]" />
            Subiendo {subiendo.length} archivo
            {subiendo.length === 1 ? '' : 's'}…
          </>
        ) : (
          <>
            <Upload className="size-5 text-[var(--arca-ink-4)]" />
            {arrastrando
              ? 'Soltá para subir'
              : 'Arrastrá todos los extractos juntos, o hacé click para elegirlos'}
            <span className="text-[11.5px] text-[var(--arca-ink-4)]">
              PDF o imagen, hasta 20 MB cada uno. Se cargan primero; la lectura
              arranca cuando apretás «Extraer».
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          void subirTodos(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Lo cargado y sin extraer: el paso que dispara la lectura */}
      {cargados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--arca-accent-ring)] bg-[var(--arca-accent-bg)] px-4 py-3">
          <span className="text-[12.5px] text-[var(--arca-accent-fg)]">
            {cargados.length} extracto{cargados.length === 1 ? '' : 's'} cargado
            {cargados.length === 1 ? '' : 's'} sin extraer. Podés seguir
            agregando antes de empezar.
          </span>
          <Button
            className="ml-auto gap-2"
            disabled={extraer.isPending}
            onClick={() => extraer.mutate()}
          >
            {extraer.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Extraer{' '}
            {cargados.length === 1 ? 'el extracto' : `los ${cargados.length}`}
          </Button>
        </div>
      )}

      {/* Resumen de la cola */}
      {cola.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px] text-[var(--arca-ink-3)]">
          {enCurso > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              {enCurso} en proceso
            </span>
          )}
          {listos > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[var(--arca-accent-pos-fg)]">
              <CheckCircle2 className="size-3.5" />
              {listos} para revisar
            </span>
          )}
          {conError > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[var(--arca-accent-warn-fg)]">
              <AlertTriangle className="size-3.5" />
              {conError} con error
            </span>
          )}
          {enCurso > 0 && (
            <span className="text-[var(--arca-ink-4)]">
              podés seguir usando la plataforma; esto sigue solo
            </span>
          )}
        </div>
      )}

      {/* La cola */}
      {cola.length > 0 && (
        <div className="overflow-hidden rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)]">
          {cola.map((e) => (
            <FilaCola
              key={e.id}
              extracto={e}
              onRevisar={() => onRevisar(e.id)}
              onReintentar={() => reintentar.mutate(e.id)}
              onDescartar={() => descartar.mutate(e.id)}
              ocupado={reintentar.isPending || descartar.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaCola({
  extracto,
  onRevisar,
  onReintentar,
  onDescartar,
  ocupado,
}: {
  extracto: ExtractoEnCola;
  onRevisar: () => void;
  onReintentar: () => void;
  onDescartar: () => void;
  ocupado: boolean;
}) {
  const est = ESTADO[extracto.estado] ?? ESTADO.pendiente;
  const Icono = est.icono;
  const listo = extracto.estado === 'extraido';

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--arca-border)] px-4 py-2.5 first:border-t-0">
      <FileText className="size-3.5 shrink-0 text-[var(--arca-ink-4)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-[var(--arca-ink)]">
          {extracto.nombreArchivo}
        </span>
        <span className="block truncate text-[10.5px] text-[var(--arca-ink-4)]">
          {listo
            ? [
                extracto.banco,
                extracto.periodoDesde && extracto.periodoHasta
                  ? `${extracto.periodoDesde} → ${extracto.periodoHasta}`
                  : null,
                extracto.cuentasDetectadas != null
                  ? `${extracto.cuentasDetectadas} cuenta${extracto.cuentasDetectadas === 1 ? '' : 's'}`
                  : null,
                extracto.movimientosDetectados != null
                  ? `${extracto.movimientosDetectados} movimientos`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : (extracto.error ??
              (extracto.estado === 'procesando'
                ? 'el modelo está leyendo el PDF'
                : 'esperando turno'))}
        </span>
      </span>

      <span
        className={`inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium ${est.clase}`}
      >
        <Icono
          className={`size-3.5 ${extracto.estado === 'procesando' ? 'animate-spin' : ''}`}
        />
        {est.label}
      </span>

      {/* Que no cuadre no impide importar, pero tiene que verse antes de abrir */}
      {listo && extracto.cuadra === false && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--arca-accent-warn-bg)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--arca-accent-warn-fg)]">
          <AlertTriangle className="size-3" />
          no cuadra
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1.5">
        {listo && (
          <Button size="sm" onClick={onRevisar}>
            Revisar
          </Button>
        )}
        {extracto.estado === 'error' && (
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={onReintentar}
          >
            <RotateCcw className="size-3.5" />
            Reintentar
          </Button>
        )}
        {extracto.estado !== 'procesando' && (
          <button
            type="button"
            title="Sacar de la cola sin importarlo"
            disabled={ocupado}
            onClick={onDescartar}
            className="text-[var(--arca-ink-4)] transition-colors hover:text-[var(--arca-ink)]"
          >
            <X className="size-3.5" />
          </button>
        )}
      </span>
    </div>
  );
}
