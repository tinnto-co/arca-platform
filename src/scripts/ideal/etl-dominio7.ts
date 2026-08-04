/**
 * ETL Dominio 7 (agentes / IA + infra): NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1.ts corrido antes (cliente, credencial_afip, user, organization).
 * Debe correr DESPUÉS de dominio6: alerta.origen_id tiene FK a job.
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio7.ts
 */
import postgres from "postgres";

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) throw new Error("Falta DATABASE_URL (source .env)");
if (SRC_URL.includes("5.78.132.83")) throw new Error("ORIGINAL_DB prohibida");
// La fuente es NEW_DB. Con .env apuntando ya a BD_IDEAL, correr esto sin
// pisar DATABASE_URL trunca el destino y lo recarga consigo mismo: lo vacia.
if (SRC_URL.includes("localhost") || SRC_URL.includes("127.0.0.1"))
  throw new Error("DATABASE_URL apunta a BD_IDEAL: la fuente seria el propio destino. Correr con DATABASE_URL=\"$MIGRATION_URL\"");

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";
if (!IDEAL_URL.includes("localhost") && !IDEAL_URL.includes("127.0.0.1")) {
  throw new Error("BD_IDEAL debe ser local");
}

const src = postgres(SRC_URL, { max: 1, prepare: false });
const dst = postgres(IDEAL_URL, { max: 1 });

type Row = Record<string, any>;

function fail(msg: string): never {
  throw new Error(`ETL D7: ${msg}`);
}

async function insertChunked(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    await dst`insert into ${dst(table)} ${dst(chunk, ...(cols as never[]))}`;
  }
}

const avisos: string[] = [];
const aviso = (m: string) => avisos.push(m);

function mapEnum<T extends string>(
  campo: string,
  valor: unknown,
  tabla: Record<string, T>
): T | null {
  if (valor === null || valor === undefined) return null;
  const v = tabla[String(valor).toLowerCase()];
  if (!v) fail(`${campo}: valor no mapeado "${valor}"`);
  return v;
}

// ---------- 0. limpiar destino ----------
console.log("→ Limpiando destino...");
// Ojo: acá NO se puede usar truncate cascade. job lo referencia alerta y agent_run lo
// referencian todos los hechos vía ai_run_id: un truncate cascade vaciaría media BD.
// Con delete, las FKs `on delete set null` se encargan de desenganchar.
for (const t of [
  "agent_action",
  "agent_run",
  "agent_message",
  "agent_conversation",
  "job_log",
  "job",
  "organization_module",
]) {
  await dst.unsafe(`delete from ${t}`);
}

// ---------- 1. contexto ----------
const clientes = new Set<string>(
  (await dst.unsafe(`select id from cliente`)).map((c: Row) => c.id as string)
);
const credenciales = new Map<string, string>(
  (await dst.unsafe(`select id, org_id from credencial_afip`)).map((c: Row) => [c.id, c.org_id])
);
const usuarios = new Set<string>(
  (await dst.unsafe(`select id from "user"`)).map((u: Row) => u.id as string)
);
const usuario = (id: unknown) => (id && usuarios.has(String(id)) ? String(id) : null);

// ---------- 2. organization_module ----------
console.log("→ organization_module...");
const MODULO = {
  sueldos: "sueldos",
  banco: "banco",
  contabilidad: "contabilidad",
  analytics: "analytics",
  portal_cliente: "portal_cliente",
  ai_agent: "ai_agent",
} as const;
const modulos = (await src.unsafe(`select * from organization_module`)).map((r: Row) => ({
  id: r.id,
  org_id: r.organization_id,
  module: mapEnum("organization_module.module", r.module, MODULO),
  enabled: r.enabled,
  enabled_at: r.enabled_at,
  created_at: r.created_at,
  updated_at: r.updated_at,
}));
await insertChunked("organization_module", modulos);
console.log(`  organization_module: ${modulos.length}`);

