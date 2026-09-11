'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClientes, getClientesForSueldos } from '@/actions/client';
import type { ClienteCopilot } from './resolver-cliente';

/**
 * La cartera de clientes tal como la necesitan las tools del asistente.
 *
 * Sale de las mismas dos queries que usa el resto de la app (`['clientes']` y
 * `['clientes','sueldos']`), así que comparte caché con el selector de empresa
 * y con la paleta ⌘K: montar el asistente no agrega un viaje al servidor.
 *
 * `credencialId` es el login de ARCA preferido. Va acá porque la ficha de
 * cliente se abre en `/clients/<credencialId>?empresa=<clienteId>`: la ruta
 * cuelga del login, no de la empresa, y sin este dato el asistente navegaba a
 * una URL que existe pero no resuelve ninguna ficha.
 */
export function useClientesCopilot(): ClienteCopilot[] {
  const { data: todos } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => getClientes(),
    staleTime: 60_000,
  });

  const { data: conSueldos } = useQuery({
    queryKey: ['clientes', 'sueldos'],
    queryFn: () => getClientesForSueldos(),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const idsConSueldos = new Set((conSueldos ?? []).map((c) => c.clienteId));
    return (todos ?? []).map((c) => ({
      id: c.id,
      razonSocial: c.razonSocial,
      cuit: c.cuit,
      credencialId: c.credenciales[0]?.id ?? null,
      credenciales: c.credenciales
        .map((cr) => cr.nombre ?? cr.cuit)
        .filter((n): n is string => Boolean(n)),
      liquidaSueldos: idsConSueldos.has(c.id),
    }));
  }, [todos, conSueldos]);
}
