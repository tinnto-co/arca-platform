/**
 * ETL Dominio 1: NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Reglas: tasks/mapa-actual-ideal.md §2-3. IDs se conservan.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio1.ts
 */
import postgres from "postgres";
import { docTipo } from "./doc-tipo";

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

// ---------- helpers ----------
function fail(msg: string): never {
  throw new Error(`ETL: ${msg}`);
}

function tipoPersonaFromCuit(cuit: string): "fisica" | "juridica" {
  const pref = cuit.replace(/\D/g, "").slice(0, 2);
  if (["20", "23", "24", "27"].includes(pref)) return "fisica";
  if (["30", "33", "34"].includes(pref)) return "juridica";
  fail(`CUIT con prefijo desconocido: ${cuit}`);
}

const CONDICION_IVA = ["responsable_inscripto", "monotributista", "exento", "no_alcanzado"];

async function insertChunked(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await dst`insert into ${dst(table)} ${dst(chunk, ...(cols as never[]))}`;
  }
}

// ---------- 0. limpiar destino (re-ejecutable) ----------
console.log("→ Truncando destino...");
await dst.unsafe(`
  truncate table evento, cliente_eecc_config, cliente_empleador_config,
    cliente_credencial, cliente, credencial_afip, contraparte,
    invitation, member, session, verification, account, organization, "user"
  cascade
`);

// ---------- 1. auth (copia fiel) ----------
console.log("→ Copiando auth...");
for (const t of ["user", "organization", "account", "session", "verification", "member", "invitation"]) {
  const rows = await src.unsafe(`select * from "${t}"`);
  await insertChunked(t, rows as unknown as Record<string, unknown>[]);
  console.log(`  ${t}: ${rows.length}`);
}

// ---------- 2. representative → credencial_afip ----------
console.log("→ representative → credencial_afip...");
const reps = await src.unsafe(`select * from representative`);
await insertChunked(
  "credencial_afip",
  reps.map((r: Record<string, unknown>) => {
    if (r.status !== "active") fail(`representative.status no mapeado: ${r.status}`);
    return {
      id: r.id,
      org_id: r.organization_id,
      cuit: r.cuit,
      clave: r.afip_password,
      nombre: r.name || null,
      email: r.email || null,
      telefono: r.phone || null,
      estado: "activa",
      ultimo_login_ok: null,
      verificada_at: null,
      created_at: r.registered_at ?? r.created_at,
      updated_at: r.updated_at,
    };
  })
);
console.log(`  credencial_afip: ${reps.length}`);

// ---------- 3. client → cliente ----------
console.log("→ client → cliente...");
const allClients = await src.unsafe(`select * from client`);
// El modelo ideal exige CUIT: clients sin CUIT válido quedan afuera hasta resolverse
// (caso conocido: MUGIWARAS SA, pendiente de verdict del estudio).
const CUIT_RE = /^(20|23|24|27|30|33|34)\d{9}$/;
const skipped = allClients.filter(
  (c: Record<string, unknown>) => !CUIT_RE.test((c.identity_number as string).replace(/\D/g, ""))
);
for (const s of skipped)
  console.warn(`  ⚠ SALTEADO (sin CUIT válido): ${s.name} [${s.id}] cuit="${s.identity_number}"`);
