import XLSX from "xlsx";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

type ClientRow = {
  id: string;
  name: string;
  cuit_empresa: string;
  identity_number: string;
  liquida_sueldos: boolean;
};

type ProfileRow = {
  client_id: string | null;
  name: string;
  identity_number: string;
};

type ExcelRow = {
  empresa: string;
  cuit: string;
  norm: string;
  tokens: Set<string>;
};

type MatchReason =
  | "profile_cuit_exact"
  | "profile_cuit_exact_name_disambiguated"
  | "name_high_confidence";

type MatchCandidate = {
  clientId: string;
  clientName: string;
  excelEmpresa: string;
  excelCuit: string;
  reason: MatchReason;
  score: number;
};

function loadEnv() {
  const envPath = resolve(import.meta.dir, "../../.env");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function digits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
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
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function containsEither(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function scoreClientMatch(excelNorm: string, excelTokens: Set<string>, c: ClientRow, ps: ProfileRow[]): number {
  const cn = normalizeName(c.name);
  let best = 0;
  const direct = jaccard(excelTokens, tokenSet(cn));
  if (direct > best) best = direct;
  if (containsEither(excelNorm, cn)) best = Math.max(best, 0.85);

  for (const p of ps) {
    const pn = normalizeName(p.name);
    const s = jaccard(excelTokens, tokenSet(pn));
    if (s > best) best = s;
    if (containsEither(excelNorm, pn)) best = Math.max(best, 0.9);
  }
  return best;
}

function reasonPriority(reason: MatchReason): number {
  return reason.startsWith("profile_cuit_exact") ? 2 : 1;
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { max: 1 });

const clients = await sql<ClientRow[]>`
  SELECT id, name, COALESCE(cuit_empresa,'') AS cuit_empresa,
         COALESCE(identity_number,'') AS identity_number,
         COALESCE(liquida_sueldos,false) AS liquida_sueldos
  FROM client
`;

const profiles = await sql<ProfileRow[]>`
  SELECT client_id, COALESCE(name,'') AS name, COALESCE(identity_number,'') AS identity_number
  FROM profile
  WHERE client_id IS NOT NULL
`;

const profilesByClient = new Map<string, ProfileRow[]>();
for (const p of profiles) {
  if (!p.client_id) continue;
  const arr = profilesByClient.get(p.client_id) ?? [];
  arr.push(p);
  profilesByClient.set(p.client_id, arr);
}

const clientById = new Map(clients.map((c) => [c.id, c] as const));

const excelPath = resolve(import.meta.dir, "../../Documentacion Tecnica/Empresas que liquidan sueldos.xlsx");
const txtOutPath = resolve(import.meta.dir, "../../Documentacion Tecnica/empresas que faltan sumar.txt");
const auditOutPath = resolve(import.meta.dir, "../../Documentacion Tecnica/auditoria actualizacion cuit_empresa.xlsx");

const ws = XLSX.readFile(excelPath).Sheets["Hoja1"];
const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: "" });

const excelRows: ExcelRow[] = [];
for (let i = 2; i < raw.length; i++) {
  const empresa = String(raw[i]?.[0] ?? "").trim();
  const cuit = digits(raw[i]?.[1]);
  if (!empresa || cuit.length !== 11) continue;
  const norm = normalizeName(empresa);
  excelRows.push({ empresa, cuit, norm, tokens: tokenSet(norm) });
}

const profileCuitToClients = new Map<string, Set<string>>();
for (const p of profiles) {
  const cuit = digits(p.identity_number);
  if (cuit.length !== 11 || !p.client_id) continue;
  const set = profileCuitToClients.get(cuit) ?? new Set<string>();
  set.add(p.client_id);
  profileCuitToClients.set(cuit, set);
}

const candidates: MatchCandidate[] = [];

