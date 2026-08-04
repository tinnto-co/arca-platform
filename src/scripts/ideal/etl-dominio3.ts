/**
 * ETL Dominio 3 (sueldos): NEW_DB (fuente, solo lectura) → BD_IDEAL (local).
 * Requiere etl-dominio1.ts corrido antes (usa cliente / organization).
 * Re-ejecutable: trunca las tablas destino y recarga todo.
 * Uso: source .env && bun src/scripts/ideal/etl-dominio3.ts
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
  throw new Error(`ETL D3: ${msg}`);
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

/** 'YYYY-MM' o 'YYYY-MM-DD' o Date → primer día del mes. */
function periodoDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

const fecha = (v: unknown): string | null =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null;

// ---------- 0. limpiar destino ----------
// concepto_afip queda fuera a propósito: es la grilla oficial de AFIP sembrada
// por schema-dominio3.sql, no un dato migrado. Truncarla la borraría.
console.log("→ Truncando destino...");
// base_calculo tampoco se trunca (la siembra el schema); su membership sí.
await dst.unsafe(`truncate table
  recibo_concepto, recibo, empleado, lsd_presentacion, parametro_periodo,
  cliente_concepto, base_calculo_concepto, concepto,
  escala_salarial, convenio_categoria, convenio_fuente, convenio, cliente_cct, cct,
  situacion_revista, condicion_trabajador, modalidad_contratacion, actividad, zona,
  provincia, localidad, nacionalidad, siniestrado, tipo_empresa, obra_social
  cascade`);

// ---------- 1. contexto ----------
const clientes = await dst.unsafe(`select id, org_id from cliente`);
const clienteById = new Map<string, Row>(clientes.map((c: Row) => [c.id, c]));
/** Un rep puede tener varios clientes: payroll_concepto cuelga del rep, no del cliente. */
const clientesPorRep = new Map<string, string[]>();
for (const c of await src.unsafe(`select id, representative_id from client`)) {
  if (!clienteById.has(c.id)) continue;
  const arr = clientesPorRep.get(c.representative_id) ?? [];
  arr.push(c.id);
  clientesPorRep.set(c.representative_id, arr);
}
const orgDe = (clienteId: string) => {
  const c = clienteById.get(clienteId);
  if (!c) fail(`cliente ${clienteId} no existe en BD_IDEAL`);
  return c.org_id as string;
};

