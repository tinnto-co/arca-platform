/**
 * Aviso de extractos leyéndose, para la página de Banco.
 *
 * La cola vive en el servidor, así que el avance no depende de que el diálogo
 * esté abierto: esta franja lo muestra desde la página y avisa por toast
 * cuando algo termina. Es lo que hace cierto el "podés cerrar esto y seguir
 * trabajando" del importador.
 *
 * Se repregunta sola mientras haya algo en curso y se calla cuando la cola
 * queda quieta.
 */
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { listarExtractos } from '@/actions/extractos';

const EN_CURSO = ['pendiente', 'procesando'];

export function AvisoExtractosEnCurso({
  clienteId,
  onAbrirCola,
}: {
  clienteId: string;
  /** Abrir el importador para revisar lo que ya está leído. */
  onAbrirCola?: () => void;
}) {
  const { data: cola = [] } = useQuery({
    queryKey: ['extractos', clienteId],
    queryFn: () => listarExtractos({ data: { clienteId } }),
    enabled: !!clienteId,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((e) => EN_CURSO.includes(e.estado))
        ? 4000
        : false,
  });

  const cargados = cola.filter((e) => e.estado === 'cargado').length;
  const enCurso = cola.filter((e) => EN_CURSO.includes(e.estado)).length;
  const listos = cola.filter((e) => e.estado === 'extraido').length;
  const conError = cola.filter((e) => e.estado === 'error').length;

  // Un solo aviso por transición: la primera vuelta solo toma la foto, así
  // entrar a la página con cosas ya leídas no dispara un toast.
  const previo = useRef({ listos: 0, arrancado: false });
  useEffect(() => {
    if (!previo.current.arrancado) {
      previo.current = { listos, arrancado: true };
      return;
    }
    if (listos > previo.current.listos) {
      const nuevos = listos - previo.current.listos;
      toast.success(
        nuevos === 1
          ? 'Un extracto quedó listo para revisar'
          : `${nuevos} extractos quedaron listos para revisar`,
        {
          description:
            enCurso > 0 ? `Faltan ${enCurso}.` : 'Terminó toda la cola.',
        }
      );
    }
    previo.current = { listos, arrancado: true };
  }, [listos, enCurso]);

  if (enCurso === 0 && listos === 0 && conError === 0 && cargados === 0)
    return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[12px] border border-[var(--arca-border)] bg-[var(--arca-surface)] px-4 py-2.5 text-[12px]">
      {/* Cargado y sin extraer es fácil de olvidar: la lectura no arranca
          sola, así que hay que decirlo desde la página. */}
      {cargados > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[var(--arca-accent-fg)]">
          <FileText className="size-3.5" />
          {cargados} extracto{cargados === 1 ? '' : 's'} cargado
          {cargados === 1 ? '' : 's'} sin extraer
        </span>
      )}
      {enCurso > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[var(--arca-ink-2)]">
          <Loader2 className="size-3.5 animate-spin" />
          Leyendo {enCurso} extracto{enCurso === 1 ? '' : 's'} en segundo plano
        </span>
      )}
      {listos > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[var(--arca-accent-pos-fg)]">
          <CheckCircle2 className="size-3.5" />
          {listos} listo{listos === 1 ? '' : 's'} para revisar
        </span>
      )}
      {conError > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[var(--arca-accent-warn-fg)]">
          <AlertTriangle className="size-3.5" />
          {conError} con error
        </span>
      )}
      {onAbrirCola && (listos > 0 || conError > 0 || cargados > 0) && (
        <button
          type="button"
          onClick={onAbrirCola}
          className="ml-auto text-[11.5px] font-medium text-[var(--arca-ink-2)] underline hover:text-[var(--arca-ink)]"
        >
          Ver la cola
        </button>
      )}
    </div>
  );
}
