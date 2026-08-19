'use client';

import { useQuery } from '@tanstack/react-query';
import { useCopilotReadable } from '@copilotkit/react-core';
import {
  getRepresentativesWithClients,
  getRepresentativesForSueldos,
} from '@/actions/client';

interface ClientRow {
  id: string;
  name: string;
  cuit: string | null;
  clients?: { id: string; name: string; identityNumber?: string | null }[];
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
    queryFn: () => getRepresentativesWithClients(),
    staleTime: 60_000,
  });

  const { data: sueldosClients } = useQuery({
    queryKey: ['clients', 'sueldos'],
    queryFn: () => getRepresentativesForSueldos(),
    staleTime: 60_000,
  });

  const clientesGlobal = ((allClients) ?? [])
    .slice(0, 100)
    .map((c) => ({
      clientId: c.id,
      nombre: c.name,
      cuit: c.cuit ?? null,
      empresas: (c.clients ?? []).map((p) => ({
        empresaId: p.id,
        nombre: p.name,
        cuit: p.identityNumber ?? null,
      })),
    }));

  const sueldosGlobal = (sueldosClients ?? []).slice(0, 100).map((c) => ({
    profileId: c.clientId,
    clientId: c.representativeId,
    nombre: c.name,
    label: c.label,
  }));

  useCopilotReadable({
    description:
      'Lista global de la organización (hasta 100 representantes). Cada entrada es un REPRESENTANTE (agrupador, campo `clientId`) y dentro tiene `empresas`: las ENTIDADES FISCALES reales con CUIT propio, cada una con `empresaId`, `nombre` y `cuit`. ' +
      'REGLA DE RESOLUCIÓN para navegar con `abrirCliente`: cuando el usuario nombra un "cliente" casi SIEMPRE se refiere a una EMPRESA, no al representante. ' +
      '1) Buscá PRIMERO en TODAS las `empresas` de todos los representantes, por nombre o CUIT, con fuzzy match (ignorá mayúsculas, puntos, guiones, espacios y sufijos como "S.A."/"SA"/"SRL"). ' +
      '2) Si encontrás una empresa que coincide, llamá `abrirCliente` con el `clientId` del representante que la contiene Y su `empresaId` para que quede preseleccionada — hacé esto INCLUSO si el término también coincide con el nombre del representante (ej: el representante "E-Presis SA" tiene una empresa "E-presis S.A.": si piden "e-presis", pasá esa empresa). ' +
      '3) Solo si NINGUNA empresa coincide pero sí un representante, llamá `abrirCliente` con solo el `clientId`. ' +
      'Si varias empresas coinciden, ofrecé la lista para que elija. NUNCA inventes un UUID.',
    value: clientesGlobal,
  });

  useCopilotReadable({
    description:
      'Lista global de clientes habilitados para liquidación de sueldos (hasta 100). Usá este contexto para resolver `profileId` cuando el usuario pide abrir el módulo Sueldos de un cliente por nombre (ej: "andá a sueldos de e-presis" → buscá "e-presis" en esta lista, sacá el profileId, y llamá `abrirSueldosCliente`). Hacé fuzzy match: ignorá mayúsculas, guiones y espacios extras. Si hay varias coincidencias, ofrecé al usuario que elija. NUNCA inventes un UUID.',
    value: sueldosGlobal,
  });

  return null;
}
