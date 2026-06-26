/**
 * Compara el LSD generado vs referencia para E-presis S.A. Mayo 2026.
 * Compara por CUIL (no por posición de línea) para ignorar diferencias de orden.
 */

import { readFileSync } from 'fs';
import { db } from '@/lib/db';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { aliasedTable } from 'drizzle-orm';
import {
  client, payrollTipoEmpresa, payrollParametrosPeriodo,
  liquidacionImportRecibo, liquidacionImportEmpleado, liquidacionImportConceptoValor,
  payrollConcepto, payrollSituacion, payrollCondicion, payrollActividad,
  payrollModalidadContratacion, payrollSiniestrado, payrollLocalidad, obraSocial,
} from '@/drizzle/schema';

const PROFILE_ID = '53adfe1f-7142-4af4-b9cd-e80ddf21e66f';
const PERIODO = '2026-05';
const REF_FILE = 'C:/Users/Brian/Downloads/30-71755486-4_2026-5_0__LSD.txt';

function montoCentavos(v: string | number | null | undefined) { return v == null ? 0 : Math.round(Math.abs(parseFloat(String(v))) * 100); }
function lsdMoney(c: number) { return String(c).padStart(15, '0'); }

// ── Generar LSD ───────────────────────────────────────────────────────────────
const [employer] = await db.select({ cuit: client.identityNumber, codigoLsd: payrollTipoEmpresa.codigoLsd, seguroColectivo: client.seguroColectivo, mipyme: client.mipyme })
  .from(client).leftJoin(payrollTipoEmpresa, eq(client.tipoEmpresaId, payrollTipoEmpresa.id)).where(eq(client.id, PROFILE_ID)).limit(1);
if (!employer) throw new Error('Empresa no encontrada');
const cuit = employer.cuit.replace(/[-\s]/g, '').padStart(11, '0');
const tipoEmpleadorCode = (employer.codigoLsd ?? '1').charAt(0);

const [paramsPeriodo] = await db.select({ topeMaximoImponible: payrollParametrosPeriodo.topeMaximoImponible })
  .from(payrollParametrosPeriodo).where(eq(payrollParametrosPeriodo.periodo, PERIODO)).limit(1);
const topeCentavos = paramsPeriodo ? montoCentavos(paramsPeriodo.topeMaximoImponible) : null;

const sit1Alias = aliasedTable(payrollSituacion, 'sit1');
const sit2Alias = aliasedTable(payrollSituacion, 'sit2');
const sit3Alias = aliasedTable(payrollSituacion, 'sit3');

const recibos = await db.select({
  recibo: liquidacionImportRecibo, empleado: liquidacionImportEmpleado,
  sit1Codigo: sit1Alias.codigo, sit2Codigo: sit2Alias.codigo, sit3Codigo: sit3Alias.codigo,
  condicionCodigo: payrollCondicion.codigo, actividadCodigo: payrollActividad.codigo,
  modalidadCodigo: payrollModalidadContratacion.codigo, siniestradoCodigo: payrollSiniestrado.codigo,
  localidadCodigo: payrollLocalidad.codigo, obraSocialCodigo: obraSocial.codigo,
}).from(liquidacionImportRecibo)
  .innerJoin(liquidacionImportEmpleado, eq(liquidacionImportRecibo.empleadoId, liquidacionImportEmpleado.id))
  .leftJoin(sit1Alias, sql`${sit1Alias.id} = COALESCE(${liquidacionImportRecibo.situacionRevista1Id}, ${liquidacionImportEmpleado.situacionId})`)
  .leftJoin(sit2Alias, eq(liquidacionImportRecibo.situacionRevista2Id, sit2Alias.id))
  .leftJoin(sit3Alias, eq(liquidacionImportRecibo.situacionRevista3Id, sit3Alias.id))
  .leftJoin(payrollCondicion, eq(liquidacionImportEmpleado.condicionId, payrollCondicion.id))
  .leftJoin(payrollActividad, eq(liquidacionImportEmpleado.actividadId, payrollActividad.id))
  .leftJoin(payrollModalidadContratacion, eq(liquidacionImportEmpleado.modalidadContratacionId, payrollModalidadContratacion.id))
  .leftJoin(payrollSiniestrado, eq(liquidacionImportEmpleado.siniestradoId, payrollSiniestrado.id))
  .leftJoin(payrollLocalidad, eq(liquidacionImportEmpleado.localidadId, payrollLocalidad.id))
  .leftJoin(obraSocial, eq(liquidacionImportEmpleado.obraSocialId, obraSocial.id))
  .where(and(eq(liquidacionImportEmpleado.clientId, PROFILE_ID), eq(liquidacionImportRecibo.periodo, PERIODO)))
  .orderBy(asc(liquidacionImportEmpleado.legajo));

