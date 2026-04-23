import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { client, liquidacionImportEmpleado, profile } from '@/drizzle/schema';
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
  const m = /\d{2}-\d{8}-\d|\d{11}/.exec(filePath);
  if (!m) return null;
  const cuit = normDigits(m[0]);
  return cuit.length === 11 ? cuit : null;
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

  const files = findExcelFiles(BASE_DIR);
  const filesByCuit = new Map<string, string>();
  for (const f of files) {
    const cuit = cuitFromPath(f);
    if (!cuit) continue;
    if (!filesByCuit.has(cuit)) filesByCuit.set(cuit, f);
  }

  interface EmpresaReporte {
    clientName: string;
    cuit: string;
    filePath: string | null;
    excelFilas: number;
    empleadosBD: number;
    matches: number;
    sinMatch: number;
    motivoPrincipal: string;
  }

  const reportes: EmpresaReporte[] = [];

  for (const [cuit, perfil] of perfilByCuit.entries()) {
    const filePath = filesByCuit.get(cuit) ?? null;

    const empleados = await db
      .select({
        id: liquidacionImportEmpleado.id,
        cuil: liquidacionImportEmpleado.cuil,
        legajo: liquidacionImportEmpleado.legajo,
      })
      .from(liquidacionImportEmpleado)
      .where(eq(liquidacionImportEmpleado.profileId, perfil.profileId));

    const byCuil = new Map(
      empleados
        .map((e) => [normDigits(e.cuil), e] as const)
        .filter(([k]) => k.length > 0)
    );
    const byLegajo = new Map(
      empleados
        .map((e) => [normalizeLegajo(e.legajo), e] as const)
        .filter(([k]) => k.length > 0)
    );

    if (!filePath) {
      reportes.push({
        clientName: perfil.clientName,
        cuit,
        filePath: null,
        excelFilas: 0,
        empleadosBD: empleados.length,
        matches: 0,
        sinMatch: 0,
        motivoPrincipal:
          'No se encontró archivo de legajos para este CUIT en la carpeta SOS_empresas_legajos.',
      });
      continue;
    }

    const wb = XLSX.readFile(filePath, { cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ''];
    if (!sheet) {
      reportes.push({
        clientName: perfil.clientName,
        cuit,
        filePath,
        excelFilas: 0,
        empleadosBD: empleados.length,
        matches: 0,
        sinMatch: 0,
        motivoPrincipal: 'El Excel no tiene hoja legible (sheet vacío).',
      });
      continue;
    }

    const rows = parseSosLegajosRows(sheet);

    let matches = 0;
    let sinMatch = 0;

    for (const normalized of rows) {
      const cuil = normDigits(getCuilFromLegajoRow(normalized));
      const legajo = normalizeLegajo(getLegajoFromLegajoRow(normalized));
      const emp =
        (cuil && byCuil.get(cuil)) || (legajo && byLegajo.get(legajo));
      if (emp) matches += 1;
      else sinMatch += 1;
    }

    let motivoPrincipal = '';
    if (rows.length === 0) {
      motivoPrincipal = 'El Excel no contiene filas de legajos.';
    } else if (empleados.length === 0) {
      motivoPrincipal =
        'No hay empleados cargados en liquidacion_import_empleado para este perfil (no hay a quién matchear).';
    } else if (matches === 0 && sinMatch > 0) {
      motivoPrincipal =
        'Ninguna fila del Excel coincide por CUIL o Legajo con los empleados de liquidacion_import_empleado para este perfil.';
    } else if (matches > 0 && sinMatch > 0) {
      motivoPrincipal =
        'Solo algunas filas del Excel encontraron match por CUIL/Legajo; hay legajos adicionales que no existen en BD.';
    } else {
      motivoPrincipal = 'Match completo entre Excel y BD por CUIL/Legajo.';
    }

    reportes.push({
      clientName: perfil.clientName,
      cuit,
      filePath,
      excelFilas: rows.length,
      empleadosBD: empleados.length,
      matches,
      sinMatch,
      motivoPrincipal,
    });
  }

  // Ordenar por casos con fallos primero
  reportes.sort((a, b) => {
    const fallaA = a.matches === 0 && a.excelFilas > 0;
    const fallaB = b.matches === 0 && b.excelFilas > 0;
    if (fallaA && !fallaB) return -1;
    if (!fallaA && fallaB) return 1;
    return a.clientName.localeCompare(b.clientName, 'es');
  });

  console.log(JSON.stringify(reportes, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
