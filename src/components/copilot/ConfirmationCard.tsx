'use client';

import * as React from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatCard, ChatCardHead } from './chat-card';

type Fase = 'pendiente' | 'ejecutando' | 'hecho' | 'fallo' | 'cancelado';

interface ConfirmationCardProps {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  submittingLabel?: string;
  successText?: string;
  /**
   * El `respond` de CopilotKit. Se llama con el resultado (o `{cancelled}`)
   * una vez que el usuario eligió y la mutación terminó.
   */
  respond: (result: unknown) => void;
  /**
   * La mutación real. Tiene que tirar si falla; lo que devuelva se le pasa a
   * `respond`.
   */
  onConfirm: () => Promise<unknown>;
}

/**
 * La confirmación genérica de una acción que escribe.
 *
 * Es la card del chat, no un `Card` de página: dentro del panel una card con
 * padding de escritorio empuja los botones fuera de la vista y hay que
 * scrollear para confirmar algo que ya se leyó entero.
 */
export function ConfirmationCard({
  title = 'Confirmar acción',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  submittingLabel = 'Ejecutando…',
  successText = 'Listo.',
  respond,
  onConfirm,
}: ConfirmationCardProps) {
  const [fase, setFase] = React.useState<Fase>('pendiente');
  const [error, setError] = React.useState<string | null>(null);

  const confirmar = async () => {
    setFase('ejecutando');
    setError(null);
    try {
      const result = await onConfirm();
      setFase('hecho');
      respond({ confirmed: true, success: true, result });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Error al ejecutar la acción.';
      setError(msg);
      setFase('fallo');
      respond({ confirmed: true, success: false, error: msg });
    }
  };

  const cancelar = () => {
    setFase('cancelado');
    respond({ cancelled: true });
  };

  return (
    <ChatCard className="my-1.5">
      <ChatCardHead title={title} sub={description} />
      <div className="px-3 py-2.5 text-[12.5px]">
        <EstadoFase
          fase={fase}
          submittingLabel={submittingLabel}
          successText={successText}
          error={error}
        />
      </div>
      {(fase === 'pendiente' || fase === 'ejecutando') && (
        <div className="flex justify-end gap-2 border-t border-[var(--arca-border)] bg-[var(--arca-surface-2)] px-3 py-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={cancelar}
            disabled={fase === 'ejecutando'}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={fase === 'ejecutando'}
          >
            {fase === 'ejecutando' ? submittingLabel : confirmLabel}
          </Button>
        </div>
      )}
    </ChatCard>
  );
}

/** El renglón que cambia según en qué punto está la acción. */
export function EstadoFase({
  fase,
  pendingText = '¿Querés continuar?',
  submittingLabel,
  successText,
  error,
}: {
  fase: Fase;
  pendingText?: React.ReactNode;
  submittingLabel: string;
  successText: string;
  error: string | null;
}) {
  if (fase === 'pendiente') {
    return <p className="text-[var(--arca-ink-2)]">{pendingText}</p>;
  }
  if (fase === 'ejecutando') {
    return (
      <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--arca-accent)]" />
        {submittingLabel}
      </div>
    );
  }
  if (fase === 'hecho') {
    return (
      <div className="flex items-center gap-2 text-[var(--arca-accent-pos-fg)]">
        <CheckCircle2 className="size-3.5 shrink-0" />
        {successText}
      </div>
    );
  }
  if (fase === 'fallo') {
    return (
      <div className="flex items-start gap-2 text-[var(--arca-accent-neg-fg)]">
        <XCircle className="mt-px size-3.5 shrink-0" />
        <span>{error ?? 'Error al ejecutar la acción.'}</span>
      </div>
    );
  }
  return (
    <p className="text-[var(--arca-ink-3)]">Cancelado. No se cambió nada.</p>
  );
}

export type { Fase };
