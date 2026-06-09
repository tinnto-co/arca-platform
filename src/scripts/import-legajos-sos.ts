/**
 * Script: import-legajos-sos.ts
 *
 * Lee los archivos Excel del RAR SOS_empresas_legajos, verifica qué empresas
 * y empleados están en el sistema, e inserta los faltantes.
 *
 * Genera un reporte completo al finalizar.
 */

import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import {
  client,
  liquidacionImportEmpleado,
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
import { inArray, eq, and } from "drizzle-orm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function decodeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Convierte fecha de celda Excel a Date UTC (sin hora).
 * SOS Contador exporta en formato US (m/d/yy) aunque el usuario cargó DD/MM/AAAA.
 * Usamos cellDates:true al leer y luego intercambiamos mes y día.
 * Ej: serial → "2023-01-05" (US mes=1, día=5) → swap → 01/05/2023 = 1 de mayo ✓
 */
function parseExcelDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === 0 || val === "false" || val === false) return null;
  // Con cellDates:true, XLSX devuelve Date objects
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const [y, usM, usD] = val.toISOString().slice(0, 10).split('-').map(Number);
    // usM = "mes" US = DÍA argentino; usD = "día" US = MES argentino
    const argDay = usM;
    const argMonth = usD;
    if (argMonth >= 1 && argMonth <= 12) {
      return new Date(Date.UTC(y, argMonth - 1, argDay));
    }
    // Si el "día" US > 12, el mes resultante sería inválido: usar sin swap
    return new Date(Date.UTC(y, usM - 1, usD));
  }
  if (typeof val === "number" && val > 1) {
    const serial = Math.floor(val);
    return new Date((serial - 25569) * 86400 * 1000);
  }
  if (typeof val === "string" && val.trim()) {
    const parts = val.trim().split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      if (d && m && y) return new Date(Date.UTC(y, m - 1, d));
    }
  }
  return null;
}

function normalizeCuil(val: unknown): string {
  const s = String(val ?? "").replace(/[-\s]/g, "");
  return s;
}

function normalizeCuit(raw: string): string {
  return raw.replace(/[-\s]/g, "");
}

/** Extrae el número SOS al inicio del nombre de un catálogo: "8 - A Tiempo..." → "8" */
function extractLeadingCode(nombre: string): string | null {
  const m = nombre.match(/^(\d+)\s*-/);
  return m ? m[1] : null;
}

/** Normaliza texto para comparación fuzzy: minúsculas, sin tildes, sin puntuación */
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Definición de empresas del RAR ────────────────────────────────────────

const BASE_DIR = "C:/Users/Brian/Downloads/SOS_empresas_legajos";

interface EmpresaRar {
  carpeta: string;
  nombreSos: string;
  cuit: string;
}

