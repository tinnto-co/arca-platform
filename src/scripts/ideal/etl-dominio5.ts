/**
 * ETL Dominio 5 (bancos): NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1/2/4 corridos antes (usa cliente, contraparte, comprobante, cuenta).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio5.ts
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
  throw new Error(`ETL D5: ${msg}`);
}

async function insertChunked(table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
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

/** bank_transaction.direction es texto libre; se mira desde el cliente. */
const DIRECCION = {
  in: "ingreso",
  inbound: "ingreso",
  credit: "ingreso",
  ingreso: "ingreso",
  credito: "ingreso",
  out: "egreso",
  outbound: "egreso",
  debit: "egreso",
  egreso: "egreso",
  debito: "egreso",
} as const;

/** bank_invoice_match.match_type es texto libre: separa quién lo hizo de en qué estado quedó. */
const MATCH_FUENTE = {
  manual: "manual",
  auto: "ai",
  automatic: "ai",
  ai: "ai",
  suggested: "ai",
  exact: "import",
  import: "import",
} as const;

// ---------- 0. limpiar destino ----------
console.log("→ Truncando destino...");
await dst.unsafe(
  `truncate table conciliacion_comprobante, movimiento_bancario, cuenta_bancaria cascade`
);

// ---------- 1. contexto ----------
const clientes = await dst.unsafe(`select id, org_id from cliente`);
const clienteById = new Map<string, Row>(clientes.map((c: Row) => [c.id, c]));
const orgDe = (clienteId: string) => {
  const c = clienteById.get(clienteId);
  if (!c) fail(`cliente ${clienteId} no existe en BD_IDEAL`);
  return c.org_id as string;
};

/** Los IDs se conservan: credencial_afip.id === representative.id del modelo viejo. */
const rel = await dst.unsafe(`select cliente_id, credencial_id from cliente_credencial`);
const clientesPorCredencial = new Map<string, string[]>();
for (const r of rel as Row[]) {
  const arr = clientesPorCredencial.get(r.credencial_id) ?? [];
  arr.push(r.cliente_id);
  clientesPorCredencial.set(r.credencial_id, arr);
}

const usuarios = new Set<string>(
  (await dst.unsafe(`select id from "user"`)).map((u: Row) => u.id as string)
);
const usuario = (id: unknown) => (id && usuarios.has(String(id)) ? String(id) : null);

const comprobantes = new Set<string>(
  (await dst.unsafe(`select id from comprobante`)).map((c: Row) => c.id as string)
);

// ---------- 2. bank_account → cuenta_bancaria ----------
console.log("→ bank_account → cuenta_bancaria...");
const srcCuentas = await src.unsafe(`select * from bank_account`);

const TIPO = {
  caja_ahorro: "caja_ahorro",
  savings: "caja_ahorro",
  cuenta_corriente: "cuenta_corriente",
  checking: "cuenta_corriente",
  otra: "otra",
} as const;

