/**
 * 1) Asegura columna cuit_empresa
 * 2) Rellena cuit_empresa vacío desde perfiles (CUIT de empresa en perfil asociado)
 * 3) Cruza Excel "Empresas que liquidan sueldos" con cuit_empresa (y fallback identity_number), marca liquida_sueldos
 * 4) Escribe Documentacion Tecnica/empresas que faltan sumar.txt
 *
 * Uso: bun run src/scripts/sync-cuit-empresa-liquida-sueldos.ts
 */
import XLSX from "xlsx";
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const p = resolve(import.meta.dir, "../../.env");
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function normDigits(v: string): string {
  return v.replace(/\D/g, "");
}

function normalizeCuitCell(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).replace(/\D/g, "");
  if (s.length === 11) return s;
  if (s.length > 0 && s.length < 11) return s.padStart(11, "0");
  return null;
}

/** CUIT de sociedad (sujeto jurídico) — prefijos habituales AFIP */
function isCompanyCuitPrefix(n: string): boolean {
  return (
    n.length === 11 &&
    (n.startsWith("30") || n.startsWith("33") || n.startsWith("34"))
  );
}

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const excelPath = resolve(
  import.meta.dir,
  "../../Documentacion Tecnica/Empresas que liquidan sueldos.xlsx",
);
const outPath = resolve(
  import.meta.dir,
  "../../Documentacion Tecnica/empresas que faltan sumar.txt",
);

const sql = postgres(url, { max: 1 });

await sql`ALTER TABLE client ADD COLUMN IF NOT EXISTS cuit_empresa text DEFAULT '' NOT NULL`;

type ClientRow = { id: string; identity_number: string; cuit_empresa: string };
type ProfRow = {
  client_id: string | null;
  identity_number: string;
  identity_type: string;
};

const clients = await sql<ClientRow[]>`
  SELECT id, identity_number, COALESCE(cuit_empresa, '') AS cuit_empresa FROM client
`;
const profiles = await sql<ProfRow[]>`
  SELECT client_id, identity_number, identity_type FROM profile WHERE client_id IS NOT NULL
`;

const byClient = new Map<string, ProfRow[]>();
for (const p of profiles) {
  if (!p.client_id) continue;
  const list = byClient.get(p.client_id) ?? [];
  list.push(p);
  byClient.set(p.client_id, list);
}

let backfilled = 0;
for (const c of clients) {
  if (!c || (c.cuit_empresa && c.cuit_empresa.trim() !== "")) continue;
  const clientN = normDigits(c.identity_number);
  const plist = byClient.get(c.id) ?? [];
  const candidates = plist.map((p) => ({
    ...p,
    n: normDigits(p.identity_number),
  })).filter((p) => p.n.length === 11 && p.n !== clientN);

  let chosen: (typeof candidates)[0] | undefined;

  chosen = candidates.find(
    (p) =>
      isCompanyCuitPrefix(p.n) &&
      /cuit/i.test(p.identity_type || ""),
  );
  if (!chosen) {
    chosen = candidates.find((p) => isCompanyCuitPrefix(p.n));
  }
  if (!chosen) {
    chosen = candidates.find((p) => /cuit/i.test(p.identity_type || ""));
  }
  if (!chosen && candidates.length === 1) chosen = candidates[0];

  if (chosen) {
    const raw = chosen.identity_number.trim();
    await sql`
      UPDATE client
      SET cuit_empresa = ${raw}, updated_at = NOW()
      WHERE id = ${c.id}::uuid
    `;
    backfilled++;
  }
}

const identityFill = await sql`
  UPDATE client
  SET cuit_empresa = identity_number, updated_at = NOW()
  WHERE (COALESCE(TRIM(cuit_empresa), '') = '')
    AND COALESCE(TRIM(identity_number), '') <> ''
`;

const clientsAfter = await sql<ClientRow[]>`
  SELECT id, identity_number, COALESCE(cuit_empresa, '') AS cuit_empresa FROM client
`;

function normDb(s: string): string {
  const n = normDigits(s);
  return n.length === 11 ? n : "";
}

const matchKeys = new Map<string, ClientRow[]>();
function addMatch(key: string, c: ClientRow) {
  const list = matchKeys.get(key) ?? [];
  if (!list.some((x) => x.id === c.id)) list.push(c);
  matchKeys.set(key, list);
}
for (const c of clientsAfter) {
  const a = normDb(c.cuit_empresa);
  if (a) addMatch(a, c);
  const b = normDb(c.identity_number);
  if (b) addMatch(b, c);
}

const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
  header: 1,
  defval: "",
});

const fromExcel: { empresa: string; cuit: string }[] = [];
for (let i = 2; i < raw.length; i++) {
  const row = raw[i];
  if (!row || row.length < 2) continue;
  const empresa = String(row[0] ?? "").trim();
  const cuit = normalizeCuitCell(row[1]);
  if (!cuit) continue;
  fromExcel.push({ empresa, cuit });
}

const missing: { empresa: string; cuit: string }[] = [];
let updated = 0;

for (const { empresa, cuit } of fromExcel) {
  const matches = matchKeys.get(cuit);
  if (!matches?.length) {
    missing.push({ empresa, cuit });
    continue;
  }
  const seen = new Set<string>();
  for (const m of matches) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const r = await sql`
      UPDATE client
      SET liquida_sueldos = true,
          updated_at = NOW()
      WHERE id = ${m.id}::uuid AND (liquida_sueldos IS DISTINCT FROM true)
    `;
    updated += r.count;
  }
}

await sql.end();

const lines = [
  "Empresas del Excel cuyo CUIT no coincide con ningún cliente (cuit_empresa ni identity_number) en la base.",
  `Generado: ${new Date().toISOString()}`,
  `Backfill cuit_empresa desde perfiles (filas actualizadas): ${backfilled}`,
  `cuit_empresa rellenado desde identity_number (personas físicas / vacíos): ${identityFill.count}`,
  `Total en Excel (filas con CUIT válido): ${fromExcel.length}`,
  `Actualizaciones liquida_sueldos (filas): ${updated}`,
  `Faltantes: ${missing.length}`,
  "",
  ...missing.map((m) => `${m.cuit}\t${m.empresa}`),
];

await Bun.write(outPath, lines.join("\n") + "\n");

console.log("Backfill cuit_empresa desde perfiles:", backfilled);
console.log("cuit_empresa desde identity_number:", identityFill.count);
console.log("Excel rows:", fromExcel.length);
console.log("UPDATE liquida_sueldos:", updated);
console.log("Missing:", missing.length);
console.log("Wrote:", outPath);