// ---------- 3. job ----------
console.log("→ job...");
const srcJobs = (await src.unsafe(`select * from job`)) as unknown as Row[];
const jobs: Row[] = [];
const jobOk = new Set<string>();
for (const r of srcJobs) {
  const orgId = credenciales.get(r.representative_id);
  if (!orgId) {
    aviso(`job ${r.id}: credencial ${r.representative_id} inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  // El modelo viejo no guardaba el cliente; cuando el job es de uno solo, viene en params.
  const clienteParam = r.params?.clientId ?? r.params?.client_id ?? null;
  jobOk.add(r.id);
  jobs.push({
    id: r.id,
    org_id: orgId,
    credencial_id: r.representative_id,
    cliente_id: clienteParam && clientes.has(clienteParam) ? clienteParam : null,
    type: r.type,
    status: r.status,
    params: r.params ?? {},
    result: r.result,
    failed_reason: r.failed_reason,
    attempts: r.attempts ?? 0,
    progress: r.progress ?? 0,
    bull_job_id: r.bull_job_id,
    started_at: r.started_at,
    finished_at: r.finished_at,
    failed_at: r.failed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("job", jobs);
console.log(`  job: ${jobs.length} (con cliente identificado: ${jobs.filter((j) => j.cliente_id).length})`);

// ---------- 4. job_log ----------
console.log("→ job_log...");
const NIVEL = { debug: "debug", info: "info", warn: "warn", warning: "warn", error: "error" } as const;
let logsSalteados = 0;
const logs: Row[] = [];
for (const r of (await src.unsafe(`select * from job_log`)) as unknown as Row[]) {
  if (!jobOk.has(r.job_id)) {
    logsSalteados++;
    continue;
  }
  logs.push({
    id: r.id,
    job_id: r.job_id,
    level: mapEnum("job_log.level", r.level, NIVEL),
    message: r.message,
    context: r.context,
    created_at: r.created_at,
  });
}
await insertChunked("job_log", logs);
console.log(`  job_log: ${logs.length}${logsSalteados ? ` (${logsSalteados} salteados)` : ""}`);

// ---------- 5. alerta.origen_id → job ----------
const [{ n: alertasReligadas }] = await dst.unsafe(`
  with u as (
    update alerta a set origen_id = (a.detalle->>'jobId')::uuid
    where a.detalle->>'jobId' is not null
      and exists (select 1 from job j where j.id = (a.detalle->>'jobId')::uuid)
    returning 1
  ) select count(*)::int n from u`);
console.log(`  alertas religadas a su job: ${alertasReligadas}`);

// ---------- 6. agent_conversation / agent_message ----------
console.log("→ agentes...");
const conversaciones = (await src.unsafe(`select * from agent_conversation`)).map((r: Row) => ({
  id: r.id,
  org_id: r.organization_id,
  user_id: r.user_id,
  cliente_id: null,
  titulo: r.title,
  created_at: r.created_at,
  updated_at: r.updated_at,
}));
await insertChunked("agent_conversation", conversaciones);
console.log(`  agent_conversation: ${conversaciones.length}`);

const ROLE = { user: "user", assistant: "assistant", system: "system", tool: "tool" } as const;
const mensajes = (await src.unsafe(`select * from agent_message`)).map((r: Row) => ({
  id: r.id,
  conversation_id: r.conversation_id,
  role: mapEnum("agent_message.role", r.role, ROLE),
  contenido: r.content,
  tool_calls: r.tool_calls,
  citas: r.citations,
  created_at: r.created_at,
}));
await insertChunked("agent_message", mensajes);
console.log(`  agent_message: ${mensajes.length}`);

// ---------- 7. agent_run ----------
const RESULTADO = {
  ok: "ok",
  success: "ok",
  finished: "ok",
  error: "error",
  failed: "error",
  cancelado: "cancelado",
  cancelled: "cancelado",
  canceled: "cancelado",
} as const;
const corridas: Row[] = [];
for (const r of (await src.unsafe(`select * from agent_run`)) as unknown as Row[]) {
  const enCurso = String(r.status).toLowerCase() === "running";
  corridas.push({
    id: r.id,
    org_id: r.organization_id,
    conversation_id: r.conversation_id,
    cliente_id: r.client_id && clientes.has(r.client_id) ? r.client_id : null,
    user_id: usuario(r.user_id),
    // El modelo viejo tenía `intent` texto libre; el ideal lo tipa. Todo lo existente es chat.
    tipo: "chat",
    modelo: null,
    costo: null,
    resultado: enCurso ? null : mapEnum("agent_run.status", r.status, RESULTADO),
    input: r.input ? { texto: r.input } : null,
    output: r.output ? { texto: r.output } : null,
    tool_trace: r.tool_trace,
    error: r.error,
    started_at: r.started_at,
    finished_at: r.finished_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
  if (r.intent) aviso(`agent_run ${r.id}: intent "${r.intent}" descartado (el ideal usa tipo)`);
}
await insertChunked("agent_run", corridas);
console.log(`  agent_run: ${corridas.length}`);
console.log(`  agent_action: 0 (tabla nueva, no existe en el modelo viejo)`);

// ---------- 8. data_source_event → evento ----------
const [{ n: dseCount }] = await src.unsafe(`select count(*)::int n from data_source_event`);
if (dseCount > 0) {
  aviso(`data_source_event tiene ${dseCount} filas: migrarlas a evento (no implementado, estaba en 0)`);
} else {
  console.log("  data_source_event: 0 filas → evento queda vacío (se llena de acá en adelante)");
}

// ---------- 9. verificación ----------
console.log("\n=== Verificación ===");
const pares: [string, string][] = [
  ["job", "job"],
  ["job_log", "job_log"],
  ["organization_module", "organization_module"],
  ["agent_conversation", "agent_conversation"],
  ["agent_message", "agent_message"],
  ["agent_run", "agent_run"],
];
for (const [destino, origen] of pares) {
  const [{ n: nd }] = await dst.unsafe(`select count(*)::int n from "${destino}"`);
  const [{ n: no }] = await src.unsafe(`select count(*)::int n from "${origen}"`);
  console.log(`  ${nd === no ? "✓" : "⚠"} ${destino.padEnd(22)} ${nd} (origen ${origen}: ${no})`);
}

const [{ n: sinAlerta }] = await dst.unsafe(
  `select count(*)::int n from alerta where origen_tipo = 'job' and origen_id is null`
);
console.log(`\n  alertas de job sin job apuntado: ${sinAlerta}`);

const estados = await dst.unsafe(
  `select status, count(*)::int n from job group by 1 order by 2 desc`
);
console.log("  jobs por estado: " + estados.map((e: Row) => `${e.status}=${e.n}`).join(", "));

const [{ n: colgados }] = await dst.unsafe(
  `select count(*)::int n from job where status = 'pending' and started_at is not null`
);
console.log(`  jobs pending con started_at (reencolados por BullMQ): ${colgados}`);

if (avisos.length) {
  console.log(`\n=== Avisos (${avisos.length}) ===`);
  for (const a of avisos.slice(0, 15)) console.log("  ⚠", a);
  if (avisos.length > 15) console.log(`  … y ${avisos.length - 15} más`);
}

console.log("\n✓ ETL Dominio 7 completo");
await src.end();
await dst.end();