const reciboIds = recibos.map(r => r.recibo.id);
const conceptoValores = reciboIds.length > 0
  ? await db.select({ valor: liquidacionImportConceptoValor, numeroSos: payrollConcepto.numeroSos })
      .from(liquidacionImportConceptoValor)
      .leftJoin(payrollConcepto, eq(liquidacionImportConceptoValor.conceptoId, payrollConcepto.id))
      .where(and(inArray(liquidacionImportConceptoValor.reciboId, reciboIds), eq(liquidacionImportConceptoValor.activoEnRecibo, true)))
      .orderBy(asc(liquidacionImportConceptoValor.codigo))
  : [];

const conceptosByRecibo = new Map<string, typeof conceptoValores>();
for (const cv of conceptoValores) {
  if (!conceptosByRecibo.has(cv.valor.reciboId)) conceptosByRecibo.set(cv.valor.reciboId, []);
  conceptosByRecibo.get(cv.valor.reciboId)!.push(cv);
}

const [year, month] = PERIODO.split('-');
const periodoLsd = `${year}${month}`;
const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
const fechaFin = `${year}${month}${String(lastDay).padStart(2, '0')}`;

// Generar por CUIL para comparación
const genByCuil = new Map<string, { r02: string; r03: string[]; r04: string }>();

