/**
 * Elige el CUIT de perfil más coherente para mostrar / guardar como "CUIT empresa"
 * cuando hay varios perfiles (titular persona + razón social).
 */

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

/** CUIT de sociedad (contribuyentes jurídicos) — prefijos habituales AFIP */
export function isCompanyCuit(n: string): boolean {
  return (
    n.length === 11 &&
    (n.startsWith("30") || n.startsWith("33") || n.startsWith("34"))
  );
}

/** CUIT/CUIL de persona física (heurística por prefijo) */
export function isPersonCuit(n: string): boolean {
  return (
    n.length === 11 &&
    (n.startsWith("20") ||
      n.startsWith("23") ||
      n.startsWith("24") ||
      n.startsWith("27"))
  );
}

function normalizeName(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|sa|srl|sas|ltda|sociedad|anonima|de|la|el|y)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .split(" ")
      .map((x) => x.trim())
      .filter((x) => x.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function containsEither(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function nameScore(clientName: string, profileName: string): number {
  const cn = normalizeName(clientName);
  const pn = normalizeName(profileName);
  const base = jaccard(tokenSet(cn), tokenSet(pn));
  if (containsEither(cn, pn)) return Math.max(base, 0.88);
  return base;
}

/** Nombre de cliente que sugiere razón social (S.A., SRL, etc.) */
export function looksLikeCompanyClientName(clientName: string | undefined): boolean {
  const n = normalizeName(clientName ?? "");
  if (!n) return false;
  return /\b(sa|srl|sas|s\.a|s\.r\.l|ltda|sociedad)\b/.test(n);
}

export type ProfileWithCuit = {
  name?: string | null;
  identityNumber?: string | null;
  /** Drizzle/SQL snake_case */
  identity_number?: string | null;
};

/**
 * Entre varios perfiles, prioriza el CUIT de sociedad cuando el cliente parece empresa
 * y conviven perfil titular (persona) + perfil empresa.
 */
export function pickProfileCuitForClientName(
  clientName: string | undefined,
  profiles: ProfileWithCuit[],
): string | undefined {
  const valid = profiles
    .map((p) => ({
      name: String(p.name ?? ""),
      cuit: digits(p.identityNumber ?? p.identity_number),
    }))
    .filter((p) => p.cuit.length === 11);

  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0].cuit;

  const companies = valid.filter((p) => isCompanyCuit(p.cuit));
  const persons = valid.filter((p) => isPersonCuit(p.cuit));

  const pickBest = (list: typeof valid) => {
    let best = list[0]!;
    let bestS = nameScore(clientName ?? "", best.name);
    for (const p of list) {
      const s = nameScore(clientName ?? "", p.name);
      if (s > bestS) {
        bestS = s;
        best = p;
      }
    }
    return best;
  };

  if (looksLikeCompanyClientName(clientName) && companies.length >= 1 && persons.length >= 1) {
    return pickBest(companies).cuit;
  }

  if (looksLikeCompanyClientName(clientName) && companies.length >= 1) {
    return pickBest(companies).cuit;
  }

  return pickBest(valid).cuit;
}
