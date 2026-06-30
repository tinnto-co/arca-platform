/**
 * Informe comparativo completo: local vs producción.
 * Analiza estructura, volumen y coherencia de datos.
 */
import postgres from 'postgres';
import { writeFileSync } from 'fs';

const local = postgres('postgres://arca:arca@localhost:5432/arca');
const prod  = postgres('postgres://postgres:o1qdc9ZZFvzaPZ2MguML6263LcB0aeQTUTqAWs5Utc2kyYJuTIJo2Sz33wvMYtQy@5.78.132.83:5438/postgres');

const lines: string[] = [];
const log = (s = '') => { lines.push(s); console.log(s); };

async function count(db: postgres.Sql, table: string): Promise<number> {
  try {
    const r = await db.unsafe(`SELECT COUNT(*) as c FROM ${table}`);
    return Number((r[0] as any).c);
  } catch { return -1; }
}

async function sample(db: postgres.Sql, table: string, cols: string, limit = 5): Promise<any[]> {
  try {
    return await db.unsafe(`SELECT ${cols} FROM ${table} LIMIT ${limit}`);
  } catch { return []; }
}

async function columns(db: postgres.Sql, table: string): Promise<string[]> {
  try {
    const r = await db.unsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position
    `, [table]);
    return r.map((x: any) => x.column_name);
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════════════════════
log('# INFORME COMPARATIVO: BASE LOCAL vs PRODUCCIÓN');
log(`Generado: ${new Date().toLocaleString('es-AR')}`);
log('');

// ═══════════════════════════════════════════════════════════════════════
log('## 1. VOLUMEN DE TABLAS');
log('');
log('| Tabla                              | Local  | Prod   | Diferencia |');
log('|------------------------------------|--------|--------|------------|');

const tables = [
  // Auth / org
  'organization', 'user', 'member', 'client', 'profile', 'credential',
  // Catálogos AFIP
  'payroll_situacion', 'payroll_condicion', 'payroll_actividad',
  'payroll_modalidad_contratacion', 'payroll_zona', 'payroll_siniestrado',
  'payroll_tipo_empresa', 'obra_social',
  // CCT
  'payroll_convenio', 'payroll_convenio_categoria', 'payroll_escala',
  // Conceptos
  'payroll_concepto', 'conceptos_completos_sos', 'lsd_perfil_concepto',
  // Empleados y recibos
  'liquidacion_import_empleado', 'liquidacion_import_recibo', 'liquidacion_import_concepto_valor',
  // Presentaciones
  'payroll_lsd_presentacion',
  // Contabilidad
  'invoice', 'movements', 'notification', 'job',
];

for (const t of tables) {
  const [l, p] = await Promise.all([count(local, t), count(prod, t)]);
  if (l === -1 && p === -1) continue;
  const ls = l === -1 ? 'N/A' : String(l);
  const ps = p === -1 ? 'N/A' : String(p);
  const diff = l === -1 || p === -1 ? '?' : l === p ? '=' : l > p ? `+${l-p} local` : `+${p-l} prod`;
  log(`| ${t.padEnd(34)} | ${ls.padStart(6)} | ${ps.padStart(6)} | ${diff.padEnd(10)} |`);
}

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 2. ESTRUCTURA DE CATÁLOGOS AFIP');
log('');
log('### 2.1 payroll_situacion — muestra de códigos');

const [lSit, pSit] = await Promise.all([
  sample(local, 'payroll_situacion', 'codigo, nombre, codigo_sos', 8),
  sample(prod,  'payroll_situacion', 'codigo, nombre, codigo_sos', 8),
]);

log('\nLOCAL (primeros 8):');
lSit.forEach((r: any) => log(`  codigo="${r.codigo}"  codigo_sos=${r.codigo_sos ?? 'NULL'}  nombre="${r.nombre}"`));
log('\nPROD (primeros 8):');
pSit.forEach((r: any) => log(`  codigo="${r.codigo}"  codigo_sos=${r.codigo_sos ?? 'NULL'}  nombre="${r.nombre}"`));

log('');
log('### 2.2 payroll_modalidad_contratacion — muestra de códigos');
const [lCont, pCont] = await Promise.all([
  sample(local, 'payroll_modalidad_contratacion', 'codigo, nombre, codigo_sos', 5),
  sample(prod,  'payroll_modalidad_contratacion', 'codigo, nombre, codigo_sos', 5),
]);
log('\nLOCAL (primeros 5):');
lCont.forEach((r: any) => log(`  codigo="${r.codigo}"  codigo_sos=${r.codigo_sos ?? 'NULL'}  nombre="${r.nombre?.slice(0,60)}"`));
log('\nPROD (primeros 5):');
pCont.forEach((r: any) => log(`  codigo="${r.codigo}"  codigo_sos=${r.codigo_sos ?? 'NULL'}  nombre="${r.nombre?.slice(0,60)}"`));

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 3. COLUMNAS — diferencias de schema');
log('');

const schemaTables = [
  'client', 'payroll_situacion', 'payroll_convenio',
  'liquidacion_import_empleado', 'liquidacion_import_recibo',
];

for (const t of schemaTables) {
  const [lc, pc] = await Promise.all([columns(local, t), columns(prod, t)]);
  const onlyLocal = lc.filter(c => !pc.includes(c));
  const onlyProd  = pc.filter(c => !lc.includes(c));
  if (onlyLocal.length > 0 || onlyProd.length > 0) {
    log(`### ${t}`);
    if (onlyLocal.length) log(`  Solo en LOCAL:  ${onlyLocal.join(', ')}`);
    if (onlyProd.length)  log(`  Solo en PROD:   ${onlyProd.join(', ')}`);
    log('');
  } else {
    log(`✓ ${t} — columnas idénticas`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 4. CONVENIOS CCT');
log('');

const [lConv, pConv] = await Promise.all([
  local.unsafe(`SELECT cct_codigo as codigo, nombre FROM payroll_convenio ORDER BY cct_codigo`),
  prod.unsafe(`SELECT cct_codigo as codigo, nombre FROM payroll_convenio ORDER BY cct_codigo`),
]);

const lConvSet = new Set(lConv.map((r: any) => r.codigo));
const pConvSet = new Set(pConv.map((r: any) => r.codigo));

const onlyLocalConv = lConv.filter((r: any) => !pConvSet.has(r.codigo));
const onlyProdConv  = pConv.filter((r: any) => !lConvSet.has(r.codigo));

log(`Total local: ${lConv.length}  |  Total prod: ${pConv.length}`);

if (onlyLocalConv.length) {
  log(`\nSolo en LOCAL (${onlyLocalConv.length}):`);
  onlyLocalConv.forEach((r: any) => log(`  ${r.codigo} — ${r.nombre}`));
}
if (onlyProdConv.length) {
  log(`\nSolo en PROD (${onlyProdConv.length}):`);
  onlyProdConv.forEach((r: any) => log(`  ${r.codigo} — ${r.nombre}`));
}

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 5. ESCALAS — rango de fechas');
log('');

const [lEsc, pEsc] = await Promise.all([
  local.unsafe(`SELECT MIN(vigencia_desde) as min, MAX(vigencia_desde) as max, COUNT(*) as c FROM payroll_escala`),
  prod.unsafe(`SELECT MIN(vigencia_desde) as min, MAX(vigencia_desde) as max, COUNT(*) as c FROM payroll_escala`),
]);
log(`LOCAL: ${(lEsc[0] as any).c} escalas  |  desde ${(lEsc[0] as any).min}  hasta ${(lEsc[0] as any).max}`);
log(`PROD:  ${(pEsc[0] as any).c} escalas  |  desde ${(pEsc[0] as any).min}  hasta ${(pEsc[0] as any).max}`);

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 6. RECIBOS — distribución por período');
log('');

const [lRec, pRec] = await Promise.all([
  local.unsafe(`SELECT periodo, COUNT(*) as c FROM liquidacion_import_recibo GROUP BY periodo ORDER BY periodo`),
  prod.unsafe(`SELECT periodo, COUNT(*) as c FROM liquidacion_import_recibo GROUP BY periodo ORDER BY periodo`),
]);

const allPeriodos = [...new Set([
  ...lRec.map((r: any) => r.periodo),
  ...pRec.map((r: any) => r.periodo),
])].sort();

log('| Período   | Local | Prod |');
log('|-----------|-------|------|');
const lMap = Object.fromEntries(lRec.map((r: any) => [r.periodo, r.c]));
const pMap = Object.fromEntries(pRec.map((r: any) => [r.periodo, r.c]));
for (const p of allPeriodos) {
  log(`| ${p} | ${String(lMap[p] ?? 0).padStart(5)} | ${String(pMap[p] ?? 0).padStart(4)} |`);
}

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 7. EMPLEADOS — estado');
log('');

const [lEmp, pEmp] = await Promise.all([
  local.unsafe(`SELECT COUNT(*) as c, COUNT(DISTINCT client_id) as clientes FROM liquidacion_import_empleado`),
  prod.unsafe(`SELECT COUNT(*) as c, COUNT(DISTINCT client_id) as clientes FROM liquidacion_import_empleado`),
]);
log(`LOCAL: ${(lEmp[0] as any).c} empleados en ${(lEmp[0] as any).clientes} clientes`);
log(`PROD:  ${(pEmp[0] as any).c} empleados en ${(pEmp[0] as any).clientes} clientes`);

// ═══════════════════════════════════════════════════════════════════════
log('');
log('## 8. MIGRACIONES DRIZZLE APLICADAS');
log('');

const [lMig, pMig] = await Promise.all([
  local.unsafe(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`),
  prod.unsafe(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`),
]);

log('LOCAL:');
lMig.forEach((r: any) => log(`  ${r.hash}`));
log('PROD:');
pMig.forEach((r: any) => log(`  ${r.hash}`));

// ═══════════════════════════════════════════════════════════════════════
log('');
log('---');
log('Fin del informe.');

const filename = 'informe-bases.md';
writeFileSync(filename, lines.join('\n'));
log(`\nGuardado en: ${filename}`);

await local.end();
await prod.end();