for (const row of recibos) {
  const emp = row.empleado;
  const rec = row.recibo;
  const cuil = emp.cuil.replace(/[-\s]/g, '').padStart(11, '0');
  const conceptos = conceptosByRecibo.get(rec.id) ?? [];

  const r02 = (`02${cuil}${emp.legajo}`).padEnd(96) + `000${fechaFin}${' '.repeat(8)}1`;

  const r03Lines: string[] = [];
  for (const cv of conceptos) {
    const sosNum = cv.numeroSos != null ? cv.numeroSos : parseInt(cv.valor.codigo) || 0;
    if (sosNum === 0) continue;
    const sosCode = String(sosNum).padStart(3, '0');
    const cantidadRaw = cv.valor.cantidad != null ? Number(cv.valor.cantidad) : 1;
    const centavos = Math.round(Math.abs(Number(cv.valor.monto)) * 100);
    let credDeb: 'C' | 'D';
    if (cv.valor.tipoLiquidacion === 'descuento' || cv.valor.tipoLiquidacion === 'retencion') credDeb = 'D';
    else if (cv.valor.tipoLiquidacion) credDeb = 'C';
    else credDeb = (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
    const amountStr = String(centavos).padStart(15, '0');
    if (sosNum >= 400) {
      r03Lines.push(`03${cuil}${'0'.repeat(9)}${sosCode}${String(Math.round(cantidadRaw * 100)).padStart(6, '0')}$${amountStr}${credDeb}`);
    } else {
      r03Lines.push(`03${cuil}${'0'.repeat(7)}${sosCode}${String(Math.round(cantidadRaw * 100)).padStart(5, '0')}$${amountStr}${credDeb}`);
    }
  }

  let totalRemCentavos = 0, totalNonRemCentavos = 0;
  for (const cv of conceptos) {
    const sosNum = cv.numeroSos != null ? cv.numeroSos : parseInt(cv.valor.codigo) || 0;
    if (sosNum === 0) continue;
    let credDeb: 'C' | 'D';
    if (cv.valor.tipoLiquidacion === 'descuento' || cv.valor.tipoLiquidacion === 'retencion') credDeb = 'D';
    else if (cv.valor.tipoLiquidacion) credDeb = 'C';
    else credDeb = (sosNum >= 200 && sosNum < 400) || sosNum >= 500 ? 'D' : 'C';
    if (credDeb === 'C') {
      const c = Math.round(Math.abs(Number(cv.valor.monto)) * 100);
      if (sosNum >= 1 && sosNum <= 399) totalRemCentavos += c;
      else if (sosNum >= 400 && sosNum <= 499) totalNonRemCentavos += c;
    }
  }
  const brutaCentavos = totalRemCentavos + totalNonRemCentavos;
  const applyTope = (v: number) => topeCentavos != null ? Math.min(v, topeCentavos) : v;
  const rem4y8Base = rec.rem4y8Override != null ? montoCentavos(rec.rem4y8Override) : brutaCentavos;
  const rem9Base = rec.rem9Override != null ? montoCentavos(rec.rem9Override) : brutaCentavos;

  const baseDifLRT = Math.max(0, brutaCentavos - applyTope(totalRemCentavos));
  const baseDifAporOS = Math.max(0, applyTope(rem4y8Base) - brutaCentavos);
  const baseDifContOS = Math.max(0, rem4y8Base - brutaCentavos);

  const moneyFields = [
    lsdMoney(0), lsdMoney(montoCentavos(rec.contribucionAdicionalOS)),
    lsdMoney(baseDifAporOS), lsdMoney(baseDifContOS), lsdMoney(baseDifLRT),
    lsdMoney(montoCentavos(rec.importeMaternidadArt13)),
    lsdMoney(brutaCentavos), lsdMoney(applyTope(totalRemCentavos)),
    lsdMoney(totalRemCentavos), lsdMoney(totalRemCentavos),
    lsdMoney(applyTope(rem4y8Base)), lsdMoney(applyTope(totalRemCentavos)),
    lsdMoney(0), lsdMoney(0),
    lsdMoney(rem4y8Base), lsdMoney(rem9Base),
    lsdMoney(0), lsdMoney(0), lsdMoney(0),
    lsdMoney(montoCentavos(rec.importeADetraerLey27430)),
  ].join('');

  const lsdAlpha = (code: string | null | undefined, len: number) =>
    (parseInt(code ?? '0') || 0).toString().padEnd(len, ' ');

  const sit1 = row.sit1Codigo ?? '';
  const sit2 = row.sit2Codigo ?? '';
  const sit3 = row.sit3Codigo ?? '';
  const r04Header =
    `04${cuil}` +
    ((emp.conyuge ?? 0) > 0 ? '1' : '0') + String(emp.hijos ?? 0).padStart(2, '0') +
    (emp.convenioId ? '1' : '0') + (employer.seguroColectivo ? '1' : '0') + (employer.mipyme ? '1' : '0') +
    tipoEmpleadorCode + '0' +
    lsdAlpha(sit1 || '1', 2) +
    lsdAlpha(row.condicionCodigo ?? '1', 2) +
    (row.actividadCodigo ?? '000').padStart(3, '0') +
    lsdAlpha(row.modalidadCodigo ?? '1', 3) +
    lsdAlpha(row.siniestradoCodigo ?? '0', 2) +
    (row.localidadCodigo ?? '00').padStart(2, '0') +
    (sit1 ? lsdAlpha(sit1, 2) : '  ') + (sit1 ? String(rec.situacionRevista1DiaInicio ?? 1).padStart(2, '0') : '  ') +
    (sit2 ? lsdAlpha(sit2, 2) : '  ') + (sit2 ? String(rec.situacionRevista2DiaInicio ?? 1).padStart(2, '0') : '00') +
    (sit3 ? lsdAlpha(sit3, 2) : '  ') + (sit3 ? String(rec.situacionRevista3DiaInicio ?? 1).padStart(2, '0') : '00') +
    String(rec.diasTrabajados ?? 30).padStart(2, '0') +
    '000' + '00000' + '00000' +
    (row.obraSocialCodigo ?? '').padEnd(6, ' ') +
    String(emp.adherentes ?? 0).padStart(2, '0');

  genByCuil.set(cuil, { r02, r03: r03Lines, r04: r04Header + moneyFields });
}

// ── Leer referencia y agrupar por CUIL ───────────────────────────────────────
const refContent = readFileSync(REF_FILE, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const refLines = refContent.split('\n').filter(l => l.trim());

const refR01 = refLines.find(l => l.startsWith('01')) ?? '';
const refByCuil = new Map<string, { r02: string; r03: string[]; r04: string }>();

for (const line of refLines) {
  const tipo = line.slice(0, 2);
  if (tipo === '01') continue;
  const cuil = line.slice(2, 13);
  if (!refByCuil.has(cuil)) refByCuil.set(cuil, { r02: '', r03: [], r04: '' });
  const entry = refByCuil.get(cuil)!;
  if (tipo === '02') entry.r02 = line.trimEnd();
  else if (tipo === '03') entry.r03.push(line.trimEnd());
  else if (tipo === '04') entry.r04 = line.trimEnd();
}

// ── Comparar ─────────────────────────────────────────────────────────────────
console.log('='.repeat(70));
console.log('COMPARACIÓN LSD E-presis Mayo 2026 (agrupado por CUIL)');
console.log('='.repeat(70));

// R01
console.log('\n── Record 01 ──');
const genR01 = `01${cuit}SJ${periodoLsd}M${'0'.padStart(6, '0')}${String(recibos.length).padStart(7, '0')}`;
if (genR01 === refR01.trimEnd()) {
  console.log('✓ R01 idéntico');
} else {
  console.log('✗ R01 difiere:');
  console.log(`  GEN: ${genR01}`);
  console.log(`  REF: ${refR01.trimEnd()}`);
  // Mostrar campo a campo
  for (let i = 0; i < Math.max(genR01.length, refR01.trimEnd().length); i++) {
    if (genR01[i] !== refR01.trimEnd()[i]) {
      console.log(`  Pos ${i}: GEN='${genR01[i]}' REF='${refR01.trimEnd()[i]}'`);
    }
  }
}

// Por empleado
const allCuils = new Set([...genByCuil.keys(), ...refByCuil.keys()]);
let r03Ok = 0, r03Diff = 0, r04MoneyOk = 0, r04MoneyDiff = 0, r04HeaderDiff = 0;

console.log('\n── Records 03 y 04 por empleado ──\n');

for (const cuil of [...allCuils].sort()) {
  const gen = genByCuil.get(cuil);
  const ref = refByCuil.get(cuil);

  if (!gen) { console.log(`[${cuil}] Solo en REF`); continue; }
  if (!ref) { console.log(`[${cuil}] Solo en GEN`); continue; }

  const r04GenMoney = gen.r04.slice(70);
  const r04RefMoney = ref.r04.slice(70);
  const r04GenHeader = gen.r04.slice(0, 70);
  const r04RefHeader = ref.r04.slice(0, 70);

  const moneyMatch = r04GenMoney === r04RefMoney;
  const headerMatch = r04GenHeader === r04RefHeader;

  // Comparar R03 por contenido (sos + monto + CD), ignorando diferencias de padding/formato
  const parseR03Line = (l: string) => {
    if (l[28] === '$') return { sos: l.slice(20, 23), amount: l.slice(29, 44), cd: l[44] };
    else return { sos: l.slice(22, 25), amount: l.slice(32, 47), cd: l[47] };
  };
  const fmtR03 = (lines: string[]) => lines.map(l => { const p = parseR03Line(l); return `${p.sos}=${(parseInt(p.amount) / 100).toFixed(2)}${p.cd}`; }).sort();
  const genR03Parsed = fmtR03(gen.r03);
  const refR03Parsed = fmtR03(ref.r03);
  const r03Match = JSON.stringify(genR03Parsed) === JSON.stringify(refR03Parsed);

  if (r03Match) r03Ok++; else r03Diff++;
  if (moneyMatch) r04MoneyOk++; else r04MoneyDiff++;
  if (!headerMatch) r04HeaderDiff++;

  const prefix = moneyMatch && r03Match ? '✓' : '✗';
  console.log(`[${cuil}]`);
  console.log(`  R03 conceptos: ${r03Match ? '✓ OK' : `✗ DIFIERE (gen:${gen.r03.length} ref:${ref.r03.length})`}`);
  console.log(`  R04 header:    ${headerMatch ? '✓ OK' : '✗ DIFIERE'}`);
  console.log(`  R04 monetary:  ${moneyMatch ? '✓ OK' : '✗ DIFIERE'}`);

  if (!headerMatch) {
    console.log(`    GEN header: ${r04GenHeader}`);
    console.log(`    REF header: ${r04RefHeader}`);
    const diffs: number[] = [];
    for (let i = 0; i < 70; i++) if (r04GenHeader[i] !== r04RefHeader[i]) diffs.push(i);
    console.log(`    Diffs en pos: ${diffs.join(', ')}`);
  }

  if (!moneyMatch) {
    // Mostrar las 20 bases (15 chars cada una)
    console.log('    Campo  | GEN (pesos)       | REF (pesos)       | Match');
    const labels = ['AporAdicOS','ContribAdicOS','BaseDifAporOS','BaseDifContOS','BaseDifLRT','RemMatern','Bruta','B1-JubApor','B2-JubContr','B3-PAMI','B4-OSApor','B5-FNE','B6','B7','B8-OSContr','B9-ART','BaseDifSSAp','BaseDifSSCo','B10','Detraer27430'];
    for (let f = 0; f < 20; f++) {
      const gVal = r04GenMoney.slice(f * 15, f * 15 + 15);
      const rVal = r04RefMoney.slice(f * 15, f * 15 + 15);
      if (gVal !== rVal) {
        const gPesos = (parseInt(gVal) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        const rPesos = (parseInt(rVal) / 100).toLocaleString('es-AR', { minimumFractionDigits: 2 });
        console.log(`    ${(labels[f] ?? `F${f+1}`).padEnd(14)} | $${gPesos.padStart(17)} | $${rPesos.padStart(17)} | ✗`);
      }
    }
  }

  if (!r03Match) {
    const onlyGen = genR03Parsed.filter(x => !refR03Parsed.includes(x));
    const onlyRef = refR03Parsed.filter(x => !genR03Parsed.includes(x));
    if (onlyGen.length) console.log(`    Solo en GEN: ${onlyGen.join(', ')}`);
    if (onlyRef.length) console.log(`    Solo en REF: ${onlyRef.join(', ')}`);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`R03: ${r03Ok}/${allCuils.size} empleados OK | ${r03Diff} con diferencias`);
console.log(`R04 monetary: ${r04MoneyOk}/${allCuils.size} empleados OK | ${r04MoneyDiff} con diferencias`);
console.log(`R04 header: ${allCuils.size - r04HeaderDiff}/${allCuils.size} OK | ${r04HeaderDiff} con diferencias`);
console.log('='.repeat(70));

process.exit(0);
