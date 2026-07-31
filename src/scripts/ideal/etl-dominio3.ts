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
console.log("→ Truncando destino...");
await dst.unsafe(`truncate table
  recibo_concepto, recibo, empleado, lsd_presentacion, parametro_periodo,
  cliente_concepto, concepto, concepto_afip,
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
const conceptosAfip = (await src.unsafe(`select * from lsd_concepto_afip`)) as unknown as Row[];
await insertChunked(
  "concepto_afip",
  conceptosAfip.map((r) => ({
    id: r.id,
    codigo: r.codigo_afip,
    descripcion: r.descripcion,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
);
const afipIdPorCodigo = new Map<string, string>(
  conceptosAfip.map((r) => [r.codigo_afip as string, r.id as string])
);

const BASE_COLUMNA = new Set([
  "valHora", "sueldoLegajo", "sueldo", "importe_fijo", "ref_concepto",
  "sub1_9", "sub1_19", "sub1_26", "sub1_39", "sub1_199",
  "sub411_469", "sub1_199_plus_411_469", "sub411_414_qty",
  "os_base", "os_norem_base", "sac_normal", "sac_proporcional",
  "bruto_anterior_div25", "concepto_401_div12",
]);

const conceptosSos = (await src.unsafe(`select * from conceptos_completos_sos`)) as unknown as Row[];
// El catálogo global referencia códigos AFIP que lsd_concepto_afip no siempre tiene: se crean.
const afipFaltantes = new Map<string, Row>();
for (const c of conceptosSos) {
  const cod = c.codigo_afip as string;
  if (!afipIdPorCodigo.has(cod) && !afipFaltantes.has(cod)) {
    afipFaltantes.set(cod, { codigo: cod, descripcion: c.nombre });
  }
}
if (afipFaltantes.size > 0) {
  const insertados = await dst`
    insert into concepto_afip ${dst([...afipFaltantes.values()], "codigo", "descripcion")}
    returning id, codigo`;
  for (const r of insertados) afipIdPorCodigo.set(r.codigo, r.id);
  aviso(`${afipFaltantes.size} códigos AFIP creados desde conceptos_completos_sos (no estaban en lsd_concepto_afip)`);
}

await insertChunked(
  "concepto",
  conceptosSos.map((c) => {
    if (!BASE_COLUMNA.has(c.base_columna))
      fail(`concepto ${c.numero_sos}: base_columna no mapeada "${c.base_columna}"`);
    return {
      id: c.id,
      numero: c.numero_sos,
      nombre: c.nombre,
      codigo_afip: c.codigo_afip,
      base_columna: c.base_columna,
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
const conceptoIdPorCodigoAfip = new Map<string, string>();
for (const c of conceptosSos) {
  if (!conceptoIdPorCodigoAfip.has(c.codigo_afip)) conceptoIdPorCodigoAfip.set(c.codigo_afip, c.id);
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
  if (!BASE_COLUMNA.has(r.base_columna))
    fail(`payroll_concepto ${r.id}: base_columna no mapeada "${r.base_columna}"`);
  for (const clienteId of destinos) {
    Object.assign(base(clienteId, conceptoId), {
      habilitado: r.activo,
      codigo_propio: r.codigo,
      nombre_propio: r.nombre,
      tipo: r.tipo,
      base_calculo: r.base_calculo,
      base_columna: r.base_columna,
      formula: r.formula,
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
const afipCodigoPorId = new Map<string, string>(
  conceptosAfip.map((r) => [r.id as string, r.codigo_afip as string])
);
let perfilSinConcepto = 0;
for (const r of (await src.unsafe(`select * from lsd_perfil_concepto`)) as unknown as Row[]) {
  if (!clienteById.has(r.client_id)) continue;
  const cod = String(r.codigo_contribuyente);
  let conceptoId = /^\d+$/.test(cod) ? conceptoIdPorNumero.get(Number(cod)) : undefined;
  if (!conceptoId) {
    // El código del contribuyente no es un número SOS: se cae al concepto AFIP declarado.
    const codAfip = afipCodigoPorId.get(r.concepto_afip_id);
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
    concepto_afip_id: r.concepto_afip_id,
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
    base_calculo: r.base_calculo ?? null,
    base_columna: r.base_columna ?? null,
    formula: r.formula ?? null,
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
    conceptoIdPorNumero.get(Number(cod)) ?? conceptoIdPorCodigoAfip.get(cod) ?? null;
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
  "concepto_afip", "concepto", "cliente_concepto",
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
