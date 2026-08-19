/**
 * import-legajos-desde-excel.ts
 *
 * Lee los archivos Excel de legajos por empresa desde SOS_empresas_legajos/
 * y actualiza los campos demográficos/laborales de liquidacion_import_empleado
 * que estén actualmente en NULL.
 *
 * Uso: bun run src/scripts/import-legajos-desde-excel.ts
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/drizzle/schema';

const {
  liquidacionImportEmpleado,
  obraSocial,
  payrollActividad,
  payrollCondicion,
  payrollSiniestrado,
  payrollSituacion,
  payrollZona,
  profile,
} = schema;

// Use a dedicated single-connection client so we don't compete with the app pool.
// Prefer MIGRATION_URL when DATABASE_URL is at connection limit.
const DB_URL = process.env.DATABASE_URL ?? process.env.MIGRATION_URL;
if (!DB_URL) {
  console.error('ERROR: Neither MIGRATION_URL nor DATABASE_URL is set.');
  process.exit(1);
}
const pgClient = postgres(DB_URL, { prepare: false, max: 1 });
const db = drizzle(pgClient, { schema });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_DIR = 'C:/Users/Brian/Downloads/SOS_empresas_legajos';

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function normText(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normDigits(v: unknown): string {
  return normText(v).replace(/\D/g, '');
}

/** Convert Excel serial date number to JS Date (UTC midnight). */
function excelSerialToDate(serial: unknown): Date | null {
  if (serial == null || serial === '') return null;
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Excel epoch: 1899-12-30 (accounting for the 1900 leap-year bug)
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = normText(v);
  // Handle "true"/"false" booleans (conyuge field)
  if (raw.toLowerCase() === 'true') return 1;
  if (raw.toLowerCase() === 'false') return 0;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNumericOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(normText(v).replace(',', '.'));
  return Number.isFinite(n) ? String(n) : null;
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Finds .xls/.xlsx files inside the given directory (non-recursive).
 * Returns { filePath, cuit } pairs where cuit is the 11-digit string
 * extracted from the filename (e.g. "30-70792005-6_legajos.xls" → "30707920056").
 */
function findLegajoFiles(dir: string): { filePath: string; cuit: string }[] {
  if (!fs.existsSync(dir)) {
    console.error(`Base directory not found: ${dir}`);
    return [];
  }

  const result: { filePath: string; cuit: string }[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(dir, entry.name);

    for (const file of fs.readdirSync(subDir, { withFileTypes: true })) {
      if (!file.isFile()) continue;
      if (!/\.(xls|xlsx)$/i.test(file.name)) continue;

      // Extract CUIT from filename: strip dashes then take first 11-digit sequence
      const cuitMatch = /\d{2}-\d{8}-\d|\d{11}/.exec(file.name);
      if (!cuitMatch) continue;
      const cuit = normDigits(cuitMatch[0]);
      if (cuit.length !== 11) continue;

      result.push({ filePath: path.join(subDir, file.name), cuit });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Catalog loading
// ---------------------------------------------------------------------------

async function loadCatalogs() {
  const [obras, situaciones, condiciones, actividades, siniestrados, zonas] = await Promise.all([
    db.select({ id: obraSocial.id, codigo: obraSocial.codigo }).from(obraSocial),
    db.select({ codigo: payrollSituacion.codigo, nombre: payrollSituacion.nombre }).from(payrollSituacion),
    db.select({ codigo: payrollCondicion.codigo, nombre: payrollCondicion.nombre }).from(payrollCondicion),
    db.select({ codigo: payrollActividad.codigo, nombre: payrollActividad.nombre }).from(payrollActividad),
    db.select({ codigo: payrollSiniestrado.codigo, nombre: payrollSiniestrado.nombre }).from(payrollSiniestrado),
    db.select({ codigo: payrollZona.codigo, nombre: payrollZona.nombre }).from(payrollZona),
  ]);

  const obraByCodigo = new Map<string, string>();
  for (const os of obras) {
    const cod = normDigits(os.codigo).padStart(6, '0');
    if (cod && cod !== '000000') obraByCodigo.set(cod, os.id);
    // Also index without leading zeros for flexible lookup
    const codRaw = normDigits(os.codigo);
    if (codRaw) obraByCodigo.set(codRaw, os.id);
  }

  const situacionByCode = new Map(situaciones.map((s) => [s.codigo, s.nombre]));
  const condicionByCode = new Map(condiciones.map((s) => [s.codigo, s.nombre]));
  const actividadByCode = new Map(actividades.map((s) => [s.codigo, s.nombre]));
  const siniestradoByCode = new Map(siniestrados.map((s) => [s.codigo, s.nombre]));
  const zonaByCode = new Map(zonas.map((s) => [s.codigo, s.nombre]));

  return { obraByCodigo, situacionByCode, condicionByCode, actividadByCode, siniestradoByCode, zonaByCode };
}

// ---------------------------------------------------------------------------
// Excel row parsing
// ---------------------------------------------------------------------------

/**
 * Read data rows from the sheet.
 * Row 0: title (skip)
 * Row 1: header (skip)
 * Row 2+: data rows, column indices as specified in the task.
 */
function parseDataRows(sheet: XLSX.WorkSheet): unknown[][] {
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  // Skip row 0 (title) and row 1 (header); return rows from index 2 onwards
  return (data).slice(2);
}

// ---------------------------------------------------------------------------
// Main logic
// ---------------------------------------------------------------------------

async function main() {
  console.log('Loading catalogs...');
  const catalogs = await loadCatalogs();
  console.log(`  obra_social entries: ${catalogs.obraByCodigo.size / 2 | 0} (approx)`);
  console.log(`  situaciones: ${catalogs.situacionByCode.size}`);
  console.log(`  condiciones: ${catalogs.condicionByCode.size}`);
  console.log(`  actividades: ${catalogs.actividadByCode.size}`);
  console.log(`  siniestrados: ${catalogs.siniestradoByCode.size}`);
  console.log(`  zonas: ${catalogs.zonaByCode.size}`);

  // Load all profiles keyed by identity_number (CUIT without dashes)
  console.log('\nLoading profiles...');
  const profiles = await db
    .select({ id: profile.id, identityNumber: profile.identityNumber })
    .from(profile);

  const profileByCuit = new Map<string, string>();
  for (const p of profiles) {
    const cuit = normDigits(p.identityNumber);
    if (cuit.length === 11) profileByCuit.set(cuit, p.id);
  }
  console.log(`  profiles loaded: ${profileByCuit.size}`);

  const files = findLegajoFiles(BASE_DIR);
  console.log(`\nFound ${files.length} Excel file(s) in ${BASE_DIR}\n`);

  // Global counters
  let totalCompanies = 0;
  let totalRowsRead = 0;
  let totalMatched = 0;
  let totalUpdated = 0;
  let totalSkippedNoCuil = 0;
  let totalSkippedNoProfile = 0;
  let totalSkippedNoDbMatch = 0;
  const warnings: string[] = [];

  for (const { filePath, cuit } of files) {
    const profileId = profileByCuit.get(cuit);
    if (!profileId) {
      warnings.push(`No profile found for CUIT ${cuit} (file: ${path.basename(filePath)})`);
      totalSkippedNoProfile++;
      continue;
    }

    totalCompanies++;
    const companyLabel = `CUIT ${cuit}`;
    console.log(`Processing ${companyLabel} — ${path.basename(filePath)}`);

    // Read Excel
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.readFile(filePath, { cellDates: false, raw: true });
    } catch (err) {
      warnings.push(`Could not read file ${filePath}: ${err}`);
      continue;
    }

    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      warnings.push(`No sheets found in ${filePath}`);
      continue;
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const rows = parseDataRows(sheet);
    totalRowsRead += rows.length;

    // Load all employees for this profile
    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        cuil: liquidacionImportEmpleado.cuil,
        // Fetch all nullable fields so we can check which are NULL
        fechaNacimiento: liquidacionImportEmpleado.fechaNacimiento,
        sexo: liquidacionImportEmpleado.sexo,
        domicilio: liquidacionImportEmpleado.domicilio,
        localidad: liquidacionImportEmpleado.localidad,
        codigoPostal: liquidacionImportEmpleado.codigoPostal,
        provincia: liquidacionImportEmpleado.provincia,
        nacionalidad: liquidacionImportEmpleado.nacionalidad,
        conyuge: liquidacionImportEmpleado.conyuge,
        hijos: liquidacionImportEmpleado.hijos,
        adherentes: liquidacionImportEmpleado.adherentes,
        obraSocialId: liquidacionImportEmpleado.obraSocialId,
        codigoModalidadContratacion: liquidacionImportEmpleado.codigoModalidadContratacion,
        codigoSituacion: liquidacionImportEmpleado.codigoSituacion,
        situacion: liquidacionImportEmpleado.situacion,
        codigoCondicion: liquidacionImportEmpleado.codigoCondicion,
        condicion: liquidacionImportEmpleado.condicion,
        codigoActividad: liquidacionImportEmpleado.codigoActividad,
        actividad: liquidacionImportEmpleado.actividad,
        codigoSiniestrado: liquidacionImportEmpleado.codigoSiniestrado,
        siniestrado: liquidacionImportEmpleado.siniestrado,
        zona: liquidacionImportEmpleado.zona,
        codigoZona: liquidacionImportEmpleado.codigoZona,
        valorHora: liquidacionImportEmpleado.valorHora,
        valorSueldo: liquidacionImportEmpleado.valorSueldo,
        horasMensualesNormales: liquidacionImportEmpleado.horasMensualesNormales,
        tarea: liquidacionImportEmpleado.tarea,
        observaciones: liquidacionImportEmpleado.observaciones,
      })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.profileId, profileId));

    // Index by normalized CUIL
    const byCuil = new Map<string, typeof empleados[number]>();
    for (const e of empleados) {
      const cuil = normDigits(e.cuil);
      if (cuil) byCuil.set(cuil, e);
    }

    let companyMatched = 0;
    let companyUpdated = 0;

    for (const row of rows) {
      const r = row;

      // Extract CUIL (col 2)
      const cuilRaw = r[2];
      if (cuilRaw == null || cuilRaw === '') {
        totalSkippedNoCuil++;
        continue;
      }
      const cuil = normDigits(String(cuilRaw));
      if (!cuil || cuil.length < 7) {
        totalSkippedNoCuil++;
        continue;
      }

      const emp = byCuil.get(cuil);
      if (!emp) {
        totalSkippedNoDbMatch++;
        continue;
      }

      companyMatched++;

      // Build patch — only include fields that are currently NULL in DB
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = {};

      // fecha_nacimiento (col 5)
      if (emp.fechaNacimiento == null) {
        const d = excelSerialToDate(r[5]);
        if (d) patch.fechaNacimiento = d;
      }

      // sexo (col 9)
      if (emp.sexo == null) {
        const s = normText(r[9]);
        if (s) patch.sexo = s;
      }

      // domicilio (col 10)
      if (emp.domicilio == null) {
        const v = normText(r[10]);
        if (v) patch.domicilio = v;
      }

      // localidad (col 11)
      if (emp.localidad == null) {
        const v = normText(r[11]);
        if (v) patch.localidad = v;
      }

      // codigo_postal (col 12)
      if (emp.codigoPostal == null) {
        const v = normText(r[12]);
        if (v) patch.codigoPostal = v;
      }

      // provincia (col 13)
      if (emp.provincia == null) {
        const v = normText(r[13]);
        if (v) patch.provincia = v;
      }

      // nacionalidad (col 4)
      if (emp.nacionalidad == null) {
        const v = normText(r[4]);
        if (v) patch.nacionalidad = v;
      }

      // conyuge (col 6)
      if (emp.conyuge == null) {
        const v = toIntOrNull(r[6]);
        if (v != null) patch.conyuge = v;
      }

      // hijos (col 7)
      if (emp.hijos == null) {
        const v = toIntOrNull(r[7]);
        if (v != null) patch.hijos = v;
      }

      // adherentes (col 8)
      if (emp.adherentes == null) {
        const v = toIntOrNull(r[8]);
        if (v != null) patch.adherentes = v;
      }

      // obra_social_id (col 29 = Cod Obra Social)
      if (emp.obraSocialId == null) {
        const codOsRaw = r[29];
        if (codOsRaw != null && codOsRaw !== 0 && codOsRaw !== '') {
          const codOs = normDigits(String(codOsRaw)).padStart(6, '0');
          const obraId = catalogs.obraByCodigo.get(codOs) ?? catalogs.obraByCodigo.get(normDigits(String(codOsRaw)));
          if (obraId) patch.obraSocialId = obraId;
          // If not found, leave null (don't store raw value)
        }
      }

      // codigo_modalidad_contratacion (col 16)
      if (emp.codigoModalidadContratacion == null) {
        const v = normText(r[16]);
        if (v) patch.codigoModalidadContratacion = v;
      }

      // situacion (col 17 desc, col 18 code) — use catalog for canonical nombre
      if (emp.codigoSituacion == null) {
        const cod = normText(r[18]);
        if (cod) patch.codigoSituacion = cod;
      }
      if (emp.situacion == null) {
        const cod = normText(r[18]);
        if (cod) {
          const nombre = catalogs.situacionByCode.get(cod);
          if (nombre) patch.situacion = nombre;
          // If no catalog match, leave null
        }
      }

      // condicion (col 26 desc, col 27 code)
      if (emp.codigoCondicion == null) {
        const cod = normText(r[27]);
        if (cod) patch.codigoCondicion = cod;
      }
      if (emp.condicion == null) {
        const cod = normText(r[27]);
        if (cod) {
          const nombre = catalogs.condicionByCode.get(cod);
          if (nombre) patch.condicion = nombre;
        }
      }

      // actividad (col 30 desc, col 31 code) — pad to 3 digits
      if (emp.codigoActividad == null) {
        const rawCod = normText(r[31]);
        if (rawCod) patch.codigoActividad = rawCod.padStart(3, '0');
      }
      if (emp.actividad == null) {
        const rawCod = normText(r[31]);
        if (rawCod) {
          const cod = rawCod.padStart(3, '0');
          const nombre = catalogs.actividadByCode.get(cod) ?? catalogs.actividadByCode.get(rawCod);
          if (nombre) patch.actividad = nombre;
        }
      }

      // siniestrado (col 32 desc, col 33 code)
      if (emp.codigoSiniestrado == null) {
        const cod = normText(r[33]);
        if (cod) patch.codigoSiniestrado = cod;
      }
      if (emp.siniestrado == null) {
        const cod = normText(r[33]);
        if (cod) {
          const nombre = catalogs.siniestradoByCode.get(cod);
          if (nombre) patch.siniestrado = nombre;
        }
      }

      // zona (col 20 desc, col 21 code)
      if (emp.codigoZona == null) {
        const cod = normText(r[21]);
        if (cod) patch.codigoZona = cod;
      }
      if (emp.zona == null) {
        const cod = normText(r[21]);
        if (cod) {
          const nombre = catalogs.zonaByCode.get(cod);
          if (nombre) patch.zona = nombre;
        }
      }

      // valor_hora (col 22)
      if (emp.valorHora == null) {
        const v = toNumericOrNull(r[22]);
        if (v != null) patch.valorHora = v;
      }

      // valor_sueldo (col 23)
      if (emp.valorSueldo == null) {
        const v = toNumericOrNull(r[23]);
        if (v != null) patch.valorSueldo = v;
      }

      // horas_mensuales_normales (col 24)
      if (emp.horasMensualesNormales == null) {
        const v = toIntOrNull(r[24]);
        if (v != null) patch.horasMensualesNormales = v;
      }

      // tarea (col 25)
      if (emp.tarea == null) {
        const v = normText(r[25]);
        if (v) patch.tarea = v;
      }

      // observaciones (col 35)
      if (emp.observaciones == null) {
        const v = normText(r[35]);
        if (v) patch.observaciones = v;
      }

      // Only write to DB if there's something to update
      if (Object.keys(patch).length === 0) continue;

      patch.updatedAt = new Date();

      await db
        .update(liquidacionImportEmpleado)
        .set(patch)
        .where(eq(liquidacionImportEmpleado.id, emp.id));

      companyUpdated++;
      totalUpdated++;
    }

    totalMatched += companyMatched;
    console.log(
      `  Rows in sheet: ${rows.length} | Matched to DB: ${companyMatched} | Rows updated: ${companyUpdated}`
    );
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n========== SUMMARY ==========');
  console.log(`Companies processed:       ${totalCompanies}`);
  console.log(`Total Excel rows read:     ${totalRowsRead}`);
  console.log(`Rows matched to DB:        ${totalMatched}`);
  console.log(`Rows updated in DB:        ${totalUpdated}`);
  console.log(`Skipped (no CUIL in row):  ${totalSkippedNoCuil}`);
  console.log(`Skipped (no profile):      ${totalSkippedNoProfile} company file(s)`);
  console.log(`Skipped (no DB match):     ${totalSkippedNoDbMatch}`);

  if (warnings.length > 0) {
    console.log('\n========== WARNINGS ==========');
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  console.log('\nDone.');
  await pgClient.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await pgClient.end().catch(() => {});
  process.exit(1);
});
