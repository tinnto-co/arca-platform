/**
 * Script: completar-detalles-empleados.ts
 *
 * Completa campos NULL en liquidacion_import_empleado con los valores del Excel SOS.
 * NUNCA pisa un valor existente — solo rellena campos que están en null/undefined.
 *
 * Campos que actualiza (si están vacíos en la DB):
 *   Personales : sexo, fechaNacimiento, domicilio, localidad, codigoPostal,
 *                conyuge, hijos, adherentes, nacionalidad (texto + FK), provincia (texto + FK)
 *   Laborales  : categoria, tarea, horasMensualesNormales, valorHora, valorSueldo
 *   Catálogos  : modalidadContratacionId + codigoModalidadContratacion
 *                situacionId + codigoSituacion
 *                zonaId + codigoZona
 *                condicionId + codigoCondicion
 *                actividadId + codigoActividad
 *                siniestradoId + codigoSiniestrado
 *                obraSocialId
 *   Misc       : observaciones
 */

import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import {
  liquidacionImportEmpleado,
  client as clientTable,
  obraSocial,
  payrollModalidadContratacion,
  payrollSituacion,
  payrollZona,
  payrollCondicion,
  payrollActividad,
  payrollSiniestrado,
  payrollProvincia,
  payrollNacionalidad,
} from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').trim();
}

function parseExcelDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === 0 || val === "false" || val === false) return null;
  if (typeof val === "number" && val > 1) {
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  if (typeof val === "string" && val.trim()) {
    const parts = val.trim().split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
  }
  return null;
}

function normalizeCuil(val: unknown): string {
  return String(val ?? "").replace(/[-\s]/g, "");
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "").replace(/\s+/g, " ").trim();
}

// ─── Parseo de fila Excel (mismo layout que import-legajos-sos.ts) ────────────

interface ExcelRow {
  cuil: string;
  legajo: string;
  nacionalidad: string | null;
  fechaNacimiento: Date | null;
  conyuge: number;
  hijos: number | null;
  adherentes: number | null;
  sexo: string | null;
  domicilio: string | null;
  localidad: string | null;
  codigoPostal: string | null;
  provincia: string | null;
  fechaIngreso: Date | null;
  modalidadNombre: string | null;
  codModalidad: string;
  situacionNombre: string | null;
  codSituacion: string;
  categoria: string | null;
  zonaNombre: string | null;
  codZona: string;
  valorHora: string | null;
  valorSueldo: string | null;
  horasMensuales: number | null;
  tarea: string | null;
  condicionNombre: string | null;
  codCondicion: string;
  obraSocialNombre: string | null;
  codObraSocial: string;
  actividadNombre: string | null;
  codActividad: string;
  siniestradoNombre: string | null;
  codSiniestrado: string;
  observaciones: string | null;
}

function parseRow(row: unknown[]): ExcelRow | null {
  if (!row[0] || !row[2]) return null;
  const cuil = normalizeCuil(row[2]);
  if (cuil.length !== 11) return null;

  const conyuge = (() => {
    const v = row[6];
    if (v === "true" || v === true || v === 1) return 1;
    return 0;
  })();

  return {
    cuil,
    legajo: String(row[1] ?? ""),
    nacionalidad: row[4] ? decodeHtml(String(row[4])) : null,
    fechaNacimiento: parseExcelDate(row[5]),
    conyuge,
    hijos: row[7] != null ? Number(row[7]) : null,
    adherentes: row[8] != null ? Number(row[8]) : null,
    sexo: row[9] ? String(row[9]) : null,
    domicilio: row[10] ? decodeHtml(String(row[10])) : null,
    localidad: row[11] ? decodeHtml(String(row[11])) : null,
    codigoPostal: row[12] ? String(row[12]) : null,
    provincia: row[13] ? decodeHtml(String(row[13])) : null,
    fechaIngreso: parseExcelDate(row[14]),
    modalidadNombre: row[15] ? decodeHtml(String(row[15])) : null,
    codModalidad: String(row[16] ?? ""),
    situacionNombre: row[17] ? decodeHtml(String(row[17])) : null,
    codSituacion: String(row[18] ?? ""),
    categoria: row[19] ? decodeHtml(String(row[19])) : null,
    zonaNombre: row[20] ? decodeHtml(String(row[20])) : null,
    codZona: String(row[21] ?? ""),
    valorHora: row[22] != null ? String(row[22]) : null,
    valorSueldo: row[23] != null ? String(row[23]) : null,
    horasMensuales: row[24] != null ? Number(row[24]) : null,
    tarea: row[25] ? decodeHtml(String(row[25])) : null,
    condicionNombre: row[26] ? decodeHtml(String(row[26])) : null,
    codCondicion: String(row[27] ?? ""),
    obraSocialNombre: row[28] ? decodeHtml(String(row[28])) : null,
    codObraSocial: String(row[29] ?? ""),
    actividadNombre: row[30] ? decodeHtml(String(row[30])) : null,
    codActividad: String(row[31] ?? ""),
    siniestradoNombre: row[32] ? decodeHtml(String(row[32])) : null,
    codSiniestrado: String(row[33] ?? ""),
    observaciones: row[35] ? decodeHtml(String(row[35])) : null,
  };
}

