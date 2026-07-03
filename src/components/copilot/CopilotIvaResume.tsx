'use client';

import * as React from 'react';
import {
  RenderIvaResume,
  type ClientIvaCreditData,
} from '@/components/render-iva-resume';
import type { GetIvaPositionForCopilotResult } from '@/actions/copilot';

interface CopilotIvaResumeProps {
  result: GetIvaPositionForCopilotResult;
}

function periodToDateRange(p: string): { from: Date; to: Date } {
  const [mm, yyyy] = p.split('/').map(Number);
  const from = new Date(yyyy, mm - 1, 1);
  const to = new Date(yyyy, mm, 0, 23, 59, 59);
  return { from, to };
}

export function CopilotIvaResume({ result }: CopilotIvaResumeProps) {
  const isError = 'error' in result;
  const perfiles = isError ? [] : result.perfiles;
  const [selectedProfileId, setSelectedProfileId] = React.useState<string>(
    perfiles[0]?.profileId ?? ''
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

  const selectedProfile =
    perfiles.find((p) => p.profileId === selectedProfileId) ?? perfiles[0];

  if (!selectedProfile) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        No hay perfiles para mostrar.
      </div>
    );
  }

  const dateRange = periodToDateRange(result.periodoMostrado);

  const clientIva: ClientIvaCreditData = {
    cuit: selectedProfile.cuit ?? '',
    data: selectedProfile.ivaScrape
      ? {
          periodoFiscal: selectedProfile.ivaScrape.periodoFiscal,
          fechaPresentacion:
            selectedProfile.ivaScrape.fechaPresentacion ?? undefined,
          debitoFiscal: selectedProfile.ivaScrape.debitoFiscal,
          creditoFiscal: selectedProfile.ivaScrape.creditoFiscal,
          saldoMesPasado: selectedProfile.ivaScrape.saldoMesPasado,
          saldoArcaMes: selectedProfile.ivaScrape.saldoArcaMes,
          saldoTecnicoFavorContribuyente:
            selectedProfile.ivaScrape.saldoTecnicoFavorContribuyente,
          saldoTecnicoFavorContribuyentePosicionMensual:
            selectedProfile.ivaScrape
              .saldoTecnicoFavorContribuyentePosicionMensual,
          saldoLibreDisponibilidadPeriodoAnteriorNeto:
            selectedProfile.ivaScrape
              .saldoLibreDisponibilidadPeriodoAnteriorNeto,
          totalRetencionesPercepcionesPeriodo:
            selectedProfile.ivaScrape.totalRetencionesPercepcionesPeriodo,
          saldoLibreDisponibilidadFavorContribuyentePeriodo:
            selectedProfile.ivaScrape
              .saldoLibreDisponibilidadFavorContribuyentePeriodo,
          ok: true,
        }
      : null,
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="font-medium text-foreground">
          IVA · {result.cliente} · {result.periodoMostrado}
        </div>
        <div className="text-muted-foreground">
          Período scrape AFIP: {result.periodoIvaScrape}
        </div>
      </div>

      {perfiles.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {perfiles.map((p) => (
            <button
              key={p.profileId}
              type="button"
              onClick={() => setSelectedProfileId(p.profileId)}
              className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                p.profileId === selectedProfileId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground hover:bg-muted'
              }`}
            >
              {p.perfil}
            </button>
          ))}
        </div>
      )}

      <RenderIvaResume
        clientId={result.clienteId}
        clientName={result.cliente}
        clientIva={clientIva}
        selectedProfileId={selectedProfile.profileId}
        dateRange={dateRange}
        periodUsedForResumen={result.periodoIvaScrape}
      />
    </div>
  );
}
