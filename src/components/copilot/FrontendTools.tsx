'use client';

import { useFrontendTool } from '@copilotkit/react-core';
import { useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useClientesCopilot } from './use-clientes-copilot';
import { mensajeDeFallo, resolverCliente } from './resolver-cliente';

/**
 * Lo que hizo el agente, en una línea. No es un mensaje suyo —es una nota al
 * margen—, así que no lleva recuadro: hecho, una marca en un cuadradito
 * turquesa; en curso, un punto que late. En los dos casos arranca en el mismo
 * margen izquierdo que la respuesta, para que la conversación se lea en una
 * sola columna.
 */
function NavToolStatus({
  status,
  result,
}: {
  status: string;
  result?: unknown;
}) {
  const done = status === 'complete';
  const text =
    typeof result === 'string' && result.length > 0
      ? result
      : done
        ? 'Listo'
        : 'Navegando…';
  return (
    <div className="flex items-start gap-2 text-[12px] leading-[1.45] text-[var(--arca-ink-3)]">
      {done ? (
        <span className="mt-px grid size-[17px] shrink-0 place-items-center rounded-[5px] bg-[var(--arca-accent-info-bg)] text-[var(--arca-accent)]">
          <Check className="size-[11px]" strokeWidth={2.6} />
        </span>
      ) : (
        <span
          aria-hidden
          className="mt-[5px] ml-[4px] mr-[4px] size-2 shrink-0 rounded-full bg-[var(--arca-accent-light)] motion-safe:animate-pulse"
        />
      )}
      <span className="min-w-0">{text}</span>
    </div>
  );
}

/** Las mismas diez que declara `/_authed/clients/$clientId`. */
const CLIENT_DETAIL_TABS = [
  'resumen',
  'deudas',
  'vencimientos',
  'notificaciones',
  'facturas',
  'iva',
  'convenio-multilateral',
  'solicitudes',
  'portal',
  'perfiles',
] as const;

/** Las mismas ocho que declara `/_authed/sueldos/$clienteId`. */
const SUELDOS_TABS = [
  'dashboard',
  'empleados',
  'convenios',
  'conceptos',
  'simulador',
  'recibo',
  'firma-digital',
  'cargas',
] as const;

type ClientDetailTab = (typeof CLIENT_DETAIL_TABS)[number];
type SueldosTab = (typeof SUELDOS_TABS)[number];

/**
 * Las tools que el asistente resuelve en el navegador, sin pasar por el
 * servidor: abrir la ficha de una empresa, abrir su módulo de sueldos, o
 * cambiar de pestaña estando ya adentro.
 *
 * Todas reciben el NOMBRE de la empresa, no su id: el emparejamiento lo hace
 * `resolverCliente` contra la cartera en caché. Cuando el modelo transportaba
 * el UUID, un solo carácter cambiado bastaba para navegar a una ficha ajena o
 * a una URL muerta, y el usuario veía "Cliente no encontrado" sin ninguna
 * pista de por qué.
 *
 * La pestaña viaja por `?tab=`, que es como la leen las dos páginas: el link
 * queda compartible y "abrime X en la solapa Y" es una sola navegación.
 */
