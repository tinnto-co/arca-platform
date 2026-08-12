'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  getCliente,
  getClienteCredenciales,
  scrapSingleJob,
} from '@/actions/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export type ScrapeJobType =
  | 'iva'
  | 'comprobantes'
  | 'notificaciones'
  | 'deuda'
  | 'vencimientos';

const JOB_TYPE_LABELS: Record<ScrapeJobType, string> = {
  iva: 'Posición IVA',
  comprobantes: 'Comprobantes (facturas)',
  notificaciones: 'Notificaciones AFIP',
  deuda: 'Deudas',
  vencimientos: 'Vencimientos',
};

type Phase = 'pending' | 'submitting' | 'done' | 'failed' | 'cancelled';

interface ScrapeConfirmationProps {
  clienteId: string;
  jobType: ScrapeJobType;
  respond: (result: unknown) => void;
}

export function ScrapeConfirmation({
  clienteId,
  jobType,
  respond,
}: ScrapeConfirmationProps) {
  const [phase, setPhase] = React.useState<Phase>('pending');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: () => getCliente({ data: { id: clienteId } }),
    staleTime: 60_000,
  });

  // El scrape se dispara contra un login de AFIP, no contra el cliente: cada
  // job recorre todas las empresas de ese login. Se usa el login preferido
  // (`getClienteCredenciales` ya los ordena por `preferida`).
  const { data: credenciales } = useQuery({
    queryKey: ['clienteCredenciales', clienteId],
    queryFn: () => getClienteCredenciales({ data: { clienteId } }),
    staleTime: 60_000,
  });

  const clientName = client?.razonSocial ?? null;
  const credencialId = credenciales?.[0]?.id ?? null;
  const jobLabel = JOB_TYPE_LABELS[jobType] ?? jobType;

  const handleConfirm = async () => {
    setPhase('submitting');
    setErrorMsg(null);
    try {
      if (!credencialId) {
        throw new Error(
          'El cliente no tiene ninguna credencial de AFIP asociada.'
        );
      }
      const result = await scrapSingleJob({
        data: { credencialId, jobType },
      });
      setPhase('done');
      respond({
        confirmed: true,
        success: true,
        clienteId,
        clientName,
        jobType,
        result,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Error al ejecutar el job ${jobType}`;
      setErrorMsg(msg);
      setPhase('failed');
      respond({
        confirmed: true,
        success: false,
        clienteId,
        clientName,
        jobType,
        error: msg,
      });
    }
  };

  const handleCancel = () => {
    setPhase('cancelled');
    respond({ cancelled: true, clienteId, jobType });
  };

  return (
    <Card className="my-2 max-w-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Confirmar scrape: {jobLabel}
        </CardTitle>
        <CardDescription>
          {clientLoading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando cliente…
            </span>
          ) : clientName ? (
            <>
              Cliente: <span className="font-medium">{clientName}</span>
            </>
          ) : (
            <>
              Cliente ID:{' '}
              <span className="font-mono text-xs">{clienteId.slice(0, 8)}…</span>
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="text-sm text-[var(--arca-ink-2)]">
        {phase === 'pending' && (
          <p>
            Esta acción dispara un job de tipo{' '}
            <span className="font-medium">{jobLabel}</span> contra ARCA. Puede
            tardar varios segundos. ¿Querés continuar?
          </p>
        )}
        {phase === 'submitting' && (
          <div className="flex items-center gap-2 text-[var(--arca-ink-3)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ejecutando {jobLabel}…
          </div>
        )}
        {phase === 'done' && (
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            Job ejecutado correctamente.
          </div>
        )}
        {phase === 'failed' && (
          <div className="flex items-start gap-2 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg ?? 'Error al ejecutar el job.'}</span>
          </div>
        )}
        {phase === 'cancelled' && (
          <p className="text-[var(--arca-ink-3)]">
            Acción cancelada. No se ejecutó ningún job.
          </p>
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
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={phase === 'submitting'}
          >
            {phase === 'submitting' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Ejecutando…
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
