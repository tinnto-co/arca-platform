/**
 * Puebla los FK de catálogo en liquidacion_import_empleado.
 *
 * Estrategia por catálogo:
 *  - actividad:  regex extrae código numérico del inicio del nombre → match con codigo_actividad (padded 3 digits)
 *  - modalidad:  regex extrae código numérico del inicio del nombre → match con codigo_modalidad_contratacion
 *  - zona:       Excel almacena el nombre completo exacto del catálogo → match directo normalizado
 *  - situacion:  match por nombre normalizado (Excel data[17])
 *  - condicion:  match por nombre normalizado (Excel data[26])
 *  - siniestrado: match por nombre normalizado (Excel data[32])
 *  - provincia:  match por nombre normalizado (Excel data[13])
 *  - nacionalidad: match por nombre normalizado (Excel data[4])
 *
 * Reporta cualquier valor sin match en el catálogo.
 *
 * Uso: bun run src/scripts/populate-empleado-fks.ts
 */
import postgres from 'postgres';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const BASE_DIR = 'C:/Users/Brian/Downloads/SOS_empresas_legajos';

function normDigits(v: unknown): string { return String(v ?? '').replace(/\D/g, ''); }

/** Decodifica entidades HTML numéricas: &#241; → ñ, &#243; → ó, etc. */
function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/** Normaliza texto para comparación: decodifica entities, minúsculas,
 *  colapsa espacios, elimina separadores " - ", homogeniza ordinales/grado. */
function norm(s: string): string {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[º°]/g, '')         // "Nº" → "N", "N°" → "N"
    .replace(/\s*-\s*/g, ' ')     // " - " → " "
    .replace(/\s+/g, ' ')         // colapsa espacios múltiples
    .trim();
}

/** Construye map normalizado nombre → id para match por texto. */
function byNombreMap(rows: { id: string; nombre: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [norm(r.nombre), r.id]));
}

/** Extrae código numérico del inicio del nombre de catálogo.
 *  "049 - Actividades..." → "049"
 *  "8 - A tiempo..."     → "8"
 *  "01 - 1995/03-..."    → "01"
 */
function extractLeadingCode(nombre: string): string | null {
  const m = nombre.match(/^(\d+)/);
  return m ? m[1] : null;
}

