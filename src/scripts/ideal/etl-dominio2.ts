/**
 * ETL Dominio 2: NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1.ts corrido antes (usa cliente / credencial_afip / contraparte).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio2.ts
 */
import postgres from "postgres";
import { docTipo } from "./doc-tipo";

const SRC_URL = process.env.DATABASE_URL;
if (!SRC_URL) throw new Error("Falta DATABASE_URL (source .env)");
if (SRC_URL.includes("5.78.132.83")) throw new Error("ORIGINAL_DB prohibida");
// La fuente es NEW_DB. Con .env apuntando ya a BD_IDEAL, correr esto sin pisar
// DATABASE_URL trunca el destino y lo recarga consigo mismo: lo vacia.
if (SRC_URL.includes("localhost") || SRC_URL.includes("127.0.0.1"))
  throw new Error(
    'DATABASE_URL apunta a BD_IDEAL: la fuente seria el propio destino. Correr con DATABASE_URL="$MIGRATION_URL"'
  );

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";
if (!IDEAL_URL.includes("localhost") && !IDEAL_URL.includes("127.0.0.1")) {
  throw new Error("BD_IDEAL debe ser local");
}

const src = postgres(SRC_URL, { max: 1, prepare: false });
const dst = postgres(IDEAL_URL, { max: 1 });

type Row = Record<string, any>;

function fail(msg: string): never {
  throw new Error(`ETL D2: ${msg}`);
}

async function insertChunked(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await dst`insert into ${dst(table)} ${dst(chunk, ...(cols as never[]))}`;
  }
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// ---------- 0. limpiar destino ----------
console.log("→ Truncando destino...");
await dst.unsafe(
  `truncate table comprobante_alicuota, comprobante, iva_declaracion, deuda, vencimiento, notificacion, liquidacion_iibb cascade`
);

// ---------- 1. contexto desde BD_IDEAL ----------
const clientes = await dst.unsafe(`select id, org_id, cuit from cliente`);
const clienteById = new Map<string, Row>(clientes.map((c: Row) => [c.id, c]));
const credenciales = await dst.unsafe(`select id, org_id, cuit from credencial_afip`);
const credencialById = new Map<string, Row>(credenciales.map((c: Row) => [c.id, c]));
const tiposOk = new Set<number>(
  (await dst.unsafe(`select codigo from comprobante_tipo`)).map((t: Row) => Number(t.codigo))
);

const contraKey = (docTipoV: string, docNro: string) => `${docTipoV}|${docNro}`;
const contraparteId = new Map<string, string>();
for (const c of await dst.unsafe(`select id, doc_tipo, doc_nro from contraparte`)) {
  contraparteId.set(contraKey(c.doc_tipo, c.doc_nro), c.id);
}

// ---------- 2. invoice → comprobante + comprobante_alicuota ----------
console.log("→ invoice → comprobante...");
const invoices = (await src.unsafe(`select * from invoice`)) as unknown as Row[];

// 2a. contrapartes que faltan en el catálogo (fiscal_entity no las tiene todas)
const nuevas = new Map<string, Row>();
for (const i of invoices) {
  const esRecibido = (i.direction as string).toLowerCase() === "inbound";
  const doc = docTipo(esRecibido ? i.emitter_identity_number : i.recipient_identity_number);
  const key = contraKey(doc.doc_tipo, doc.doc_nro);
  if (contraparteId.has(key) || nuevas.has(key)) continue;
  nuevas.set(key, {
    id: crypto.randomUUID(),
    ...doc,
    nombre: (esRecibido ? i.emitter_name : i.recipient_name) || null,
  });
}
await insertChunked("contraparte", [...nuevas.values()]);
for (const [key, v] of nuevas) contraparteId.set(key, v.id as string);
console.log(`  contrapartes nuevas (no estaban en fiscal_entity): ${nuevas.size}`);

// 2b. cabeceras + alícuotas
const ALICUOTAS: [number, string, string | null][] = [
  [21, "amount_iva_21", "iva_21"],
  [10.5, "amount_iva_105", "iva_105"],
  [27, "amount_iva_27", "iva_27"],
  [5, "amount_iva_5", "iva_5"],
  [2.5, "amount_iva_25", "iva_25"],
  [0, "amount_iva_0", null],
];

const cabeceras: Row[] = [];
const alicuotas: Row[] = [];
const sinCliente: string[] = [];

