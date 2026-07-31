/**
 * ETL Dominio 6 (portal / gestión): NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1.ts y etl-dominio2.ts corridos antes (cliente, credencial, notificacion).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio6.ts
 */
import postgres from "postgres";
import { createHash } from "node:crypto";

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) throw new Error("Falta DATABASE_URL (source .env)");
if (SRC_URL.includes("5.78.132.83")) throw new Error("ORIGINAL_DB prohibida");

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";
if (!IDEAL_URL.includes("localhost") && !IDEAL_URL.includes("127.0.0.1")) {
  throw new Error("BD_IDEAL debe ser local");
}

const src = postgres(SRC_URL, { max: 1, prepare: false });
const dst = postgres(IDEAL_URL, { max: 1 });

type Row = Record<string, any>;

function fail(msg: string): never {
  throw new Error(`ETL D6: ${msg}`);
}

async function insertChunked(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await dst`insert into ${dst(table)} ${dst(chunk, ...(cols as never[]))}`;
  }
}

const avisos: string[] = [];
const aviso = (m: string) => avisos.push(m);

const fecha = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null;

/** Traduce un valor de enum del modelo viejo; falla ruidoso si aparece uno nuevo. */
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
/**
 * Los archivos ya subidos a R2 no se vuelven a subir: la key es lo único de
 * `documento` que no se puede recalcular desde el origen, así que se preserva
 * entre corridas (ver src/scripts/ideal/subir-documentos-r2.ts).
 */
const keysPrevias = new Map<string, string>(
  (
    await dst.unsafe(`select id, storage_key from documento where storage_key is not null`)
  ).map((r: Row) => [r.id, r.storage_key])
);
if (keysPrevias.size > 0) {
  console.log(`→ Preservando ${keysPrevias.size} storage_key ya subidas a R2`);
}

console.log("→ Truncando destino...");
await dst.unsafe(`truncate table
  notificacion_adjunto, documento, alerta, solicitud,
  acceso_usuario_cliente, riesgo_snapshot, proyeccion_impuesto
  cascade`);

// ---------- 1. contexto ----------
const clientes = await dst.unsafe(`select id, org_id from cliente`);
const clienteById = new Map<string, Row>(clientes.map((c: Row) => [c.id, c]));

const credenciales = new Map<string, string>(
  (await dst.unsafe(`select id, org_id from credencial_afip`)).map((c: Row) => [c.id, c.org_id])
);

/** Los IDs se conservan: credencial_afip.id === representative.id del modelo viejo. */
const rel = await dst.unsafe(`select cliente_id, credencial_id from cliente_credencial`);
const clientesPorCredencial = new Map<string, string[]>();
for (const r of rel as Row[]) {
  const arr = clientesPorCredencial.get(r.credencial_id) ?? [];
  arr.push(r.cliente_id);
  clientesPorCredencial.set(r.credencial_id, arr);
}
const clienteUnicoDe = (credencialId: string): string | null => {
  const c = clientesPorCredencial.get(credencialId) ?? [];
  return c.length === 1 ? c[0] : null;
};

const usuarios = new Set<string>(
  (await dst.unsafe(`select id from "user"`)).map((u: Row) => u.id as string)
);
const usuario = (id: unknown) => (id && usuarios.has(String(id)) ? String(id) : null);

/** El job puede no estar cargado todavía (lo trae el dominio 7): en ese caso queda null y D7 religa. */
const jobs = new Set<string>(
  (await dst.unsafe(`select id from job`)).map((j: Row) => j.id as string)
);

const notificaciones = new Map<string, Row>(
  (await dst.unsafe(`select id, cliente_id, credencial_id, org_id from notificacion`)).map(
    (n: Row) => [n.id, n]
  )
);

// ---------- 2. document → documento ----------
console.log("→ document → documento...");
const srcDocs = await src.unsafe(`select * from document`);

/** El cliente del documento sale de la notificación que lo adjunta, si la hay. */
const srcAdjuntos = await src.unsafe(`select * from invoice_attachment`);
const notifDeDocumento = new Map<string, string>();
for (const a of srcAdjuntos as Row[]) {
  if (a.document_id && a.notification_id) notifDeDocumento.set(a.document_id, a.notification_id);
}

