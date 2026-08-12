'use client';

import { useQuery } from '@tanstack/react-query';
import { useCopilotReadable } from '@copilotkit/react-core';
import { getClientes, getClientesForSueldos } from '@/actions/client';

/**
 * Global CopilotKit readables — kept always mounted so the agent can resolve
 * a client by name (fuzzy / partial) → clienteId from any screen of the app.
 * Without this, tools like `abrirCliente` and `abrirSueldosCliente` would force
 * the user to provide UUIDs, which they don't typically know.
 *
 * `cliente` es la entidad fiscal con CUIT propio (lo que el usuario llama
 * "cliente"); `credenciales` son los logins de AFIP por los que se lo scrapea y
 * sirven solo como contexto extra para el fuzzy match.
 *
 * Each list is capped to 100 entries to keep the prompt context bounded.
 * If the org grows past that, switch to a server-side search action.
 */
export function GlobalCopilotReadables() {
  const { data: allClients } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });

  const { data: sueldosClients } = useQuery({
    queryKey: ['clientes', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
    staleTime: 60_000,
  });

  const clientesGlobal = (allClients ?? []).slice(0, 100).map((c) => ({
    clienteId: c.id,
    nombre: c.razonSocial,
    cuit: c.cuit,
    credenciales: c.credenciales.map((cr) => cr.nombre ?? cr.cuit),
  }));

  const sueldosGlobal = (sueldosClients ?? []).slice(0, 100).map((c) => ({
    clienteId: c.clienteId,
    nombre: c.name,
    label: c.label,
  }));

  useCopilotReadable({
    description:
      'Lista global de clientes de la organización (hasta 100). Cada entrada es un CLIENTE: la entidad fiscal con CUIT propio, identificada por `clienteId`. `credenciales` son los nombres de los logins de AFIP por los que se lo scrapea (contexto extra para reconocerlo, NO son ids navegables). ' +
      'REGLA DE RESOLUCIÓN para navegar con `abrirCliente`: buscá por `nombre` o `cuit` con fuzzy match (ignorá mayúsculas, puntos, guiones, espacios y sufijos como "S.A."/"SA"/"SRL") y llamá `abrirCliente` con el `clienteId` de la entrada que coincide. ' +
      'Si varios clientes coinciden, ofrecé la lista para que elija. NUNCA inventes un UUID.',
    value: clientesGlobal,
  });

  useCopilotReadable({
    description:
      'Lista global de clientes habilitados para liquidación de sueldos (hasta 100). Usá este contexto para resolver `clienteId` cuando el usuario pide abrir el módulo Sueldos de un cliente por nombre (ej: "andá a sueldos de e-presis" → buscá "e-presis" en esta lista, sacá el clienteId, y llamá `abrirSueldosCliente`). Hacé fuzzy match: ignorá mayúsculas, guiones y espacios extras. Si hay varias coincidencias, ofrecé al usuario que elija. NUNCA inventes un UUID.',
    value: sueldosGlobal,
  });

  return null;
}