const clients = allClients.filter((c: Record<string, unknown>) => !skipped.includes(c));
// IIBB: el flag vive en el representante (login AFIP), pero el régimen es de la
// entidad fiscal → se baja a cada cliente de ese login.
const iibbPorCredencial = new Map<string, string>();
for (const r of reps as unknown as Record<string, unknown>[]) {
  if (r.convenio_multilateral && r.regimen_local)
    fail(`representative ${r.id} tiene convenio_multilateral y regimen_local a la vez`);
  if (r.convenio_multilateral) iibbPorCredencial.set(r.id as string, "convenio_multilateral");
  else if (r.regimen_local) iibbPorCredencial.set(r.id as string, "local");
}
await insertChunked(
  "cliente",
  clients.map((c: Record<string, unknown>) => {
    if (c.identity_type !== "cuit") fail(`client.identity_type no mapeado: ${c.identity_type}`);
    if (c.status !== "active") fail(`client.status no mapeado: ${c.status}`);
    const condicion = c.fiscal_condition as string | null;
    if (condicion !== null && !CONDICION_IVA.includes(condicion))
      fail(`client.fiscal_condition no mapeada: ${condicion}`);
    return {
      id: c.id,
      org_id: c.organization_id,
      cuit: c.identity_number,
      razon_social: c.name,
      tipo_persona: tipoPersonaFromCuit(c.identity_number as string),
      condicion_iva: condicion,
      iibb_regimen: iibbPorCredencial.get(c.representative_id as string) ?? null,
      estado: c.disabled_at ? "baja" : "activo",
      baja_motivo: c.disabled_reason ?? null,
      baja_at: c.disabled_at ?? null,
      email: c.email || null,
      telefono: c.phone || null,
      domicilio: c.address || null,
      notas: null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  })
);
console.log(`  cliente: ${clients.length}`);

// ---------- 4. cliente_credencial (desde client.representative_id) ----------
console.log("→ cliente_credencial...");
const rels = clients.filter((c: Record<string, unknown>) => c.representative_id);
await insertChunked(
  "cliente_credencial",
  rels.map((c: Record<string, unknown>) => ({
    cliente_id: c.id,
    credencial_id: c.representative_id,
    fuente: "discovery",
    afip_contribuyente_id: c.afip_contribuyente_id ?? null,
    preferida: true,
  }))
);
console.log(`  cliente_credencial: ${rels.length}`);

// ---------- 5. satélites de config ----------
console.log("→ satélites de config...");
const empleadorRows = clients
  .filter(
    (c: Record<string, unknown>) =>
      c.liquida_sueldos ||
      c.usa_lsd_referencia ||
      c.tipo_empresa_id ||
      c.seguro_colectivo ||
      c.mipyme ||
      c.orden_cln ||
      c.situacion_default_id ||
      c.condicion_default_id ||
      c.actividad_default_id ||
      c.contratacion_default_id ||
      c.siniestrado_default_id ||
      c.zona_default_id ||
      c.obra_social_default_id ||
      c.payroll_plantilla_empleado_id ||
      c.firma_digital_empleador
  )
  .map((c: Record<string, unknown>) => {
    if (c.firma_digital_empleador)
      fail(`client ${c.id} tiene firma base64 — falta implementar subida a R2`);
    return {
      cliente_id: c.id,
      liquida_sueldos: c.liquida_sueldos ?? false,
      tipo_empresa_id: c.tipo_empresa_id ?? null,
      seguro_colectivo: c.seguro_colectivo ?? false,
      mipyme: c.mipyme ?? false,
      orden_cln: c.orden_cln ?? null,
      situacion_default_id: c.situacion_default_id ?? null,
      condicion_default_id: c.condicion_default_id ?? null,
      actividad_default_id: c.actividad_default_id ?? null,
      modalidad_default_id: c.contratacion_default_id ?? null,
      siniestrado_default_id: c.siniestrado_default_id ?? null,
      zona_default_id: c.zona_default_id ?? null,
      obra_social_default_id: c.obra_social_default_id ?? null,
      firma_empleador_key: null,
      plantilla_empleado_id: c.payroll_plantilla_empleado_id ?? null,
      usa_lsd_referencia: c.usa_lsd_referencia ?? false,
    };
  });
await insertChunked("cliente_empleador_config", empleadorRows);
console.log(`  cliente_empleador_config: ${empleadorRows.length}`);

const eeccRows = clients
  .filter(
    (c: Record<string, unknown>) =>
      c.actividad_principal || c.fecha_inscripcion || c.numero_inscripcion
  )
  .map((c: Record<string, unknown>) => ({
    cliente_id: c.id,
    actividad_principal: c.actividad_principal ?? null,
    fecha_inscripcion_rpc: c.fecha_inscripcion ?? null,
    numero_igj: c.numero_inscripcion ?? null,
    cierre_ejercicio_mes: null,
    firmante_id: null,
  }));
await insertChunked("cliente_eecc_config", eeccRows);
console.log(`  cliente_eecc_config: ${eeccRows.length}`);

// ---------- 6. fiscal_entity → contraparte ----------
console.log("→ fiscal_entity → contraparte...");
const fes = await src.unsafe(`select * from fiscal_entity order by updated_at asc`);
// (doc_tipo, doc_nro) es único: fiscal_entity puede tener el mismo documento escrito
// de varias formas ("20-1234-5" vs "2012345"). Gana la fila más reciente.
const contrapartes = new Map<string, Record<string, unknown>>();
for (const f of fes as unknown as Record<string, unknown>[]) {
  const fuente = f.province_source as string | null;
  if (fuente !== null && !["padron", "nosis", "manual"].includes(fuente))
    fail(`fiscal_entity.province_source no mapeada: ${fuente}`);
  const doc = docTipo(f.cuil_cuit as string);
  contrapartes.set(`${doc.doc_tipo}|${doc.doc_nro}`, {
    id: f.id,
    ...doc,
    nombre: f.name ?? null,
    provincia: f.province ?? null,
    provincia_fuente: fuente,
    provincia_actualizada_at: f.province_fetched_at ?? null,
    direccion: f.direccion ?? null,
    cod_postal: f.cod_postal ?? null,
    created_at: f.created_at,
    updated_at: f.updated_at,
  });
}
await insertChunked("contraparte", [...contrapartes.values()]);
console.log(`  contraparte: ${contrapartes.size} (de ${fes.length} fiscal_entity)`);

// ---------- 7. verificación ----------
console.log("\n=== VERIFICACIÓN ===");
const checks: [string, string, number][] = [
  ["credencial_afip", "select count(*)::int as c from credencial_afip", reps.length],
  ["cliente", "select count(*)::int as c from cliente", clients.length],
  ["cliente_credencial", "select count(*)::int as c from cliente_credencial", rels.length],
  ["contraparte", "select count(*)::int as c from contraparte", contrapartes.size],
];
let ok = true;
for (const [name, q, expected] of checks) {
  const [{ c }] = await dst.unsafe(q);
  const match = c === expected;
  if (!match) ok = false;
  console.log(`${match ? "✓" : "✗"} ${name}: ${c} (esperado ${expected})`);
}

// todo cliente debe tener al menos una credencial
const [{ c: sinCred }] = await dst.unsafe(
  `select count(*)::int as c from cliente cl
   where not exists (select 1 from cliente_credencial cc where cc.cliente_id = cl.id)`
);
console.log(`${sinCred === 0 ? "✓" : "✗"} clientes sin credencial: ${sinCred}`);
if (sinCred > 0) ok = false;

// informativo: divergencias rep vs client en fiscal_condition (gana cliente, se descartan)
const [{ c: diverg }] = await src.unsafe(
  `select count(*)::int as c from representative r
   join client c2 on c2.identity_number = r.cuit and c2.organization_id = r.organization_id
   where coalesce(c2.fiscal_condition,'') <> coalesce(r.fiscal_condition,'')`
);
console.log(`ℹ divergencias fiscal_condition rep↔client descartadas (gana cliente): ${diverg}`);

await src.end();
await dst.end();
if (!ok) {
  console.error("\n✗ ETL con diferencias");
  process.exit(1);
}
console.log("\n✓ ETL Dominio 1 OK");
