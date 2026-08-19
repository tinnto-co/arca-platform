/**
 * Inserta en liquidacion_import_empleado los empleados que están en los
 * Excel de legajos pero no tienen fila en la tabla.
 *
 * Uso: bun run src/scripts/insert-empleados-desde-excel.ts
 */
import postgres from 'postgres';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const BASE_DIR = 'C:/Users/Brian/Downloads/SOS_empresas_legajos';

function normDigits(v: unknown): string { return String(v ?? '').replace(/\D/g, ''); }
function normText(v: unknown): string { return v == null ? '' : String(v).trim(); }
function toIntOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = normText(v).toLowerCase();
  if (raw === 'true') return 1;
  if (raw === 'false') return 0;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toNumericOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const n = Number(normText(v).replace(',', '.'));
  return Number.isFinite(n) ? String(n) : null;
}
function excelSerialToDate(serial: unknown): Date | null {
  if (serial == null || serial === '') return null;
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });

  // Load catalogs
  const [obras, situaciones, condiciones, actividades, siniestrados, zonas] = await Promise.all([
    client`SELECT id, codigo FROM obra_social`,
    client`SELECT codigo, nombre FROM payroll_situacion`,
    client`SELECT codigo, nombre FROM payroll_condicion`,
    client`SELECT codigo, nombre FROM payroll_actividad`,
    client`SELECT codigo, nombre FROM payroll_siniestrado`,
    client`SELECT codigo, nombre FROM payroll_zona`,
  ]);

  const obraMap = new Map<string, string>();
  for (const o of obras) {
    const cod = normDigits(o.codigo).padStart(6, '0');
    obraMap.set(cod, o.id);
    obraMap.set(normDigits(o.codigo), o.id);
  }
  const situacionMap = new Map(situaciones.map((x) => [x.codigo, x.nombre]));
  const condicionMap = new Map(condiciones.map((x) => [x.codigo, x.nombre]));
  const actividadMap = new Map(actividades.map((x) => [x.codigo, x.nombre]));
  const siniestradoMap = new Map(siniestrados.map((x) => [x.codigo, x.nombre]));
  const zonaMap = new Map(zonas.map((x) => [x.codigo, x.nombre]));

  // Load profiles
  const profiles = await client`SELECT id, identity_number, name FROM profile`;
  const profileByCuit = new Map(profiles.map((p) => [normDigits(p.identity_number), p.id]));

  // Load existing employees (to detect which are missing)
  const existing = await client`SELECT profile_id, cuil FROM liquidacion_import_empleado`;
  const empSet = new Set(existing.map((e) => e.profile_id + '|' + normDigits(e.cuil)));

  let totalInserted = 0;
  let totalSkipped = 0;
  const warnings: string[] = [];

  for (const entry of fs.readdirSync(BASE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(BASE_DIR, entry.name);

    for (const file of fs.readdirSync(subDir)) {
      if (!/\.(xls|xlsx)$/i.test(file)) continue;
      const m = /\d{2}-\d{8}-\d/.exec(file);
      if (!m) continue;
      const cuit = normDigits(m[0]);

      const profileId = profileByCuit.get(cuit);
      if (!profileId) continue; // Sin perfil → ignorar (punto 1, ya descartado)

      const wb = XLSX.readFile(path.join(subDir, file), { raw: true });
      const rows = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
        header: 1, defval: null, raw: true,
      })).slice(2);

      let companyInserted = 0;

      for (const row of rows) {
        const cuil = normDigits(String(row[2] ?? ''));
        if (!cuil || cuil.length < 7) continue;

        const key = profileId + '|' + cuil;
        if (empSet.has(key)) continue; // Ya existe

        const legajo = normText(row[1]) || '0';
        const nombre = normText(row[3]);
        if (!nombre) { totalSkipped++; continue; }

        // Catalog lookups
        const codSituacion = normText(row[18]);
        const codCondicion = normText(row[27]);
        const codActividadRaw = normText(row[31]);
        const codActividad = codActividadRaw ? codActividadRaw.padStart(3, '0') : '';
        const codSiniestrado = normText(row[33]);
        const codZona = normText(row[21]);
        const codOsRaw = normDigits(String(row[29] ?? '')).padStart(6, '0');
        const obraSocialId = codOsRaw !== '000000' ? (obraMap.get(codOsRaw) ?? obraMap.get(normDigits(String(row[29] ?? '')))) ?? null : null;

        const record: Record<string, unknown> = {
          profile_id: profileId,
          cuil,
          legajo,
          nombre,
          origen: 'legajo_sos',
          activo: true,
          tipo_jornada: 'full_time',
          created_at: new Date(),
          updated_at: new Date(),

          // Personal
          fecha_nacimiento: excelSerialToDate(row[5]),
          sexo: normText(row[9]) || null,
          domicilio: normText(row[10]) || null,
          localidad: normText(row[11]) || null,
          codigo_postal: normText(row[12]) || null,
          provincia: normText(row[13]) || null,
          nacionalidad: normText(row[4]) || null,
          conyuge: toIntOrNull(row[6]),
          hijos: toIntOrNull(row[7]),
          adherentes: toIntOrNull(row[8]),

          // Obra social
          obra_social_id: obraSocialId,

          // Laboral
          codigo_modalidad_contratacion: normText(row[16]) || null,
          codigo_situacion: codSituacion || null,
          situacion: codSituacion ? (situacionMap.get(codSituacion) ?? null) : null,
          codigo_condicion: codCondicion || null,
          condicion: codCondicion ? (condicionMap.get(codCondicion) ?? null) : null,
          codigo_actividad: codActividad || null,
          actividad: codActividad ? (actividadMap.get(codActividad) ?? actividadMap.get(codActividadRaw) ?? null) : null,
          codigo_siniestrado: codSiniestrado || null,
          siniestrado: codSiniestrado ? (siniestradoMap.get(codSiniestrado) ?? null) : null,
          codigo_zona: codZona || null,
          zona: codZona ? (zonaMap.get(codZona) ?? null) : null,

          valor_hora: toNumericOrNull(row[22]),
          valor_sueldo: toNumericOrNull(row[23]),
          horas_mensuales_normales: toIntOrNull(row[24]),
          tarea: normText(row[25]) || null,
          observaciones: normText(row[35]) || null,
        };

        // Remove nulls so postgres doesn't complain about missing defaults
        const cleanRecord = Object.fromEntries(Object.entries(record).filter(([, v]) => v !== null && v !== undefined));

        try {
          await client`INSERT INTO liquidacion_import_empleado ${client(cleanRecord)}`;
          empSet.add(key); // Prevent duplicate within same run
          companyInserted++;
          totalInserted++;
        } catch (e: unknown) {
          warnings.push(`Error insertando CUIL ${cuil} en ${entry.name}: ${(e as Error).message}`);
          totalSkipped++;
        }
      }

      if (companyInserted > 0) {
        console.log(`  ${entry.name}: +${companyInserted} empleados insertados`);
      }
    }
  }

  console.log('\n========== RESUMEN ==========');
  console.log(`Empleados insertados: ${totalInserted}`);
  console.log(`Saltados/errores:     ${totalSkipped}`);

  if (warnings.length) {
    console.log('\nADVERTENCIAS:');
    for (const w of warnings) console.log('  ⚠', w);
  }

  await client.end();
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
