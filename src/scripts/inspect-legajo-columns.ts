/**
 * Inspecciona las columnas de los Excels de legajos para identificar el campo categoría.
 */
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import { parseSosLegajosRows } from '@/lib/parse-sos-legajos-sheet';

const BASE_DIR = 'C:\\Users\\Brian\\Downloads\\SOS_empresas_legajos';

function findFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}\\${entry.name}`;
    if (entry.isDirectory()) out.push(...findFiles(full));
    else if (/\.(xlsx|xls)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = findFiles(BASE_DIR);
console.log(`Total archivos: ${files.length}\n`);

// Tomar el primer archivo y mostrar todas las columnas disponibles
const wb = XLSX.readFile(files[0]);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = parseSosLegajosRows(ws);

if (rows.length > 0) {
  console.log('Columnas del Excel:', Object.keys(rows[0]).join(', '));
  console.log('\nPrimera fila de datos:');
  for (const [k, v] of Object.entries(rows[0])) {
    if (v != null && String(v).trim()) console.log(`  ${k}: ${v}`);
  }
}

// Buscar columna de categoría en todos los archivos
const catKeys = new Set<string>();
for (const file of files.slice(0, 10)) {
  const wb2 = XLSX.readFile(file);
  const ws2 = wb2.Sheets[wb2.SheetNames[0]];
  const rows2 = parseSosLegajosRows(ws2);
  if (rows2.length > 0) {
    for (const k of Object.keys(rows2[0])) {
      if (k.includes('categ') || k.includes('cargo') || k.includes('puesto')) catKeys.add(k);
    }
  }
}
console.log('\nColumnas relacionadas a categoría/cargo encontradas:', [...catKeys].join(', ') || 'ninguna');
