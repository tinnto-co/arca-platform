import { pickProfileCuitForClientName } from "@/lib/cuit-empresa-from-profiles";

/** Mínimo de caracteres del nombre del perfil para considerarlo un match (evita "S", "A", etc.). */
export const MIN_PROFILE_NAME_LENGTH = 3;

export type ProfileForMatch = {
  id: string;
  name?: string | null;
  identityNumber?: string | null;
};

/**
 * Elige el id del perfil que mejor coincide con el nombre del cliente (case-insensitive, por contiene).
 * Ej: cliente "Smart Solutions SRL" → perfil "Smart Solutions".
 */
export function findBestMatchingProfileId(
  clientName: string | undefined,
  profiles: Array<{ id: string; name?: string | null }>
): string | undefined {
  if (!profiles.length) return undefined;
  const normalizedClient = (clientName ?? "").trim().toLowerCase();
  if (normalizedClient.length < 2) return profiles[0].id;

  const withName = profiles.filter(
    (p) => ((p.name ?? "").trim().length >= MIN_PROFILE_NAME_LENGTH)
  );
  if (withName.length === 0) return profiles[0].id;

  const containedInClient = withName
    .filter((p) =>
      normalizedClient.includes((p.name ?? "").trim().toLowerCase())
    )
    .sort((a, b) => (b.name ?? "").length - (a.name ?? "").length);
  if (containedInClient.length > 0) return containedInClient[0].id;

  const clientInProfile = withName.find((p) =>
    (p.name ?? "").trim().toLowerCase().includes(normalizedClient)
  );
  if (clientInProfile) return clientInProfile.id;

  return profiles[0].id;
}

/**
 * CUIT del perfil más coherente con el nombre del cliente.
 * Con varios perfiles (titular + empresa), prioriza el CUIT de sociedad cuando el nombre del cliente parece razón social.
 */
export function getCuitFromNameMatchedProfile(
  clientName: string | undefined,
  profiles: ProfileForMatch[]
): string | undefined {
  if (!profiles.length) return undefined;
  const raw = pickProfileCuitForClientName(clientName, profiles);
  return raw || undefined;
}
