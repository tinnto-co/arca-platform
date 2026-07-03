/**
 * Analiza el régimen fiscal provincial de cada empresa (representative)
 * en base a las facturas outbound importadas.
 *
 * Criterios:
 *   MULTILATERAL  → más de 1 provincia distinta en receipt_province
 *   LOCAL         → exactamente 1 provincia distinta
 *   SIN DATOS     → ninguna factura outbound, o todas con receipt_province null
 *
 * BAJA CONFIANZA  → menos de 3 facturas outbound con provincia (puede ser ruido)
 *
 * No modifica nada. Solo lectura.
 *
 * Uso: bun run src/scripts/analyze-regimen-fiscal.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const log = (s = '') => console.log(s);

// ─── Query principal ────────────────────────────────────────────────────────

const rows = await sql.unsafe(`
  SELECT
    r.id,
    r.name,
    r.cuit,
    r.convenio_multilateral,
    r.regimen_local,
    COUNT(i.id) FILTER (WHERE lower(i.direction) = 'outbound')                        AS total_outbound,
    COUNT(i.id) FILTER (WHERE lower(i.direction) = 'outbound' AND i.receipt_province IS NOT NULL AND i.receipt_province != 'sin datos') AS outbound_con_provincia,
    COUNT(DISTINCT i.receipt_province) FILTER (WHERE lower(i.direction) = 'outbound' AND i.receipt_province IS NOT NULL AND i.receipt_province != 'sin datos') AS provincias_distintas,
    array_agg(DISTINCT i.receipt_province ORDER BY i.receipt_province)
      FILTER (WHERE lower(i.direction) = 'outbound' AND i.receipt_province IS NOT NULL AND i.receipt_province != 'sin datos') AS provincias
  FROM representative r
  LEFT JOIN invoice i ON i.representative_id = r.id
  GROUP BY r.id, r.name, r.cuit, r.convenio_multilateral, r.regimen_local
  ORDER BY r.name
`);

// ─── Clasificación ──────────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string | null;
  cuit: string;
  convenio_multilateral: boolean;
  regimen_local: boolean;
  total_outbound: string;
  outbound_con_provincia: string;
  provincias_distintas: string;
  provincias: string[] | null;
};

type Regimen = 'MULTILATERAL' | 'LOCAL' | 'SIN DATOS';

function clasificar(row: Row): { regimen: Regimen; confianza: 'OK' | 'BAJA' } {
  const distintas = Number(row.provincias_distintas);
  const conProvincia = Number(row.outbound_con_provincia);

  if (distintas > 1) {
    return { regimen: 'MULTILATERAL', confianza: conProvincia < 3 ? 'BAJA' : 'OK' };
  }
  if (distintas === 1) {
    return { regimen: 'LOCAL', confianza: conProvincia < 3 ? 'BAJA' : 'OK' };
  }
  return { regimen: 'SIN DATOS', confianza: 'BAJA' };
}

// ─── Agrupados por resultado ─────────────────────────────────────────────────

const multilateral: Row[] = [];
const local: Row[]        = [];
const sinDatos: Row[]     = [];
const bajaCon: Row[]      = [];

for (const row of rows as Row[]) {
  const { regimen, confianza } = clasificar(row);
  if (confianza === 'BAJA') bajaCon.push(row);
  if (regimen === 'MULTILATERAL') multilateral.push(row);
  else if (regimen === 'LOCAL')   local.push(row);
  else                            sinDatos.push(row);
}

// ─── Helpers de formato ──────────────────────────────────────────────────────

function flagActual(row: Row): string {
  if (row.convenio_multilateral && row.regimen_local) return 'AMBOS (ERROR)';
  if (row.convenio_multilateral) return 'multilateral';
  if (row.regimen_local)         return 'local';
  return 'sin definir';
}

function printTable(rows: Row[], showProvinces = true) {
  for (const row of rows) {
    const { regimen, confianza } = clasificar(row);
    const nombre = (row.name ?? '(sin nombre)').slice(0, 40).padEnd(40);
    const cuit = row.cuit.padEnd(13);
    const prov = row.provincias?.join(', ') ?? '-';
    const distintas = String(row.provincias_distintas).padStart(2);
    const total = String(row.total_outbound).padStart(5);
    const conf = confianza === 'BAJA' ? ' *** BAJA CONFIANZA' : '';
    const flag = flagActual(row);
    const flagMismatch = (
      (regimen === 'MULTILATERAL' && !row.convenio_multilateral) ||
      (regimen === 'LOCAL' && !row.regimen_local)
    ) ? '  <-- DIFERENTE AL FLAG ACTUAL' : '';

    log(`  ${nombre} | CUIT: ${cuit} | Facturas: ${total} | Provincias: ${distintas}${conf}`);
    if (showProvinces && prov !== '-') {
      log(`    Provincias: ${prov}`);
    }
    log(`    Flag en DB: ${flag}${flagMismatch}`);
    log('');
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

log('');
log('══════════════════════════════════════════════════════════════════════');
log('  ANÁLISIS DE RÉGIMEN FISCAL PROVINCIAL');
log(`  Generado: ${new Date().toLocaleString('es-AR')}`);
log('══════════════════════════════════════════════════════════════════════');
log('');

// ─── MULTILATERAL ────────────────────────────────────────────────────────────
log(`▶ CONVENIO MULTILATERAL (${multilateral.length} empresas — facturan a más de 1 provincia)`);
log('─'.repeat(70));
if (multilateral.length === 0) {
  log('  (ninguna)');
  log('');
} else {
  printTable(multilateral);
}

// ─── LOCAL ───────────────────────────────────────────────────────────────────
log(`▶ RÉGIMEN LOCAL (${local.length} empresas — facturan a 1 sola provincia)`);
log('─'.repeat(70));
if (local.length === 0) {
  log('  (ninguna)');
  log('');
} else {
  printTable(local, false);
}

// ─── SIN DATOS ───────────────────────────────────────────────────────────────
log(`▶ SIN DATOS (${sinDatos.length} empresas — sin facturas outbound o sin receipt_province)`);
log('─'.repeat(70));
if (sinDatos.length === 0) {
  log('  (ninguna)');
  log('');
} else {
  printTable(sinDatos, false);
}

// ─── BAJA CONFIANZA ───────────────────────────────────────────────────────────
log(`▶ BAJA CONFIANZA — requieren revisión manual (${bajaCon.length} empresas)`);
log('  (menos de 3 facturas con provincia, o sin datos)');
log('─'.repeat(70));
if (bajaCon.length === 0) {
  log('  (ninguna)');
  log('');
} else {
  printTable(bajaCon);
}

// ─── RESUMEN ─────────────────────────────────────────────────────────────────
log('══════════════════════════════════════════════════════════════════════');
log('  RESUMEN');
log('──────────────────────────────────────────────────────────────────────');
log(`  Total empresas analizadas : ${rows.length}`);
log(`  Multilateral detectadas   : ${multilateral.length}`);
log(`  Régimen local detectadas  : ${local.length}`);
log(`  Sin datos suficientes     : ${sinDatos.length}`);
log(`  Baja confianza (< 3 fact) : ${bajaCon.length}`);

const inconsistentes = (rows as Row[]).filter(row => {
  const { regimen } = clasificar(row);
  return (
    (regimen === 'MULTILATERAL' && !row.convenio_multilateral) ||
    (regimen === 'LOCAL' && !row.regimen_local)
  );
});
log(`  Con flag desactualizado   : ${inconsistentes.length}`);
log('══════════════════════════════════════════════════════════════════════');
log('');
log('Para actualizar los flags, ejecutar: bun run src/scripts/set-regimen-fiscal.ts');
log('');

await sql.end();
