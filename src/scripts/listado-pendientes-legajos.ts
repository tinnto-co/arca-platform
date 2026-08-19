/**
 * Genera un listado de pendientes del import de legajos:
 * 1. Empresas sin perfil en la BD (no se pudo procesar el Excel)
 * 2. Empleados en Excel sin match en liquidacion_import_empleado
 *
 * Uso: bun run src/scripts/listado-pendientes-legajos.ts
 */
import postgres from 'postgres';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const BASE_DIR = 'C:/Users/Brian/Downloads/SOS_empresas_legajos';

function normDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}
function normText(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });

  const profiles = await client`SELECT id, identity_number, name FROM profile`;
  const profileByCuit = new Map(profiles.map((p) => [normDigits(p.identity_number), { id: p.id, name: p.name }]));

  const empleados = await client`SELECT id, profile_id, cuil, nombre FROM liquidacion_import_empleado`;
  const empSet = new Set(empleados.map((e) => e.profile_id + '|' + normDigits(e.cuil)));

  const noProfile: { cuit: string; empresa: string }[] = [];
  const noDbMatch: { empresa: string; cuit_empresa: string; cuil: string; nombre: string }[] = [];

  for (const entry of fs.readdirSync(BASE_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(BASE_DIR, entry.name);

    for (const file of fs.readdirSync(subDir)) {
      if (!/\.(xls|xlsx)$/i.test(file)) continue;
      const m = /\d{2}-\d{8}-\d/.exec(file);
      if (!m) continue;
      const cuit = normDigits(m[0]);

      const profile = profileByCuit.get(cuit);
      if (!profile) {
        if (!noProfile.find((x) => x.cuit === cuit)) {
          noProfile.push({ cuit, empresa: entry.name });
        }
        continue;
      }

      const wb = XLSX.readFile(path.join(subDir, file), { raw: true });
      const rows = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
        header: 1, defval: null, raw: true,
      })).slice(2);

      for (const row of rows) {
        const cuil = normDigits(String(row[2] ?? ''));
        if (!cuil || cuil.length < 7) continue;
        if (!empSet.has(profile.id + '|' + cuil)) {
          noDbMatch.push({
            empresa: profile.name,
            cuit_empresa: cuit,
            cuil,
            nombre: normText(row[3]),
          });
        }
      }
    }
  }

  // --- Output ---
  console.log('='.repeat(70));
  console.log('1. EMPRESAS SIN PERFIL EN LA BD (Excel no procesado)');
  console.log('='.repeat(70));
  for (const x of noProfile) {
    console.log(`  CUIT: ${x.cuit}  |  Carpeta: ${x.empresa}`);
  }
  console.log(`  Total: ${noProfile.length}\n`);

  console.log('='.repeat(70));
  console.log('2. EMPLEADOS EN EXCEL SIN MATCH EN liquidacion_import_empleado');
  console.log('='.repeat(70));

  // Group by empresa
  const byEmpresa = new Map<string, typeof noDbMatch>();
  for (const x of noDbMatch) {
    if (!byEmpresa.has(x.empresa)) byEmpresa.set(x.empresa, []);
    byEmpresa.get(x.empresa)!.push(x);
  }

  for (const [empresa, empleadosList] of byEmpresa) {
    console.log(`\n  ${empresa} (CUIT: ${empleadosList[0].cuit_empresa})`);
    for (const e of empleadosList) {
      console.log(`    CUIL: ${e.cuil}  |  ${e.nombre}`);
    }
  }
  console.log(`\n  Total empleados sin match: ${noDbMatch.length}`);

  await client.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
