'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Phase = 'pending' | 'submitting' | 'done' | 'failed' | 'cancelled';

interface ConfirmationCardProps {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  submittingLabel?: string;
  successText?: string;
  /**
   * CopilotKit's respond callback. Called with the mutation outcome (or {cancelled:true})
   * after the user makes a choice and the mutation resolves.
   */
  respond: (result: unknown) => void;
  /**
   * Runs the actual mutation when the user clicks Confirmar.
   * Should throw on failure. The resolved value is forwarded to `respond`.
   */
  onConfirm: () => Promise<unknown>;
}

export function ConfirmationCard({
  title = 'Confirmar acción',
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  submittingLabel = 'Ejecutando…',
  successText = 'Acción ejecutada correctamente.',
  respond,
  onConfirm,
}: ConfirmationCardProps) {
  const [phase, setPhase] = React.useState<Phase>('pending');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleConfirm = async () => {
    setPhase('submitting');
    setErrorMsg(null);
    try {
      const result = await onConfirm();
      setPhase('done');
      respond({ confirmed: true, success: true, result });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Error al ejecutar la acción.';
      setErrorMsg(msg);
      setPhase('failed');
      respond({ confirmed: true, success: false, error: msg });
    }
  };

  const handleCancel = () => {
    setPhase('cancelled');
    respond({ cancelled: true });
  };

  return (
    <Card className="my-2 max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="text-sm text-[var(--arca-ink-2)]">
        {phase === 'pending' && (
          <p className="text-[var(--arca-ink-3)]">¿Querés continuar?</p>
        )}
        {phase === 'submitting' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {submittingLabel}
          </div>
        )}
        {phase === 'done' && (
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            {successText}
          </div>
        )}
        {phase === 'failed' && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg ?? 'Error al ejecutar la acción.'}</span>
          </div>
        )}
        {phase === 'cancelled' && (
          <p className="text-[var(--arca-ink-3)]">Acción cancelada.</p>
        )}
      </CardContent>

      {(phase === 'pending' || phase === 'submitting') && (
        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={phase === 'submitting'}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={phase === 'submitting'}
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {submittingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
