/**
 * Completa fecha_alta y fecha_baja en liquidacion_import_empleado
 * leyendo los Excel de legajos SOS.
 *
 * - fecha_alta (col 14 = Fecha de Ingreso): actualiza si está en NULL
 * - fecha_baja (col 34 = Fecha de Egreso):  actualiza si está en NULL
 * - activo: pone false si hay fecha_baja (independientemente de si ya estaba seteado)
 *
 * Uso: bun run src/scripts/fix-fechas-empleados.ts
 */
import postgres from 'postgres';
import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const BASE_DIR = 'C:/Users/Brian/Downloads/SOS_empresas_legajos';

function normDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** Parsea "DD/MM/YYYY" → Date (UTC midnight). Devuelve null si no es válida. */
function parseTextDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });

  const profiles = await client`SELECT id, identity_number FROM profile`;
  const profileByCuit = new Map(profiles.map((p) => [normDigits(p.identity_number), p.id as string]));

  let updatedAlta = 0;
  let updatedBaja = 0;
  let updatedActivo = 0;
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
      if (!profileId) continue;

      const wb = XLSX.readFile(path.join(subDir, file), { raw: true });
      const rows = (XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
        header: 1, defval: null, raw: true,
      })).slice(2);

      // Load existing employees for this profile
      const empleados = await client`
        SELECT id, cuil, fecha_alta, fecha_baja, activo
        FROM liquidacion_import_empleado
        WHERE profile_id = ${profileId}
      `;
      const byCuil = new Map(empleados.map((e) => [normDigits(e.cuil), e]));

      for (const row of rows) {
        const cuil = normDigits(String(row[2] ?? ''));
        if (!cuil || cuil.length < 7) continue;

        const emp = byCuil.get(cuil);
        if (!emp) continue;

        const fechaAlta = parseTextDate(row[14]);
        const fechaBaja = parseTextDate(row[34]);

        const patch: Record<string, unknown> = { updated_at: new Date() };
        let changed = false;

        if (emp.fecha_alta == null && fechaAlta) {
          patch.fecha_alta = fechaAlta;
          changed = true;
          updatedAlta++;
        }

        if (emp.fecha_baja == null && fechaBaja) {
          patch.fecha_baja = fechaBaja;
          changed = true;
          updatedBaja++;
        }

        // Si tiene fecha de egreso, forzar activo = false (aunque ya estuviera seteado)
        if (fechaBaja && emp.activo !== false) {
          patch.activo = false;
          changed = true;
          updatedActivo++;
        }

        if (!changed) continue;

        try {
          await client`
            UPDATE liquidacion_import_empleado
            SET ${client(patch)}
            WHERE id = ${emp.id}
          `;
        } catch (e: unknown) {
          warnings.push(`Error CUIL ${cuil} (${entry.name}): ${(e as Error).message}`);
        }
      }
    }
  }

  console.log('\n========== RESUMEN ==========');
  console.log(`fecha_alta completada: ${updatedAlta}`);
  console.log(`fecha_baja completada: ${updatedBaja}`);
  console.log(`activo → false:        ${updatedActivo}`);

  if (warnings.length) {
    console.log('\nADVERTENCIAS:');
    for (const w of warnings) console.log('  ⚠', w);
  }

  await client.end();
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