for (const i of invoices) {
  const cliente = clienteById.get(i.client_id);
  if (!cliente) {
    sinCliente.push(i.id);
    continue;
  }
  const dir = (i.direction as string).toLowerCase();
  if (dir !== "inbound" && dir !== "outbound") fail(`invoice.direction no mapeada: ${i.direction}`);
  const tipo = Number(i.type);
  if (!tiposOk.has(tipo)) fail(`tipo de comprobante ${i.type} no está en comprobante_tipo`);

  const esRecibido = dir === "inbound";
  const doc = docTipo(esRecibido ? i.emitter_identity_number : i.recipient_identity_number);
  const cid = contraparteId.get(contraKey(doc.doc_tipo, doc.doc_nro));
  if (!cid) fail(`contraparte no resuelta para invoice ${i.id}`);

  const id = crypto.randomUUID();
  cabeceras.push({
    id,
    org_id: cliente.org_id,
    cliente_id: cliente.id,
    direccion: esRecibido ? "recibido" : "emitido",
    tipo,
    punto_venta: Number(i.sale_point),
    numero: Number(i.id_from),
    fecha_emision: i.emition_date,
    contraparte_id: cid,
    moneda: i.currency,
    cotizacion: i.currency_rate,
    neto_gravado: i.amount_taxed,
    neto_no_gravado: i.imp_neto_no_gravado,
    exento: i.amount_exempt,
    otros_tributos: i.other_taxes,
    iva_total: i.total_iva,
    total: i.amount,
    cae: i.authorization_number || null,
    fuente: "scraper",
    created_at: i.created_at,
    updated_at: i.updated_at,
  });

  for (const [alic, colNeto, colIva] of ALICUOTAS) {
    const neto = num(i[colNeto]);
    const iva = colIva ? num(i[colIva]) : 0;
    if (neto === 0 && iva === 0) continue;
    alicuotas.push({ id: crypto.randomUUID(), comprobante_id: id, alicuota: alic, neto, iva });
  }
}

if (sinCliente.length)
  console.warn(`  ⚠ ${sinCliente.length} comprobantes salteados: su cliente no entró en D1`);

await insertChunked("comprobante", cabeceras);
await insertChunked("comprobante_alicuota", alicuotas);
console.log(`  comprobante: ${cabeceras.length}`);
console.log(`  comprobante_alicuota: ${alicuotas.length}`);

