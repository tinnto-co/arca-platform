'use client';

import { useQuery } from '@tanstack/react-query';
import { useCopilotReadable } from '@copilotkit/react-core';
import { getClientsWithProfiles, getClientsForSueldos } from '@/actions/client';

interface ClientRow {
  id: string;
  name: string;
  identityNumber: string | null;
  profiles?: { id: string; name: string }[];
}

/**
 * Global CopilotKit readables — kept always mounted so the agent can resolve
 * a client by name (fuzzy / partial) → clientId, and a sueldos profile by name
 * → profileId, from any screen of the app. Without this, tools like
 * `abrirCliente` and `abrirSueldosCliente` would force the user to provide
 * UUIDs, which they don't typically know.
 *
 * Each list is capped to 100 entries to keep the prompt context bounded.
 * If the org grows past that, switch to a server-side search action.
 */
export function GlobalCopilotReadables() {
  const { data: allClients } = useQuery({
    queryKey: ['clientsWithProfiles'],
    queryFn: () => getClientsWithProfiles(),
    staleTime: 60_000,
  });

  const { data: sueldosClients } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getClientsForSueldos(),
    staleTime: 60_000,
  });

  const clientesGlobal = ((allClients as ClientRow[] | undefined) ?? [])
    .slice(0, 100)
    .map((c) => ({
      clientId: c.id,
      nombre: c.name,
      cuit: c.identityNumber ?? null,
      perfilPrincipal: c.profiles?.[0]?.name ?? null,
    }));

  const sueldosGlobal = (sueldosClients ?? []).slice(0, 100).map((c) => ({
    profileId: c.profileId,
    clientId: c.clientId,
    nombre: c.name,
    label: c.label,
  }));

  useCopilotReadable({
    description:
      'Lista global de clientes de la organización (hasta 100). Usá este contexto para resolver `clientId` cuando el usuario menciona un cliente por nombre, parcial o variante (ej: "e-presis" → "E-Presis SA"). Hacé fuzzy match: ignorá mayúsculas, guiones y espacios extras. Si hay coincidencia única, invocá `abrirCliente` con ese clientId. Si hay varias coincidencias, ofrecé la lista al usuario para que elija. NUNCA inventes un UUID.',
    value: clientesGlobal,
  });

  useCopilotReadable({
    description:
      'Lista global de clientes habilitados para liquidación de sueldos (hasta 100). Usá este contexto para resolver `profileId` cuando el usuario pide abrir el módulo Sueldos de un cliente por nombre (ej: "andá a sueldos de e-presis" → buscá "e-presis" en esta lista, sacá el profileId, y llamá `abrirSueldosCliente`). Hacé fuzzy match: ignorá mayúsculas, guiones y espacios extras. Si hay varias coincidencias, ofrecé al usuario que elija. NUNCA inventes un UUID.',
    value: sueldosGlobal,
  });

  return null;
}