const BASE_DIR = "C:/Users/Brian/Downloads/SOS_empresas_legajos";

function readEmpresaExcel(carpeta: string): Map<string, ExcelRow> {
  const dir = join(BASE_DIR, carpeta);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".xls") || f.endsWith(".xlsx"));
  } catch {
    return new Map();
  }
  const result = new Map<string, ExcelRow>();
  for (const file of files) {
    const wb = XLSX.read(readFileSync(join(dir, file)));
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    for (let i = 2; i < data.length; i++) {
      const parsed = parseRow(data[i]);
      if (parsed) result.set(parsed.cuil, parsed);
    }
  }
  return result;
}

// ─── Lista completa de empresas (misma que import-legajos-sos.ts) ─────────────

const empresas = [
  { carpeta: "Admip SRL",                  cuit: "30707920056" },
  { carpeta: "Artzeinu x2 S.A.",           cuit: "30719153255" },
  { carpeta: "Avz S.R.L.",                 cuit: "30718726340" },
  { carpeta: "Berns Sebastian Matias",     cuit: "20259968012" },
  { carpeta: "Besorot Tovot S.A.",         cuit: "30719305535" },
  { carpeta: "Brique Construcciones S.R.", cuit: "30715944029" },
  { carpeta: "Carballo Fabian Alberto",    cuit: "20180955454" },
  { carpeta: "Carniceria Brothers x2 S.a", cuit: "33717904309" },
  { carpeta: "Casvin, Cristian Andres",    cuit: "20349758610" },
  { carpeta: "Chirin",                     cuit: "30718161394" },
  { carpeta: "Diaz Miguens Fernando Este", cuit: "20235093287" },
  { carpeta: "E-presis S.A.",              cuit: "30717554864" },
  { carpeta: "Flor de Azar S.A.",          cuit: "33719196239" },
  { carpeta: "Gastrotecno S.A.",           cuit: "30718074785" },
  { carpeta: "Gb Bazar SA",                cuit: "30716206404" },
  { carpeta: "Gb Metal SA",                cuit: "30716135124" },
  { carpeta: "Green Safety",               cuit: "30718394682" },
  { carpeta: "Hdx Grupo",                  cuit: "33718970089" },
  { carpeta: "Hernan Joaquin",             cuit: "20249628116" },
  { carpeta: "Hexacom SA",                 cuit: "30643202812" },
  { carpeta: "Iriarte, Joaquin Ramon",     cuit: "23251342199" },
  { carpeta: "J Ame Poderosa SA",          cuit: "30717679845" },
  { carpeta: "Kasur Lipat",                cuit: "30719184835" },
  { carpeta: "Khiro S.A.",                 cuit: "30717680568" },
  { carpeta: "Master Kids S.A.",           cuit: "30718524551" },
  { carpeta: "Max Buddy SA",               cuit: "30717605663" },
  { carpeta: "Maximov, Mabel Amelia",      cuit: "27175689937" },
  { carpeta: "Maximvs S.r.l",              cuit: "30718958934" },
  { carpeta: "Mazal Dream SA",             cuit: "30718323386" },
  { carpeta: "Messenger & Consulting SA",  cuit: "30717548767" },
  { carpeta: "Metagame S.A.",              cuit: "30718374142" },
  { carpeta: "Momel S.r.l",               cuit: "30714871087" },
  { carpeta: "Mr Almohada Factory S.A.",   cuit: "33718009419" },
  { carpeta: "Mr Factory Couch SA",        cuit: "30717679136" },
  { carpeta: "Ngvs",                       cuit: "30717786986" },
  { carpeta: "Pahue Technologies SA",      cuit: "30719105056" },
  { carpeta: "Pnr Trade S.A.",             cuit: "30718922565" },
  { carpeta: "Rojot S.A.",                 cuit: "30716753251" },
  { carpeta: "Sabenumitubeja S.A.",        cuit: "30718310519" },
  { carpeta: "Salem, Jose Edgardo",        cuit: "20127571083" },
  { carpeta: "Selem David Javier",         cuit: "20231269879" },
  { carpeta: "Semeca Ingenieria SRL",      cuit: "30715433490" },
  { carpeta: "Sigana S.A.",                cuit: "30718149874" },
  { carpeta: "Smart Solution SRL",         cuit: "30714871508" },
  { carpeta: "Tarrab, Jacobo Leandro",     cuit: "20308861210" },
  { carpeta: "Termomecanica Valtri S.a",   cuit: "30716025752" },
  { carpeta: "Toloki",                     cuit: "30716787407" },
  { carpeta: "Ureshi Group S.A.",          cuit: "33718399799" },
  { carpeta: "Zahrah S.A.",                cuit: "30718084209" },
];