const empresasRar: EmpresaRar[] = [
  { carpeta: "Admip SRL",                 nombreSos: "Admip SRL",                 cuit: "30707920056" },
  { carpeta: "Artzeinu x2 S.A.",          nombreSos: "Artzeinu x2 S.A.",          cuit: "30719153255" },
  { carpeta: "Avz S.R.L.",                nombreSos: "Avz S.R.L.",                cuit: "30718726340" },
  { carpeta: "Berns Sebastian Matias",    nombreSos: "Berns Sebastian Matias",    cuit: "20259968012" },
  { carpeta: "Besorot Tovot S.A.",        nombreSos: "Besorot Tovot S.A.",        cuit: "30719305535" },
  { carpeta: "Brique Construcciones S.R.",nombreSos: "Brique Construcciones S.R.",cuit: "30715944029" },
  { carpeta: "Carballo Fabian Alberto",   nombreSos: "Carballo Fabian Alberto",   cuit: "20180955454" },
  { carpeta: "Carniceria Brothers x2 S.a",nombreSos: "Carniceria Brothers x2 S.a",cuit: "33717904309" },
  { carpeta: "Casvin, Cristian Andres",   nombreSos: "Casvin, Cristian Andres",   cuit: "20349758610" },
  { carpeta: "Chirin",                    nombreSos: "Chirin",                    cuit: "30718161394" },
  { carpeta: "Diaz Miguens Fernando Este",nombreSos: "Diaz Miguens Fernando Este",cuit: "20235093287" },
  { carpeta: "E-presis S.A.",             nombreSos: "E-presis S.A.",             cuit: "30717554864" },
  { carpeta: "Flor de Azar S.A.",         nombreSos: "Flor de Azar S.A.",         cuit: "33719196239" },
  { carpeta: "Gastrotecno S.A.",          nombreSos: "Gastrotecno S.A.",          cuit: "30718074785" },
  { carpeta: "Gb Bazar SA",               nombreSos: "Gb Bazar SA",               cuit: "30716206404" },
  { carpeta: "Gb Metal SA",               nombreSos: "Gb Metal SA",               cuit: "30716135124" },
  { carpeta: "Green Safety",              nombreSos: "Green Safety",              cuit: "30718394682" },
  { carpeta: "Hdx Grupo",                 nombreSos: "Hdx Grupo",                 cuit: "33718970089" },
  { carpeta: "Hernan Joaquin",            nombreSos: "Hernan Joaquin",            cuit: "20249628116" },
  { carpeta: "Hexacom SA",                nombreSos: "Hexacom SA",                cuit: "30643202812" },
  { carpeta: "Iriarte, Joaquin Ramon",    nombreSos: "Iriarte, Joaquin Ramon",    cuit: "23251342199" },
  { carpeta: "J Ame Poderosa SA",         nombreSos: "J Ame Poderosa SA",         cuit: "30717679845" },
  { carpeta: "Kasur Lipat",               nombreSos: "Kasur Lipat",               cuit: "30719184835" },
  { carpeta: "Khiro S.A.",                nombreSos: "Khiro S.A.",                cuit: "30717680568" },
  { carpeta: "Master Kids S.A.",          nombreSos: "Master Kids S.A.",          cuit: "30718524551" },
  { carpeta: "Max Buddy SA",              nombreSos: "Max Buddy SA",              cuit: "30717605663" },
  { carpeta: "Maximov, Mabel Amelia",     nombreSos: "Maximov, Mabel Amelia",     cuit: "27175689937" },
  { carpeta: "Maximvs S.r.l",             nombreSos: "Maximvs S.r.l",             cuit: "30718958934" },
  { carpeta: "Mazal Dream SA",            nombreSos: "Mazal Dream SA",            cuit: "30718323386" },
  { carpeta: "Messenger & Consulting SA", nombreSos: "Messenger & Consulting SA", cuit: "30717548767" },
  { carpeta: "Metagame S.A.",             nombreSos: "Metagame S.A.",             cuit: "30718374142" },
  { carpeta: "Momel S.r.l",               nombreSos: "Momel S.r.l",               cuit: "30714871087" },
  { carpeta: "Mr Almohada Factory S.A.",  nombreSos: "Mr Almohada Factory S.A.",  cuit: "33718009419" },
  { carpeta: "Mr Factory Couch SA",       nombreSos: "Mr Factory Couch SA",       cuit: "30717679136" },
  { carpeta: "Ngvs",                      nombreSos: "Ngvs",                      cuit: "30717786986" },
  { carpeta: "Pahue Technologies SA",     nombreSos: "Pahue Technologies SA",     cuit: "30719105056" },
  { carpeta: "Pnr Trade S.A.",            nombreSos: "Pnr Trade S.A.",            cuit: "30718922565" },
  { carpeta: "Rojot S.A.",                nombreSos: "Rojot S.A.",                cuit: "30716753251" },
  { carpeta: "Sabenumitubeja S.A.",       nombreSos: "Sabenumitubeja S.A.",       cuit: "30718310519" },
  { carpeta: "Salem, Jose Edgardo",       nombreSos: "Salem, Jose Edgardo",       cuit: "20127571083" },
  { carpeta: "Selem David Javier",        nombreSos: "Selem David Javier",        cuit: "20231269879" },
  { carpeta: "Semeca Ingenieria SRL",     nombreSos: "Semeca Ingenieria SRL",     cuit: "30715433490" },
  { carpeta: "Sigana S.A.",               nombreSos: "Sigana S.A.",               cuit: "30718149874" },
  { carpeta: "Smart Solution SRL",        nombreSos: "Smart Solution SRL",        cuit: "30714871508" },
  { carpeta: "Tarrab, Jacobo Leandro",    nombreSos: "Tarrab, Jacobo Leandro",    cuit: "20308861210" },
  { carpeta: "Termomecanica Valtri S.a",  nombreSos: "Termomecanica Valtri S.a",  cuit: "30716025752" },
  { carpeta: "Toloki",                    nombreSos: "Toloki",                    cuit: "30716787407" },
  { carpeta: "Ureshi Group S.A.",         nombreSos: "Ureshi Group S.A.",         cuit: "33718399799" },
  { carpeta: "Zahrah S.A.",               nombreSos: "Zahrah S.A.",               cuit: "30718084209" },
];

