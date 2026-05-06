'use client';

import { useCopilotAction } from '@copilotkit/react-core';
import { Loader2 } from 'lucide-react';
import {
  getIvaPositionForCopilot,
  type GetIvaPositionForCopilotResult,
} from '@/actions/copilot';
import { getDashboardStats, getUpcomingDueDates } from '@/actions/dashboard';
import { markNotificationOpened } from '@/actions/notification';
import {
  MiniKpiCardsRow,
  type DashboardStats,
} from '@/components/dashboard/mini-kpi-cards';
import {
  VencimientosList,
  type VencimientoItem,
} from '@/components/dashboard/vencimientos-list';
import { ConfirmationCard } from './ConfirmationCard';
import { CopilotIvaResume } from './CopilotIvaResume';
import { ScrapeConfirmation, type ScrapeJobType } from './ScrapeConfirmation';

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

  useCopilotAction({
    name: 'getVencimientos',
    description:
      'Lista los próximos vencimientos fiscales del estudio. Devuelve obligaciones (impuestos y conceptos) ordenadas por fecha de vencimiento. Usalo para preguntas como "qué vencimientos tengo", "qué vence esta semana", "vencimientos próximos".',
    parameters: [
      {
        name: 'daysAhead',
        type: 'number',
        description:
          'Cantidad de días hacia adelante a consultar. Si no se especifica, usa 30.',
        required: false,
      },
    ],
    handler: async ({ daysAhead }) => {
      return await getUpcomingDueDates({
        data: { days: daysAhead ?? 30, limit: 20 },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Buscando vencimientos…</span>
          </div>
        );
      }
      const items = (result ?? []) as VencimientoItem[];
      if (items.length === 0) {
        return (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            No hay vencimientos próximos en el período consultado.
          </div>
        );
      }
      return <VencimientosList items={items} />;
    },
  });

  useCopilotAction({
    name: 'getDashboardKpis',
    description:
      'Resumen ejecutivo del estudio: KPIs principales del mes en curso (clientes activos, facturas del período, notificaciones pendientes, deudas vencidas). Usalo para preguntas como "dame el resumen del estudio", "cuáles son los KPIs", "cómo va el estudio este mes".',
    parameters: [],
    handler: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return await getDashboardStats({
        data: { from: from.toISOString(), to: to.toISOString() },
      });
    },
    render: ({ status, result }) => {
      if (status === 'inProgress' || status === 'executing') {
        return (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Calculando KPIs del estudio…</span>
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
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return (
        <MiniKpiCardsRow from={from} to={to} stats={result as DashboardStats} />
      );
    },
  });

  useCopilotAction({
    name: 'dispararScrape',
    description:
      'Dispara un job de scraping contra ARCA para un cliente. SIEMPRE pide confirmación al usuario antes de ejecutar — la acción se completa solo cuando el usuario confirma o cancela. Tipos disponibles: iva (posición IVA), comprobantes (facturas), notificaciones (notificaciones AFIP), deuda (deudas), vencimientos (vencimientos fiscales). Usalo cuando el usuario pida explícitamente refrescar/scrapear/actualizar datos de un cliente.',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description:
          'ID (UUID) del cliente. Si tenés el cliente activo expuesto en el contexto, usá ese id.',
        required: true,
      },
      {
        name: 'jobType',
        type: 'string',
        enum: [
          'iva',
          'comprobantes',
          'notificaciones',
          'deuda',
          'vencimientos',
        ],
        description: 'Tipo de job a disparar.',
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (status === 'inProgress' || !respond) {
        return (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Preparando confirmación…</span>
          </div>
        );
      }
      const { clientId, jobType } = args;
      if (!clientId || !jobType) {
        return (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Faltan datos para disparar el job (clientId y jobType son
            requeridos).
          </div>
        );
      }
      return (
        <ScrapeConfirmation
          clientId={clientId}
          jobType={jobType as ScrapeJobType}
          respond={respond}
        />
      );
    },
  });

  useCopilotAction({
    name: 'marcarNotificacionLeida',
    description:
      'Marca una notificación AFIP como leída. SIEMPRE pide confirmación al usuario antes de ejecutar — la acción se completa solo cuando el usuario confirma o cancela. Usá el id (UUID) de la notificación, que está expuesto en el contexto cuando el usuario está en /notifications.',
    parameters: [
      {
        name: 'notificationId',
        type: 'string',
        description:
          'UUID de la notificación a marcar como leída. Obtenelo del contexto de "Notificaciones AFIP no leídas visibles en pantalla".',
        required: true,
      },
    ],
    renderAndWaitForResponse: ({ args, status, respond }) => {
      if (status === 'inProgress' || !respond) {
        return (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Preparando confirmación…</span>
          </div>
        );
      }
      const { notificationId } = args;
      if (!notificationId) {
        return (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Falta el id de la notificación.
          </div>
        );
      }
      return (
        <ConfirmationCard
          title="Marcar notificación como leída"
          description={`Marcar notificación ${notificationId.slice(0, 8)}… como leída.`}
          confirmLabel="Marcar como leída"
          submittingLabel="Marcando…"
          successText="Notificación marcada como leída."
          respond={respond}
          onConfirm={async () => {
            return await markNotificationOpened({
              data: { id: notificationId },
            });
          }}
        />
      );
    },
  });

  return null;
}
