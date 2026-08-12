/**
 * ETL Dominio 4 (contabilidad): NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1.ts corrido antes (usa cliente / organization).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio4.ts
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
  throw new Error(`ETL D4: ${msg}`);
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
  const v = tabla[String(valor)];
  if (!v) fail(`${campo}: valor no mapeado "${valor}"`);
  return v;
}

// ---------- 0. limpiar destino ----------
console.log("→ Truncando destino...");
await dst.unsafe(`truncate table
  asiento_linea, asiento, regla_mapeo_linea, regla_mapeo,
  eecc, anexo_cmv, bien_de_uso, firmante,
  periodo_contable, ejercicio, cliente_cuenta, cuenta
  cascade`);

// ---------- 1. contexto ----------
const clientes = await dst.unsafe(`select id, org_id from cliente`);
const clienteById = new Map<string, Row>(clientes.map((c: Row) => [c.id, c]));
const orgDe = (clienteId: string) => {
  const c = clienteById.get(clienteId);
  if (!c) fail(`cliente ${clienteId} no existe en BD_IDEAL`);
  return c.org_id as string;
};
const usuarios = new Set<string>(
  (await dst.unsafe(`select id from "user"`)).map((u: Row) => u.id as string)
);
const usuario = (id: unknown) => (id && usuarios.has(String(id)) ? String(id) : null);

// ---------- 2. plan de cuentas ----------
console.log("→ accounting_account → cuenta...");
const TIPO = { imputable: "imputable", group: "grupo" } as const;
const ALCANCE = { base: "base", custom: "propia" } as const;
const SALDO = { debit: "deudor", credit: "acreedor", both: "ambos" } as const;
const FUNCION = {
  administration: "administracion",
  sales: "comercializacion",
  financial: "financiero",
  other: "otro",
} as const;
const FLUJO = { operating: "operativa", investing: "inversion", financing: "financiacion" } as const;
// account_group / inflation_nature ya estaban en castellano y con los mismos valores.

const cuentas = (await src.unsafe(
  `select * from accounting_account order by length(code), code`
)) as unknown as Row[];
await insertChunked(
  "cuenta",
  cuentas.map((c) => {
    if (c.client_id && !clienteById.has(c.client_id))
      fail(`cuenta ${c.code}: cliente ${c.client_id} no existe`);
    return {
      id: c.id,
      org_id: c.organization_id,
      codigo: c.code,
      nombre: c.name,
      tipo: mapEnum("cuenta.type", c.type, TIPO),
      alcance: mapEnum("cuenta.scope", c.scope, ALCANCE),
      cliente_id: c.client_id,
      padre_id: c.parent_id,
      descripcion: c.description,
      rubro: c.account_group,
      saldo_esperado: mapEnum("cuenta.expected_balance", c.expected_balance, SALDO),
      funcion_gasto: mapEnum("cuenta.expense_function", c.expense_function, FUNCION),
      naturaleza_inflacion: c.inflation_nature,
      flujo_efectivo: mapEnum("cuenta.cash_flow_activity", c.cash_flow_activity, FLUJO),
      es_cuenta_sistema: c.is_system_account,
      activa: c.is_active,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  })
);

// account_override → cliente_cuenta (misma info, nombre nuevo)
await insertChunked(
  "cliente_cuenta",
  ((await src.unsafe(`select * from account_override`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.client_id))
    .map((r) => ({
      id: r.id,
      cliente_id: r.client_id,
      cuenta_id: r.account_id,
      activa: r.is_active,
      nombre_propio: r.custom_name,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

// ---------- 3. ejercicios y períodos ----------
console.log("→ fiscal_year → ejercicio / accounting_period → periodo_contable...");
const EJERCICIO_ESTADO = { open: "abierto", closing: "en_cierre", closed: "cerrado" } as const;
const PERIODO_ESTADO = { open: "abierto", closed: "cerrado" } as const;

const ejercicios = ((await src.unsafe(`select * from fiscal_year`)) as unknown as Row[]).filter(
  (r) => clienteById.has(r.client_id)
);
await insertChunked(
  "ejercicio",
  ejercicios.map((r) => ({
    id: r.id,
    org_id: orgDe(r.client_id),
    cliente_id: r.client_id,
    numero: r.number,
    fecha_desde: fecha(r.start_date),
    fecha_hasta: fecha(r.end_date),
    estado: mapEnum("ejercicio.status", r.status, EJERCICIO_ESTADO),
    cerrado_at: r.closed_at,
    cerrado_por: usuario(r.closed_by),
    reabierto_at: r.reopened_at,
    reabierto_por: usuario(r.reopened_by),
    motivo_reapertura: r.reopen_reason,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const ejercicioIds = new Set(ejercicios.map((r) => r.id as string));

const periodos = ((await src.unsafe(`select * from accounting_period`)) as unknown as Row[]).filter(
  (r) => ejercicioIds.has(r.fiscal_year_id)
);
await insertChunked(
  "periodo_contable",
  periodos.map((r) => ({
    id: r.id,
    cliente_id: r.client_id,
    ejercicio_id: r.fiscal_year_id,
    // El modelo viejo guardaba (year, month) por separado; acá es una fecha real.
    periodo: `${r.year}-${String(r.month).padStart(2, "0")}-01`,
    estado: mapEnum("periodo.status", r.status, PERIODO_ESTADO),
    cerrado_at: r.closed_at,
    cerrado_por: usuario(r.closed_by),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const periodoIds = new Set(periodos.map((r) => r.id as string));

// ---------- 4. reglas de mapeo ----------
console.log("→ ledger_mapping_rule → regla_mapeo...");
const MODULO = { invoice: "comprobante", payroll: "recibo", bank: "movimiento_bancario" } as const;
const REGLA_TIPO = { default: "default", conditional: "condicional" } as const;
const BASE = {
  total: "total",
  net: "neto",
  vat: "iva",
  other_taxes: "otros_tributos",
  concept_value: "valor_concepto",
  fixed: "fijo",
} as const;
const LADO = { debit: "debe", credit: "haber" } as const;

const reglas = ((await src.unsafe(`select * from ledger_mapping_rule`)) as unknown as Row[]).filter(
  (r) => clienteById.has(r.client_id)
);
await insertChunked(
  "regla_mapeo",
  reglas.map((r) => ({
    id: r.id,
    org_id: orgDe(r.client_id),
    cliente_id: r.client_id,
    nombre: r.name,
    modulo: mapEnum("regla.source_module", r.source_module, MODULO),
    tipo: mapEnum("regla.rule_type", r.rule_type, REGLA_TIPO),
    condicion: r.condition,
    prioridad: r.priority,
    activa: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const reglaIds = new Set(reglas.map((r) => r.id as string));

await insertChunked(
  "regla_mapeo_linea",
  ((await src.unsafe(`select * from ledger_mapping_rule_line`)) as unknown as Row[])
    .filter((r) => reglaIds.has(r.rule_id))
    .map((r) => ({
      id: r.id,
      regla_id: r.rule_id,
      cuenta_id: r.account_id,
      lado: mapEnum("regla_linea.side", r.side, LADO),
      base: mapEnum("regla_linea.amount_basis", r.amount_basis, BASE),
      importe_fijo: r.fixed_amount,
      orden: r.line_order,
      descripcion: r.description,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

// ---------- 5. asientos (journal_entry + movements) ----------
console.log("→ journal_entry → asiento...");
// origin decía de dónde salió el asiento; source_type era un puntero paralelo sin CHECK.
const ORIGEN: Record<string, string> = {
  manual: "manual",
  auto_invoice: "comprobante",
  auto_payroll: "recibo",
  auto_closing: "cierre",
  auto_opening: "apertura",
  import_excel: "import",
};
const FUENTE_DE_ORIGEN: Record<string, string> = {
  manual: "manual",
  comprobante: "calculo",
  recibo: "calculo",
  cierre: "calculo",
  apertura: "calculo",
  import: "import",
};

const asientos = ((await src.unsafe(`select * from journal_entry`)) as unknown as Row[]).filter(
  (r) => clienteById.has(r.client_id) && ejercicioIds.has(r.fiscal_year_id)
);
let sinOrigenId = 0;
await insertChunked(
  "asiento",
  asientos.map((r) => {
    const origenTipo = ORIGEN[String(r.origin)];
    if (!origenTipo) fail(`asiento ${r.id}: origin no mapeado "${r.origin}"`);
    // El CHECK exige origen_id cuando el tipo no es manual; si el dato viejo no lo tiene,
    // el asiento pasa a manual (no se inventa un puntero).
    let tipo = origenTipo;
    if (tipo !== "manual" && !r.source_id) {
      tipo = "manual";
      sinOrigenId++;
    }
    return {
      id: r.id,
      org_id: orgDe(r.client_id),
      cliente_id: r.client_id,
      ejercicio_id: r.fiscal_year_id,
      periodo_id: periodoIds.has(r.period_id) ? r.period_id : fail(`asiento ${r.id}: período inexistente`),
      numero: r.number,
      fecha: fecha(r.entry_date),
      descripcion: r.description,
      origen_tipo: tipo,
      origen_id: tipo === "manual" ? null : r.source_id,
      regla_id: reglaIds.has(r.mapping_rule_id) ? r.mapping_rule_id : null,
      anulado: r.is_voided,
      anulado_at: r.voided_at,
      anulado_por: usuario(r.voided_by),
      motivo_anulacion: r.void_reason,
      editado_post_generacion: r.is_edited_post_generation,
      fuente: FUENTE_DE_ORIGEN[origenTipo],
      creado_por: usuario(r.created_by),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  })
);
if (sinOrigenId > 0) aviso(`${sinOrigenId} asientos automáticos sin source_id → pasan a origen_tipo=manual`);
const asientoIds = new Set(asientos.map((r) => r.id as string));

await insertChunked(
  "asiento_linea",
  ((await src.unsafe(`select * from journal_entry_line`)) as unknown as Row[])
    .filter((r) => asientoIds.has(r.journal_entry_id))
    .map((r) => ({
      id: r.id,
      asiento_id: r.journal_entry_id,
      cuenta_id: r.account_id,
      debe: r.debit,
      haber: r.credit,
      descripcion: r.description,
      orden: r.line_order,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

// movements: mayor manual del modelo viejo. Cuelga de user_id y no tiene cliente ni
// contrapartida, así que no se puede armar un asiento balanceado desde ahí.
const [{ n: movs }] = await src.unsafe(`select count(*)::int n from movements`);
if (movs > 0)
  aviso(
    `movements tiene ${movs} filas: cuelgan de user_id sin cliente ni cuenta, no son convertibles a asiento automáticamente`
  );

// ---------- 6. estados contables ----------
console.log("→ EECC, anexo CMV, bienes de uso, firmante...");
const firmas = (await src.unsafe(`select * from accountant_signature`)) as unknown as Row[];
await insertChunked(
  "firmante",
  firmas.map((r) => {
    if (r.firma_imagen)
      aviso(`firmante ${r.id}: firma_imagen en base64 → pendiente de subir a R2 (firma_imagen_key)`);
    return {
      id: r.id,
      org_id: r.organization_id,
      nombre: r.nombre ?? "Sin nombre",
      titulo: r.titulo,
      universidad: r.universidad,
      consejo: r.consejo,
      tomo: r.tomo,
      folio: r.folio,
      firma_imagen_key: null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  })
);

const EECC_ESTADO = { draft: "borrador", approved: "aprobado" } as const;
await insertChunked(
  "eecc",
  ((await src.unsafe(`select * from financial_statement`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.client_id) && ejercicioIds.has(r.fiscal_year_id))
    .map((r) => {
      if (r.pdf_url) aviso(`eecc ${r.id}: pdf_url → pendiente de mover a R2 (pdf_key)`);
      return {
        id: r.id,
        org_id: r.organization_id,
        cliente_id: r.client_id,
        ejercicio_id: r.fiscal_year_id,
        estado: mapEnum("eecc.status", r.status, EECC_ESTADO),
        notas: r.notes,
        aprobado_at: r.approved_at,
        aprobado_por: usuario(r.approved_by),
        pdf_key: null,
        pdf_bytes: r.pdf_size_bytes,
        pdf_generado_at: r.pdf_generated_at,
        pdf_generado_por: usuario(r.pdf_generated_by),
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    })
);

await insertChunked(
  "anexo_cmv",
  ((await src.unsafe(`select * from cmv_annex`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.client_id) && ejercicioIds.has(r.fiscal_year_id))
    .map((r) => ({
      id: r.id,
      org_id: r.organization_id,
      cliente_id: r.client_id,
      ejercicio_id: r.fiscal_year_id,
      existencia_inicial: r.existencia_inicial,
      compras_gastos: r.compras_gastos,
      existencia_final: r.existencia_final,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

const BIEN_ESTADO = { active: "activo", sold: "vendido", discarded: "baja" } as const;
const BIEN_MOTIVO = { sale: "venta", disuse: "desuso", destruction: "destruccion" } as const;
await insertChunked(
  "bien_de_uso",
  ((await src.unsafe(`select * from fixed_asset`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.client_id))
    .map((r) => ({
      id: r.id,
      org_id: orgDe(r.client_id),
      cliente_id: r.client_id,
      nombre: r.name,
      categoria: r.category,
      cuenta_bien_id: r.asset_account_id,
      cuenta_amortizacion_acumulada_id: r.accum_depr_account_id,
      cuenta_amortizacion_gasto_id: r.depr_expense_account_id,
      fecha_alta: fecha(r.acquisition_date),
      valor_origen: r.original_value,
      vida_util_anios: r.useful_life_years,
      valor_residual: r.residual_value,
      metodo: "lineal",
      estado: mapEnum("bien.status", r.status, BIEN_ESTADO),
      fecha_baja: fecha(r.disposal_date),
      motivo_baja: mapEnum("bien.disposal_reason", r.disposal_reason, BIEN_MOTIVO),
      creado_por: usuario(r.created_by),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

// accounting_log desaparece: lo cubre `evento` (D1).
const [{ n: logs }] = await src.unsafe(`select count(*)::int n from accounting_log`);
if (logs > 0) aviso(`accounting_log tiene ${logs} filas: van a la tabla evento, pendiente de mapear`);

// ---------- 7. verificación ----------
console.log("\n=== Verificación ===");
const pares: [string, string][] = [
  ["cuenta", "accounting_account"],
  ["cliente_cuenta", "account_override"],
  ["ejercicio", "fiscal_year"],
  ["periodo_contable", "accounting_period"],
  ["regla_mapeo", "ledger_mapping_rule"],
  ["regla_mapeo_linea", "ledger_mapping_rule_line"],
  ["asiento", "journal_entry"],
  ["asiento_linea", "journal_entry_line"],
  ["firmante", "accountant_signature"],
  ["eecc", "financial_statement"],
  ["anexo_cmv", "cmv_annex"],
  ["bien_de_uso", "fixed_asset"],
];
for (const [destino, origen] of pares) {
  const [{ n }] = await dst.unsafe(`select count(*)::int n from "${destino}"`);
  const [{ n: o }] = await src.unsafe(`select count(*)::int n from "${origen}"`);
  console.log(`  ${n === o ? "✓" : "⚠"} ${destino.padEnd(20)} ${n} (origen ${origen}: ${o})`);
}

const [balance] = await dst.unsafe(`
  select count(*)::int n from (
    select asiento_id from asiento_linea group by asiento_id
    having abs(sum(debe) - sum(haber)) > 0.005) x`);
console.log(`\n  asientos desbalanceados (debe ≠ haber): ${balance.n}`);

const [huerfanas] = await dst.unsafe(
  `select count(*)::int n from cuenta c where c.padre_id is not null
   and not exists (select 1 from cuenta p where p.id = c.padre_id)`
);
console.log(`  cuentas con padre inexistente: ${huerfanas.n}`);

if (avisos.length > 0) {
  console.log(`\n=== Avisos (${avisos.length}) ===`);
  for (const a of [...new Set(avisos)].slice(0, 30)) console.log("  •", a);
}

await src.end();
await dst.end();
console.log("\n✓ ETL Dominio 4 completo");