// ─── Estructura de una fila del Excel ────────────────────────────────────────

interface ExcelRow {
  cuitEmpresa: string;
  legajo: string;
  cuil: string;
  nombre: string;
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
  fechaBaja: Date | null;
  observaciones: string | null;
}

function parseRow(row: unknown[]): ExcelRow | null {
  // row[0] = CUIT empresa, row[1] = legajo, row[2] = cuil, ...
  if (!row[0] || !row[2]) return null;
  const cuil = normalizeCuil(row[2]);
  if (cuil.length !== 11) return null;

  const conyuge = (() => {
    const v = row[6];
    if (v === "true" || v === true || v === 1) return 1;
    return 0;
  })();

  return {
    cuitEmpresa: normalizeCuil(row[0]),
    legajo: String(row[1] ?? ""),
    cuil,
    nombre: decodeHtml(String(row[3] ?? "")),
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
    fechaBaja: parseExcelDate(row[34]),
    observaciones: row[35] ? decodeHtml(String(row[35])) : null,
  };
}

/** Lee todos los .xls de una carpeta y combina las filas (deduplica por CUIL) */
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
    const buf = readFileSync(join(dir, file));
    const wb = XLSX.read(buf, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    // Skip row 0 (title) and row 1 (headers), data starts at row 2
    for (let i = 2; i < data.length; i++) {
      const row = data[i] as unknown[];
      if (!row || row.length < 3) continue;
      const parsed = parseRow(row);
      if (!parsed) continue;
      result.set(parsed.cuil, parsed); // last file wins on duplication
    }
  }
  return result;
}

// ─── Carga de catálogos de la BD ─────────────────────────────────────────────

interface CatalogEntry { id: string; codigo: string; nombre: string }

async function loadCatalog(table: typeof payrollModalidadContratacion): Promise<CatalogEntry[]> {
  // @ts-expect-error generic drizzle call
  return db.select({ id: table.id, codigo: table.codigo, nombre: table.nombre }).from(table);
}

type LookupMap = Map<string, string>; // SOS code → DB id

/** Builds lookup: codigo (as string, stripped of leading zeros) → UUID */
function buildCodigoMap(entries: CatalogEntry[]): LookupMap {
  const m = new Map<string, string>();
  for (const e of entries) {
    if (!e.codigo) continue;
    m.set(e.codigo, e.id);
    // También sin ceros leading: "049" → "49"
    m.set(String(parseInt(e.codigo, 10)), e.id);
  }
  return m;
}

/** Builds lookup: normalized nombre → UUID */
function buildNombreMap(entries: CatalogEntry[]): LookupMap {
  const m = new Map<string, string>();
  for (const e of entries) {
    m.set(normalizeText(e.nombre), e.id);
  }
  return m;
}

