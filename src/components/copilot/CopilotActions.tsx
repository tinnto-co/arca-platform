'use client';

import { useCopilotAction } from '@copilotkit/react-core';
import { Loader2 } from 'lucide-react';
import {
  getIvaPositionForCopilot,
  type GetIvaPositionForCopilotResult,
} from '@/actions/copilot';
import { CopilotIvaResume } from './CopilotIvaResume';

export function CopilotActions() {
  useCopilotAction({
    name: 'getIvaPosition',
    description:
      'Obtiene la posición IVA completa de un cliente para un período dado. Devuelve datos de todos los perfiles del cliente con totales consolidados. Usalo para cualquier consulta sobre IVA, saldo IVA, débito/crédito fiscal.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Nombre del cliente (búsqueda parcial)',
        required: true,
      },
      {
        name: 'displayMonth',
        type: 'string',
        description:
          'Mes que el usuario quiere ver, en formato MM/YYYY. Ej: "03/2026" para Marzo 2026. Si no se especifica, usa el mes más reciente con datos disponibles.',
        required: false,
      },
      {
        name: 'profileName',
        type: 'string',
        description:
          'Nombre del perfil si se quiere filtrar a uno en particular',
        required: false,
      },
    ],
    handler: async ({ clientName, displayMonth, profileName }) => {
      return await getIvaPositionForCopilot({
        data: {
          clientName,
          displayMonth: displayMonth ?? undefined,
          profileName: profileName ?? undefined,
        },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Calculando posición IVA…</span>
          </div>
        );
      }
      if (!result) {
        return (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Sin datos.
          </div>
        );
      }
      return (
        <CopilotIvaResume result={result as GetIvaPositionForCopilotResult} />
      );
    },
  });

  return null;
}
