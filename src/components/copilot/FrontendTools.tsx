'use client';

import { useFrontendTool } from '@copilotkit/react-core';
import { useNavigate } from '@tanstack/react-router';

const ALLOWED_ROUTES = [
  '/',
  '/clients',
  '/notifications',
  '/sueldos',
  '/vencimientos',
  '/facturas',
  '/trabajos',
  '/chats',
] as const;

type AllowedRoute = (typeof ALLOWED_ROUTES)[number];

const CLIENT_DETAIL_TABS = [
  'resumen',
  'deudas',
  'vencimientos',
  'notificaciones',
  'facturas',
  'iva',
  'convenio-multilateral',
] as const;

type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];

const SUELDOS_TABS = [
  'dashboard',
  'empleados',
  'convenios',
  'conceptos',
  'simulador',
  'recibo',
  'firma-digital',
] as const;

type SueldosTab = (typeof SUELDOS_TABS)[number];

/**
 * Custom event contract for cross-component tab control. The frontend tools
 * dispatch these on `window`; the corresponding pages subscribe via
 * `useEffect(() => window.addEventListener(...))` and call setActiveTab.
 *
 * - `arca:set-client-tab` — payload `{ tab: ClientDetailTab }`, listened by
 *   src/components/client-detail-page.tsx.
 * - `arca:set-sueldos-tab` — payload `{ tab: SueldosTab }`, listened by
 *   src/routes/_authed/sueldos/index.tsx.
 */
export const ARCA_EVENT_SET_CLIENT_TAB = 'arca:set-client-tab' as const;
export const ARCA_EVENT_SET_SUELDOS_TAB = 'arca:set-sueldos-tab' as const;

export type ArcaSetClientTabEvent = CustomEvent<{ tab: ClientDetailTab }>;
export type ArcaSetSueldosTabEvent = CustomEvent<{ tab: SueldosTab }>;

declare global {
  interface WindowEventMap {
    [ARCA_EVENT_SET_CLIENT_TAB]: ArcaSetClientTabEvent;
    [ARCA_EVENT_SET_SUELDOS_TAB]: ArcaSetSueldosTabEvent;
  }
}

/**
 * Registers frontend-only tools the assistant can invoke without a server
 * round-trip: navigation between pages, opening a client by id/name, and
 * switching tabs in the client-detail and sueldos pages via custom events.
 *
 * All tools are non-destructive (they only change in-memory UI state or the
 * router location) — never expose a frontend tool that mutates persisted data.
 * For server mutations use `useCopilotAction` against a server function.
 */
export function FrontendTools() {
  const navigate = useNavigate();

  useFrontendTool({
    name: 'navegarA',
    description:
      'Navegá a una de las páginas principales de la app sin recargar. Usá esta tool cuando el usuario pida explícitamente "ir a", "llevame a", "andá a", "abrí" una sección. Rutas válidas: /, /clients, /notifications, /sueldos, /vencimientos, /facturas, /trabajos, /chats. Si la ruta pedida no está en la lista, devuelve "Ruta no válida".',
    parameters: [
      {
        name: 'ruta',
        type: 'string',
        description:
          'Ruta destino. Debe ser exactamente una de: /, /clients, /notifications, /sueldos, /vencimientos, /facturas, /trabajos, /chats.',
        required: true,
      },
    ],
    handler: ({ ruta }) => {
      if (!ruta || !ALLOWED_ROUTES.includes(ruta as AllowedRoute)) {
        return `Ruta no válida: "${ruta}". Rutas disponibles: ${ALLOWED_ROUTES.join(', ')}.`;
      }
      void navigate({ to: ruta as AllowedRoute });
      return `Navegado a ${ruta}.`;
    },
  });

  useFrontendTool({
    name: 'abrirCliente',
    description:
      'Abrí la página de detalle de un cliente sin recargar. Pasá el clientId (UUID) que tengas del contexto del listado de clientes (clientesResumen) o del cliente activo. Si solo tenés el nombre, igual pasá un clientId del contexto que coincida; no inventes UUIDs. clientName es informativo (para el feedback al usuario) y no se usa para resolver el id.',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description:
          'UUID del cliente. Obtenelo del contexto activo (clientesResumen del listado o cliente visible). Nunca inventes un UUID.',
        required: true,
      },
      {
        name: 'clientName',
        type: 'string',
        description:
          'Nombre del cliente, sólo para mostrar feedback. Opcional.',
        required: false,
      },
    ],
    handler: ({ clientId, clientName }) => {
      if (!clientId || !/^[0-9a-fA-F-]{8,}$/.test(clientId)) {
        return 'Falta un clientId válido. Pasá el UUID del cliente desde el contexto del listado.';
      }
      void navigate({ to: '/clients/$clientId', params: { clientId } });
      return clientName
        ? `Abierto el cliente "${clientName}".`
        : 'Cliente abierto.';
    },
  });

  useFrontendTool({
    name: 'cambiarTabClienteDetalle',
    description:
      'Cambiá la pestaña activa en la página de detalle de un cliente (/clients/$id). Sólo tiene efecto si el usuario está actualmente en esa página. Pestañas válidas: resumen, deudas, vencimientos, notificaciones, facturas, iva, convenio-multilateral.',
    parameters: [
      {
        name: 'tab',
        type: 'string',
        enum: [...CLIENT_DETAIL_TABS],
        description:
          'Pestaña a activar en la página de detalle del cliente. Debe ser una de: resumen, deudas, vencimientos, notificaciones, facturas, iva, convenio-multilateral.',
        required: true,
      },
    ],
    handler: ({ tab }) => {
      const tabStr = String(tab);
      if (!isClientDetailTab(tabStr)) {
        return `Pestaña no válida: "${tabStr}". Opciones: ${CLIENT_DETAIL_TABS.join(', ')}.`;
      }
      if (typeof window === 'undefined') return 'Sin entorno de ventana.';
      window.dispatchEvent(
        new CustomEvent(ARCA_EVENT_SET_CLIENT_TAB, { detail: { tab: tabStr } })
      );
      return `Pestaña cambiada a "${tabStr}".`;
    },
  });

  useFrontendTool({
    name: 'cambiarTabSueldos',
    description:
      'Cambiá la pestaña activa en el módulo Sueldos (/sueldos) cuando hay un cliente seleccionado. Sólo tiene efecto si el usuario está actualmente en esa página con cliente activo. Pestañas válidas: dashboard, empleados, convenios, conceptos, simulador, recibo, firma-digital.',
    parameters: [
      {
        name: 'tab',
        type: 'string',
        enum: [...SUELDOS_TABS],
        description:
          'Pestaña a activar en el módulo Sueldos. Debe ser una de: dashboard, empleados, convenios, conceptos, simulador, recibo, firma-digital.',
        required: true,
      },
    ],
    handler: ({ tab }) => {
      const tabStr = String(tab);
      if (!isSueldosTab(tabStr)) {
        return `Pestaña no válida: "${tabStr}". Opciones: ${SUELDOS_TABS.join(', ')}.`;
      }
      if (typeof window === 'undefined') return 'Sin entorno de ventana.';
      window.dispatchEvent(
        new CustomEvent(ARCA_EVENT_SET_SUELDOS_TAB, { detail: { tab: tabStr } })
      );
      return `Pestaña de Sueldos cambiada a "${tabStr}".`;
    },
  });

  return null;
}

function isClientDetailTab(value: string): value is ClientDetailTab {
  return (CLIENT_DETAIL_TABS as readonly string[]).includes(value);
}

function isSueldosTab(value: string): value is SueldosTab {
  return (SUELDOS_TABS as readonly string[]).includes(value);
}
