/**
 * Compara la planilla de clientes (CSV) con las tablas representative/client de la BD.
 * Uso: source .env && bun run src/scripts/audit-clientes-csv.ts "/path/al.csv"
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Falta el path del CSV");

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const norm = (s: string) => (s ?? "").replace(/\D/g, "");

const lines = readFileSync(csvPath, "utf8").split("\n");
const rows = lines.map(parseCsvLine);
const findRow = (label: string) =>
  rows.find((r) => r[0]?.trim().toLowerCase() === label.toLowerCase()) ?? [];

const names = rows[1] ?? [];
const cuits = findRow("Cuit");
const rels = findRow("Relación de Clave");

type Entry = { name: string; cuit: string; repCuit: string };
const entries: Entry[] = [];
for (let i = 1; i < names.length; i++) {
  const name = names[i]?.trim();
  const cuit = norm(cuits[i]);
  if (!name && !cuit) continue;
  entries.push({ name, cuit, repCuit: norm(rels[i]) });
}

const sql = postgres(process.env.DATABASE_URL!, { max: 3 });

const dbReps = await sql`
  select id, name, cuit, created_at from representative order by name
`;
const dbClients = await sql`
  select id, name, identity_number, representative_id from client order by name
`;

const repByCuit = new Map(dbReps.map((r) => [norm(r.cuit), r]));
const clientByCuit = new Map(dbClients.map((c) => [norm(c.identity_number), c]));

// CUITs que la planilla usa como login AFIP (representantes reales)
const csvLoginCuits = new Set<string>();
for (const e of entries) csvLoginCuits.add(e.repCuit || e.cuit);

console.log("=== PLANILLA ===");
console.log("Clientes en planilla:", entries.length);
console.log("Logins AFIP distintos (representantes reales):", csvLoginCuits.size);
console.log(
  "Clientes que son persona física (sin relación de clave):",
  entries.filter((e) => !e.repCuit).length,
);

console.log("\n=== BD ===");
console.log("representative:", dbReps.length);
console.log("client:", dbClients.length);

console.log("\n=== CLIENTES DE LA PLANILLA QUE FALTAN EN BD (por CUIT) ===");
const missing = entries.filter((e) => !clientByCuit.has(e.cuit));
for (const e of missing) console.log(` - ${e.name} (${e.cuit})`);
console.log("total:", missing.length);

console.log("\n=== CLIENTES EN BD QUE NO ESTÁN EN LA PLANILLA ===");
const csvClientCuits = new Set(entries.map((e) => e.cuit));
const extraClients = dbClients.filter((c) => !csvClientCuits.has(norm(c.identity_number)));
for (const c of extraClients) console.log(` - ${c.name} (${c.identity_number})`);
console.log("total:", extraClients.length);

console.log("\n=== REPRESENTANTES EN BD QUE NO SON LOGIN EN LA PLANILLA ===");
const extraReps = dbReps.filter((r) => !csvLoginCuits.has(norm(r.cuit)));
for (const r of extraReps) console.log(` - ${r.name} (${r.cuit})`);
console.log("total:", extraReps.length);

console.log("\n=== LOGINS DE LA PLANILLA QUE FALTAN COMO REPRESENTANTE EN BD ===");
const missingReps = [...csvLoginCuits].filter((c) => c && !repByCuit.has(c));
for (const c of missingReps) {
  const owner = entries.find((e) => (e.repCuit || e.cuit) === c);
  console.log(` - ${c} (login de: ${owner?.name})`);
}
console.log("total:", missingReps.length);

console.log("\n=== REPRESENTANTES QUE TAMBIÉN ESTÁN CARGADOS COMO CLIENT ===");
let dup = 0;
for (const r of dbReps) {
  const c = clientByCuit.get(norm(r.cuit));
  if (c) {
    const inCsv = csvClientCuits.has(norm(r.cuit));
    console.log(
      ` - ${r.name} (${r.cuit}) -> client "${c.name}" ${inCsv ? "[está en planilla]" : "[NO está en planilla]"}`,
    );
    dup++;
  }
}
console.log("total:", dup);

await sql.end();