/** Obra Social: DB codigo (6-digit string) → UUID */
function buildObraSocialMap(entries: CatalogEntry[]): LookupMap {
  const m = new Map<string, string>();
  for (const e of entries) {
    m.set(e.codigo, e.id);
    // Also try stripping leading zeros
    m.set(String(parseInt(e.codigo, 10)), e.id);
  }
  return m;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const report = {
  empresasEnSistema: [] as { nombreSos: string; cuit: string; nombreDb: string }[],
  empresasAusentes: [] as { nombreSos: string; cuit: string }[],
  empleadosAgregados: [] as { empresa: string; cuil: string; nombre: string }[],
  empleadosYaCorrectos: [] as { empresa: string; cuil: string; nombre: string }[],
  empleadosSospechosos: [] as { empresa: string; cuil: string; nombre: string; razon: string }[],
  empresasSinCliente: [] as string[],
};

console.log("Cargando catálogos...");
const [modalidadesRaw, situacionesRaw, zonasRaw, condicionesRaw, actividadesRaw, siniestradosRaw, obraSocialesRaw, provinciasRaw, nacionalidadesRaw] = await Promise.all([
  loadCatalog(payrollModalidadContratacion),
  loadCatalog(payrollSituacion),
  loadCatalog(payrollZona),
  loadCatalog(payrollCondicion),
  loadCatalog(payrollActividad),
  loadCatalog(payrollSiniestrado),
  db.select({ id: obraSocial.id, codigo: obraSocial.codigo, nombre: obraSocial.nombre }).from(obraSocial),
  loadCatalog(payrollProvincia),
  loadCatalog(payrollNacionalidad),
]);

const modalidadMap = buildCodigoMap(modalidadesRaw);
const situacionMap = buildNombreMap(situacionesRaw);
const zonaMap = buildCodigoMap(zonasRaw);
const condicionMap = buildNombreMap(condicionesRaw);
const actividadMap = buildCodigoMap(actividadesRaw);
const siniestradoMap = buildNombreMap(siniestradosRaw);
const obraSocialMap = buildObraSocialMap(obraSocialesRaw);
const provinciaMap = buildNombreMap(provinciasRaw);
const nacionalidadMap = buildNombreMap(nacionalidadesRaw);

// Fallback: match by leading code in situacion (some have "1 - Activo" format)
function findId(map: LookupMap, key: string | null, nombre: string | null): string | null {
  if (!key && !nombre) return null;
  if (key) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  if (nombre) {
    const hit = map.get(normalizeText(nombre));
    if (hit) return hit;
  }
  return null;
}

console.log("Consultando clientes en BD...");
const cuits = empresasRar.map((e) => e.cuit);
const clientsDb = await db.select({
  id: client.id,
  name: client.name,
  identityNumber: client.identityNumber,
}).from(client).where(inArray(client.identityNumber, cuits));

const clientByCuit = new Map(clientsDb.map((c) => [c.identityNumber, c]));

// ─── Tabla de empresas ────────────────────────────────────────────────────────
console.log("\n╔══════════════════════════════════════════════════════════════════════════╗");
console.log("║              TABLA DE EMPRESAS — SOS vs SISTEMA                         ║");
console.log("╠══════════════════════════════════════════════════════════════════════════╣");
console.log(`${"Empresa SOS".padEnd(32)} | ${"CUIT".padEnd(12)} | ${"En sistema"} | Nombre en sistema`);
console.log("-".repeat(80));

for (const e of empresasRar) {
  const found = clientByCuit.get(e.cuit);
  const enSistema = found ? "✓ true " : "✗ false";
  const nombreDb = found ? found.name : "-";
  console.log(`${e.nombreSos.padEnd(32)} | ${e.cuit.padEnd(12)} | ${enSistema}     | ${nombreDb}`);
  if (found) {
    report.empresasEnSistema.push({ nombreSos: e.nombreSos, cuit: e.cuit, nombreDb: found.name });
  } else {
    report.empresasAusentes.push({ nombreSos: e.nombreSos, cuit: e.cuit });
  }
}

console.log("-".repeat(80));
console.log(`Total: ${empresasRar.length} empresas, ${report.empresasEnSistema.length} en sistema, ${report.empresasAusentes.length} ausentes\n`);

// ─── Procesamiento de empleados ───────────────────────────────────────────────

for (const empresa of empresasRar) {
  const clientDb = clientByCuit.get(empresa.cuit);
  if (!clientDb) {
    report.empresasSinCliente.push(`${empresa.nombreSos} (${empresa.cuit})`);
    continue;
  }

  const excelRows = readEmpresaExcel(empresa.carpeta);
  if (excelRows.size === 0) {
    report.empleadosSospechosos.push({
      empresa: empresa.nombreSos,
      cuil: "-",
      nombre: "-",
      razon: "No se encontraron filas en el Excel",
    });
    continue;
  }

  // Traer empleados actuales de esta empresa
  const empleadosActuales = await db
    .select({ id: liquidacionImportEmpleado.id, cuil: liquidacionImportEmpleado.cuil, nombre: liquidacionImportEmpleado.nombre })
    .from(liquidacionImportEmpleado)
    .where(eq(liquidacionImportEmpleado.clientId, clientDb.id));

  const empleadoExistePorCuil = new Set(empleadosActuales.map((e) => e.cuil));

  const toInsert: (typeof liquidacionImportEmpleado.$inferInsert)[] = [];

  for (const [cuil, row] of excelRows) {
    const nombreLimpio = row.nombre;
    if (!nombreLimpio) {
      report.empleadosSospechosos.push({ empresa: empresa.nombreSos, cuil, nombre: "-", razon: "Nombre vacío" });
      continue;
    }

    if (empleadoExistePorCuil.has(cuil)) {
      report.empleadosYaCorrectos.push({ empresa: empresa.nombreSos, cuil, nombre: nombreLimpio });
      continue;
    }

    // Resolver FKs de catálogo
    const modalidadId = findId(modalidadMap, row.codModalidad, null);
    const situacionId = findId(situacionMap, null, row.situacionNombre);
    const zonaId = findId(zonaMap, row.codZona, null);
    const condicionId = findId(condicionMap, null, row.condicionNombre);
    const actividadId = findId(actividadMap, row.codActividad, null);
    const siniestradoId = findId(siniestradoMap, null, row.siniestradoNombre);
    const obraSocialId = row.codObraSocial && row.codObraSocial !== "0"
      ? (obraSocialMap.get(row.codObraSocial) ?? obraSocialMap.get(String(parseInt(row.codObraSocial, 10))) ?? null)
      : null;
    const provinciaId = row.provincia ? findId(provinciaMap, null, row.provincia) : null;
    const nacionalidadId = row.nacionalidad ? findId(nacionalidadMap, null, row.nacionalidad) : null;

    // activo: si tiene fecha de baja es inactivo
    const activo = !row.fechaBaja;

    if (!modalidadId) {
      report.empleadosSospechosos.push({
        empresa: empresa.nombreSos,
        cuil,
        nombre: nombreLimpio,
        razon: `Modalidad no encontrada en catálogo (cod=${row.codModalidad}, nombre="${row.modalidadNombre}")`,
      });
    }
    if (!situacionId) {
      report.empleadosSospechosos.push({
        empresa: empresa.nombreSos,
        cuil,
        nombre: nombreLimpio,
        razon: `Situacion no encontrada en catálogo (nombre="${row.situacionNombre}")`,
      });
    }

    toInsert.push({
      clientId: clientDb.id,
      cuil,
      legajo: row.legajo,
      nombre: nombreLimpio,
      fechaAlta: row.fechaIngreso,
      fechaBaja: row.fechaBaja,
      fechaNacimiento: row.fechaNacimiento,
      categoria: row.categoria,
      origen: "import",
      sexo: row.sexo,
      domicilio: row.domicilio,
      localidad: row.localidad,
      codigoPostal: row.codigoPostal,
      provincia: row.provincia,
      provinciaId: provinciaId ?? undefined,
      nacionalidad: row.nacionalidad,
      nacionalidadId: nacionalidadId ?? undefined,
      conyuge: row.conyuge,
      hijos: row.hijos,
      adherentes: row.adherentes,
      modalidadContratacionId: modalidadId ?? undefined,
      codigoModalidadContratacion: row.codModalidad,
      situacionId: situacionId ?? undefined,
      codigoSituacion: row.codSituacion,
      zonaId: zonaId ?? undefined,
      codigoZona: row.codZona,
      condicionId: condicionId ?? undefined,
      codigoCondicion: row.codCondicion,
      actividadId: actividadId ?? undefined,
      codigoActividad: row.codActividad,
      siniestradoId: siniestradoId ?? undefined,
      codigoSiniestrado: row.codSiniestrado,
      obraSocialId: obraSocialId ?? undefined,
      valorHora: row.valorHora,
      valorSueldo: row.valorSueldo,
      horasMensualesNormales: row.horasMensuales,
      tarea: row.tarea,
      observaciones: row.observaciones,
      activo,
      // Legacy text fields for zona
      zona: row.zonaNombre,
      situacion: row.situacionNombre,
      condicion: row.condicionNombre,
      actividad: row.actividadNombre,
      siniestrado: row.siniestradoNombre,
    });
  }

  // Insert in batches of 50
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      await db.insert(liquidacionImportEmpleado).values(batch);
    }
    for (const e of toInsert) {
      report.empleadosAgregados.push({ empresa: empresa.nombreSos, cuil: e.cuil, nombre: e.nombre });
    }
    console.log(`  ✓ ${empresa.nombreSos}: insertados ${toInsert.length} empleados`);
  } else {
    console.log(`  - ${empresa.nombreSos}: todos los empleados ya estaban (${excelRows.size} en Excel)`);
  }
}