// ---------- 3. iva_scrape → iva_declaracion ----------
console.log("→ iva_scrape → iva_declaracion...");
function parseFecha(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  console.warn(`  ⚠ fecha_presentacion no parseable: "${s}"`);
  return null;
}
const scrapes = (await src.unsafe(`select * from iva_scrape`)) as unknown as Row[];
const declaraciones = scrapes
  .filter((s) => clienteById.has(s.client_id) && s.periodo)
  .map((s) => ({
    id: s.id,
    cliente_id: s.client_id,
    periodo: s.periodo,
    presentada_at: parseFecha(s.fecha_presentacion),
    debito_fiscal: s.debito_fiscal,
    credito_fiscal: s.credito_fiscal,
    saldo_mes_anterior: s.saldo_mes_pasado,
    saldo_afip_mes: s.saldo_arca_mes,
    saldo_tecnico_favor: s.saldo_tecnico_favor_contribuyente,
    saldo_tecnico_favor_mensual: s.saldo_tecnico_favor_contribuyente_posicion_mensual,
    saldo_libre_disponibilidad_anterior_neto: s.saldo_libre_disponibilidad_periodo_anterior_neto,
    retenciones_percepciones_periodo: s.total_retenciones_percepciones_periodo,
    saldo_libre_disponibilidad_favor: s.saldo_libre_disponibilidad_favor_contribuyente_periodo,
    fuente: s.imported_manually ? "manual" : "scraper",
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));
await insertChunked("iva_declaracion", declaraciones);
console.log(`  iva_declaracion: ${declaraciones.length} (de ${scrapes.length})`);

// ---------- 4. debt → deuda / due_date → vencimiento ----------
// El sujeto es un CUIT: si es cliente va cliente_id, si es el CUIT del login queda null.
function sujeto(r: Row): { cliente_id: string | null; cuit: string; org_id: string } {
  const cred = credencialById.get(r.representative_id);
  if (!cred) fail(`credencial ${r.representative_id} no existe en BD_IDEAL`);
  const cliente = r.client_id ? clienteById.get(r.client_id) : null;
  return {
    cliente_id: cliente ? (cliente.id as string) : null,
    cuit: (cliente ? cliente.cuit : cred.cuit) as string,
    org_id: cred.org_id as string,
  };
}

/**
 * `debt.due_date` es un timestamp naive en el modelo viejo y en el ideal es
 * `date`. Se lo colapsa acá, con los componentes locales del Date que devolvió
 * postgres-js, para recuperar el literal original: dejar que lo castee la BD
 * corre la fecha un día cuando la hora del timestamp cruza el huso.
 */
function soloFecha(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return parseFecha(v);
}

/**
 * La misma obligación entró más de una vez porque el dedupe del scrapper viejo
 * comparaba el timestamp completo y AFIP la devolvía a distinta hora. Con la
 * fecha ya colapsada quedan filas idénticas: se conserva la última scrapeada,
 * que es la que tiene los importes vigentes.
 */
function dedupe<T extends Row>(tabla: string, filas: T[], clave: (f: T) => string): T[] {
  const porClave = new Map<string, T>();
  for (const fila of filas) {
    const k = clave(fila);
    const previa = porClave.get(k);
    if (!previa || (fila.created_at as Date) > (previa.created_at as Date)) porClave.set(k, fila);
  }
  if (porClave.size < filas.length) {
    console.warn(`  ⚠ ${tabla}: ${filas.length - porClave.size} duplicados colapsados`);
  }
  return [...porClave.values()];
}

console.log("→ debt → deuda...");
const debts = (await src.unsafe(`select * from debt`)) as unknown as Row[];
const ESTADO_DEUDA: Record<string, string> = {
  open: "abierta",
  paid: "pagada",
  payment_plan: "plan_pago",
  prescribed: "prescripta",
};
const deudas = dedupe(
  "deuda",
  debts.map((d) => {
    const estado = ESTADO_DEUDA[d.status as string];
    if (!estado) fail(`debt.status no mapeado: ${d.status}`);
    return {
      id: d.id,
      ...sujeto(d),
      credencial_id: d.representative_id,
      impuesto: d.tax,
      concepto: d.concept,
      sub_concepto: d.sub_concept || null,
      periodo: soloFecha(d.periodo),
      cuota: d.quota_number,
      vence_at: soloFecha(d.due_date),
      establecimiento: d.establishment || null,
      saldo: d.balance ?? 0,
      interes_resarcitorio: d.compensatory_interest ?? 0,
      interes_punitorio: d.punitive_interest ?? 0,
      estado,
      intimada: d.is_intimated ?? false,
      detectada_at: d.detected_at,
      created_at: d.created_at,
      updated_at: d.updated_at,
    };
  }),
  (d) =>
    [
      d.credencial_id,
      d.cuit,
      d.establecimiento,
      d.impuesto,
      d.concepto,
      d.sub_concepto,
      d.periodo,
      d.cuota,
      d.vence_at,
    ].join("|")
);
await insertChunked("deuda", deudas);
console.log(
  `  deuda: ${deudas.length} (${deudas.filter((d) => !d.cliente_id).length} del CUIT del login)`
);

console.log("→ due_date → vencimiento...");
const dueDates = (await src.unsafe(`select * from due_date`)) as unknown as Row[];
const vencimientos = dedupe(
  "vencimiento",
  dueDates.map((v) => ({
    id: v.id,
    ...sujeto(v),
    credencial_id: v.representative_id,
    impuesto: v.tax,
    concepto: v.concept,
    sub_concepto: v.sub_concept || null,
    periodo: soloFecha(v.periodo),
    cuota: v.quota_number,
    vence_at: soloFecha(v.due_date),
    detalle: v.detail || null,
    completado_at: v.completed_at,
    completado_por: v.completed_by_user_id,
    created_at: v.created_at,
    updated_at: v.updated_at,
  })),
  (v) =>
    [
      v.credencial_id,
      v.cuit,
      v.impuesto,
      v.concepto,
      v.sub_concepto,
      v.periodo,
      v.cuota,
      v.vence_at,
    ].join("|")
);
await insertChunked("vencimiento", vencimientos);
console.log(
  `  vencimiento: ${vencimientos.length} (${vencimientos.filter((v) => !v.cliente_id).length} del CUIT del login)`
);

// ---------- 5. notification → notificacion ----------
console.log("→ notification → notificacion...");
const notifs = (await src.unsafe(`select * from notification`)) as unknown as Row[];
const SEVERIDAD: Record<string, string> = {
  unclassified: "sin_clasificar",
  info: "informativa",
  action_required: "accion_requerida",
  urgent: "urgente",
};
const notificaciones = notifs.map((n) => {
  const sev = SEVERIDAD[n.severity as string];
  if (!sev) fail(`notification.severity no mapeada: ${n.severity}`);
  return {
    id: n.id,
    ...sujeto(n),
    credencial_id: n.representative_id,
    external_id: n.external_id || null,
    mensaje: n.message ?? "",
    publicada_at: n.publication_date,
    vence_at: n.expiration_date,
    leida: n.opened ?? false,
    severidad: sev,
    categoria: n.category || null,
    ai_resumen: n.ai_summary || null,
    ai_clasificada_at: n.ai_classified_at,
    asignada_a: n.assigned_to_user_id,
    resuelta_at: n.resolved_at,
    resuelta_por: n.resolved_by_user_id,
    created_at: n.created_at,
    updated_at: n.updated_at,
  };
});
// `cuit` sale de sujeto(): en notificacion no hace falta, se saca antes de insertar
for (const n of notificaciones) delete (n as Row).cuit;
await insertChunked("notificacion", notificaciones);
console.log(
  `  notificacion: ${notificaciones.length} (${notificaciones.filter((n) => !n.cliente_id).length} del CUIT del login)`
);

// ---------- 6. iibb_liquidacion → liquidacion_iibb ----------
console.log("→ iibb_liquidacion → liquidacion_iibb...");
const iibbSrc = (await src.unsafe(`select * from iibb_liquidacion`)) as unknown as Row[];
const iibb: Row[] = [];
for (const r of iibbSrc) {
  // profile_id es el client del modelo viejo (nombre heredado de un rediseño que no ocurrió).
  const clienteId = r.profile_id;
  if (!clienteId || !clienteById.has(clienteId)) {
    console.log(`  ⚠ liquidación IIBB ${r.id}: cliente inexistente en BD_IDEAL, se saltea`);
    continue;
  }
  if (!r.periodo_fecha) {
    console.log(`  ⚠ liquidación IIBB ${r.id}: período "${r.periodo}" no parseable, se saltea`);
    continue;
  }
  iibb.push({
    id: r.id,
    org_id: r.org_id,
    cliente_id: clienteId,
    periodo: r.periodo_fecha,
    provincia: r.provincia,
    alicuota: r.alicuota,
    saldo_a_favor: r.saldo_a_favor,
    percepciones_agentes: r.percepciones_agentes,
    percepciones_aduaneras: r.percepciones_aduaneras,
    retenciones_agentes: r.retenciones_agentes,
    retenciones_bancarias: r.retenciones_bancarias,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("liquidacion_iibb", iibb);
console.log(`  liquidacion_iibb: ${iibb.length} (de ${iibbSrc.length})`);

// ---------- 7. verificación ----------
console.log("\n=== VERIFICACIÓN ===");
let ok = true;
const checks: [string, string, number][] = [
  ["comprobante", "select count(*)::int as c from comprobante", cabeceras.length],
  ["comprobante_alicuota", "select count(*)::int as c from comprobante_alicuota", alicuotas.length],
  ["iva_declaracion", "select count(*)::int as c from iva_declaracion", declaraciones.length],
  ["deuda", "select count(*)::int as c from deuda", deudas.length],
  ["vencimiento", "select count(*)::int as c from vencimiento", vencimientos.length],
  ["notificacion", "select count(*)::int as c from notificacion", notificaciones.length],
];
for (const [name, q, expected] of checks) {
  const [{ c }] = await dst.unsafe(q);
  const match = c === expected;
  if (!match) ok = false;
  console.log(`${match ? "✓" : "✗"} ${name}: ${c} (esperado ${expected})`);
}

// totales: la suma de netos por alícuota debe dar el neto gravado de la cabecera
const [{ c: descuadres }] = await dst.unsafe(`
  select count(*)::int as c from (
    select c.id, c.neto_gravado, coalesce(sum(a.neto) filter (where a.alicuota > 0), 0) as suma
    from comprobante c left join comprobante_alicuota a on a.comprobante_id = c.id
    group by c.id, c.neto_gravado
  ) x where abs(neto_gravado - suma) > 0.05`);
console.log(`${descuadres === 0 ? "✓" : "ℹ"} cabeceras con neto ≠ suma de alícuotas: ${descuadres}`);

const [{ c: ivaDesc }] = await dst.unsafe(`
  select count(*)::int as c from (
    select c.id, c.iva_total, coalesce(sum(a.iva), 0) as suma
    from comprobante c left join comprobante_alicuota a on a.comprobante_id = c.id
    group by c.id, c.iva_total
  ) x where abs(iva_total - suma) > 0.05`);
console.log(`${ivaDesc === 0 ? "✓" : "ℹ"} cabeceras con iva_total ≠ suma de alícuotas: ${ivaDesc}`);

await src.end();
await dst.end();
if (!ok) {
  console.error("\n✗ ETL D2 con diferencias");
  process.exit(1);
}
console.log("\n✓ ETL Dominio 2 OK");