// ─── Carga de catálogos ───────────────────────────────────────────────────────

console.log("Cargando catálogos...");

interface CatalogEntry { id: string; codigo: string; nombre: string }

async function loadCatalog(table: typeof payrollModalidadContratacion): Promise<CatalogEntry[]> {
  // @ts-expect-error generic drizzle call
  return db.select({ id: table.id, codigo: table.codigo, nombre: table.nombre }).from(table);
}

const [
  modalidadesRaw, situacionesRaw, zonasRaw, condicionesRaw,
  actividadesRaw, siniestradosRaw, provinciasRaw, nacionalidadesRaw, obraSocialesRaw,
] = await Promise.all([
  loadCatalog(payrollModalidadContratacion),
  loadCatalog(payrollSituacion),
  loadCatalog(payrollZona),
  loadCatalog(payrollCondicion),
  loadCatalog(payrollActividad),
  loadCatalog(payrollSiniestrado),
  loadCatalog(payrollProvincia),
  loadCatalog(payrollNacionalidad),
  db.select({ id: obraSocial.id, codigo: obraSocial.codigo, nombre: obraSocial.nombre }).from(obraSocial),
]);

// Modalidad, zona, actividad: por codigo directo (con y sin ceros leading)
function buildCodigoMap(entries: CatalogEntry[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) {
    if (!e.codigo) continue;
    m.set(e.codigo, e.id);
    m.set(String(parseInt(e.codigo, 10)), e.id);
  }
  return m;
}

const modalidadByCode  = buildCodigoMap(modalidadesRaw);
const zonaByCode       = buildCodigoMap(zonasRaw);
const actividadByCode  = buildCodigoMap(actividadesRaw);

// Situación, condición, siniestrado: por nombre normalizado (no tienen código en el Excel)
const situacionByNombre  = new Map(situacionesRaw.map(e => [normalizeText(e.nombre), e.id]));
const condicionByNombre  = new Map(condicionesRaw.map(e => [normalizeText(e.nombre), e.id]));
const siniestradoByNombre = new Map(siniestradosRaw.map(e => [normalizeText(e.nombre), e.id]));

