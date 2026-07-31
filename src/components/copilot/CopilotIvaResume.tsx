'use client';

import * as React from 'react';
import {
  RenderIvaResume,
  type ClientIvaCreditData,
} from '@/components/render-iva-resume';
import { dateAPeriodo } from '@/lib/periodo';
import type { GetIvaPositionForCopilotResult } from '@/actions/copilot';

interface CopilotIvaResumeProps {
  result: GetIvaPositionForCopilotResult;
}

/** El período llega como `YYYY-MM-DD` (primer día del mes) desde la BD. */
function periodToDateRange(periodo: string): { from: Date; to: Date } {
  const [yyyy, mm] = periodo.split('-').map(Number);
  const from = new Date(yyyy, mm - 1, 1);
  const to = new Date(yyyy, mm, 0, 23, 59, 59);
  return { from, to };
}

export function CopilotIvaResume({ result }: CopilotIvaResumeProps) {
  const isError = 'error' in result;
  const clientes = isError ? [] : result.clientes;
  const [selectedClienteId, setSelectedClienteId] = React.useState<string>(
    clientes[0]?.clienteId ?? ''
  );

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        <p className="font-medium">{result.error}</p>
        {result.options && result.options.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
            {result.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const selected =
    clientes.find((c) => c.clienteId === selectedClienteId) ?? clientes[0];

  if (!selected) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        No hay clientes para mostrar.
      </div>
    );
  }

  const dateRange = periodToDateRange(result.periodo);
  // La UI habla "YYYY-MM"; en la BD el período es un `date`.
  const periodo = dateAPeriodo(result.periodo);
  const declaracion = selected.declaracionAfip;

  const clientIva: ClientIvaCreditData = {
    cuit: selected.cuit,
    data: declaracion
      ? {
          periodoFiscal: periodo,
          fechaPresentacion: selected.presentadaAt ?? undefined,
          debitoFiscal: declaracion.debitoFiscal,
          creditoFiscal: declaracion.creditoFiscal,
          saldoMesPasado: declaracion.saldoMesAnterior,
          saldoArcaMes: declaracion.saldoAfipMes,
          saldoTecnicoFavorContribuyente: declaracion.saldoTecnicoFavor,
          saldoTecnicoFavorContribuyentePosicionMensual:
            declaracion.saldoTecnicoFavorMensual,
          saldoLibreDisponibilidadPeriodoAnteriorNeto:
            declaracion.saldoLibreDisponibilidadAnteriorNeto,
          totalRetencionesPercepcionesPeriodo:
            declaracion.retencionesPercepcionesPeriodo,
          saldoLibreDisponibilidadFavorContribuyentePeriodo:
            declaracion.saldoLibreDisponibilidadFavor,
          ok: true,
        }
      : null,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="font-medium text-foreground">
          IVA · {selected.razonSocial} · {periodo}
        </div>
        {!selected.tieneDatosAFIP && (
          <div className="text-muted-foreground">
            Sin declaración de AFIP para el período: los totales salen de los
            comprobantes.
          </div>
        )}
      </div>

      {clientes.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {clientes.map((c) => (
            <button
              key={c.clienteId}
              type="button"
              onClick={() => setSelectedClienteId(c.clienteId)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                c.clienteId === selected.clienteId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground hover:bg-muted'
              }`}
            >
              {c.razonSocial}
            </button>
          ))}
        </div>
      )}

      <RenderIvaResume
        /* El resultado no trae el login de AFIP: sin él no se muestra la fecha
           del último scrape, pero el resto del resumen se calcula igual. */
        representativeId=""
        clientName={selected.razonSocial}
        clientIva={clientIva}
        selectedProfileId={selected.clienteId}
        dateRange={dateRange}
        periodUsedForResumen={periodo}
      />
    </div>
  );
}