/** El type del modelo viejo es la extensión que dijo quien lo subió; el real está en el contenido. */
function mimeReal(base64: string): string {
  const cabecera = base64.slice(0, 8);
  if (cabecera.startsWith("JVBERi")) return "application/pdf";
  if (cabecera.startsWith("UEsDB")) return "application/zip";
  if (cabecera.startsWith("77u/") || cabecera.startsWith("77u")) return "text/plain";
  return "text/plain";
}

let mimeCorregido = 0;
const documentos: Row[] = [];
const documentoOk = new Set<string>();
for (const r of srcDocs as Row[]) {
  const credencialId = r.representative_id as string | null;
  if (!credencialId || !credenciales.has(credencialId)) {
    aviso(`documento ${r.id} ("${r.name}"): sin credencial válida, se saltea`);
    continue;
  }
  const notifId = notifDeDocumento.get(r.id);
  const notif = notifId ? notificaciones.get(notifId) : undefined;
  const clienteId = notif?.cliente_id ?? clienteUnicoDe(credencialId);

  const url = String(r.url ?? "");
  const coma = url.indexOf(",");
  const declarado = url.startsWith("data:") ? url.slice(5, url.indexOf(";")) : null;
  const base64 = coma >= 0 ? url.slice(coma + 1) : "";
  const bytes = Buffer.from(base64, "base64");
  const mime = mimeReal(base64);
  if (declarado && declarado !== mime) mimeCorregido++;

  documentoOk.add(r.id);
  documentos.push({
    id: r.id,
    org_id: credenciales.get(credencialId),
    credencial_id: credencialId,
    cliente_id: clienteId && clienteById.has(clienteId) ? clienteId : null,
    nombre: r.name,
    // El binario sigue en NEW_DB en base64: la subida a R2 es un paso aparte.
    storage_key: keysPrevias.get(r.id) ?? null,
    mime_type: mime,
    tamano_bytes: bytes.length,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    fuente: "scraper",
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("documento", documentos);
console.log(`  documento: ${documentos.length} (mime corregido desde el contenido: ${mimeCorregido})`);

// ---------- 3. invoice_attachment → notificacion_adjunto ----------
console.log("→ invoice_attachment → notificacion_adjunto...");
const adjuntos: Row[] = [];
const vistos = new Set<string>();
for (const r of srcAdjuntos as Row[]) {
  if (!r.notification_id || !notificaciones.has(r.notification_id)) {
    aviso(`adjunto ${r.id}: notificación inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  if (!r.document_id || !documentoOk.has(r.document_id)) {
    aviso(`adjunto ${r.id}: documento inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  const clave = `${r.notification_id}|${r.document_id}`;
  if (vistos.has(clave)) {
    aviso(`adjunto ${r.id}: repetido (misma notificación y documento), se saltea`);
    continue;
  }
  vistos.add(clave);
  adjuntos.push({
    id: r.id,
    notificacion_id: r.notification_id,
    documento_id: r.document_id,
    external_id: r.external_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("notificacion_adjunto", adjuntos);
console.log(`  notificacion_adjunto: ${adjuntos.length}`);

// ---------- 4. alert → alerta ----------
console.log("→ alert → alerta...");
const srcAlertas = await src.unsafe(`select * from alert`);

const ALERTA_TIPO = { scraper_error: "error_scraping" } as const;
const SEVERIDAD = { low: "baja", medium: "media", high: "alta", critical: "critica" } as const;
const ESTADO_ALERTA = { open: "abierta", resolved: "resuelta" } as const;
const ALERTA_ORIGEN = { job: "job" } as const;

const esUuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

let resueltasSinFecha = 0;
let sinJob = 0;
const alertas: Row[] = [];
for (const r of srcAlertas as Row[]) {
  const credencialId =
    r.representative_id && credenciales.has(r.representative_id) ? r.representative_id : null;
  const clienteId = r.client_id && clienteById.has(r.client_id) ? r.client_id : null;
  const estado = mapEnum("alert.status", r.status, ESTADO_ALERTA);
  if (estado === "resuelta" && !r.resolved_at) resueltasSinFecha++;
  // source_entity_id NO es el id del job: es la clave de deduplicación
  // "<representante>:<tipo de job>:<categoría de error>". El job real está en metadata.
  const jobId = r.metadata?.jobId;
  if (!esUuid(jobId)) sinJob++;
  alertas.push({
    id: r.id,
    org_id: r.organization_id,
    credencial_id: credencialId,
    cliente_id: clienteId,
    tipo: mapEnum("alert.type", r.type, ALERTA_TIPO),
    severidad: mapEnum("alert.severity", r.severity, SEVERIDAD),
    titulo: r.title,
    descripcion: r.description,
    origen_tipo: mapEnum("alert.source_entity_type", r.source_entity_type, ALERTA_ORIGEN),
    origen_id: esUuid(jobId) && jobs.has(jobId) ? jobId : null,
    estado,
    asignada_a: usuario(r.assigned_to_user_id),
    resuelta_at: r.resolved_at,
    resuelta_por: usuario(r.resolved_by_user_id),
    detalle: r.metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("alerta", alertas);
console.log(`  alerta: ${alertas.length}`);

// ---------- 5. representative_request → solicitud ----------
console.log("→ representative_request → solicitud...");
const srcSolicitudes = await src.unsafe(`select * from representative_request`);

const SOLICITUD_TIPO = {
  documentacion: "documentacion",
  document: "documentacion",
  documento: "documentacion",
  informacion: "informacion",
  info: "informacion",
  pago: "pago",
  payment: "pago",
  otra: "otra",
  other: "otra",
} as const;
const SOLICITUD_ESTADO = {
  open: "abierta",
  abierta: "abierta",
  completed: "completada",
  completada: "completada",
  cancelled: "cancelada",
  canceled: "cancelada",
} as const;

const solicitudes: Row[] = [];
for (const r of srcSolicitudes as Row[]) {
  const clienteId = r.client_id ?? clienteUnicoDe(r.representative_id);
  if (!clienteId || !clienteById.has(clienteId)) {
    aviso(`solicitud ${r.id} ("${r.title}"): no se puede determinar el cliente, NO se migra`);
    continue;
  }
  const estado = mapEnum("representative_request.status", r.status, SOLICITUD_ESTADO)!;
  solicitudes.push({
    id: r.id,
    org_id: r.organization_id,
    cliente_id: clienteId,
    tipo: mapEnum("representative_request.type", r.type, SOLICITUD_TIPO),
    titulo: r.title,
    descripcion: r.description,
    estado,
    pedida_por: usuario(r.requested_by_user_id),
    vence_at: r.due_at,
    completada_at: estado === "completada" ? (r.completed_at ?? r.updated_at) : null,
    detalle: r.metadata,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("solicitud", solicitudes);
console.log(`  solicitud: ${solicitudes.length}`);

// ---------- 6. representative_user_access → acceso_usuario_cliente ----------
console.log("→ representative_user_access → acceso_usuario_cliente...");
const srcAccesos = await src.unsafe(`select * from representative_user_access`);

const ROL = { client_viewer: "cliente_lector", cliente_lector: "cliente_lector" } as const;

const accesos: Row[] = [];
const clavesAcceso = new Set<string>();
for (const r of srcAccesos as Row[]) {
  // El acceso viejo era al login; el nuevo es al cliente: se abre uno por cada cliente del login.
  const destinos = clientesPorCredencial.get(r.representative_id) ?? [];
  if (destinos.length === 0) {
    aviso(`acceso ${r.id}: el login no tiene clientes en BD_IDEAL, se saltea`);
    continue;
  }
  if (destinos.length > 1) {
    aviso(
      `acceso de ${r.user_id} al login ${r.representative_id}: se abre a sus ${destinos.length} clientes (antes era acceso al login entero)`
    );
  }
  for (const clienteId of destinos) {
    const clave = `${r.user_id}|${clienteId}`;
    if (clavesAcceso.has(clave)) continue;
    clavesAcceso.add(clave);
    accesos.push({
      user_id: r.user_id,
      cliente_id: clienteId,
      rol: mapEnum("representative_user_access.role", r.role, ROL),
      puede_subir_documentos: r.can_upload_documents,
      puede_ver_deudas: r.can_view_debts,
      puede_ver_iva: r.can_view_iva,
      puede_ver_sueldos: r.can_view_payroll,
      puede_chatear_ia: r.can_chat_ai,
      created_at: r.created_at,
      updated_at: r.updated_at,
    });
  }
}
await insertChunked("acceso_usuario_cliente", accesos);
console.log(`  acceso_usuario_cliente: ${accesos.length}`);

// ---------- 7. client_risk_snapshot → riesgo_snapshot ----------
console.log("→ riesgo y proyecciones...");
const srcRiesgos = await src.unsafe(`select * from client_risk_snapshot`);
const NIVEL = { low: "bajo", medium: "medio", high: "alto", critical: "critico" } as const;

const riesgos: Row[] = [];
for (const r of srcRiesgos as Row[]) {
  if (!clienteById.has(r.client_id)) {
    aviso(`riesgo ${r.id}: cliente inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  const periodo = fecha(r.periodo);
  if (!periodo) {
    aviso(`riesgo ${r.id}: período "${r.period}" no parseable, se saltea`);
    continue;
  }
  riesgos.push({
    id: r.id,
    cliente_id: r.client_id,
    periodo,
    score: r.score,
    nivel: mapEnum("client_risk_snapshot.risk_level", r.risk_level, NIVEL),
    factores: r.factors,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("riesgo_snapshot", riesgos);
console.log(`  riesgo_snapshot: ${riesgos.length}`);

const srcProyecciones = await src.unsafe(`select * from tax_projection`);
const IMPUESTO = {
  iva: "iva",
  ganancias: "ganancias",
  income_tax: "ganancias",
  iibb: "ingresos_brutos",
  ingresos_brutos: "ingresos_brutos",
  cargas_sociales: "cargas_sociales",
} as const;
const CONFIANZA = { low: "baja", medium: "media", high: "alta" } as const;

const proyecciones: Row[] = [];
for (const r of srcProyecciones as Row[]) {
  if (!clienteById.has(r.client_id)) {
    aviso(`proyección ${r.id}: cliente inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  const periodo = fecha(r.periodo);
  if (!periodo) {
    aviso(`proyección ${r.id}: período "${r.period}" no parseable, se saltea`);
    continue;
  }
  proyecciones.push({
    id: r.id,
    cliente_id: r.client_id,
    periodo,
    impuesto: mapEnum("tax_projection.tax", r.tax, IMPUESTO),
    monto_proyectado: r.projected_amount,
    confianza: mapEnum("tax_projection.confidence", r.confidence, CONFIANZA),
    factores: r.factors,
    generada_at: r.generated_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("proyeccion_impuesto", proyecciones);
console.log(`  proyeccion_impuesto: ${proyecciones.length}`);

// ---------- 8. verificación ----------
console.log("\n=== Verificación ===");
const pares: [string, string][] = [
  ["documento", "document"],
  ["notificacion_adjunto", "invoice_attachment"],
  ["alerta", "alert"],
  ["solicitud", "representative_request"],
  ["acceso_usuario_cliente", "representative_user_access"],
  ["riesgo_snapshot", "client_risk_snapshot"],
  ["proyeccion_impuesto", "tax_projection"],
];
for (const [destino, origen] of pares) {
  const [{ n: nd }] = await dst.unsafe(`select count(*)::int n from "${destino}"`);
  const [{ n: no }] = await src.unsafe(`select count(*)::int n from "${origen}"`);
  console.log(`  ${nd === no ? "✓" : "⚠"} ${destino.padEnd(24)} ${nd} (origen ${origen}: ${no})`);
}

const [{ n: pendientes }] = await dst.unsafe(
  `select count(*)::int n from documento where storage_key is null`
);
const [{ mb }] = await dst.unsafe(
  `select round(sum(tamano_bytes) / 1048576.0, 1) mb from documento`
);
console.log(`\n  documentos pendientes de subir a R2: ${pendientes} (${mb} MB)`);

const [{ n: sinCliente }] = await dst.unsafe(
  `select count(*)::int n from documento where cliente_id is null`
);
console.log(`  documentos sin cliente identificado: ${sinCliente}`);

const [{ n: duplicados }] = await dst.unsafe(`
  select count(*)::int n from (
    select checksum from documento group by checksum having count(*) > 1
  ) t`);
console.log(`  contenidos duplicados (mismo checksum): ${duplicados}`);
console.log(`  alertas resueltas sin fecha de resolución: ${resueltasSinFecha}`);
console.log(`  alertas sin job de origen identificable: ${sinJob}`);

if (avisos.length) {
  console.log(`\n=== Avisos (${avisos.length}) ===`);
  for (const a of avisos.slice(0, 20)) console.log("  ⚠", a);
  if (avisos.length > 20) console.log(`  … y ${avisos.length - 20} más`);
}

console.log("\n✓ ETL Dominio 6 completo");
await src.end();
await dst.end();