// ─── Reporte final ────────────────────────────────────────────────────────────

console.log("\n");
console.log("═".repeat(80));
console.log("                        REPORTE FINAL");
console.log("═".repeat(80));

console.log(`\n▶ EMPRESAS EN SISTEMA (${report.empresasEnSistema.length} de ${empresasRar.length}):`);
for (const e of report.empresasEnSistema) {
  console.log(`   ✓ ${e.nombreSos} (${e.cuit}) → "${e.nombreDb}" en DB`);
}

console.log(`\n▶ EMPRESAS AUSENTES DEL SISTEMA (${report.empresasAusentes.length}):`);
for (const e of report.empresasAusentes) {
  console.log(`   ✗ ${e.nombreSos} (${e.cuit})`);
}

console.log(`\n▶ EMPLEADOS AGREGADOS (${report.empleadosAgregados.length}):`);
const porEmpresaAgregados = new Map<string, number>();
for (const e of report.empleadosAgregados) {
  porEmpresaAgregados.set(e.empresa, (porEmpresaAgregados.get(e.empresa) ?? 0) + 1);
}
for (const [empresa, count] of porEmpresaAgregados) {
  console.log(`   + ${empresa}: ${count} empleado(s) nuevos`);
}
if (report.empleadosAgregados.length === 0) console.log("   (ninguno)");

console.log(`\n▶ EMPLEADOS YA EN SISTEMA (${report.empleadosYaCorrectos.length}):`);
const porEmpresaCorrectos = new Map<string, number>();
for (const e of report.empleadosYaCorrectos) {
  porEmpresaCorrectos.set(e.empresa, (porEmpresaCorrectos.get(e.empresa) ?? 0) + 1);
}
for (const [empresa, count] of porEmpresaCorrectos) {
  console.log(`   ✓ ${empresa}: ${count} empleado(s) ya presentes`);
}
if (report.empleadosYaCorrectos.length === 0) console.log("   (ninguno)");

console.log(`\n▶ SITUACIONES SOSPECHOSAS (${report.empleadosSospechosos.length}):`);
for (const e of report.empleadosSospechosos) {
  console.log(`   ⚠ ${e.empresa} | CUIL ${e.cuil} | ${e.nombre} → ${e.razon}`);
}
if (report.empleadosSospechosos.length === 0) console.log("   (ninguna)");

console.log("\n" + "═".repeat(80));

process.exit(0);