// Obra social: por codigo exacto o sin ceros leading
const obraSocialByCodigo = new Map<string, string>();
for (const e of obraSocialesRaw) {
  obraSocialByCodigo.set(e.codigo, e.id);
  obraSocialByCodigo.set(String(parseInt(e.codigo, 10)), e.id);
}

// Provincia y nacionalidad: por nombre normalizado
const provinciaByNombre    = new Map(provinciasRaw.map(e => [normalizeText(e.nombre), e.id]));
const nacionalidadByNombre = new Map(nacionalidadesRaw.map(e => [normalizeText(e.nombre), e.id]));

function findByCode(map: Map<string, string>, code: string | null): string | null {
  if (!code) return null;
  return map.get(code) ?? map.get(String(parseInt(code, 10))) ?? null;
}

// ─── Carga de clientes ────────────────────────────────────────────────────────

const allCuits = empresas.map(e => e.cuit);
const clientsDb = await db
  .select({ id: clientTable.id, cuit: clientTable.identityNumber })
  .from(clientTable)
  .where(inArray(clientTable.identityNumber, allCuits));
const clientIdByCuit = new Map(clientsDb.map(c => [c.cuit, c.id]));

// ─── Stats y tracking ─────────────────────────────────────────────────────────

const stats: Record<string, number> = {
  sexo: 0, fechaNacimiento: 0, domicilio: 0, localidad: 0, codigoPostal: 0,
  conyuge: 0, hijos: 0, adherentes: 0,
  provincia: 0, provinciaId: 0, nacionalidad: 0, nacionalidadId: 0,
  categoria: 0, tarea: 0, horasMensualesNormales: 0, valorHora: 0, valorSueldo: 0,
  modalidadContratacionId: 0, codigoModalidadContratacion: 0,
  situacionId: 0, codigoSituacion: 0,
  zonaId: 0, codigoZona: 0,
  condicionId: 0, codigoCondicion: 0,
  actividadId: 0, codigoActividad: 0,
  siniestradoId: 0, codigoSiniestrado: 0,
  obraSocialId: 0, observaciones: 0,
};

let totalActualizados = 0;

// Registrar valores sin match en catálogo para diagnóstico
const sinMatchModalidad  = new Set<string>();
const sinMatchSituacion  = new Set<string>();
const sinMatchZona       = new Set<string>();
const sinMatchCondicion  = new Set<string>();
const sinMatchActividad  = new Set<string>();
const sinMatchSiniestrado = new Set<string>();
const sinMatchObraSocial = new Set<string>();
const sinMatchProvincia  = new Set<string>();
const sinMatchNacionalidad = new Set<string>();

// ─── Procesamiento ────────────────────────────────────────────────────────────

