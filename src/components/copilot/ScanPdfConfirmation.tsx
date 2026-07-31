'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getCliente } from '@/actions/client';
import {
  persistBankStatementMovements,
  resolveClientForCopilot,
  type ResolveClientResult,
} from '@/actions/copilot';
import { scanBankStatement } from '@/actions/scannerAi';
import { getCopilotAttachment } from './AttachmentContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { RenderPdfInfo } from '@/components/render-pdf-info';

type Phase =
  | 'no-attachment'
  | 'resolving'
  | 'resolve-error'
  | 'extracting'
  | 'preview'
  | 'submitting'
  | 'done'
  | 'failed'
  | 'cancelled';

interface ScanPdfConfirmationProps {
  clientId?: string;
  clientName?: string;
  respond: (result: unknown) => void;
}

interface ScanPreview {
  banco: string;
  saldo_inicial: string;
  saldo_final: string;
  ingresos: {
    fecha: string;
    tipo: 'ingreso' | 'egreso';
    monto: string;
    infoExtra: string;
  }[];
  egresos: {
    fecha: string;
    tipo: 'ingreso' | 'egreso';
    monto: string;
    infoExtra: string;
  }[];
}

export function ScanPdfConfirmation({
  clientId: clientIdProp,
  clientName: clientNameProp,
  respond,
}: ScanPdfConfirmationProps) {
  // Snapshot del adjunto al instante de invocación; el adjunto en context
  // puede cambiar después y esta acción debe trabajar sobre el archivo
  // que estaba presente cuando el LLM disparó la acción.
  const [attachment] = React.useState(() => getCopilotAttachment());
  const initialPhase: Phase = attachment
    ? clientIdProp
      ? 'extracting'
      : 'resolving'
    : 'no-attachment';

  const [phase, setPhase] = React.useState<Phase>(initialPhase);
  const [resolvedClientId, setResolvedClientId] = React.useState<string | null>(
    clientIdProp ?? null
  );
  const [resolveError, setResolveError] = React.useState<{
    message: string;
    options?: string[];
  } | null>(null);
  const [preview, setPreview] = React.useState<ScanPreview | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [persistResult, setPersistResult] = React.useState<{
    inserted: number;
    skipped: number;
  } | null>(null);
  const respondedRef = React.useRef(false);

  // Trae el nombre real del cliente para mostrarlo (no para validar — la validación
  // de pertenencia al org se hace server-side en persistBankStatementMovements).
  const { data: clientRow } = useQuery({
    queryKey: ['cliente', resolvedClientId],
    queryFn: () =>
      resolvedClientId
        ? getCliente({ data: { id: resolvedClientId } })
        : Promise.resolve(null),
    enabled: !!resolvedClientId,
    staleTime: 60_000,
  });

  const sendRespond = React.useCallback(
    (payload: unknown) => {
      if (respondedRef.current) return;
      respondedRef.current = true;
      respond(payload);
    },
    [respond]
  );

  // Notifica "no hay PDF" inmediatamente para que el LLM avise al usuario.
  React.useEffect(() => {
    if (phase === 'no-attachment') {
      sendRespond({
        confirmed: false,
        success: false,
        error:
          'No hay PDF adjunto. Pediste al usuario que arrastre un PDF al popup antes de escanear.',
      });
    }
  }, [phase, sendRespond]);

  // Resuelve clientName → clientId si fue necesario.
  React.useEffect(() => {
    if (phase !== 'resolving') return;
    let cancelled = false;
    void (async () => {
      try {
        const res: ResolveClientResult = await resolveClientForCopilot({
          data: {
            clienteId: clientIdProp,
            clientName: clientNameProp,
          },
        });
        if (cancelled) return;
        if ('error' in res) {
          setResolveError({ message: res.error, options: res.options });
          setPhase('resolve-error');
          return;
        }
        setResolvedClientId(res.id);
        setPhase('extracting');
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Error resolviendo cliente';
        setResolveError({ message: msg });
        setPhase('resolve-error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, clientIdProp, clientNameProp]);

  // Notifica el error de resolución una vez determinado.
  React.useEffect(() => {
    if (phase !== 'resolve-error' || !resolveError) return;
    sendRespond({
      confirmed: false,
      success: false,
      error: resolveError.message,
      options: resolveError.options,
    });
  }, [phase, resolveError, sendRespond]);

  // Extrae el preview del PDF adjunto.
  React.useEffect(() => {
    if (phase !== 'extracting') return;
    if (!attachment) {
      setPhase('no-attachment');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await scanBankStatement({
          data: { fileBase64: attachment.base64 },
        });
        if (cancelled) return;
        setPreview(result);
        setPhase('preview');
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : 'Error al escanear el PDF con Gemini';
        setErrorMsg(msg);
        setPhase('failed');
        sendRespond({
          confirmed: false,
          success: false,
          error: msg,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, attachment, sendRespond]);

  const handleConfirm = async () => {
    if (!preview || !resolvedClientId) return;
    setPhase('submitting');
    setErrorMsg(null);
    try {
      const res = await persistBankStatementMovements({
        data: {
          clienteId: resolvedClientId,
          banco: preview.banco,
          ingresos: preview.ingresos,
          egresos: preview.egresos,
        },
      });
      setPersistResult({ inserted: res.inserted, skipped: res.skipped });
      setPhase('done');
      sendRespond({
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
        err instanceof Error ? err.message : 'Error al guardar los movimientos';
      setErrorMsg(msg);
      setPhase('failed');
      sendRespond({
        confirmed: true,
        success: false,
        clientId: resolvedClientId,
        error: msg,
      });
    }
  };

  const handleCancel = () => {
    setPhase('cancelled');
    sendRespond({
      cancelled: true,
      clientId: resolvedClientId,
    });
  };

  const fileName = attachment?.name ?? null;
  const clientDisplayName =
    clientRow?.razonSocial ?? clientNameProp ?? clientIdProp ?? 'cliente';

  if (phase === 'no-attachment') {
    return (
      <Card className="my-2 max-w-lg border-amber-300/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileWarning className="h-4 w-4 text-amber-500" />
            Falta el PDF
          </CardTitle>
          <CardDescription>
            No hay un PDF adjunto en el popup. Arrastrá un extracto bancario
            (PDF, máximo 10MB) sobre la barra de adjunto y volvé a pedir el
            escaneo.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === 'resolving') {
    return (
      <Card className="my-2 max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando cliente…
          </CardTitle>
          <CardDescription>
            {clientNameProp
              ? `Resolviendo "${clientNameProp}"…`
              : 'Resolviendo cliente…'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === 'resolve-error' && resolveError) {
    return (
      <Card className="my-2 max-w-lg border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <XCircle className="h-4 w-4" />
            No se pudo resolver el cliente
          </CardTitle>
          <CardDescription>{resolveError.message}</CardDescription>
        </CardHeader>
        {resolveError.options && resolveError.options.length > 0 && (
          <CardContent className="text-sm text-[var(--arca-ink-2)]">
            <p className="mb-1">Coincidencias:</p>
            <ul className="list-disc pl-5">
              {resolveError.options.slice(0, 8).map((opt) => (
                <li key={opt}>{opt}</li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <Card className="my-2 max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Escanear extracto bancario
        </CardTitle>
        <CardDescription>
          Cliente: <span className="font-medium">{clientDisplayName}</span>
          {fileName && (
            <>
              {' · '}
              <span className="font-mono text-xs">{fileName}</span>
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-sm text-[var(--arca-ink-2)]">
        {phase === 'extracting' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Extrayendo movimientos del PDF (puede tardar varios segundos)…
          </div>
        )}

        {(phase === 'preview' ||
          phase === 'submitting' ||
          phase === 'done' ||
          phase === 'failed' ||
          phase === 'cancelled') &&
          preview && (
            <div className="space-y-3">
              <p>
                Se detectaron{' '}
                <span className="font-medium">
                  {preview.ingresos.length} ingresos
                </span>{' '}
                y{' '}
                <span className="font-medium">
                  {preview.egresos.length} egresos
                </span>
                . Revisá la previsualización y confirmá para guardarlos como
                movimientos del cliente.
              </p>
              <div className="rounded-md border bg-background p-3">
                <RenderPdfInfo data={preview} clientId={resolvedClientId} />
              </div>
            </div>
          )}

        {phase === 'submitting' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Guardando movimientos…
          </div>
        )}

        {phase === 'done' && persistResult && (
          <div className="flex items-start gap-2 text-emerald-600">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {persistResult.inserted} movimiento
              {persistResult.inserted === 1 ? '' : 's'} guardado
              {persistResult.inserted === 1 ? '' : 's'} correctamente
              {persistResult.skipped > 0
                ? ` (${persistResult.skipped} con datos inválidos no se pudieron guardar).`
                : '.'}
            </span>
          </div>
        )}

        {phase === 'failed' && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg ?? 'Error al procesar el PDF.'}</span>
          </div>
        )}

        {phase === 'cancelled' && (
          <p className="text-[var(--arca-ink-3)]">
            Acción cancelada. No se guardó ningún movimiento.
          </p>
        )}
      </CardContent>

      {(phase === 'preview' || phase === 'submitting') && (
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={phase === 'submitting'}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={phase === 'submitting' || !preview || !resolvedClientId}
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando…
              </>
            ) : (
              'Confirmar y guardar'
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