async function run(label: string, url: string) {
  const c = postgres(url, { prepare: false });

  // ── Catálogos ─────────────────────────────────────────────────────────────
  const [situaciones, condiciones, actividades, modalidades, siniestrados, zonas, provincias, nacionalidades] =
    await Promise.all([
      c`SELECT id, nombre FROM payroll_situacion`,
      c`SELECT id, nombre FROM payroll_condicion`,
      c`SELECT id, nombre FROM payroll_actividad`,
      c`SELECT id, nombre FROM payroll_modalidad_contratacion`,
      c`SELECT id, nombre FROM payroll_siniestrado`,
      c`SELECT id, nombre FROM payroll_zona`,
      c`SELECT id, nombre FROM payroll_provincia`,
      c`SELECT id, nombre FROM payroll_nacionalidad`,
    ]) as { id: string; nombre: string }[][];

  // Situacion / condicion / siniestrado / provincia / nacionalidad → por nombre normalizado
  const mapSit  = byNombreMap(situaciones);
  const mapCon  = byNombreMap(condiciones);
  const mapSin  = byNombreMap(siniestrados);
  const mapProv = byNombreMap(provincias);
  const mapNac  = byNombreMap(nacionalidades);

  // Actividad → por código numérico extraído del nombre (pad 3 dígitos)
  const mapAct = new Map<string, string>();
  for (const r of actividades) {
    const code = extractLeadingCode(r.nombre);
    if (code) mapAct.set(code.padStart(3, '0'), r.id);
  }

  // Modalidad → por código numérico extraído del nombre
  const mapMod = new Map<string, string>();
  for (const r of modalidades) {
    const code = extractLeadingCode(r.nombre);
    if (code) mapMod.set(code, r.id);
  }

  // Zona → por nombre normalizado (el Excel guarda el texto completo)
  const mapZon = byNombreMap(zonas);

  // ── Profiles ──────────────────────────────────────────────────────────────
  const profiles = await c`SELECT id, identity_number FROM profile`;
  const profileByCuit = new Map(
    (profiles as { id: string; identity_number: string }[]).map((p) => [normDigits(p.identity_number), p.id])
  );

  // ── Leer textos desde Excel (provincia, nacionalidad, situacion, condicion, actividad, siniestrado, zona, modalidad) ──
  type ExcelData = {
    modalidadDesc: string; situacionDesc: string; zonaDesc: string;
    condicionDesc: string; actividadDesc: string; siniestradoDesc: string;
    provinciaDesc: string; nacionalidadDesc: string;
  };
  const excelByEmpId = new Map<string, ExcelData>();

  // Para cruzar empId necesitamos cargar empleados primero (ver abajo),
  // así que cargamos los datos del Excel en un Map por profileId|cuil primero.
  const excelByCuilProfile = new Map<string, ExcelData>();

  for (const entry of fs.readdirSync(BASE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(BASE_DIR, entry.name);
    for (const file of fs.readdirSync(subDir)) {
      if (!/\.(xls|xlsx)$/i.test(file)) continue;
      const m = file.match(/\d{2}-\d{8}-\d/);
      if (!m) continue;
      const cuit = normDigits(m[0]);
      const profileId = profileByCuit.get(cuit);
      if (!profileId) continue;

      const wb = XLSX.readFile(path.join(subDir, file), { raw: true });
      const rows = (XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1, defval: null, raw: true,
      }) as unknown[][]).slice(2);

      for (const row of rows) {
        const cuil = normDigits(String(row[2] ?? ''));
        if (!cuil || cuil.length < 7) continue;
        excelByCuilProfile.set(profileId + '|' + cuil, {
          modalidadDesc:   String(row[15] ?? '').trim(),
          situacionDesc:   String(row[17] ?? '').trim(),
          zonaDesc:        String(row[20] ?? '').trim(),
          condicionDesc:   String(row[26] ?? '').trim(),
          actividadDesc:   String(row[30] ?? '').trim(),
          siniestradoDesc: String(row[32] ?? '').trim(),
          provinciaDesc:   String(row[13] ?? '').trim(),
          nacionalidadDesc: String(row[4]  ?? '').trim(),
        });
      }
    }
  }

  // ── Empleados ─────────────────────────────────────────────────────────────
  type EmpRow = {
    id: string; cuil: string; profile_id: string;
    codigo_situacion: string | null; codigo_condicion: string | null;
    codigo_actividad: string | null; codigo_modalidad_contratacion: string | null;
    codigo_siniestrado: string | null; codigo_zona: string | null;
    situacion_id: string | null; condicion_id: string | null;
    actividad_id: string | null; modalidad_contratacion_id: string | null;
    siniestrado_id: string | null; zona_id: string | null;
    provincia_id: string | null; nacionalidad_id: string | null;
  };

  const empleados = await c`
    SELECT id, cuil, profile_id,
      codigo_situacion, codigo_condicion, codigo_actividad,
      codigo_modalidad_contratacion, codigo_siniestrado, codigo_zona,
      situacion_id, condicion_id, actividad_id,
      modalidad_contratacion_id, siniestrado_id, zona_id,
      provincia_id, nacionalidad_id
    FROM liquidacion_import_empleado
  ` as EmpRow[];

  // Build empId → ExcelData using excelByCuilProfile
  for (const emp of empleados) {
    const key = emp.profile_id + '|' + normDigits(emp.cuil);
    const data = excelByCuilProfile.get(key);
    if (data) excelByEmpId.set(emp.id, data);
  }

  // ── Poblar FKs ────────────────────────────────────────────────────────────
  const mismatches: string[] = [];
  let updated = 0;
  let alreadySet = 0;

  for (const emp of empleados) {
    const patch: Record<string, string> = {};
    const excel = excelByEmpId.get(emp.id);

    function resolveByCode(
      campo: string,
      codigo: string | null | undefined,
      padLen: number,
      map: Map<string, string>,
      currentFk: string | null,
    ) {
      if (currentFk) { alreadySet++; return; }
      if (!codigo) return;
      const key = codigo.trim().padStart(padLen, '0');
      const id = map.get(key);
      if (id) {
        patch[campo] = id;
      } else {
        mismatches.push(`CUIL ${emp.cuil} | ${campo}: código SOS "${codigo}" sin match`);
      }
    }

    function resolveByNombre(
      campo: string,
      nombre: string | undefined,
      map: Map<string, string>,
      currentFk: string | null,
    ) {
      if (currentFk) { alreadySet++; return; }
      if (!nombre) return;
      const key = norm(nombre);
      if (!key) return;
      const id = map.get(key);
      if (id) {
        patch[campo] = id;
      } else {
        mismatches.push(`CUIL ${emp.cuil} | ${campo}: nombre "${nombre}" sin match`);
      }
    }

    // Actividad y Modalidad: match por código SOS en el nombre del catálogo
    resolveByCode('actividad_id',              emp.codigo_actividad,              3, mapAct, emp.actividad_id);
    resolveByCode('modalidad_contratacion_id', emp.codigo_modalidad_contratacion, 1, mapMod, emp.modalidad_contratacion_id);

    // Situacion / Condicion / Siniestrado / Zona: match por nombre normalizado
    resolveByNombre('situacion_id',  excel?.situacionDesc,   mapSit, emp.situacion_id);
    resolveByNombre('condicion_id',  excel?.condicionDesc,   mapCon, emp.condicion_id);
    resolveByNombre('siniestrado_id', excel?.siniestradoDesc, mapSin, emp.siniestrado_id);
    resolveByNombre('zona_id',       excel?.zonaDesc,        mapZon, emp.zona_id);

    // Provincia / Nacionalidad: match por nombre normalizado
    resolveByNombre('provincia_id',   excel?.provinciaDesc,   mapProv, emp.provincia_id);
    resolveByNombre('nacionalidad_id', excel?.nacionalidadDesc, mapNac, emp.nacionalidad_id);

    if (Object.keys(patch).length === 0) continue;

    await c`UPDATE liquidacion_import_empleado SET ${c(patch)} WHERE id = ${emp.id}`;
    updated++;
  }

  console.log(`\n[${label}]`);
  console.log(`  Empleados actualizados: ${updated} / ${empleados.length}`);
  console.log(`  FK ya seteados (omitidos): ${alreadySet}`);

  if (mismatches.length) {
    // Deduplicar por campo+valor
    const deduped = [...new Set(mismatches.map((m) => m.replace(/^CUIL \d+ \| /, '')))];
    console.log(`\n  DIFERENCIAS ÚNICAS (${deduped.length}):`);
    for (const m of deduped) console.log('  ⚠', m);
    console.log(`\n  Total ocurrencias: ${mismatches.length}`);
  } else {
    console.log('  Sin diferencias — todos los valores encontraron match en el catálogo.');
  }

  await c.end();
}

const dbUrl  = process.env.DATABASE_URL!;
const migUrl = process.env.MIGRATION_URL!;
if (!dbUrl || !migUrl) throw new Error('Faltan DATABASE_URL / MIGRATION_URL');

await run('dump    ', dbUrl);
await run('postgres', migUrl);