for (const empresa of empresas) {
  const clientId = clientIdByCuit.get(empresa.cuit);
  if (!clientId) {
    console.log(`  ⚠ Sin cliente en DB: ${empresa.carpeta} (${empresa.cuit})`);
    continue;
  }

  const excelRows = readEmpresaExcel(empresa.carpeta);
  if (excelRows.size === 0) {
    console.log(`  - Sin Excel: ${empresa.carpeta}`);
    continue;
  }

  const dbEmpleados = await db
    .select({
      id:                          liquidacionImportEmpleado.id,
      cuil:                        liquidacionImportEmpleado.cuil,
      sexo:                        liquidacionImportEmpleado.sexo,
      fechaNacimiento:             liquidacionImportEmpleado.fechaNacimiento,
      domicilio:                   liquidacionImportEmpleado.domicilio,
      localidad:                   liquidacionImportEmpleado.localidad,
      codigoPostal:                liquidacionImportEmpleado.codigoPostal,
      conyuge:                     liquidacionImportEmpleado.conyuge,
      hijos:                       liquidacionImportEmpleado.hijos,
      adherentes:                  liquidacionImportEmpleado.adherentes,
      provincia:                   liquidacionImportEmpleado.provincia,
      provinciaId:                 liquidacionImportEmpleado.provinciaId,
      nacionalidad:                liquidacionImportEmpleado.nacionalidad,
      nacionalidadId:              liquidacionImportEmpleado.nacionalidadId,
      categoria:                   liquidacionImportEmpleado.categoria,
      tarea:                       liquidacionImportEmpleado.tarea,
      horasMensualesNormales:      liquidacionImportEmpleado.horasMensualesNormales,
      valorHora:                   liquidacionImportEmpleado.valorHora,
      valorSueldo:                 liquidacionImportEmpleado.valorSueldo,
      modalidadContratacionId:     liquidacionImportEmpleado.modalidadContratacionId,
      codigoModalidadContratacion: liquidacionImportEmpleado.codigoModalidadContratacion,
      situacionId:                 liquidacionImportEmpleado.situacionId,
      codigoSituacion:             liquidacionImportEmpleado.codigoSituacion,
      zonaId:                      liquidacionImportEmpleado.zonaId,
      codigoZona:                  liquidacionImportEmpleado.codigoZona,
      condicionId:                 liquidacionImportEmpleado.condicionId,
      codigoCondicion:             liquidacionImportEmpleado.codigoCondicion,
      actividadId:                 liquidacionImportEmpleado.actividadId,
      codigoActividad:             liquidacionImportEmpleado.codigoActividad,
      siniestradoId:               liquidacionImportEmpleado.siniestradoId,
      codigoSiniestrado:           liquidacionImportEmpleado.codigoSiniestrado,
      obraSocialId:                liquidacionImportEmpleado.obraSocialId,
      observaciones:               liquidacionImportEmpleado.observaciones,
    })
    .from(liquidacionImportEmpleado)
    .where(eq(liquidacionImportEmpleado.clientId, clientId));

  let actualizadosEmpresa = 0;

  for (const db_emp of dbEmpleados) {
    const xls = excelRows.get(db_emp.cuil);
    if (!xls) continue;

    const patch: Partial<typeof liquidacionImportEmpleado.$inferInsert> = {};

    // ── Datos personales ──
    if (db_emp.sexo == null && xls.sexo) {
      patch.sexo = xls.sexo; stats.sexo++;
    }
    if (db_emp.fechaNacimiento == null && xls.fechaNacimiento) {
      patch.fechaNacimiento = xls.fechaNacimiento; stats.fechaNacimiento++;
    }
    if (db_emp.domicilio == null && xls.domicilio) {
      patch.domicilio = xls.domicilio; stats.domicilio++;
    }
    if (db_emp.localidad == null && xls.localidad) {
      patch.localidad = xls.localidad; stats.localidad++;
    }
    if (db_emp.codigoPostal == null && xls.codigoPostal) {
      patch.codigoPostal = xls.codigoPostal; stats.codigoPostal++;
    }
    // conyuge: 0 es valor válido, solo parchear si es null
    if (db_emp.conyuge == null) {
      patch.conyuge = xls.conyuge; stats.conyuge++;
    }
    if (db_emp.hijos == null && xls.hijos != null) {
      patch.hijos = xls.hijos; stats.hijos++;
    }
    if (db_emp.adherentes == null && xls.adherentes != null) {
      patch.adherentes = xls.adherentes; stats.adherentes++;
    }

    // ── Provincia ──
    if (db_emp.provincia == null && xls.provincia) {
      patch.provincia = xls.provincia; stats.provincia++;
    }
    if (db_emp.provinciaId == null && xls.provincia) {
      const id = provinciaByNombre.get(normalizeText(xls.provincia));
      if (id) { patch.provinciaId = id; stats.provinciaId++; }
      else sinMatchProvincia.add(xls.provincia);
    }

    // ── Nacionalidad ──
    if (db_emp.nacionalidad == null && xls.nacionalidad) {
      patch.nacionalidad = xls.nacionalidad; stats.nacionalidad++;
    }
    if (db_emp.nacionalidadId == null && xls.nacionalidad) {
      const id = nacionalidadByNombre.get(normalizeText(xls.nacionalidad));
      if (id) { patch.nacionalidadId = id; stats.nacionalidadId++; }
      else sinMatchNacionalidad.add(xls.nacionalidad);
    }

    // ── Laborales ──
    if (db_emp.categoria == null && xls.categoria && xls.categoria !== "Sin Categoria") {
      patch.categoria = xls.categoria; stats.categoria++;
    }
    if (db_emp.tarea == null && xls.tarea) {
      patch.tarea = xls.tarea; stats.tarea++;
    }
    if (db_emp.horasMensualesNormales == null && xls.horasMensuales != null && xls.horasMensuales > 0) {
      patch.horasMensualesNormales = xls.horasMensuales; stats.horasMensualesNormales++;
    }
    if (db_emp.valorHora == null && xls.valorHora && xls.valorHora !== "0") {
      patch.valorHora = xls.valorHora; stats.valorHora++;
    }
    if (db_emp.valorSueldo == null && xls.valorSueldo && xls.valorSueldo !== "0") {
      patch.valorSueldo = xls.valorSueldo; stats.valorSueldo++;
    }

    // ── Modalidad de contratación ──
    if (db_emp.codigoModalidadContratacion == null && xls.codModalidad) {
      patch.codigoModalidadContratacion = xls.codModalidad; stats.codigoModalidadContratacion++;
    }
    if (db_emp.modalidadContratacionId == null && xls.codModalidad) {
      const id = findByCode(modalidadByCode, xls.codModalidad);
      if (id) { patch.modalidadContratacionId = id; stats.modalidadContratacionId++; }
      else sinMatchModalidad.add(`cod=${xls.codModalidad} nombre="${xls.modalidadNombre}"`);
    }

    // ── Situación ──
    if (db_emp.codigoSituacion == null && xls.codSituacion) {
      patch.codigoSituacion = xls.codSituacion; stats.codigoSituacion++;
    }
    if (db_emp.situacionId == null && xls.situacionNombre) {
      const id = situacionByNombre.get(normalizeText(xls.situacionNombre));
      if (id) { patch.situacionId = id; stats.situacionId++; }
      else sinMatchSituacion.add(xls.situacionNombre);
    }

    // ── Zona ──
    if (db_emp.codigoZona == null && xls.codZona) {
      patch.codigoZona = xls.codZona; stats.codigoZona++;
    }
    if (db_emp.zonaId == null && xls.codZona) {
      const id = findByCode(zonaByCode, xls.codZona);
      if (id) { patch.zonaId = id; stats.zonaId++; }
      else sinMatchZona.add(`cod=${xls.codZona} nombre="${xls.zonaNombre}"`);
    }

    // ── Condición ──
    if (db_emp.codigoCondicion == null && xls.codCondicion) {
      patch.codigoCondicion = xls.codCondicion; stats.codigoCondicion++;
    }
    if (db_emp.condicionId == null && xls.condicionNombre) {
      const id = condicionByNombre.get(normalizeText(xls.condicionNombre));
      if (id) { patch.condicionId = id; stats.condicionId++; }
      else sinMatchCondicion.add(xls.condicionNombre);
    }

    // ── Actividad ──
    if (db_emp.codigoActividad == null && xls.codActividad) {
      patch.codigoActividad = xls.codActividad; stats.codigoActividad++;
    }
    if (db_emp.actividadId == null && xls.codActividad) {
      const id = findByCode(actividadByCode, xls.codActividad);
      if (id) { patch.actividadId = id; stats.actividadId++; }
      else sinMatchActividad.add(`cod=${xls.codActividad} nombre="${xls.actividadNombre}"`);
    }

    // ── Siniestrado ──
    if (db_emp.codigoSiniestrado == null && xls.codSiniestrado) {
      patch.codigoSiniestrado = xls.codSiniestrado; stats.codigoSiniestrado++;
    }
    if (db_emp.siniestradoId == null && xls.siniestradoNombre) {
      const id = siniestradoByNombre.get(normalizeText(xls.siniestradoNombre));
      if (id) { patch.siniestradoId = id; stats.siniestradoId++; }
      else sinMatchSiniestrado.add(xls.siniestradoNombre);
    }

    // ── Obra social ──
    if (db_emp.obraSocialId == null && xls.codObraSocial && xls.codObraSocial !== "0") {
      const id = obraSocialByCodigo.get(xls.codObraSocial)
        ?? obraSocialByCodigo.get(String(parseInt(xls.codObraSocial, 10)));
      if (id) { patch.obraSocialId = id; stats.obraSocialId++; }
      else sinMatchObraSocial.add(`cod=${xls.codObraSocial} nombre="${xls.obraSocialNombre}"`);
    }

    // ── Observaciones ──
    if (db_emp.observaciones == null && xls.observaciones) {
      patch.observaciones = xls.observaciones; stats.observaciones++;
    }

    if (Object.keys(patch).length > 0) {
      await db
        .update(liquidacionImportEmpleado)
        .set(patch)
        .where(eq(liquidacionImportEmpleado.id, db_emp.id));
      actualizadosEmpresa++;
      totalActualizados++;
    }
  }

  console.log(`  ✓ ${empresa.carpeta}: ${actualizadosEmpresa} empleados actualizados (${dbEmpleados.length} en DB, ${excelRows.size} en Excel)`);
}