for (const ex of excelRows) {
  let matchedClientId: string | null = null;
  let reason: MatchReason | null = null;
  let score = 0;

  const byProfileCuit = [...(profileCuitToClients.get(ex.cuit) ?? new Set<string>())];
  if (byProfileCuit.length === 1) {
    matchedClientId = byProfileCuit[0] ?? null;
    reason = "profile_cuit_exact";
    score = 1;
  } else if (byProfileCuit.length > 1) {
    let bestId: string | null = null;
    let bestScore = -1;
    for (const cid of byProfileCuit) {
      const c = clientById.get(cid);
      if (!c) continue;
      const s = scoreClientMatch(ex.norm, ex.tokens, c, profilesByClient.get(cid) ?? []);
      if (s > bestScore) {
        bestScore = s;
        bestId = cid;
      }
    }
    if (bestId && bestScore >= 0.35) {
      matchedClientId = bestId;
      reason = "profile_cuit_exact_name_disambiguated";
      score = bestScore;
    }
  }

  if (!matchedClientId) {
    let bestId: string | null = null;
    let bestScore = -1;
    let second = -1;
    for (const c of clients) {
      const s = scoreClientMatch(ex.norm, ex.tokens, c, profilesByClient.get(c.id) ?? []);
      if (s > bestScore) {
        second = bestScore;
        bestScore = s;
        bestId = c.id;
      } else if (s > second) {
        second = s;
      }
    }
    if (bestId && bestScore >= 0.72 && bestScore - second >= 0.12) {
      matchedClientId = bestId;
      reason = "name_high_confidence";
      score = bestScore;
    }
  }

  if (matchedClientId && reason) {
    const c = clientById.get(matchedClientId);
    if (!c) continue;
    candidates.push({
      clientId: c.id,
      clientName: c.name,
      excelEmpresa: ex.empresa,
      excelCuit: ex.cuit,
      reason,
      score,
    });
  }
}

const bestByClient = new Map<string, MatchCandidate>();
for (const c of candidates) {
  const cur = bestByClient.get(c.clientId);
  if (!cur || reasonPriority(c.reason) > reasonPriority(cur.reason)) {
    bestByClient.set(c.clientId, c);
  }
}

const auditRows: Array<Record<string, string | number | boolean>> = [];
let updatedRows = 0;

for (const match of bestByClient.values()) {
  const current = clientById.get(match.clientId);
  if (!current) continue;

  const prevCuit = digits(current.cuit_empresa);
  const willChange = prevCuit !== match.excelCuit || !current.liquida_sueldos;

  const r = await sql`
    UPDATE client
    SET cuit_empresa = ${match.excelCuit},
        liquida_sueldos = true,
        updated_at = NOW()
    WHERE id = ${match.clientId}::uuid
      AND (
        COALESCE(cuit_empresa,'') <> ${match.excelCuit}
        OR liquida_sueldos IS DISTINCT FROM true
      )
  `;
  updatedRows += r.count;

  auditRows.push({
    client_id: match.clientId,
    client_name: match.clientName,
    excel_empresa: match.excelEmpresa,
    cuit_excel: match.excelCuit,
    cuit_empresa_anterior: current.cuit_empresa,
    cuit_empresa_nuevo: match.excelCuit,
    liquida_sueldos_anterior: current.liquida_sueldos,
    accion_realizada: willChange,
    motivo_match: match.reason,
    score_match: Number(match.score.toFixed(4)),
  });
}

const cuitEmpresaRows = await sql<{ cuit_empresa: string }[]>`
  SELECT COALESCE(cuit_empresa,'') as cuit_empresa FROM client
`;
const cuitEmpresaSet = new Set(
  cuitEmpresaRows.map((r) => digits(r.cuit_empresa)).filter((x) => x.length === 11),
);
const missing = excelRows.filter((e) => !cuitEmpresaSet.has(e.cuit));

const txtLines = [
  "Empresas del Excel cuyo CUIT no coincide con ningun cliente por la columna cuit_empresa.",
  `Generado: ${new Date().toISOString()}`,
  `Filas Excel validas: ${excelRows.length}`,
  `Clientes matcheados: ${bestByClient.size}`,
  `Filas actualizadas en client: ${updatedRows}`,
  `Faltantes por cuit_empresa: ${missing.length}`,
  "",
  ...missing.map((m) => `${m.cuit}\t${m.empresa}`),
  "",
];
await Bun.write(txtOutPath, txtLines.join("\n"));

const wbAudit = XLSX.utils.book_new();
const auditSheet = XLSX.utils.json_to_sheet(auditRows);
XLSX.utils.book_append_sheet(wbAudit, auditSheet, "clientes_actualizados");
const missingSheet = XLSX.utils.json_to_sheet(
  missing.map((m) => ({ cuit_excel: m.cuit, empresa_excel: m.empresa })),
);
XLSX.utils.book_append_sheet(wbAudit, missingSheet, "faltantes");
XLSX.writeFile(wbAudit, auditOutPath);

console.log("Audit XLSX:", auditOutPath);
console.log("Matched clients:", bestByClient.size);
console.log("Updated rows:", updatedRows);
console.log("Missing by cuit_empresa:", missing.length);

await sql.end();
