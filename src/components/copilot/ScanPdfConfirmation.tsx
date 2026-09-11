'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { persistBankStatementMovements } from '@/actions/copilot';
import { scanBankStatement } from '@/actions/scannerAi';
import { Button } from '@/components/ui/button';
import { RenderPdfInfo } from '@/components/render-pdf-info';
import { getCopilotAttachment } from './AttachmentContext';
import { ChatAviso, ChatCard, ChatCardHead } from './chat-card';

type Fase =
  | 'sin-adjunto'
  | 'extrayendo'
  | 'revision'
  | 'guardando'
  | 'hecho'
  | 'fallo'
  | 'cancelado';

interface ScanPdfConfirmationProps {
  /** Ya resuelto por el asistente contra la cartera. */
  clientId: string;
  clientName: string;
  respond: (result: unknown) => void;
}

interface MovimientoEscaneado {
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  monto: string;
  infoExtra: string;
}

interface ScanPreview {
  banco: string;
  saldo_inicial: string;
  saldo_final: string;
  ingresos: MovimientoEscaneado[];
  egresos: MovimientoEscaneado[];
}

/**
 * Escaneo de un extracto bancario: Gemini lee el PDF adjunto, el usuario
 * revisa lo que salió y recién ahí se guarda.
 *
 * La empresa llega ya resuelta desde la tool, así que acá no queda ninguna
 * búsqueda por nombre: antes este componente volvía a resolver el cliente por
 * su cuenta y podía terminar guardando los movimientos en otra empresa que la
 * que el usuario nombró.
 */
export function ScanPdfConfirmation({
  clientId,
  clientName,
  respond,
}: ScanPdfConfirmationProps) {
  // Foto del adjunto en el instante de la invocación: el de la barra puede
  // cambiar después, y esta acción tiene que trabajar sobre el que estaba.
  const [adjunto] = React.useState(() => getCopilotAttachment());
  const [fase, setFase] = React.useState<Fase>(
    adjunto ? 'extrayendo' : 'sin-adjunto'
  );
  const [preview, setPreview] = React.useState<ScanPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [guardado, setGuardado] = React.useState<{
    inserted: number;
    skipped: number;
  } | null>(null);
  const respondidoRef = React.useRef(false);

  const responder = React.useCallback(
    (payload: unknown) => {
      if (respondidoRef.current) return;
      respondidoRef.current = true;
      respond(payload);
    },
    [respond]
  );

  // "No hay PDF" se contesta enseguida: si no, la conversación se queda
  // esperando una respuesta que nunca va a llegar.
  React.useEffect(() => {
    if (fase !== 'sin-adjunto') return;
    responder({
      confirmed: false,
      success: false,
      error:
        'No hay ningún PDF adjunto. Pedile al usuario que arrastre el extracto a la barra del asistente y volvé a intentar.',
    });
  }, [fase, responder]);

  React.useEffect(() => {
    if (fase !== 'extrayendo' || !adjunto) return;
    let cancelado = false;
    void (async () => {
      try {
        const result = await scanBankStatement({
          data: { fileBase64: adjunto.base64 },
        });
        if (cancelado) return;
        setPreview(result);
        setFase('revision');
      } catch (err) {
        if (cancelado) return;
        const msg =
          err instanceof Error ? err.message : 'Error al leer el PDF.';
        setError(msg);
        setFase('fallo');
        responder({ confirmed: false, success: false, error: msg });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [fase, adjunto, responder]);

  const confirmar = async () => {
    if (!preview) return;
    setFase('guardando');
    setError(null);
    try {
      const res = await persistBankStatementMovements({
        data: {
          clienteId: clientId,
          banco: preview.banco,
          ingresos: preview.ingresos,
          egresos: preview.egresos,
        },
      });
      setGuardado({ inserted: res.inserted, skipped: res.skipped });
      setFase('hecho');
      responder({
        confirmed: true,
        success: true,
        clienteId: res.clienteId,
        clientName: res.clienteNombre,
        banco: res.banco,
        inserted: res.inserted,
        skipped: res.skipped,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al guardar los movimientos.';
      setError(msg);
      setFase('fallo');
      responder({ confirmed: true, success: false, clientId, error: msg });
    }
  };

  const cancelar = () => {
    setFase('cancelado');
    responder({ cancelled: true, clientId });
  };

  if (fase === 'sin-adjunto') {
    return (
      <ChatAviso>
        No hay ningún PDF adjunto. Arrastrá el extracto bancario a la barra del
        asistente (PDF, hasta 10 MB) y volvé a pedir el escaneo.
      </ChatAviso>
    );
  }

  return (
    <ChatCard className="my-1.5">
      <ChatCardHead
        title="Escanear extracto bancario"
        sub={adjunto?.name ? `${clientName} · ${adjunto.name}` : clientName}
      />

      <div className="space-y-2.5 px-3 py-2.5 text-[12.5px] text-[var(--arca-ink-2)]">
        {fase === 'extrayendo' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--arca-accent)]" />
            Leyendo el extracto — puede tardar unos segundos.
          </div>
        )}

        {preview && fase !== 'extrayendo' && (
          <>
            <p>
              {preview.ingresos.length}{' '}
              {preview.ingresos.length === 1 ? 'ingreso' : 'ingresos'} y{' '}
              {preview.egresos.length}{' '}
              {preview.egresos.length === 1 ? 'egreso' : 'egresos'} detectados
              {preview.banco ? ` en ${preview.banco}` : ''}. Revisalos antes de
              guardar.
            </p>
            <div className="overflow-x-auto rounded-[var(--arca-r-md)] border border-[var(--arca-border)] bg-[var(--arca-surface)] p-2">
              <RenderPdfInfo data={preview} clientId={clientId} />
            </div>
          </>
        )}

        {fase === 'guardando' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--arca-accent)]" />
            Guardando los movimientos…
          </div>
        )}

        {fase === 'hecho' && guardado && (
          <div className="flex items-start gap-2 text-[var(--arca-accent-pos-fg)]">
            <CheckCircle2 className="mt-px size-3.5 shrink-0" />
            <span>
              {guardado.inserted}{' '}
              {guardado.inserted === 1
                ? 'movimiento guardado'
                : 'movimientos guardados'}
              {guardado.skipped > 0
                ? ` · ${guardado.skipped} con datos ilegibles quedaron afuera.`
                : '.'}
            </span>
          </div>
        )}

        {fase === 'fallo' && (
          <div className="flex items-start gap-2 text-[var(--arca-accent-neg-fg)]">
            <XCircle className="mt-px size-3.5 shrink-0" />
            <span>{error ?? 'Error al procesar el PDF.'}</span>
          </div>
        )}

        {fase === 'cancelado' && (
          <p className="text-[var(--arca-ink-3)]">
            Cancelado. No se guardó ningún movimiento.
          </p>
        )}
      </div>

      {(fase === 'revision' || fase === 'guardando') && (
        <div className="flex justify-end gap-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={cancelar}
            disabled={fase === 'guardando'}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={fase === 'guardando' || !preview}
          >
            {fase === 'guardando' ? 'Guardando…' : 'Guardar movimientos'}
          </Button>
        </div>
      )}
    </ChatCard>
  );
}