// ---------- 2. catálogos LSD ----------
console.log("→ catálogos LSD...");
const catalogos: [string, string, boolean][] = [
  // [tabla origen, tabla destino, tiene codigo_sos]
  ["payroll_situacion", "situacion_revista", true],
  ["payroll_condicion", "condicion_trabajador", true],
  ["payroll_modalidad_contratacion", "modalidad_contratacion", true],
  ["payroll_actividad", "actividad", true],
  ["payroll_zona", "zona", true],
  ["payroll_provincia", "provincia", false],
  ["payroll_localidad", "localidad", false],
  ["payroll_nacionalidad", "nacionalidad", false],
  ["payroll_siniestrado", "siniestrado", true],
  ["obra_social", "obra_social", true],
];
for (const [from, to, conSos] of catalogos) {
  const rows = (await src.unsafe(`select * from "${from}"`)) as unknown as Row[];
  await insertChunked(
    to,
    rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      ...(conSos ? { codigo_sos: r.codigo_sos ?? null } : {}),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  );
}
// tipo_empresa usa codigo_lsd en vez de codigo
await insertChunked(
  "tipo_empresa",
  ((await src.unsafe(`select * from payroll_tipo_empresa`)) as unknown as Row[]).map((r) => ({
    id: r.id,
    codigo: r.codigo_lsd,
    nombre: r.nombre,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);

// ---------- 3. conceptos ----------
console.log("→ conceptos...");
// concepto_afip NO se migra: es la grilla oficial de AFIP y viene sembrada en
// schema-dominio3.sql. Antes se armaba desde lsd_concepto_afip (35 códigos que
// el scrapper veía en los clientes) más 43 inventados con el nombre de SOS.
const afipCatalogo = (await dst`
  select id, codigo, codigo_hasta, tipo from concepto_afip order by codigo`) as unknown as Row[];
const afipIdPorCodigo = new Map<string, string>(
  afipCatalogo.map((r) => [r.codigo as string, r.id as string])
);

/** Resuelve un código contra la grilla, contemplando los rangos libres. */
function resolverAfip(codigo: string) {
  const exacto = afipCatalogo.find((r) => r.codigo === codigo);
  if (exacto) return exacto;
  return afipCatalogo.find(
    (r) => r.codigo_hasta && codigo >= (r.codigo as string) && codigo <= (r.codigo_hasta as string)
  );
}

/** SOS inventaba variantes con letra ("560001B") sobre códigos reales de AFIP. */
function normalizarCodigoAfip(codigo: string): string {
  const limpio = codigo.trim().toUpperCase();
  return /^\d{6}[A-Z]+$/.test(limpio) ? limpio.slice(0, 6) : limpio;
}

// El vocabulario de SOS (base_columna) se traduce a modo + base_calculo.
// Los rangos "subN_M" pasan a ser bases con nombre; el resto son modos de cálculo.
const MODO_POR_BASE_COLUMNA: Record<string, { modo: string; base?: string }> = {
  importe_fijo: { modo: "importe_manual" },
  ref_concepto: { modo: "pct_sobre_concepto" },
  sueldo: { modo: "sueldo_basico" },
  sueldoLegajo: { modo: "sueldo_basico" },
  valHora: { modo: "valor_hora" },
  sac_normal: { modo: "sac" },
  sac_proporcional: { modo: "sac_proporcional" },
  bruto_anterior_div25: { modo: "dia_vacaciones" },
  concepto_401_div12: { modo: "promedio_anual_concepto" },
  sub1_9: { modo: "pct_sobre_base", base: "sueldo_y_adicionales" },
  sub1_19: { modo: "pct_sobre_base", base: "remunerativo_habitual" },
  sub1_199: { modo: "pct_sobre_base", base: "total_remunerativo" },
  sub411_469: { modo: "pct_sobre_base", base: "total_no_remunerativo" },
  sub1_199_plus_411_469: { modo: "pct_sobre_base", base: "bruto" },
  sub411_414_qty: { modo: "pct_sobre_base", base: "no_remunerativo_con_os" },
  os_base: { modo: "pct_sobre_base", base: "base_obra_social" },
  os_norem_base: { modo: "pct_sobre_base", base: "no_remunerativo_con_os" },
};

// La metadata del seed de SOS estaba MAL en estos conceptos (verificado contra
// los recibos reales el 01/08): 211/212 no cierran contra ninguna base — se tipean.
// NOTA 02/08: 501/503 estuvieron acá apuntados a total_remunerativo, pero el
// test de aceptación del motor demostró que la declaración SOS original
// (sub411_469 → total_no_remunerativo) era la correcta: 59/64 y 41/64 de las
// líneas no-cero cierran exacto con pct × Σ(411-469); con total_remunerativo
// eran 83+83 mismatches. Se revirtió.
const CORRECCION_MODO: Record<number, { modo: string; base?: string }> = {
  211: { modo: "importe_manual" },
  212: { modo: "importe_manual" },
  // 30/43 eran las "asignaciones complementarias s/conc. 1 a 26/39" (0 usos):
  // sus escalones sub1_26/sub1_39 no se migran como base.
  30: { modo: "importe_manual" },
  43: { modo: "importe_manual" },
};

// Qué conceptos integran cada base — por SEMÁNTICA (tipo + naturaleza del
// concepto), ya no por rango de numeración SOS. Diferencias deliberadas con SOS
// (todas sobre conceptos con 0 usos en los recibos reales, verificado 01/08):
// - Las sumas no rem por decreto (491-496, 601-605) y los "otros no rem" del
//   rango libre (470-484) SÍ integran el total no remunerativo: SOS los dejaba
//   afuera solo porque su número caía fuera de 411-469.
// - Los indemnizatorios (401-408), beneficios sociales art. 103 bis (610-618) y
//   asignaciones familiares (620) NO integran: no son sumas, no son base de nada.
// - 420/421 (art. 223 bis) quedan fuera de toda canasta: su tipo dice
//   remunerativo (código AFIP 110000 del seed) pero el 223 bis es una prestación
//   NO remunerativa — contradicción de origen a resolver con las Guías de ARCA.
const ANOMALIA_223BIS = (n: number) => n === 420 || n === 421;
const INDEMNIZATORIO = (n: number) => n >= 401 && n <= 408;
const BENEFICIO_SOCIAL = (n: number) => n >= 610 && n <= 618;
const ASIGNACION_FAMILIAR = (n: number) => n === 620;

const esRemunerativo = (n: number, tipo: string) =>
  tipo === "remunerativo" && !ANOMALIA_223BIS(n);
const esSumaNoRem = (n: number, tipo: string) =>
  tipo === "no_remunerativo" && !INDEMNIZATORIO(n) && !BENEFICIO_SOCIAL(n) && !ASIGNACION_FAMILIAR(n);
const esNoRemConOs = (n: number, tipo: string) =>
  tipo === "no_remunerativo" && n >= 411 && n <= 414;

const MIEMBROS_POR_BASE: Record<string, (n: number, tipo: string) => boolean> = {
  // Bases de CCT: lista curada (heredada de comercio vía SOS)
  sueldo_y_adicionales: (n, t) => esRemunerativo(n, t) && n >= 1 && n <= 9,
  remunerativo_habitual: (n, t) => esRemunerativo(n, t) && n >= 1 && n <= 19,
  // Bases de ley: derivan del tipo
  total_remunerativo: esRemunerativo,
  total_no_remunerativo: esSumaNoRem,
  bruto: (n, t) => esRemunerativo(n, t) || esSumaNoRem(n, t),
  no_remunerativo_con_os: esNoRemConOs,
  base_obra_social: (n, t) => esRemunerativo(n, t) || esNoRemConOs(n, t),
};

const baseIdPorCodigo = new Map<string, string>(
  ((await dst`select id, codigo from base_calculo`) as unknown as Row[]).map((r) => [
    r.codigo as string,
    r.id as string,
  ])
);
for (const codigo of Object.keys(MIEMBROS_POR_BASE))
  if (!baseIdPorCodigo.has(codigo)) fail(`base_calculo "${codigo}" no está sembrada en el schema`);

/** base_columna de SOS (+ corrección puntual) → { modo, base_calculo_id }. */
function traducirBase(numero: number, baseColumna: string, origen: string) {
  const t = CORRECCION_MODO[numero] ?? MODO_POR_BASE_COLUMNA[baseColumna];
  if (!t) fail(`${origen}: base_columna no mapeada "${baseColumna}"`);
  return {
    modo: t.modo,
    base_calculo_id: t.base ? baseIdPorCodigo.get(t.base)! : null,
  };
}

const conceptosSos = (await src.unsafe(`select * from conceptos_completos_sos`)) as unknown as Row[];

// Códigos de descuento que son RETENCIÓN: plata que se le saca al empleado para
// dársela a un tercero, no un aporte a un subsistema de la seguridad social.
// - 810004 cuota sindical (art. 38 Ley 23.551 — va al gremio, no al F931)
// - 810005 seguro de vida (compañía aseguradora)
// - 810008 Ganancias (retención impositiva)
// - 82xxxx  todo el bloque "otros descuentos" y "de uso libre": ahí viven
//   préstamos, embargos, mutuales, farmacia. AFIP no dice qué son.
// El resto de los 810xxx son los aportes del F931 (SIPA, INSSJyP, Obra Social,
// FSR, RENATEA) y quedan como 'descuento' a secas. Un código nuevo cae del lado
// correcto sin tocar esta lista: 810xxx → aporte, 82xxxx → retención.
const RETENCIONES_EXPLICITAS = new Set(["810004", "810005", "810008"]);
const esRetencion = (cod: string) => cod.startsWith("82") || RETENCIONES_EXPLICITAS.has(cod);

// El tipo (remunerativo / no_remunerativo / descuento) nunca existió en el
// origen: en SOS estaba implícito en la numeración y el seed de conceptos ni
// siquiera tenía el campo. Ahora sale derivado del código AFIP, que sí lo dice;
// 'retencion' es un refinamiento nuestro sobre los descuentos, valor inicial —
// después se edita por fila, que para eso vive en concepto y no en concepto_afip.
let conLetra = 0;
let retenciones = 0;
const tipoPorConcepto = new Map<string, string>();
for (const c of conceptosSos) {
  const original = c.codigo_afip as string;
  const cod = normalizarCodigoAfip(original);
  if (cod !== original) conLetra++;
  const ca = resolverAfip(cod);
  if (!ca) {
    fail(
      `concepto ${c.numero_sos} "${c.nombre}": código AFIP "${c.codigo_afip}" no existe en la grilla del LSD. ` +
        `Corregirlo en el origen o agregarlo a concepto_afip si AFIP publicó un PDF nuevo.`
    );
  }
  let tipo = ca.tipo as string;
  if (tipo === "descuento" && esRetencion(cod)) {
    tipo = "retencion";
    retenciones++;
  }
  tipoPorConcepto.set(c.id as string, tipo);
}
if (conLetra > 0) {
  aviso(`${conLetra} códigos AFIP con sufijo de letra de SOS (ej. "560001B") normalizados a 6 dígitos`);
}
console.log(`   ${retenciones} descuentos clasificados como retención (el resto son aportes del F931)`);

const modoCatalogo = new Map<string, { modo: string; base_calculo_id: string | null }>();
await insertChunked(
  "concepto",
  conceptosSos.map((c) => {
    const numero = Number(c.numero_sos);
    const t = traducirBase(numero, c.base_columna, `concepto ${numero}`);
    if (CORRECCION_MODO[numero])
      aviso(
        `concepto ${numero} "${c.nombre}": modo corregido a ${t.modo} — el seed de SOS declaraba "${c.base_columna}" (ver CORRECCION_MODO)`
      );
    modoCatalogo.set(c.id as string, t);
    return {
      id: c.id,
      numero: c.numero_sos,
      nombre: c.nombre,
      codigo_afip: normalizarCodigoAfip(c.codigo_afip as string),
      tipo: tipoPorConcepto.get(c.id as string),
      modo: t.modo,
      base_calculo_id: t.base_calculo_id,
      pct_fijo: c.pct_fijo,
      div_hs_norm: c.div_hs_norm ?? 1,
      div_cantidad: c.div_cantidad ?? 1,
      usa_memo: c.tiene_memo,
      usa_cantidad: c.tiene_cantidad,
      usa_pct: c.tiene_pct,
      usa_concepto_ref: c.tiene_imp_concepto_nro,
      usa_importe: c.tiene_importe,
      usa_importe_min: c.tiene_imp_min,
      usa_importe_max: c.tiene_imp_max,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
  })
);
const conceptoIdPorNumero = new Map<number, string>(
  conceptosSos.map((c) => [Number(c.numero_sos), c.id as string])
);

// Membership: qué conceptos integran cada base. Solo devengan los tipo
// remunerativo / no_remunerativo (las funciones lo chequean): un descuento
// calcula SOBRE la base pero no la integra.
const membership: Row[] = [];
for (const [codigo, incluye] of Object.entries(MIEMBROS_POR_BASE)) {
  const baseId = baseIdPorCodigo.get(codigo)!;
  for (const c of conceptosSos) {
    const tipo = tipoPorConcepto.get(c.id as string)!;
    if (incluye(Number(c.numero_sos), tipo))
      membership.push({ base_calculo_id: baseId, concepto_id: c.id });
  }
}
await insertChunked("base_calculo_concepto", membership);
console.log(`   ${membership.length} filas de membership en ${Object.keys(MIEMBROS_POR_BASE).length} bases`);
// Se indexa por el código normalizado: los lookups vienen de otras tablas que
// también traen el sufijo de letra de SOS.
const conceptoIdPorCodigoAfip = new Map<string, string>();
for (const c of conceptosSos) {
  const cod = normalizarCodigoAfip(c.codigo_afip as string);
  if (!conceptoIdPorCodigoAfip.has(cod)) conceptoIdPorCodigoAfip.set(cod, c.id as string);
}

// ---------- 4. cliente_concepto (fusión de 3 tablas) ----------
console.log("→ cliente_concepto...");
const ccKey = (cliente: string, concepto: string) => `${cliente}|${concepto}`;
const clienteConcepto = new Map<string, Row>();
const base = (clienteId: string, conceptoId: string): Row => {
  const k = ccKey(clienteId, conceptoId);
  let r = clienteConcepto.get(k);
  if (!r) {
    r = { cliente_id: clienteId, org_id: orgDe(clienteId), concepto_id: conceptoId };
    clienteConcepto.set(k, r);
  }
  return r;
};

// 4a. concepto_sos_client: habilitación. concepto_sos es un subconjunto del catálogo global.
const conceptoSos = new Map<string, number>(
  ((await src.unsafe(`select id, codigo from concepto_sos`)) as unknown as Row[]).map((r) => [
    r.id as string,
    Number(r.codigo),
  ])
);
for (const r of (await src.unsafe(`select * from concepto_sos_client`)) as unknown as Row[]) {
  if (!clienteById.has(r.client_id)) continue;
  const numero = conceptoSos.get(r.concepto_id);
  if (numero === undefined) fail(`concepto_sos ${r.concepto_id} inexistente`);
  const conceptoId = conceptoIdPorNumero.get(numero);
  if (!conceptoId) fail(`concepto_sos codigo ${numero} no está en el catálogo global`);
  Object.assign(base(r.client_id, conceptoId), { habilitado: true });
}

// 4b. payroll_concepto: fórmula y vigencia. Cuelga del representante, no del cliente.
for (const r of (await src.unsafe(`select * from payroll_concepto`)) as unknown as Row[]) {
  const destinos = clientesPorRep.get(r.representative_id) ?? [];
  if (destinos.length === 0) continue;
  if (destinos.length > 1)
    aviso(
      `payroll_concepto "${r.nombre}" (rep ${r.representative_id}) replicado a ${destinos.length} clientes: el modelo viejo lo guardaba por representante`
    );
  const conceptoId = conceptoIdPorNumero.get(Number(r.numero_sos));
  if (!conceptoId) fail(`payroll_concepto numero_sos ${r.numero_sos} no está en el catálogo global`);
  const t = traducirBase(Number(r.numero_sos), r.base_columna, `payroll_concepto ${r.id}`);
  // El override solo se guarda si difiere del catálogo (null = manda el catálogo).
  const cat = modoCatalogo.get(conceptoId)!;
  const pisaModo = t.modo !== cat.modo || t.base_calculo_id !== cat.base_calculo_id;
  // formula era texto libre pero en los datos reales es SIEMPRE una constante
  // numérica ("100000"): pasa a importe_fijo. Si apareciera una fórmula de
  // verdad, esto tiene que fallar para decidirla a mano.
  let importeFijo: number | null = null;
  if (r.formula != null && String(r.formula).trim() !== "") {
    const n = Number(String(r.formula).trim());
    if (!Number.isFinite(n))
      fail(`payroll_concepto ${r.id} "${r.nombre}": formula "${r.formula}" no es una constante numérica — decidir a mano cómo traducirla`);
    importeFijo = n;
  }
  for (const clienteId of destinos) {
    Object.assign(base(clienteId, conceptoId), {
      habilitado: r.activo,
      codigo_propio: r.codigo,
      nombre_propio: r.nombre,
      tipo: r.tipo,
      modo: pisaModo ? t.modo : null,
      base_calculo_id: pisaModo ? t.base_calculo_id : null,
      importe_fijo: importeFijo,
      orden: r.orden,
      importe_min: r.imp_min,
      importe_max: r.imp_max,
      div_cantidad: r.div_cantidad,
      div_hs_norm: r.div_hs_norm,
      vigencia_desde: fecha(r.vigencia_desde),
      vigencia_hasta: fecha(r.vigencia_hasta),
    });
  }
}

// 4c. lsd_perfil_concepto: código propio y bases de aporte declaradas en AFIP.
const FLAGS = [
  "aportes_sipa", "contribuciones_sipa", "aportes_inssjyp", "contribuciones_inssjyp",
  "aportes_obra_social", "contribuciones_obra_social", "aportes_fsr", "contribuciones_fsr",
  "aportes_renatea", "contribuciones_renatea", "contribuciones_aaff", "contribuciones_fne",
  "contribuciones_lrt", "aportes_diferenciales", "aportes_especiales",
];
// lsd_concepto_afip (origen) sólo sirve ya para traducir sus ids a un código;
// el id destino sale del catálogo oficial, que tiene otros uuid.
const afipCodigoPorIdOrigen = new Map<string, string>(
  ((await src.unsafe(`select id, codigo_afip from lsd_concepto_afip`)) as unknown as Row[]).map(
    (r) => [r.id as string, normalizarCodigoAfip(r.codigo_afip as string)]
  )
);
/** id del origen → id del catálogo oficial (contemplando rangos libres). */
function afipIdDestino(idOrigen: unknown): string | null {
  const cod = afipCodigoPorIdOrigen.get(idOrigen as string);
  if (!cod) return null;
  const ca = resolverAfip(cod);
  if (!ca) fail(`lsd_concepto_afip: código "${cod}" no existe en la grilla oficial del LSD`);
  return ca.id as string;
}
let perfilSinConcepto = 0;
for (const r of (await src.unsafe(`select * from lsd_perfil_concepto`)) as unknown as Row[]) {
  if (!clienteById.has(r.client_id)) continue;
  const cod = String(r.codigo_contribuyente);
  let conceptoId = /^\d+$/.test(cod) ? conceptoIdPorNumero.get(Number(cod)) : undefined;
  if (!conceptoId) {
    // El código del contribuyente no es un número SOS: se cae al concepto AFIP declarado.
    const codAfip = afipCodigoPorIdOrigen.get(r.concepto_afip_id as string);
    conceptoId = codAfip ? conceptoIdPorCodigoAfip.get(codAfip) : undefined;
  }
  if (!conceptoId) {
    perfilSinConcepto++;
    continue;
  }
  const row = base(r.client_id, conceptoId);
  Object.assign(row, {
    codigo_propio: row.codigo_propio ?? cod,
    nombre_propio: row.nombre_propio ?? r.descripcion_contribuyente,
    concepto_afip_id: afipIdDestino(r.concepto_afip_id),
    repetible: r.marca_repetible,
  });
  for (const f of FLAGS) row[f] = r[f];
}
if (perfilSinConcepto > 0)
  aviso(`${perfilSinConcepto} filas de lsd_perfil_concepto sin concepto del catálogo (código propio fuera de la numeración SOS)`);

await insertChunked(
  "cliente_concepto",
  [...clienteConcepto.values()].map((r) => ({
    org_id: r.org_id,
    cliente_id: r.cliente_id,
    concepto_id: r.concepto_id,
    habilitado: r.habilitado ?? true,
    codigo_propio: r.codigo_propio ?? null,
    nombre_propio: r.nombre_propio ?? null,
    concepto_afip_id: r.concepto_afip_id ?? null,
    tipo: r.tipo ?? null,
    modo: r.modo ?? null,
    base_calculo_id: r.base_calculo_id ?? null,
    importe_fijo: r.importe_fijo ?? null,
    orden: r.orden ?? null,
    importe_min: r.importe_min ?? null,
    importe_max: r.importe_max ?? null,
    div_cantidad: r.div_cantidad ?? null,
    div_hs_norm: r.div_hs_norm ?? false,
    vigencia_desde: r.vigencia_desde ?? null,
    vigencia_hasta: r.vigencia_hasta ?? null,
    repetible: r.repetible ?? false,
    ...Object.fromEntries(FLAGS.map((f) => [f, r[f] ?? false])),
  }))
);

// ---------- 5. convenios ----------
console.log("→ convenios...");
const ccts = (await src.unsafe(`select * from convenios_de_trabajo`)) as unknown as Row[];
await insertChunked(
  "cct",
  ccts.map((r) => ({
    id: r.id,
    codigo: r.cct,
    nombre: r.nombre,
    signatarios: r.signatarios,
    descripcion: r.descripcion,
    activo: r.activo,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const cctCodigos = new Set(ccts.map((r) => r.cct as string));

const convenios = (await src.unsafe(`select * from payroll_convenio`)) as unknown as Row[];
const conveniosOk = convenios.filter((r) => clienteById.has(r.client_id));
if (conveniosOk.length < convenios.length)
  aviso(`${convenios.length - conveniosOk.length} convenios de clientes que ya no existen`);
await insertChunked(
  "convenio",
  conveniosOk.map((r) => ({
    id: r.id,
    org_id: orgDe(r.client_id),
    cliente_id: r.client_id,
    // Solo 16 de 59 CCT del convenio están en el catálogo: el resto queda sin FK hasta que se cargue.
    cct_codigo: r.cct_codigo && cctCodigos.has(r.cct_codigo) ? r.cct_codigo : null,
    nombre: r.nombre,
    descripcion: r.descripcion,
    activo: r.activo,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const convenioIds = new Set(conveniosOk.map((r) => r.id as string));

await insertChunked(
  "cliente_cct",
  ((await src.unsafe(`select * from afip_empleadores_convenio`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.client_id))
    .map((r) => ({
      id: r.id,
      org_id: orgDe(r.client_id),
      cliente_id: r.client_id,
      cct_codigo: r.cct,
      actividad: r.actividad,
      signatarios: r.signatarios,
      fecha_novedad: r.fecha_novedad,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

const categorias = ((await src.unsafe(`select * from payroll_convenio_categoria`)) as unknown as Row[])
  .filter((r) => convenioIds.has(r.convenio_id));
await insertChunked(
  "convenio_categoria",
  categorias.map((r) => ({
    id: r.id,
    convenio_id: r.convenio_id,
    codigo: r.codigo,
    nombre: r.nombre,
    orden: r.orden,
    es_valor_hora: r.es_valor_hora,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const categoriaIds = new Set(categorias.map((r) => r.id as string));

await insertChunked(
  "convenio_fuente",
  ((await src.unsafe(`select * from payroll_convenio_fuente`)) as unknown as Row[])
    .filter((r) => convenioIds.has(r.convenio_id))
    .map((r) => ({
      id: r.id,
      convenio_id: r.convenio_id,
      fuente: r.fuente,
      detalle: r.detalle,
      last_synced_at: r.last_synced_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

// escala: hay 1 duplicado real (misma categoría y vigencia, montos distintos). Gana el más nuevo.
const escalas = new Map<string, Row>();
for (const r of ((await src.unsafe(`select * from payroll_escala order by updated_at asc`)) as unknown as Row[])) {
  if (!categoriaIds.has(r.categoria_id)) continue;
  const k = `${r.categoria_id}|${fecha(r.vigencia_desde)}`;
  if (escalas.has(k)) aviso(`escala duplicada categoría ${r.categoria_id} desde ${fecha(r.vigencia_desde)} — se conserva la más reciente`);
  escalas.set(k, {
    id: r.id,
    categoria_id: r.categoria_id,
    vigencia_desde: fecha(r.vigencia_desde),
    vigencia_hasta: fecha(r.vigencia_hasta),
    monto_basico: r.monto_basico,
    monto_no_remunerativo: r.monto_no_remunerativo ?? 0,
    periodo_label: r.periodo_label,
    fuente: r.fuente,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
await insertChunked("escala_salarial", [...escalas.values()]);

// ---------- 6. empleados ----------
console.log("→ empleados...");
const SEXO: Record<string, string> = { M: "masculino", F: "femenino" };
const FORMA_PAGO = new Set(["efectivo", "deposito", "transferencia", "cheque"]);
const empleados = ((await src.unsafe(`select * from liquidacion_import_empleado`)) as unknown as Row[])
  .filter((r) => clienteById.has(r.client_id));
// codigo_zona viene del sistema SOS ("1") y no es el código del catálogo AFIP (4-5 dígitos):
// no hay tabla de equivalencia, así que la zona queda sin resolver como ya estaba en origen.
const zonaSinMapear = new Set(
  empleados.filter((r) => !r.zona_id && r.codigo_zona).map((r) => String(r.codigo_zona))
);
await insertChunked(
  "empleado",
  empleados.map((r) => {
    if (r.sexo && !SEXO[r.sexo]) fail(`empleado ${r.id}: sexo no mapeado "${r.sexo}"`);
    if (r.forma_pago && !FORMA_PAGO.has(r.forma_pago))
      fail(`empleado ${r.id}: forma_pago no mapeada "${r.forma_pago}"`);
    return {
      id: r.id,
      org_id: orgDe(r.client_id),
      cliente_id: r.client_id,
      cuil: r.cuil,
      legajo: r.legajo,
      nombre: r.nombre,
      sexo: r.sexo ? SEXO[r.sexo] : null,
      fecha_nacimiento: fecha(r.fecha_nacimiento),
      nacionalidad_id: r.nacionalidad_id,
      domicilio: r.domicilio,
      localidad_id: r.localidad_id,
      provincia_id: r.provincia_id,
      codigo_postal: r.codigo_postal,
      fecha_alta: fecha(r.fecha_alta),
      fecha_baja: fecha(r.fecha_baja),
      activo: r.activo,
      convenio_id: convenioIds.has(r.convenio_id) ? r.convenio_id : null,
      categoria_id: categoriaIds.has(r.categoria_id) ? r.categoria_id : null,
      categoria_texto: r.categoria,
      tarea: r.tarea,
      tipo_jornada: r.tipo_jornada,
      horas_mensuales_normales: r.horas_mensuales_normales ?? 0,
      dias_mensuales_normales: r.dias_mensuales_normales ?? 0,
      valor_hora: r.valor_hora,
      valor_sueldo: r.valor_sueldo,
      obra_social_id: r.obra_social_id,
      conyuge: r.conyuge ?? 0,
      hijos: r.hijos ?? 0,
      forma_pago: r.forma_pago ?? null,
      banco: r.banco,
      cbu: r.cbu,
      situacion_id: r.situacion_id,
      condicion_id: r.condicion_id,
      actividad_id: r.actividad_id,
      modalidad_contratacion_id: r.modalidad_contratacion_id,
      siniestrado_id: r.siniestrado_id,
      zona_id: r.zona_id,
      observaciones: r.observaciones,
      fuente: "import",
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  })
);
if (zonaSinMapear.size > 0)
  aviso(
    `zona sin resolver en ${empleados.filter((r) => !r.zona_id).length} empleados: codigo_zona SOS ${[...zonaSinMapear].join(", ")} no tiene equivalencia en el catálogo AFIP`
  );
const empleadoIds = new Set(empleados.map((r) => r.id as string));
const clienteDeEmpleado = new Map<string, string>(empleados.map((r) => [r.id, r.client_id]));

// ---------- 7. recibos ----------
console.log("→ recibos...");
const RECIBO_TIPO: Record<string, string> = {
  sueldo: "mensual",
  mensual: "mensual",
  quincenal: "quincenal",
  sac: "sac",
  "liq. final": "liquidacion_final",
  "liq.final": "liquidacion_final",
  "liquidacion final": "liquidacion_final",
  vacaciones: "vacaciones",
};
const RECIBO_FUENTE: Record<string, string> = { import: "import", generado: "calculo" };

const recibos = ((await src.unsafe(`select * from liquidacion_import_recibo`)) as unknown as Row[])
  .filter((r) => empleadoIds.has(r.empleado_id));
await insertChunked(
  "recibo",
  recibos.map((r) => {
    const tipo = RECIBO_TIPO[String(r.tipo).trim().toLowerCase()];
    if (!tipo) fail(`recibo ${r.id}: tipo no mapeado "${r.tipo}"`);
    const fuente = RECIBO_FUENTE[String(r.origen)];
    if (!fuente) fail(`recibo ${r.id}: origen no mapeado "${r.origen}"`);
    if (r.forma_pago && !FORMA_PAGO.has(r.forma_pago))
      fail(`recibo ${r.id}: forma_pago no mapeada "${r.forma_pago}"`);
    const clienteId = clienteDeEmpleado.get(r.empleado_id)!;
    const periodo = periodoDate(r.periodo);
    if (!periodo) fail(`recibo ${r.id}: periodo no parseable "${r.periodo}"`);
    return {
      id: r.id,
      org_id: orgDe(clienteId),
      cliente_id: clienteId,
      empleado_id: r.empleado_id,
      periodo,
      tipo,
      quincena: r.quincena === null ? 0 : Number(r.quincena),
      fecha: fecha(r.fecha),
      fecha_pago: fecha(r.fecha_pago),
      lugar_pago: r.lugar_pago,
      forma_pago: r.forma_pago ?? null,
      banco: r.banco,
      cbu: r.cbu,
      basico: r.basico,
      haberes: r.haberes ?? 0,
      no_remunerativo: r.no_remunerativo ?? 0,
      descuentos: r.descuentos ?? 0,
      retenciones: r.retenciones ?? 0,
      neto: r.neto ?? 0,
      obra_social_id: r.obra_social_id,
      periodo_cargas: periodoDate(r.periodo_cargas),
      fecha_deposito_cargas: fecha(r.fecha_deposito_cargas),
      situacion_revista_1_id: r.situacion_revista1_id,
      situacion_revista_1_dia_inicio: r.situacion_revista1_dia_inicio,
      situacion_revista_2_id: r.situacion_revista2_id,
      situacion_revista_2_dia_inicio: r.situacion_revista2_dia_inicio,
      situacion_revista_3_id: r.situacion_revista3_id,
      situacion_revista_3_dia_inicio: r.situacion_revista3_dia_inicio,
      dias_trabajados: r.dias_trabajados,
      horas_trabajadas: r.horas_trabajadas,
      importe_a_detraer_ley27430: r.importe_a_detraer_ley27430,
      importe_maternidad_art13: r.importe_maternidad_art13,
      contribucion_tarea_diferencial: r.contribucion_tarea_diferencial,
      contribucion_adicional_os: r.contribucion_adicional_os,
      remuneracion_4y8_override: r.rem4y8_override,
      remuneracion_9_override: r.rem9_override,
      observacion_recibo: r.observacion_recibo,
      observacion_interna: r.observacion_interna,
      confirmado: r.recibo_confirmado,
      calculado_at: r.calculado_at,
      fuente,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  })
);
const reciboIds = new Set(recibos.map((r) => r.id as string));

// ---------- 8. líneas del recibo ----------
console.log("→ recibo_concepto...");
const valores = ((await src.unsafe(`select * from liquidacion_import_concepto_valor`)) as unknown as Row[])
  .filter((r) => reciboIds.has(r.recibo_id));
// codigo es texto: primero número SOS, si no código AFIP de 6 dígitos (ej. "540000").
const lineas = new Map<string, Row>();
let sinConcepto = 0;
/** El campo guarda el número del concepto de referencia, pero 2 filas tienen un importe cargado ahí. */
const conceptoRef = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 620) {
    aviso(`importe_concepto_numero = ${n}: no es un número de concepto, se descarta`);
    return null;
  }
  return n;
};
for (const r of valores) {
  const cod = String(r.codigo);
  const conceptoId =
    conceptoIdPorNumero.get(Number(cod)) ??
    conceptoIdPorCodigoAfip.get(normalizarCodigoAfip(cod)) ??
    null;
  if (!conceptoId) {
    sinConcepto++;
    continue;
  }
  const k = `${r.recibo_id}|${conceptoId}|${r.memo ?? ""}`;
  if (lineas.has(k)) {
    aviso(`línea duplicada recibo ${r.recibo_id} concepto ${cod} memo ${r.memo ?? "—"}`);
    continue;
  }
  lineas.set(k, {
    id: r.id,
    recibo_id: r.recibo_id,
    concepto_id: conceptoId,
    tipo: r.tipo_liquidacion,
    monto: r.monto,
    cantidad: r.cantidad,
    porcentaje: r.porcentaje,
    importe: r.importe,
    importe_min: r.importe_minimo,
    importe_max: r.importe_maximo,
    concepto_ref: conceptoRef(r.importe_concepto_numero),
    memo: r.memo,
    pct_usado: r.pct_usado,
    base_usada: r.base_usada,
    activo: r.activo_en_recibo,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}
if (sinConcepto > 0) aviso(`${sinConcepto} líneas de recibo con código sin concepto en el catálogo`);
await insertChunked("recibo_concepto", [...lineas.values()]);

// ---------- 9. LSD y parámetros ----------
console.log("→ lsd_presentacion / parametro_periodo...");
await insertChunked(
  "lsd_presentacion",
  ((await src.unsafe(`select * from payroll_lsd_presentacion`)) as unknown as Row[])
    .filter((r) => clienteById.has(r.profile_id))
    .map((r) => ({
      id: r.id,
      org_id: orgDe(r.profile_id),
      cliente_id: r.profile_id,
      periodo: periodoDate(r.periodo),
      numero: r.nro_presentacion,
      filename: r.filename,
      empleados: r.empleados,
      conceptos: r.conceptos,
      contenido: r.contenido,
      generado_at: r.generado_en,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
);

await insertChunked(
  "parametro_periodo",
  ((await src.unsafe(`select * from payroll_parametros_periodo`)) as unknown as Row[]).map((r) => ({
    periodo: periodoDate(r.periodo),
    tope_maximo_imponible: r.tope_maximo_imponible,
    salario_minimo: r.salario_minimo,
    fuente: r.fuente,
    actualizado_por_cron: r.actualizado_por_cron,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);

// ---------- 10. verificación ----------
console.log("\n=== Verificación ===");
const tablas = [
  "situacion_revista", "condicion_trabajador", "modalidad_contratacion", "actividad", "zona",
  "provincia", "localidad", "nacionalidad", "siniestrado", "tipo_empresa", "obra_social",
  "concepto_afip", "base_calculo", "base_calculo_concepto", "concepto", "cliente_concepto",
  "cct", "convenio", "cliente_cct", "convenio_categoria", "escala_salarial", "convenio_fuente",
  "empleado", "recibo", "recibo_concepto", "lsd_presentacion", "parametro_periodo",
];
for (const t of tablas) {
  const [{ n }] = await dst.unsafe(`select count(*)::int n from "${t}"`);
  console.log(`  ${t.padEnd(26)} ${n}`);
}

const [dstDesc] = await dst.unsafe(
  `select count(*)::int n from recibo
   where abs((haberes + no_remunerativo - descuentos - retenciones) - neto) > 0.05`
);
const [srcDesc] = await src.unsafe(
  `select count(*)::int n from liquidacion_import_recibo
   where abs((haberes + no_remunerativo - descuentos - retenciones) - neto) > 0.05`
);
console.log(
  `\n  recibos con neto ≠ haberes+no_rem-desc-ret: ${dstDesc.n} (en origen: ${srcDesc.n})` +
    (dstDesc.n === srcDesc.n ? " ✓ preexistente" : " ⚠ el ETL cambió el descuadre")
);

const [conceptosSum] = await dst.unsafe(
  `select count(*)::int n from (
     select r.id from recibo r join recibo_concepto rc on rc.recibo_id = r.id
     group by r.id, r.haberes having abs(sum(rc.monto) filter (where rc.monto > 0)) = 0) x`
);
console.log(`  recibos sin ninguna línea con monto: ${conceptosSum.n}`);

if (avisos.length > 0) {
  console.log(`\n=== Avisos (${avisos.length}) ===`);
  for (const a of [...new Set(avisos)].slice(0, 30)) console.log("  •", a);
}

await src.end();
await dst.end();
console.log("\n✓ ETL Dominio 3 completo");
