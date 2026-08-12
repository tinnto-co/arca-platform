/**
 * Alta de los clientes de la planilla que faltan en la BD:
 *  - crea los representantes (logins AFIP) faltantes con la clave fiscal de la
 *    planilla, cifrada igual que la app (AES-256-GCM, CREDENTIAL_ENCRYPTION_KEY);
 *  - crea las filas de `client` bajo el representante que corresponda
 *    (existente o recién creado), replicando createRepresentativeWithClients.
 *
 * NO dispara jobs de scraping.
 * Destino: NEW_DB por defecto; con --original escribe en DATABASE_URL (server original,
 * solo inserts — mismo efecto que el alta por UI). Dry-run por defecto; --apply para escribir.
 *
 * Uso: source .env && bun run src/scripts/alta-clientes-faltantes.ts "/path/planilla.csv" [--original] [--apply]
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { encrypt } from "../lib/crypto";

const csvPath = process.argv[2];
const apply = process.argv.includes("--apply");
const useOriginal = process.argv.includes("--original");
if (!csvPath) throw new Error("Uso: <planilla.csv> [--original] [--apply]");

const url = useOriginal ? process.env.DATABASE_URL : process.env.NEW_DB;
if (!url) throw new Error(`Falta ${useOriginal ? "DATABASE_URL" : "NEW_DB"} en el entorno`);
console.log(`Destino: ${useOriginal ? "ORIGINAL_DB" : "NEW_DB"} (${url.replace(/:[^:@]*@/, ":****@")})`);

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const norm = (s: string) => (s ?? "").replace(/\D/g, "");

const rows = readFileSync(csvPath, "utf8").split("\n").map(parseCsvLine);
const findRow = (label: string) => rows.find((r) => r[0]?.trim().toLowerCase() === label.toLowerCase()) ?? [];
const names = rows[1] ?? [];
const cuits = findRow("Cuit");
const rels = findRow("Relación de Clave");
const claves = findRow("Clave Fiscal");

type Entry = { name: string; cuit: string; loginCuit: string; clave: string };
const entries: Entry[] = [];
for (let i = 1; i < names.length; i++) {
  const name = names[i]?.trim();
  const cuit = norm(cuits[i]);
  if (!name || !cuit) continue;
  entries.push({ name, cuit, loginCuit: norm(rels[i]) || cuit, clave: (claves[i] ?? "").trim() });
}

const sql = postgres(url, { max: 3 });

const dbReps = await sql`select id, name, cuit, user_id, organization_id from representative`;
const repByCuit = new Map(dbReps.map((r) => [norm(r.cuit), r]));
const dbClients = await sql`select id, identity_number from client`;
const clientCuits = new Set(dbClients.map((c) => norm(c.identity_number)));

// user/org de referencia (el más usado en representative)
const [ctx] = await sql`
  select user_id, organization_id, count(*)::int as n
  from representative group by 1, 2 order by n desc limit 1
`;

const missing = entries.filter((e) => !clientCuits.has(e.cuit));
console.log(`Clientes de la planilla que faltan en BD: ${missing.length}`);

// Agrupar por login
const byLogin = new Map<string, Entry[]>();
for (const e of missing) {
  if (!byLogin.has(e.loginCuit)) byLogin.set(e.loginCuit, []);
  byLogin.get(e.loginCuit)!.push(e);
}

type Plan = { repCuit: string; clave: string | null; repExists: boolean; clients: Entry[] };
const plan: Plan[] = [];
for (const [login, ents] of byLogin) {
  const rep = repByCuit.get(login);
  const clave = ents.map((e) => e.clave).find(Boolean) ?? null;
  if (!rep && !clave) {
    console.error(`!! ${login} (${ents.map((e) => e.name).join(", ")}): sin rep en BD y SIN clave en planilla — se saltea`);
    continue;
  }
  plan.push({ repCuit: login, clave: rep ? null : clave, repExists: !!rep, clients: ents });
}

console.log("\nPlan:");
for (const p of plan) {
  console.log(` rep ${p.repCuit} ${p.repExists ? "(existe)" : `(CREAR, clave ${p.clave ? "OK" : "FALTA"})`}`);
  for (const c of p.clients) console.log(`   + client ${c.name} (${c.cuit})`);
}

if (!apply) {
  console.log("\nDRY-RUN. Volver a correr con --apply para escribir.");
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const p of plan) {
    let repId: string;
    if (p.repExists) {
      repId = repByCuit.get(p.repCuit)!.id;
    } else {
      const [rep] = await tx`
        insert into representative (user_id, organization_id, name, cuit, afip_password, email, phone, status, registered_at)
        values (${ctx.user_id}, ${ctx.organization_id}, null, ${p.repCuit}, ${encrypt(p.clave!)}, '', '', 'active', now())
        returning id
      `;
      repId = rep.id;
      console.log(`rep creado: ${p.repCuit} (${repId})`);
    }
    for (const c of p.clients) {
      await tx`
        insert into client (representative_id, name, identity_number, identity_type, address, phone, email, status)
        values (${repId}, ${c.name}, ${c.cuit}, 'cuit', '', '', '', 'active')
      `;
      console.log(`client creado: ${c.name} (${c.cuit}) bajo rep ${p.repCuit}`);
    }
  }
});

const [after] = await sql`select (select count(*)::int from representative) as reps, (select count(*)::int from client) as clients`;
console.log(`\nHecho. representative=${after.reps} client=${after.clients}`);
await sql.end();