const cuentasBancarias: Row[] = [];
const cuentaBancariaOk = new Set<string>();
for (const r of srcCuentas as Row[]) {
  // En el modelo viejo la cuenta colgaba del representante y client_id era opcional.
  let clienteId: string | null = r.client_id ?? null;
  if (!clienteId) {
    const candidatos = clientesPorCredencial.get(r.representative_id) ?? [];
    if (candidatos.length === 1) {
      clienteId = candidatos[0];
      aviso(
        `cuenta bancaria "${r.bank_name}" sin client_id: se asigna al único cliente del login (${clienteId})`
      );
    } else {
      aviso(
        `cuenta bancaria "${r.bank_name}" (${r.id}) sin client_id y el login tiene ${candidatos.length} clientes: NO se migra`
      );
      continue;
    }
  }
  if (!clienteById.has(clienteId)) {
    aviso(`cuenta bancaria ${r.id}: cliente ${clienteId} no existe en BD_IDEAL, se saltea`);
    continue;
  }
  cuentaBancariaOk.add(r.id);
  cuentasBancarias.push({
    id: r.id,
    org_id: orgDe(clienteId),
    cliente_id: clienteId,
    banco: r.bank_name,
    tipo: mapEnum("bank_account.tipo", null, TIPO),
    numero: r.account_number,
    cbu: r.cbu,
    alias: r.alias,
    moneda: (r.currency ?? "ARS").slice(0, 3).toUpperCase(),
    cuenta_contable_id: null,
    activa: r.active ?? true,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("cuenta_bancaria", cuentasBancarias);

// ---------- 3. bank_transaction → movimiento_bancario ----------
console.log("→ bank_transaction → movimiento_bancario...");
const srcMovs = await src.unsafe(`select * from bank_transaction`);

/** Resuelve la contraparte por documento contra el catálogo global (dominio 1). */
const contrapartes = new Map<string, string>(
  (
    await dst.unsafe(`select id, doc_nro from contraparte where doc_tipo = 'cuit'`)
  ).map((c: Row) => [c.doc_nro as string, c.id as string])
);

const movimientos: Row[] = [];
const movimientoOk = new Set<string>();
for (const r of srcMovs as Row[]) {
  if (!cuentaBancariaOk.has(r.bank_account_id)) {
    aviso(`movimiento ${r.id}: su cuenta bancaria no se migró, se saltea`);
    continue;
  }
  const importe = Number(r.amount);
  const doc = r.counterparty_identity_number
    ? String(r.counterparty_identity_number).replace(/\D/g, "")
    : null;
  movimientoOk.add(r.id);
  movimientos.push({
    id: r.id,
    cuenta_bancaria_id: r.bank_account_id,
    fecha: fecha(r.transaction_date),
    direccion: mapEnum("bank_transaction.direction", r.direction, DIRECCION),
    importe: Math.abs(importe),
    descripcion: r.description,
    saldo_posterior: null,
    contraparte_id: doc ? (contrapartes.get(doc) ?? null) : null,
    contraparte_texto: r.counterparty_name,
    id_externo: r.external_id,
    datos_crudos: r.raw_data,
    fuente: "import",
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
  if (importe < 0) {
    aviso(`movimiento ${r.id}: importe negativo (${importe}), se guarda positivo + direccion`);
  }
}
await insertChunked("movimiento_bancario", movimientos);

// ---------- 4. bank_invoice_match → conciliacion_comprobante ----------
console.log("→ bank_invoice_match → conciliacion_comprobante...");
const srcMatches = await src.unsafe(`select * from bank_invoice_match`);
const importePorMov = new Map<string, number>(
  movimientos.map((m) => [m.id as string, Number(m.importe)])
);

const conciliaciones: Row[] = [];
for (const r of srcMatches as Row[]) {
  if (!movimientoOk.has(r.bank_transaction_id)) {
    aviso(`conciliación ${r.id}: su movimiento no se migró, se saltea`);
    continue;
  }
  if (!comprobantes.has(r.invoice_id)) {
    aviso(`conciliación ${r.id}: el comprobante ${r.invoice_id} no existe en BD_IDEAL, se saltea`);
    continue;
  }
  conciliaciones.push({
    id: r.id,
    movimiento_bancario_id: r.bank_transaction_id,
    comprobante_id: r.invoice_id,
    // El modelo viejo no guardaba cuánto del movimiento cubría el comprobante: se asume total.
    importe_conciliado: importePorMov.get(r.bank_transaction_id) ?? 0,
    estado: r.reviewed_at ? "confirmada" : "sugerida",
    fuente: mapEnum("bank_invoice_match.match_type", r.match_type, MATCH_FUENTE),
    confianza: r.confidence,
    revisado_por: usuario(r.reviewed_by_user_id),
    revisado_at: r.reviewed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("conciliacion_comprobante", conciliaciones);

// ---------- 5. verificación ----------
console.log("\n=== Verificación ===");
const pares: [string, string][] = [
  ["cuenta_bancaria", "bank_account"],
  ["movimiento_bancario", "bank_transaction"],
  ["conciliacion_comprobante", "bank_invoice_match"],
];
for (const [destino, origen] of pares) {
  const [{ n: nd }] = await dst.unsafe(`select count(*)::int n from "${destino}"`);
  const [{ n: no }] = await src.unsafe(`select count(*)::int n from "${origen}"`);
  console.log(`  ${nd === no ? "✓" : "⚠"} ${destino.padEnd(24)} ${nd} (origen ${origen}: ${no})`);
}

const [{ n: sobreconciliados }] = await dst.unsafe(`
  select count(*)::int n from (
    select c.movimiento_bancario_id, sum(c.importe_conciliado) s, max(m.importe) imp
    from conciliacion_comprobante c
    join movimiento_bancario m on m.id = c.movimiento_bancario_id
    group by c.movimiento_bancario_id
  ) t where t.s > t.imp`);
console.log(`\n  movimientos conciliados por más que su importe: ${sobreconciliados}`);

const [{ n: sinContraparte }] = await dst.unsafe(
  `select count(*)::int n from movimiento_bancario where contraparte_id is null and contraparte_texto is not null`
);
console.log(`  movimientos con contraparte sin resolver: ${sinContraparte}`);

if (avisos.length) {
  console.log(`\n=== Avisos (${avisos.length}) ===`);
  for (const a of avisos.slice(0, 30)) console.log("  ⚠", a);
  if (avisos.length > 30) console.log(`  … y ${avisos.length - 30} más`);
}

console.log("\n✓ ETL Dominio 5 completo");
await src.end();
await dst.end();
