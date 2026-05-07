'use client';

import { useFrontendTool } from '@copilotkit/react-core';
import { useNavigate } from '@tanstack/react-router';

const CLIENT_DETAIL_TABS = [
  'resumen',
  'deudas',
  'vencimientos',
  'notificaciones',
  'facturas',
  'iva',
  'convenio-multilateral',
] as const;

const SUELDOS_TABS = [
  'dashboard',
  'empleados',
  'convenios',
  'conceptos',
  'simulador',
  'recibo',
  'firma-digital',
] as const;

type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];
type SueldosTab = (typeof SUELDOS_TABS)[number];

const UUID_LIKE = /^[0-9a-fA-F-]{8,}$/;

/**
 * Frontend tools the assistant can invoke without a server round-trip:
 * navigate to a client / a payroll profile (with optional tab pre-selected),
 * or change the tab while already in those pages.
 *
 * Tabs travel via search params (`?tab=...`) — both the client detail page
 * and the sueldos detail page read that param and use it as the active tab.
 * That keeps URLs bookmarkable and makes "open X already on tab Y" a single
 * navigation, no race conditions, no custom events.
 */
export function FrontendTools() {
  const navigate = useNavigate();

  useFrontendTool({
    name: 'abrirCliente',
    description:
      'Abrí la página de detalle de un cliente (sin recargar). Si el usuario menciona el cliente por nombre (incluso parcial o con tipeo distinto, ej: "e-presis" o "epresis sa"), buscá el `clientId` en el readable global "Lista global de clientes" haciendo fuzzy match (case-insensitive, ignorá guiones/espacios extras). Si hay coincidencia única, invocá esta tool con ese `clientId`. Si hay varias, ofrecé al usuario que elija. NO le pidas el UUID al usuario, ya tenés la lista. NUNCA inventes un UUID. Opcionalmente pasá `tab` para abrir directo en esa pestaña.',
    parameters: [
      {
        name: 'clientId',
        type: 'string',
        description:
          'UUID del cliente. Obtenelo del contexto del listado o del cliente activo. Nunca inventes un UUID.',
        required: true,
      },
      {
        name: 'clientName',
        type: 'string',
        description: 'Nombre del cliente, sólo para mostrar feedback.',
        required: false,
      },
      {
        name: 'tab',
        type: 'string',
        enum: [...CLIENT_DETAIL_TABS],
        description:
          'Pestaña a abrir directamente. Una de: resumen, deudas, vencimientos, notificaciones, facturas, iva, convenio-multilateral.',
        required: false,
      },
    ],
    handler: ({ clientId, clientName, tab }) => {
      if (!clientId || !UUID_LIKE.test(clientId)) {
        return 'Falta un clientId válido. Obtenelo del contexto del listado de clientes.';
      }
      const tabStr = tab ? String(tab) : undefined;
      const validTab =
        tabStr && isClientDetailTab(tabStr) ? tabStr : undefined;
      void navigate({
        to: '/clients/$clientId',
        params: { clientId },
        search: validTab ? { tab: validTab } : {},
      });
      const name = clientName ? `"${String(clientName)}"` : 'el cliente';
      return validTab
        ? `Abierto ${name} en la pestaña "${validTab}".`
        : `Abierto ${name}.`;
    },
  });

  useFrontendTool({
    name: 'abrirSueldosCliente',
    description:
      'Abrí el módulo de sueldos de un cliente (sin recargar). Si el usuario menciona el cliente por nombre (incluso parcial o variante, ej: "e-presis" o "epresis"), buscá el `profileId` en el readable global "Lista global de clientes habilitados para liquidación de sueldos" haciendo fuzzy match (case-insensitive, ignorá guiones/espacios extras). Si hay coincidencia única, invocá esta tool con ese `profileId`. Si hay varias, ofrecé al usuario que elija. NO le pidas el UUID al usuario, ya tenés la lista. NUNCA inventes un UUID. Si el cliente NO aparece en la lista global, avisá al usuario que ese cliente no tiene sueldos habilitados. Opcionalmente pasá `tab` para abrir directo en esa pestaña.',
    parameters: [
      {
        name: 'profileId',
        type: 'string',
        description:
          'UUID del profile habilitado para sueldos. Obtenelo del contexto del listado de sueldos. Nunca inventes un UUID.',
        required: true,
      },
      {
        name: 'clientName',
        type: 'string',
        description: 'Nombre del cliente, sólo para mostrar feedback.',
        required: false,
      },
      {
        name: 'tab',
        type: 'string',
        enum: [...SUELDOS_TABS],
        description:
          'Pestaña de sueldos a abrir. Una de: dashboard, empleados, convenios, conceptos, simulador, recibo, firma-digital.',
        required: false,
      },
    ],
    handler: ({ profileId, clientName, tab }) => {
      if (!profileId || !UUID_LIKE.test(profileId)) {
        return 'Falta un profileId válido. Obtenelo del contexto del listado de sueldos.';
      }
      const tabStr = tab ? String(tab) : undefined;
      const validTab = tabStr && isSueldosTab(tabStr) ? tabStr : undefined;
      void navigate({
        to: '/sueldos/$profileId',
        params: { profileId },
        search: validTab ? { tab: validTab } : {},
      });
      const name = clientName ? `"${String(clientName)}"` : 'el cliente';
      return validTab
        ? `Abiertos los sueldos de ${name} en la pestaña "${validTab}".`
        : `Abiertos los sueldos de ${name}.`;
    },
  });

  useFrontendTool({
    name: 'cambiarTabClienteDetalle',
    description:
      'Cambiá la pestaña activa en la página de detalle de un cliente (/clients/$id). Solo tiene efecto si el usuario está actualmente en esa página. Pestañas válidas: resumen, deudas, vencimientos, notificaciones, facturas, iva, convenio-multilateral.',
    parameters: [
      {
        name: 'tab',
        type: 'string',
        enum: [...CLIENT_DETAIL_TABS],
        description: 'Pestaña a activar.',
        required: true,
      },
    ],
    handler: ({ tab }) => {
      const tabStr = String(tab);
      if (!isClientDetailTab(tabStr)) {
        return `Pestaña no válida: "${tabStr}". Opciones: ${CLIENT_DETAIL_TABS.join(', ')}.`;
      }
      const pathname =
        typeof window !== 'undefined' ? window.location.pathname : '';
      const match = /^\/clients\/([^/]+)/.exec(pathname);
      if (!match) {
        return 'No estás en una página de detalle de cliente. Usá `abrirCliente` con el `tab` correspondiente para llegar ahí.';
      }
      const clientId = match[1];
      void navigate({
        to: '/clients/$clientId',
        params: { clientId },
        search: { tab: tabStr },
        replace: true,
      });
      return `Pestaña cambiada a "${tabStr}".`;
    },
  });

  useFrontendTool({
    name: 'cambiarTabSueldos',
    description:
      'Cambiá la pestaña activa en el módulo Sueldos (/sueldos/$profileId). Solo tiene efecto si el usuario está actualmente en esa página. Pestañas válidas: dashboard, empleados, convenios, conceptos, simulador, recibo, firma-digital.',
    parameters: [
      {
        name: 'tab',
        type: 'string',
        enum: [...SUELDOS_TABS],
        description: 'Pestaña a activar.',
        required: true,
      },
    ],
    handler: ({ tab }) => {
      const tabStr = String(tab);
      if (!isSueldosTab(tabStr)) {
        return `Pestaña no válida: "${tabStr}". Opciones: ${SUELDOS_TABS.join(', ')}.`;
      }
      const pathname =
        typeof window !== 'undefined' ? window.location.pathname : '';
      const match = /^\/sueldos\/([^/]+)/.exec(pathname);
      if (!match) {
        return 'No estás en la página de sueldos de un cliente. Usá `abrirSueldosCliente` con el `tab` correspondiente.';
      }
      const profileId = match[1];
      void navigate({
        to: '/sueldos/$profileId',
        params: { profileId },
        search: { tab: tabStr },
        replace: true,
      });
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
