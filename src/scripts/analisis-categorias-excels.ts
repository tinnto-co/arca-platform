/**
 * Analiza el match entre categorías en los Excels de SOS y payroll_convenio_categoria.
 * Muestra qué matchea, qué no, y cuántos empleados hay en cada caso.
 */
import 'dotenv/config';
import fs from 'node:fs';
import * as XLSX from 'xlsx';
import postgres from 'postgres';
import { parseSosLegajosRows, normalizeCuilValue } from '@/lib/parse-sos-legajos-sheet';

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

function norm(s: unknown): string {
  if (s == null) return '';
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes
    .replace(/\s+/g, ' ');
}

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });

  // Cargar todos los empleados de la BD con su CUIL, convenio y cliente
  const empleados = await c`
    SELECT lie.cuil, lie.nombre, lie.categoria, lie.categoria_id,
           lie.convenio_id, lie.profile_id,
           p.client_id, cl.name AS client_name
    FROM liquidacion_import_empleado lie
    JOIN profile p ON lie.profile_id = p.id
    JOIN client cl ON p.client_id = cl.id
  ` as { cuil: string; nombre: string; categoria: string | null; categoria_id: string | null; convenio_id: string | null; profile_id: string; client_id: string; client_name: string }[];

  // Cargar categorías por convenio
  const catRows = await c`
    SELECT pcc.id, pcc.nombre AS cat_nombre, pcc.convenio_id,
           pc.client_id, pc.nombre AS convenio_nombre
    FROM payroll_convenio_categoria pcc
    JOIN payroll_convenio pc ON pcc.convenio_id = pc.id
  ` as { id: string; cat_nombre: string; convenio_id: string; client_id: string; convenio_nombre: string }[];

  // Índice: client_id → lista de categorías
  const catsByClient = new Map<string, typeof catRows>();
  for (const r of catRows) {
    const list = catsByClient.get(r.client_id) ?? [];
    list.push(r);
    catsByClient.set(r.client_id, list);
  }

  // Leer todos los Excels y mapear CUIL → categoria texto
  const cuilToExcelCat = new Map<string, string>();
  for (const file of findFiles(BASE_DIR)) {
    const wb = XLSX.readFile(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = parseSosLegajosRows(ws);
    for (const row of rows) {
      const cuil = normalizeCuilValue(row.cuil);
      const cat = String(row.categoria ?? '').trim();
      if (cuil && cat) cuilToExcelCat.set(cuil, cat);
    }
  }
  console.log(`Empleados en BD: ${empleados.length} | Con CUIL en Excel: ${[...cuilToExcelCat.keys()].filter(k => empleados.some(e => e.cuil === k)).length}\n`);

  // Intentar match para cada empleado
  const matched: { cuil: string; nombre: string; client: string; excelCat: string; matchedCat: string; catId: string }[] = [];
  const noMatch: { cuil: string; nombre: string; client: string; excelCat: string; available: string[] }[] = [];
  const sinCategoria: { cuil: string; nombre: string; client: string }[] = [];
  const sinConvenio: { cuil: string; nombre: string; client: string; excelCat: string }[] = [];

  for (const emp of empleados) {
    if (emp.categoria_id) continue; // ya tiene FK asignado

    const excelCat = cuilToExcelCat.get(emp.cuil);
    if (!excelCat || norm(excelCat) === 'sin categoria' || norm(excelCat) === '') {
      sinCategoria.push({ cuil: emp.cuil, nombre: emp.nombre, client: emp.client_name });
      continue;
    }

    const cats = catsByClient.get(emp.client_id) ?? [];
    if (cats.length === 0) {
      sinConvenio.push({ cuil: emp.cuil, nombre: emp.nombre, client: emp.client_name, excelCat });
      continue;
    }

    // Intentar match exacto normalizado
    const normExcel = norm(excelCat);
    let found = cats.find(cat => norm(cat.cat_nombre) === normExcel);

    // Si no hay match exacto, intentar match parcial (contiene)
    if (!found) {
      found = cats.find(cat => {
        const nc = norm(cat.cat_nombre);
        return nc.includes(normExcel) || normExcel.includes(nc);
      });
    }

    if (found) {
      matched.push({
        cuil: emp.cuil,
        nombre: emp.nombre,
        client: emp.client_name,
        excelCat,
        matchedCat: found.cat_nombre,
        catId: found.id,
      });
    } else {
      noMatch.push({
        cuil: emp.cuil,
        nombre: emp.nombre,
        client: emp.client_name,
        excelCat,
        available: cats.slice(0, 5).map(c => c.cat_nombre),
      });
    }
  }

  // ── RESULTADOS ────────────────────────────────────────────────────────────
  console.log('═'.repeat(70));
  console.log(`MATCHES ENCONTRADOS: ${matched.length}`);
  console.log('═'.repeat(70));
  // Agrupar por excelCat → matchedCat para ver el mapeo
  const matchMap = new Map<string, { matchedCat: string; n: number }>();
  for (const m of matched) {
    const key = `${norm(m.excelCat)}→${m.matchedCat}`;
    const prev = matchMap.get(key) ?? { matchedCat: m.matchedCat, n: 0 };
    matchMap.set(key, { matchedCat: m.matchedCat, n: prev.n + 1 });
  }
  for (const [key, val] of [...matchMap.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const excelPart = key.split('→')[0];
    console.log(`  x${String(val.n).padStart(3)} | Excel: "${excelPart}" → BD: "${val.matchedCat}"`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`SIN MATCH (requieren revisión manual): ${noMatch.length}`);
  console.log('═'.repeat(70));
  // Agrupar por texto de categoría del Excel
  const noMatchByText = new Map<string, { clients: Set<string>; n: number; available: string[] }>();
  for (const nm of noMatch) {
    const prev = noMatchByText.get(nm.excelCat) ?? { clients: new Set(), n: 0, available: nm.available };
    prev.clients.add(nm.client);
    prev.n++;
    noMatchByText.set(nm.excelCat, prev);
  }
  for (const [cat, val] of [...noMatchByText.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  x${String(val.n).padStart(3)} | "${cat}" | clientes: ${[...val.clients].join(', ')}`);
    console.log(`         Disponibles: ${val.available.join(' / ')}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`SIN CATEGORÍA EN EXCEL (o "Sin Categoria"): ${sinCategoria.length}`);
  console.log('═'.repeat(70));
  const sinCatByClient = new Map<string, number>();
  for (const s of sinCategoria) sinCatByClient.set(s.client, (sinCatByClient.get(s.client) ?? 0) + 1);
  for (const [client, n] of [...sinCatByClient.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  x${String(n).padStart(3)} | ${client}`);

  console.log('\n' + '═'.repeat(70));
  console.log(`SIN CONVENIO CARGADO EN BD: ${sinConvenio.length}`);
  console.log('═'.repeat(70));
  for (const s of sinConvenio) console.log(`  ${s.client.padEnd(25)} | ${s.nombre} | "${s.excelCat}"`);

  console.log('\n═'.repeat(70));
  console.log(`RESUMEN: ${matched.length} match | ${noMatch.length} sin match | ${sinCategoria.length} sin cat | ${sinConvenio.length} sin convenio`);

  await c.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
