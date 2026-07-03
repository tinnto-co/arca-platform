/**
 * Analiza los campos faltantes (NULL en DB, con valor en Excel) por empleado.
 * No modifica nada — solo análisis.
 */
import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";
import { liquidacionImportEmpleado, client as clientTable } from "@/drizzle/schema";
import { eq, inArray } from "drizzle-orm";

function decodeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str).replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c))).replace(/&amp;/g, "&").trim();
}
function parseExcelDate(val: unknown): Date | null {
  if (!val || val === 0 || val === "false" || val === false) return null;
  if (typeof val === "number" && val > 1) return new Date(Math.round((val - 25569) * 86400 * 1000));
  if (typeof val === "string" && val.trim()) {
    const p = val.trim().split("/");
    if (p.length === 3) { const [d, m, y] = p.map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  }
  return null;
}
function normalizeCuil(val: unknown): string { return String(val ?? "").replace(/[-\s]/g, ""); }

function parseRow(row: unknown[]) {
  if (!row[0] || !row[2]) return null;
  const cuil = normalizeCuil(row[2]);
  if (cuil.length !== 11) return null;
  return {
    cuil,
    legajo: String(row[1] ?? ""),
    nombre: decodeHtml(String(row[3] ?? "")),
    nacionalidad: row[4] ? decodeHtml(String(row[4])) : null,
    fechaNacimiento: parseExcelDate(row[5]),
    conyuge: (row[6] === "true" || row[6] === true || row[6] === 1) ? 1 : 0,
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
    obraSocialCod: String(row[29] ?? ""),
    actividadNombre: row[30] ? decodeHtml(String(row[30])) : null,
    codActividad: String(row[31] ?? ""),
    siniestradoNombre: row[32] ? decodeHtml(String(row[32])) : null,
    codSiniestrado: String(row[33] ?? ""),
    fechaBaja: parseExcelDate(row[34]),
    observaciones: row[35] ? decodeHtml(String(row[35])) : null,
  };
}

const BASE_DIR = "C:/Users/Brian/Downloads/SOS_empresas_legajos";
function readExcel(carpeta: string) {
  const dir = join(BASE_DIR, carpeta);
  let files: string[];
  try { files = readdirSync(dir).filter(f => f.endsWith(".xls") || f.endsWith(".xlsx")); } catch { return new Map(); }
  const result = new Map<string, ReturnType<typeof parseRow>>();
  for (const file of files) {
    const wb = XLSX.read(readFileSync(join(dir, file)));
    const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as unknown[][];
    for (let i = 2; i < data.length; i++) { const p = parseRow(data[i] as unknown[]); if (p) result.set(p.cuil, p); }
  }
  return result;
}

const cuitMap: Record<string, string> = {
  "Admip SRL": "30707920056", "Artzeinu x2 S.A.": "30719153255",
  "Berns Sebastian Matias": "20259968012", "Besorot Tovot S.A.": "30719305535",
  "Brique Construcciones S.R.": "30715944029", "Carballo Fabian Alberto": "20180955454",
  "Carniceria Brothers x2 S.a": "33717904309", "Chirin": "30718161394",
  "Diaz Miguens Fernando Este": "20235093287", "E-presis S.A.": "30717554864",
  "Flor de Azar S.A.": "33719196239", "Gastrotecno S.A.": "30718074785",
  "Gb Bazar SA": "30716206404", "Gb Metal SA": "30716135124",
  "Green Safety": "30718394682", "Kasur Lipat": "30719184835",
  "Khiro S.A.": "30717680568", "Master Kids S.A.": "30718524551",
  "Max Buddy SA": "30717605663", "Mazal Dream SA": "30718323386",
  "Messenger & Consulting SA": "30717548767", "Metagame S.A.": "30718374142",
  "Momel S.r.l": "30714871087", "Mr Almohada Factory S.A.": "33718009419",
  "Mr Factory Couch SA": "30717679136", "Ngvs": "30717786986",
  "Pahue Technologies SA": "30719105056", "Pnr Trade S.A.": "30718922565",
  "Rojot S.A.": "30716753251", "Sabenumitubeja S.A.": "30718310519",
  "Salem, Jose Edgardo": "20127571083", "Selem David Javier": "20231269879",
  "Semeca Ingenieria SRL": "30715433490", "Sigana S.A.": "30718149874",
  "Smart Solution SRL": "30714871508", "Termomecanica Valtri S.a": "30716025752",
  "Ureshi Group S.A.": "33718399799", "Zahrah S.A.": "30718084209",
};

const clientsDb = await db.select({ id: clientTable.id, cuit: clientTable.identityNumber })
  .from(clientTable)
  .where(inArray(clientTable.identityNumber, Object.values(cuitMap)));
const clientIdByCuit = new Map(clientsDb.map(c => [c.cuit, c.id]));

const faltantesPorCampo: Record<string, number> = {};
const resumen: { empresa: string; empleados: number; conFaltas: number; campos: string[] }[] = [];

for (const [carpeta, cuit] of Object.entries(cuitMap)) {
  const clientId = clientIdByCuit.get(cuit);
  if (!clientId) continue;
  const excelRows = readExcel(carpeta);
  if (excelRows.size === 0) continue;

  const dbEmpleados = await db.select().from(liquidacionImportEmpleado).where(eq(liquidacionImportEmpleado.clientId, clientId));
  const dbByCuil = new Map(dbEmpleados.map(e => [e.cuil, e]));

  let conFaltas = 0;
  const camposEmpresa = new Set<string>();

  for (const [cuil, xls] of excelRows) {
    if (!xls) continue;
    const dbEmp = dbByCuil.get(cuil);
    if (!dbEmp) continue;

    const faltan: string[] = [];
    const mark = (dbVal: unknown, xlsVal: unknown, campo: string) => {
      const dbNull = dbVal === null || dbVal === undefined || dbVal === "";
      const xlsOk = xlsVal !== null && xlsVal !== undefined && xlsVal !== "" && xlsVal !== "0";
      if (dbNull && xlsOk) { faltan.push(campo); camposEmpresa.add(campo); faltantesPorCampo[campo] = (faltantesPorCampo[campo] ?? 0) + 1; }
    };

    mark(dbEmp.fechaAlta, xls.fechaIngreso, "fechaAlta");
    mark(dbEmp.fechaNacimiento, xls.fechaNacimiento, "fechaNacimiento");
    mark(dbEmp.fechaBaja, xls.fechaBaja, "fechaBaja");
    mark(dbEmp.categoria, xls.categoria, "categoria");
    mark(dbEmp.sexo, xls.sexo, "sexo");
    mark(dbEmp.domicilio, xls.domicilio, "domicilio");
    mark(dbEmp.localidad, xls.localidad, "localidad");
    mark(dbEmp.codigoPostal, xls.codigoPostal, "codigoPostal");
    mark(dbEmp.provincia, xls.provincia, "provincia");
    mark(dbEmp.nacionalidad, xls.nacionalidad, "nacionalidad");
    if (dbEmp.conyuge === null && xls.conyuge !== null) { faltan.push("conyuge"); camposEmpresa.add("conyuge"); faltantesPorCampo["conyuge"] = (faltantesPorCampo["conyuge"] ?? 0) + 1; }
    mark(dbEmp.hijos, xls.hijos, "hijos");
    mark(dbEmp.adherentes, xls.adherentes, "adherentes");
    mark(dbEmp.codigoModalidadContratacion, xls.codModalidad, "codigoModalidadContratacion");
    mark(dbEmp.codigoSituacion, xls.codSituacion, "codigoSituacion");
    mark(dbEmp.codigoZona, xls.codZona, "codigoZona");
    mark(dbEmp.codigoCondicion, xls.codCondicion, "codigoCondicion");
    mark(dbEmp.codigoActividad, xls.codActividad, "codigoActividad");
    mark(dbEmp.codigoSiniestrado, xls.codSiniestrado, "codigoSiniestrado");
    mark(dbEmp.valorHora, xls.valorHora, "valorHora");
    mark(dbEmp.valorSueldo, xls.valorSueldo, "valorSueldo");
    mark(dbEmp.horasMensualesNormales, xls.horasMensuales, "horasMensualesNormales");
    mark(dbEmp.tarea, xls.tarea, "tarea");
    mark(dbEmp.observaciones, xls.observaciones, "observaciones");

    if (faltan.length > 0) conFaltas++;
  }

  resumen.push({ empresa: carpeta, empleados: excelRows.size, conFaltas, campos: [...camposEmpresa] });
}

console.log("\n" + "=".repeat(90));
console.log("   CAMPOS FALTANTES POR EMPRESA (NULL en DB pero con valor en Excel)");
console.log("=".repeat(90));
console.log(`${"Empresa".padEnd(35)} | ${"Empl".padEnd(4)} | ${"Con faltas".padEnd(10)} | Campos`);
console.log("-".repeat(90));
for (const r of resumen) {
  const estado = r.conFaltas > 0 ? String(r.conFaltas) : "completo";
  console.log(`${r.empresa.padEnd(35)} | ${String(r.empleados).padEnd(4)} | ${estado.padEnd(10)} | ${r.campos.join(", ")}`);
}

console.log("\n" + "=".repeat(60));
console.log("   TOTALES GLOBALES POR CAMPO");
console.log("=".repeat(60));
const sorted = Object.entries(faltantesPorCampo).sort((a, b) => b[1] - a[1]);
for (const [campo, count] of sorted) {
  console.log(`  ${campo.padEnd(35)}: ${count} empleado(s) sin datos`);
}
if (sorted.length === 0) console.log("  Sin campos faltantes.");
process.exit(0);