export function FrontendTools() {
  const navigate = useNavigate();
  const clientes = useClientesCopilot();

  useFrontendTool({
    name: 'abrirCliente',
    description:
      'Abrí la ficha de una empresa (sin recargar la página). Pasá `clientName` con la razón social tal como figura en la cartera de clientes; el id lo resuelve el sistema. ' +
      'IMPORTANTE: si el usuario menciona una SECCIÓN, pasá también el `tab`. Mapeo: "facturación"/"facturas"/"comprobantes"→facturas, "deudas"→deudas, "vencimientos"→vencimientos, "notificaciones"→notificaciones, "iva"→iva, "convenio"/"multilateral"→convenio-multilateral, "solicitudes"→solicitudes, "portal"→portal, "perfiles"/"empresas"→perfiles, "resumen"/"overview"→resumen.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Razón social de la empresa, o su CUIT. Nunca un UUID.',
        required: true,
      },
      {
        name: 'tab',
        type: 'string',
        enum: [...CLIENT_DETAIL_TABS],
        description:
          'Pestaña a abrir directamente. Una de: resumen, deudas, vencimientos, notificaciones, facturas, iva, convenio-multilateral, solicitudes, portal, perfiles.',
        required: false,
      },
    ],
    handler: ({ clientName, tab }) => {
      const consulta = String(clientName ?? '').trim();
      const resolucion = resolverCliente(clientes, consulta);
      if (resolucion.estado !== 'ok') {
        return mensajeDeFallo(resolucion, consulta);
      }
      const { cliente } = resolucion;

      // La ficha cuelga del acceso de ARCA: `/clients/<credencialId>` con la
      // empresa elegida en `?empresa=`. Sin credencial no hay ficha adónde ir.
      if (!cliente.credencialId) {
        return `${cliente.razonSocial} no tiene ningún acceso de ARCA asociado, así que todavía no tiene ficha. Se carga desde Clientes.`;
      }

      const tabStr = tab ? String(tab) : undefined;
      const validTab = tabStr && isClientDetailTab(tabStr) ? tabStr : undefined;
      void navigate({
        to: '/clients/$clientId',
        params: { clientId: cliente.credencialId },
        search: {
          empresa: cliente.id,
          ...(validTab && validTab !== 'resumen' ? { tab: validTab } : {}),
        },
      });
      return validTab
        ? `Abrí "${cliente.razonSocial}" en la pestaña "${validTab}".`
        : `Abrí "${cliente.razonSocial}".`;
    },
    render: ({ status, result }) => (
      <NavToolStatus status={status} result={result} />
    ),
  });

  useFrontendTool({
    name: 'abrirSueldosCliente',
    description:
      'Abrí el módulo de Sueldos de una empresa (sin recargar la página). Pasá `clientName` con la razón social; el id lo resuelve el sistema. ' +
      'Sólo funciona con empresas que liquidan sueldos (las que tienen `sueldos: true` en la cartera): si la empresa existe pero no liquida, la tool lo avisa. Opcionalmente pasá `tab` para abrir directo en esa pestaña.',
    parameters: [
      {
        name: 'clientName',
        type: 'string',
        description: 'Razón social de la empresa, o su CUIT. Nunca un UUID.',
        required: true,
      },
      {
        name: 'tab',
        type: 'string',
        enum: [...SUELDOS_TABS],
        description:
          'Pestaña de sueldos a abrir. Una de: dashboard, empleados, convenios, conceptos, simulador, recibo, firma-digital, cargas.',
        required: false,
      },
    ],
    handler: ({ clientName, tab }) => {
      const consulta = String(clientName ?? '').trim();
      const resolucion = resolverCliente(clientes, consulta, {
        soloSueldos: true,
      });
      if (resolucion.estado !== 'ok') {
        // Que exista pero no liquide sueldos es un "no" distinto de que no
        // exista, y al usuario le sirve saber cuál de los dos es.
        const enCartera = resolverCliente(clientes, consulta);
        if (enCartera.estado === 'ok') {
          return `${enCartera.cliente.razonSocial} no tiene el módulo de Sueldos habilitado.`;
        }
        return mensajeDeFallo(resolucion, consulta, { soloSueldos: true });
      }
      const { cliente } = resolucion;

      const tabStr = tab ? String(tab) : undefined;
      const validTab = tabStr && isSueldosTab(tabStr) ? tabStr : undefined;
      void navigate({
        to: '/sueldos/$clienteId',
        params: { clienteId: cliente.id },
        search: validTab && validTab !== 'dashboard' ? { tab: validTab } : {},
      });
      return validTab
        ? `Abrí los sueldos de "${cliente.razonSocial}" en la pestaña "${validTab}".`
        : `Abrí los sueldos de "${cliente.razonSocial}".`;
    },
    render: ({ status, result }) => (
      <NavToolStatus status={status} result={result} />
    ),
  });

  useFrontendTool({
    name: 'cambiarTabClienteDetalle',
    description:
      'Cambiá la pestaña activa en la ficha de una empresa (/clients/…). Sólo tiene efecto si el usuario ya está en esa página; si no, usá `abrirCliente` con el `tab`.',
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
      if (typeof window === 'undefined') return 'No disponible.';
      const match = /^\/clients\/([^/]+)/.exec(window.location.pathname);
      if (!match) {
        return 'No estás en la ficha de una empresa. Usá `abrirCliente` con el `tab` correspondiente para llegar ahí.';
      }
      // La empresa seleccionada vive en `?empresa=`: cambiar de pestaña no
      // puede perderla, o la ficha se cae a la primera del login.
      const empresa =
        new URLSearchParams(window.location.search).get('empresa') ?? undefined;
      void navigate({
        to: '/clients/$clientId',
        params: { clientId: match[1] },
        search: {
          ...(empresa ? { empresa } : {}),
          ...(tabStr !== 'resumen' ? { tab: tabStr } : {}),
        },
        replace: true,
      });
      return `Pestaña cambiada a "${tabStr}".`;
    },
    render: ({ status, result }) => (
      <NavToolStatus status={status} result={result} />
    ),
  });

  useFrontendTool({
    name: 'cambiarTabSueldos',
    description:
      'Cambiá la pestaña activa en el módulo Sueldos (/sueldos/…). Sólo tiene efecto si el usuario ya está en esa página; si no, usá `abrirSueldosCliente` con el `tab`.',
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
        return 'No estás en el módulo Sueldos de una empresa. Usá `abrirSueldosCliente` con el `tab` correspondiente.';
      }
      void navigate({
        to: '/sueldos/$clienteId',
        params: { clienteId: match[1] },
        search: tabStr !== 'dashboard' ? { tab: tabStr } : {},
        replace: true,
      });
      return `Pestaña de Sueldos cambiada a "${tabStr}".`;
    },
    render: ({ status, result }) => (
      <NavToolStatus status={status} result={result} />
    ),
  });

  return null;
}

function isClientDetailTab(value: string): value is ClientDetailTab {
  return (CLIENT_DETAIL_TABS as readonly string[]).includes(value);
}

function isSueldosTab(value: string): value is SueldosTab {
  return (SUELDOS_TABS as readonly string[]).includes(value);
}
