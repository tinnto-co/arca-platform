/**
 * Diff bidireccional local ↔ prod por ID.
 * Muestra qué hay en local que falta en prod y viceversa.
 */
import postgres from 'postgres';

const local = postgres('postgres://arca:arca@localhost:5432/arca');
const prod  = postgres('postgres://postgres:o1qdc9ZZFvzaPZ2MguML6263LcB0aeQTUTqAWs5Utc2kyYJuTIJo2Sz33wvMYtQy@5.78.132.83:5438/postgres');

async function diff(table: string) {
  const [lRows, pRows] = await Promise.all([
    local.unsafe(`SELECT id FROM ${table}`),
    prod.unsafe(`SELECT id FROM ${table}`),
  ]);
  const localIds = new Set(lRows.map((r: any) => r.id));
  const prodIds  = new Set(pRows.map((r: any) => r.id));

  const onlyLocal = lRows.filter((r: any) => !prodIds.has(r.id));
  const onlyProd  = pRows.filter((r: any) => !localIds.has(r.id));

  if (onlyLocal.length > 0 || onlyProd.length > 0) {
    console.log(`\n  ${table}`);
    if (onlyLocal.length > 0) console.log(`    → solo en LOCAL (falta en prod):  ${onlyLocal.length} registros`);
    if (onlyProd.length > 0)  console.log(`    ← solo en PROD  (falta en local): ${onlyProd.length} registros`);
  } else {
    console.log(`  ✓  ${table} — sincronizado`);
  }

  return { onlyLocal: onlyLocal.map((r: any) => r.id), onlyProd: onlyProd.map((r: any) => r.id) };
}

console.log('\n=== Catálogos AFIP (por codigo, no ID) ===');
for (const table of ['payroll_situacion','payroll_condicion','payroll_actividad','payroll_modalidad_contratacion','payroll_siniestrado']) {
  const [l, p] = await Promise.all([
    local.unsafe(`SELECT codigo FROM ${table}`),
    prod.unsafe(`SELECT codigo FROM ${table}`),
  ]);
  const lc = new Set(l.map((r: any) => r.codigo));
  const pc = new Set(p.map((r: any) => r.codigo));
  const onlyL = l.filter((r: any) => !pc.has(r.codigo));
  const onlyP = p.filter((r: any) => !lc.has(r.codigo));
  if (onlyL.length > 0 || onlyP.length > 0) {
    console.log(`\n  ${table}`);
    if (onlyL.length > 0) console.log(`    → solo en LOCAL: ${onlyL.map((r: any) => r.codigo).join(', ')}`);
    if (onlyP.length > 0) console.log(`    ← solo en PROD:  ${onlyP.map((r: any) => r.codigo).join(', ')}`);
  } else {
    console.log(`  ✓  ${table}`);
  }
}

console.log('\n=== Payroll (por ID UUID) ===');
await diff('payroll_convenio');
await diff('payroll_convenio_categoria');
await diff('payroll_escala');
await diff('payroll_concepto');
await diff('liquidacion_import_empleado');
await diff('liquidacion_import_recibo');
await diff('liquidacion_import_concepto_valor');
await diff('payroll_lsd_presentacion');

console.log('\n=== Auth / org (informativo) ===');
await diff('organization');

console.log('');
await local.end();
await prod.end();
