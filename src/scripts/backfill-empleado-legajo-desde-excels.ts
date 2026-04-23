import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { client, liquidacionImportEmpleado, obraSocial, profile } from '@/drizzle/schema';
import {
  getCuilFromLegajoRow,
  getLegajoFromLegajoRow,
  parseSosLegajosRows,
} from '@/lib/parse-sos-legajos-sheet';

const BASE_DIR = 'C:\\Users\\Brian\\Downloads\\SOS_empresas_legajos';

function normText(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normDigits(v: unknown): string {
  return normText(v).replace(/\D/g, '');
}

function normalizeLegajo(v: unknown): string {
  const raw = normText(v);
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return String(parseInt(raw, 10));
  return raw.toLowerCase();
}

function toIntOrNull(v: unknown): number | null {
  const s = normText(v);
  if (!s) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = normText(v);
  if (!s) return null;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

function findExcelFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(xls|xlsx)$/i.test(entry.name)) out.push(full);
    }
  }
  return out;
}

function cuitFromPath(filePath: string): string | null {
  const m = filePath.match(/\d{2}-\d{8}-\d|\d{11}/);
  if (!m) return null;
  const cuit = normDigits(m[0]);
  return cuit.length === 11 ? cuit : null;
}

function normalizeNombreObraSocial(v: unknown): string {
  return normText(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

async function resolveObraSocialId(
  normalized: Record<string, unknown>,
  byCodigo: Map<string, string>,
  byNombre: Map<string, string>
): Promise<string | null> {
  const codRaw = normText(normalized['cod obra social']);
  const codDigits = normDigits(codRaw);
  if (codDigits && byCodigo.has(codDigits)) return byCodigo.get(codDigits) ?? null;

  const obraRaw = normText(normalized['obra social']);
  if (!obraRaw) return null;

  // Muchos excels traen "400800 OBRA SOCIAL ...", intentamos tomar código al inicio.
  const prefijo = obraRaw.match(/^\s*(\d{4,})\b/);
  if (prefijo) {
    const prefijoDigits = normDigits(prefijo[1]);
    if (prefijoDigits && byCodigo.has(prefijoDigits)) return byCodigo.get(prefijoDigits) ?? null;
  }

  const nombreNorm = normalizeNombreObraSocial(obraRaw.replace(/^\s*\d{4,}\s+/, ''));
  if (nombreNorm && byNombre.has(nombreNorm)) return byNombre.get(nombreNorm) ?? null;

  // Si no existe en catálogo, la damos de alta para poder asociarla al empleado.
  const codigoAlta = codDigits || normDigits(prefijo?.[1] ?? '');
  if (codigoAlta && codigoAlta !== '0') {
    await db
      .insert(obraSocial)
      .values({
        codigo: codigoAlta,
        nombre: obraRaw || `OBRA SOCIAL ${codigoAlta}`,
      })
      .onConflictDoNothing({ target: obraSocial.codigo });

    const [created] = await db
      .select({ id: obraSocial.id, nombre: obraSocial.nombre })
      .from(obraSocial)
      .where(eq(obraSocial.codigo, codigoAlta))
      .limit(1);

    if (created) {
      byCodigo.set(codigoAlta, created.id);
      const nombreCreated = normalizeNombreObraSocial(created.nombre);
      if (nombreCreated) byNombre.set(nombreCreated, created.id);
      return created.id;
    }
  }

  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const perfiles = await db
    .select({
      profileId: profile.id,
      clientId: client.id,
      clientName: client.name,
      cuit: profile.identityNumber,
    })
    .from(profile)
    .innerJoin(client, eq(profile.client, client.id))
    .where(eq(profile.liquidaSueldos, true));

  const perfilByCuit = new Map(
    perfiles
      .map((p) => ({ ...p, cuitNorm: normDigits(p.cuit) }))
      .filter((p) => p.cuitNorm.length === 11)
      .map((p) => [p.cuitNorm, p])
  );

  const obras = await db
    .select({
      id: obraSocial.id,
      codigo: obraSocial.codigo,
      nombre: obraSocial.nombre,
    })
    .from(obraSocial);
  const obraByCodigo = new Map<string, string>();
  const obraByNombre = new Map<string, string>();
  for (const os of obras) {
    const cod = normDigits(os.codigo);
    if (cod) obraByCodigo.set(cod, os.id);
    const codDesdeNombre = normDigits(normText(os.nombre).match(/^\s*(\d{4,})\b/)?.[1] ?? '');
    if (codDesdeNombre) obraByCodigo.set(codDesdeNombre, os.id);
    const nom = normalizeNombreObraSocial(os.nombre);
    if (nom) obraByNombre.set(nom, os.id);
  }

  const files = findExcelFiles(BASE_DIR);
  const filesByCuit = new Map<string, string>();
  for (const f of files) {
    const cuit = cuitFromPath(f);
    if (!cuit) continue;
    if (!filesByCuit.has(cuit)) filesByCuit.set(cuit, f);
  }

  let totalPerfiles = 0;
  let totalUpdates = 0;
  let totalNoMatch = 0;

  for (const [cuit, perfil] of perfilByCuit.entries()) {
    const filePath = filesByCuit.get(cuit);
    if (!filePath) continue;
    totalPerfiles += 1;

    const wb = XLSX.readFile(filePath, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) continue;
    const rows = parseSosLegajosRows(sheet);

    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        cuil: liquidacionImportEmpleado.cuil,
        legajo: liquidacionImportEmpleado.legajo,
      })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.profileId, perfil.profileId));

    const byCuil = new Map(
      empleados.map((e) => [normDigits(e.cuil), e]).filter(([k]) => k.length > 0)
    );
    const byLegajo = new Map(
      empleados
        .map((e) => [normalizeLegajo(e.legajo), e] as const)
        .filter(([k]) => k.length > 0)
    );

    for (const normalized of rows) {
      const cuil = normDigits(getCuilFromLegajoRow(normalized));
      const legajo = normalizeLegajo(getLegajoFromLegajoRow(normalized));
      const emp = (cuil && byCuil.get(cuil)) || (legajo && byLegajo.get(legajo));
      if (!emp) {
        totalNoMatch += 1;
        continue;
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      patch.nacionalidad = normText(normalized['nacionalidad']) || null;
      patch.fechaNacimiento = parseDate(normalized['fecha de nacimiento']);
      patch.conyuge = toIntOrNull(normalized['conyuge']);
      patch.hijos = toIntOrNull(normalized['hijos']);
      patch.adherentes = toIntOrNull(normalized['adherentes']);
      patch.sexo = normText(normalized['sexo']) || null;
      patch.domicilio = normText(normalized['domicilio']) || null;
      patch.localidad = normText(normalized['localidad']) || null;
      patch.codigoPostal = normText(normalized['cp']) || null;
      patch.provincia = normText(normalized['provincia']) || null;
      patch.codigoModalidadContratacion =
        normText(normalized['cod modalidad contratacion']) || null;
      patch.situacion = normText(normalized['situacion']) || null;
      patch.codigoSituacion = normText(normalized['cod situacion']) || null;
      patch.zona = normText(normalized['zona']) || null;
      patch.codigoZona = normText(normalized['cod zona']) || null;
      patch.condicion = normText(normalized['condicion']) || null;
      patch.codigoCondicion = normText(normalized['cod condicion']) || null;
      patch.actividad = normText(normalized['actividad']) || null;
      patch.codigoActividad = normText(normalized['cod actividad']) || null;
      patch.siniestrado = normText(normalized['siniestrado']) || null;
      patch.codigoSiniestrado = normText(normalized['cod siniestrado']) || null;
      patch.observaciones =
        normText(normalized['observaciones'] ?? normalized['observacioes']) || null;
      patch.obraSocialId = await resolveObraSocialId(normalized, obraByCodigo, obraByNombre);

      await db
        .update(liquidacionImportEmpleado)
        .set(patch)
        .where(eq(liquidacionImportEmpleado.id, emp.id));
      totalUpdates += 1;
    }
  }

  console.log(`Perfiles procesados: ${totalPerfiles}`);
  console.log(`Filas actualizadas: ${totalUpdates}`);
  console.log(`Filas sin match por cuil/legajo: ${totalNoMatch}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
