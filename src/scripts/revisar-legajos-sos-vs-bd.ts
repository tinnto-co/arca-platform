import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { representative, client } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';

interface PerfilSueldos {
  representativeId: string;
  representativeName: string;
  clientId: string;
  cuit: string;
}

interface ArchivoLegajo {
  filePath: string;
  cuit: string;
}

const BASE_DIR = 'C:\\Users\\Brian\\Downloads\\SOS_empresas_legajos';

const CAMPOS_CUBIERTOS = [
  'cuil',
  'cuit',
  'legajo',
  'nombre',
  'apellido',
  'fecha alta',
  'fecha ingreso',
  'fecha baja',
  'categoria',
  'convenio',
  'modo contrato',
  'jornada',
  'lugar pago',
  'forma pago',
  'cbu',
  'banco',
  'obra social',
  'activo',
];

function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-./]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarCuit(s: string): string {
  return s.replace(/\D/g, '');
}

function extraerCuitDesdeTexto(s: string): string | null {
  const match = /\d{2}-\d{8}-\d|\d{11}/.exec(s);
  if (!match) return null;
  const cuit = normalizarCuit(match[0]);
  return cuit.length === 11 ? cuit : null;
}

function listarArchivosExcel(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(xls|xlsx)$/i.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function obtenerHeadersDesdeExcel(filePath: string): string[] {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    raw: false,
  });

  for (const row of rows.slice(0, 25)) {
    const cells = row
      .map((c) => (c == null ? '' : String(c).trim()))
      .filter((c) => c.length > 0);
    if (cells.length >= 4) {
      return cells;
    }
  }
  return [];
}

function sugerirCamposNoCubiertos(headers: string[]): string[] {
  const normalizados = headers.map(normalizarTexto);
  return normalizados
    .filter((h) => h.length > 0)
    .filter((h) => !CAMPOS_CUBIERTOS.some((base) => h.includes(base)))
    .filter((h, idx, arr) => arr.indexOf(h) === idx)
    .slice(0, 20);
}

async function obtenerPerfilesConSueldos(): Promise<PerfilSueldos[]> {
  const rows = await db
    .select({
      representativeId: representative.id,
      representativeName: representative.name,
      clientId: client.id,
      cuit: client.identityNumber,
      liquidaSueldos: client.liquidaSueldos,
    })
    .from(client)
    .innerJoin(representative, eq(client.representative, representative.id))
    .where(eq(client.liquidaSueldos, true));

  return rows
    .map((r) => ({
      representativeId: r.representativeId,
      representativeName: r.representativeName,
      clientId: r.clientId,
      cuit: normalizarCuit(r.cuit ?? ''),
    }))
    .filter((r) => r.cuit.length === 11);
}

async function main() {
  const perfiles = await obtenerPerfilesConSueldos();
  const perfilesPorCuit = new Map(perfiles.map((p) => [p.cuit, p]));

  const excels = listarArchivosExcel(BASE_DIR);
  const archivosConCuit: ArchivoLegajo[] = excels
    .map((filePath) => {
      const cuit =
        extraerCuitDesdeTexto(path.basename(filePath)) ??
        extraerCuitDesdeTexto(filePath);
      return cuit ? { filePath, cuit } : null;
    })
    .filter((x): x is ArchivoLegajo => x !== null);

  const vistos = new Set<string>();
  const unArchivoPorCuit = archivosConCuit.filter((a) => {
    const key = `${a.cuit}`;
    if (vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });

  const encontrados = unArchivoPorCuit.filter((a) =>
    perfilesPorCuit.has(a.cuit)
  );
  const sinExcel = perfiles.filter(
    (p) => !unArchivoPorCuit.some((a) => a.cuit === p.cuit)
  );

  const analisis = encontrados.map((a) => {
    const perfil = perfilesPorCuit.get(a.cuit)!;
    const headers = obtenerHeadersDesdeExcel(a.filePath);
    const noCubiertos = sugerirCamposNoCubiertos(headers);
    return {
      representativeName: perfil.representativeName,
      cuit: a.cuit,
      filePath: a.filePath,
      headers,
      noCubiertos,
    };
  });

  console.log('=== RESUMEN ===');
  console.log(`Perfiles con sueldos en sistema: ${perfiles.length}`);
  console.log(`Excels detectados con CUIT: ${unArchivoPorCuit.length}`);
  console.log(`Cruzados (perfil + excel): ${analisis.length}`);
  console.log(`Perfiles sin excel detectado: ${sinExcel.length}`);
  console.log('');

  if (sinExcel.length > 0) {
    console.log('=== PERFILES SIN EXCEL EN CARPETA ===');
    for (const p of sinExcel) {
      console.log(`- ${p.representativeName} (${p.cuit})`);
    }
    console.log('');
  }

  console.log('=== ANALISIS POR PERFIL CRUZADO ===');
  for (const a of analisis) {
    console.log(`- ${a.representativeName} (${a.cuit})`);
    console.log(`  Archivo: ${a.filePath}`);
    console.log(`  Headers detectados: ${a.headers.join(' | ') || 'N/D'}`);
    if (a.noCubiertos.length === 0) {
      console.log('  Posibles campos faltantes relevantes: ninguno evidente');
    } else {
      console.log(
        `  Posibles campos faltantes relevantes: ${a.noCubiertos.join(', ')}`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
