'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClienteCredenciales, scrapSingleJob } from '@/actions/client';
import { Button } from '@/components/ui/button';
import { ChatCard, ChatCardHead } from './chat-card';
import { EstadoFase, type Fase } from './ConfirmationCard';

export type ScrapeJobType =
  | 'iva'
  | 'comprobantes'
  | 'notificaciones'
  | 'deuda'
  | 'vencimientos';

const JOB_TYPE_LABELS: Record<ScrapeJobType, string> = {
  iva: 'Posición IVA',
  comprobantes: 'Comprobantes',
  notificaciones: 'Notificaciones de ARCA',
  deuda: 'Deudas',
  vencimientos: 'Vencimientos',
};

interface ScrapeConfirmationProps {
  clienteId: string;
  /** Ya resuelto por el asistente: no hace falta volver a buscarlo. */
  clienteNombre: string;
  jobType: ScrapeJobType;
  respond: (result: unknown) => void;
}

/**
 * Confirmación de una actualización contra ARCA.
 *
 * El job se dispara contra un acceso de ARCA, no contra la empresa: cada
 * corrida recorre todas las empresas de ese acceso. Se usa el preferido, que
 * es el primero que devuelve `getClienteCredenciales`.
 */
export function ScrapeConfirmation({
  clienteId,
  clienteNombre,
  jobType,
  respond,
}: ScrapeConfirmationProps) {
  const [fase, setFase] = React.useState<Fase>('pendiente');
  const [error, setError] = React.useState<string | null>(null);

  const { data: credenciales, isLoading } = useQuery({
    queryKey: ['clienteCredenciales', clienteId],
    queryFn: () => getClienteCredenciales({ data: { clienteId } }),
    staleTime: 60_000,
  });

  const credencialId = credenciales?.[0]?.id ?? null;
  const etiqueta = JOB_TYPE_LABELS[jobType] ?? jobType;

  const confirmar = async () => {
    setFase('ejecutando');
    setError(null);
    try {
      if (!credencialId) {
        throw new Error(
          `${clienteNombre} no tiene ningún acceso de ARCA asociado.`
        );
      }
      const result = await scrapSingleJob({ data: { credencialId, jobType } });
      setFase('hecho');
      respond({
        confirmed: true,
        success: true,
        clienteId,
        clienteNombre,
        jobType,
        result,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Error al ejecutar la actualización de ${etiqueta}.`;
      setError(msg);
      setFase('fallo');
      respond({
        confirmed: true,
        success: false,
        clienteId,
        clienteNombre,
        jobType,
        error: msg,
      });
    }
  };

  const cancelar = () => {
    setFase('cancelado');
    respond({ cancelled: true, clienteId, clienteNombre, jobType });
  };

  const sinAcceso = !isLoading && !credencialId;

  return (
    <ChatCard className="my-1.5">
      <ChatCardHead
        title={`Actualizar ${etiqueta.toLowerCase()}`}
        sub={clienteNombre}
      />
      <div className="px-3 py-2.5 text-[12.5px]">
        <EstadoFase
          fase={fase}
          pendingText={
            sinAcceso ? (
              <span className="text-[var(--arca-accent-warn-fg)]">
                {clienteNombre} no tiene ningún acceso de ARCA asociado, así que
                no se puede actualizar.
              </span>
            ) : (
              <>
                Se va a pedir a ARCA los datos de{' '}
                <span className="font-medium text-[var(--arca-ink)]">
                  {etiqueta.toLowerCase()}
                </span>{' '}
                del acceso de {clienteNombre}. Puede tardar unos segundos.
              </>
            )
          }
          submittingLabel={`Actualizando ${etiqueta.toLowerCase()}…`}
          successText="Actualización encolada."
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
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={confirmar}
            disabled={fase === 'ejecutando' || isLoading || sinAcceso}
          >
            {fase === 'ejecutando' ? 'Actualizando…' : 'Actualizar'}
          </Button>
        </div>
      )}
    </ChatCard>
  );
}