// ─── Reporte final ────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log("   RESUMEN DE ACTUALIZACIONES");
console.log("=".repeat(70));
console.log(`  Empleados con al menos 1 campo completado: ${totalActualizados}\n`);

const grupos = [
  { titulo: "Datos personales", campos: ["sexo", "fechaNacimiento", "domicilio", "localidad", "codigoPostal", "conyuge", "hijos", "adherentes"] },
  { titulo: "Ubicación",        campos: ["provincia", "provinciaId", "nacionalidad", "nacionalidadId"] },
  { titulo: "Laborales",        campos: ["categoria", "tarea", "horasMensualesNormales", "valorHora", "valorSueldo"] },
  { titulo: "Modalidad",        campos: ["modalidadContratacionId", "codigoModalidadContratacion"] },
  { titulo: "Situación",        campos: ["situacionId", "codigoSituacion"] },
  { titulo: "Zona",             campos: ["zonaId", "codigoZona"] },
  { titulo: "Condición",        campos: ["condicionId", "codigoCondicion"] },
  { titulo: "Actividad",        campos: ["actividadId", "codigoActividad"] },
  { titulo: "Siniestrado",      campos: ["siniestradoId", "codigoSiniestrado"] },
  { titulo: "Obra social",      campos: ["obraSocialId"] },
  { titulo: "Misc",             campos: ["observaciones"] },
];

