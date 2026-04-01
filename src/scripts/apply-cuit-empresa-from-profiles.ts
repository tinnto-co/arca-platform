/**
 * Reaplica cuit_empresa desde perfiles usando pickProfileCuitForClientName
 * (prioriza CUIT de sociedad cuando hay titular + empresa).
 *
 * Uso: bun run src/scripts/apply-cuit-empresa-from-profiles.ts
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { resolve } from "path";
import { pickProfileCuitForClientName } from "../lib/cuit-empresa-from-profiles";

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

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

loadEnv();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");

const sql = postgres(url, { max: 1 });

type Client = { id: string; name: string; cuit_empresa: string };
type Profile = { client_id: string | null; name: string; identity_number: string };

const clients = await sql<Client[]>`
  SELECT id, COALESCE(name,'') AS name, COALESCE(cuit_empresa,'') AS cuit_empresa FROM client
`;
const profiles = await sql<Profile[]>`
  SELECT client_id, COALESCE(name,'') AS name, COALESCE(identity_number,'') AS identity_number
  FROM profile WHERE client_id IS NOT NULL
`;

const byClient = new Map<string, Profile[]>();
for (const p of profiles) {
  if (!p.client_id) continue;
  const list = byClient.get(p.client_id) ?? [];
  list.push(p);
  byClient.set(p.client_id, list);
}

let updated = 0;
for (const c of clients) {
  const plist = byClient.get(c.id) ?? [];
  if (plist.length === 0) continue;

  const chosen = pickProfileCuitForClientName(c.name, plist);
  if (!chosen) continue;

  if (chosen === digits(c.cuit_empresa)) continue;

  const r = await sql`
    UPDATE client
    SET cuit_empresa = ${chosen},
        updated_at = NOW()
    WHERE id = ${c.id}::uuid
      AND COALESCE(cuit_empresa,'') <> ${chosen}
  `;
  updated += r.count;
}

console.log("Clients with profiles:", [...byClient.keys()].length);
console.log("Rows updated:", updated);

await sql.end();