for (const grupo of grupos) {
  const lineas = grupo.campos.filter(c => stats[c] > 0).map(c => `    ${c.padEnd(30)}: ${stats[c]}`);
  if (lineas.length > 0) {
    console.log(`  ${grupo.titulo}:`);
    lineas.forEach(l => console.log(l));
    console.log("");
  }
}

const sinMatch = [
  { label: "Modalidad",   set: sinMatchModalidad },
  { label: "Situación",   set: sinMatchSituacion },
  { label: "Zona",        set: sinMatchZona },
  { label: "Condición",   set: sinMatchCondicion },
  { label: "Actividad",   set: sinMatchActividad },
  { label: "Siniestrado", set: sinMatchSiniestrado },
  { label: "Obra social", set: sinMatchObraSocial },
  { label: "Provincia",   set: sinMatchProvincia },
  { label: "Nacionalidad",set: sinMatchNacionalidad },
];

const hayMismatches = sinMatch.some(s => s.set.size > 0);
if (hayMismatches) {
  console.log("=".repeat(70));
  console.log("  VALORES SIN MATCH EN CATÁLOGO (revisar manualmente)");
  console.log("=".repeat(70));
  for (const { label, set } of sinMatch) {
    if (set.size > 0) {
      console.log(`\n  ${label}:`);
      for (const v of set) console.log(`    - "${v}"`);
    }
  }
}

console.log("\n" + "=".repeat(70));
process.exit(0);
