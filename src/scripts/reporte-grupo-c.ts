/**
 * Diagnóstico Grupo C: empleados CCT 130/75 sin texto de categoria pero con valor_sueldo.
 * Intenta inferir categoria_id comparando valor_sueldo con básicos de Marzo 2026.
 *
 * Uso: bun run src/scripts/reporte-grupo-c.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Básicos Marzo 2026 por código
const ESCALAS_MARZO: Record<string, number> = {
  MA_A:    1_055_795,
  MA_B:    1_058_852,
  MA_C:    1_069_560,
  ADM_A:   1_067_268,
  ADM_B:   1_071_860,
  ADM_C:   1_076_448,
  ADM_D:   1_090_218,
  ADM_E:   1_101_690,
  ADM_F:   1_118_519,
  CAJ_A:   1_071_091,
  CAJ_B:   1_076_448,
  CAJ_C:   1_083_333,
  AUX_A:   1_071_091,
  AUX_B:   1_078_740,
  AUX_C:   1_103_985,
  AUESP_A: 1_080_274,
  AUESP_B: 1_094_041,
  VEN_A:   1_071_091,
  VEN_B:   1_094_044,
  VEN_C:   1_101_690,
  VEN_D:   1_118_519,
};

// Mapa inverso: monto → lista de códigos
const montoCodigos = new Map<number, string[]>();
for (const [cod, monto] of Object.entries(ESCALAS_MARZO)) {
  if (!montoCodigos.has(monto)) montoCodigos.set(monto, []);
  montoCodigos.get(monto)!.push(cod);
}

const rows = await sql`
  SELECT
    p.name as empresa,
    e.id,
    e.nombre,
    e.categoria,
    e.categoria_id,
    e.valor_sueldo::numeric::integer as monto
  FROM liquidacion_import_empleado e
  JOIN profile p ON p.id = e.profile_id
  JOIN payroll_convenio pc ON pc.id = e.convenio_id
  WHERE pc.cct_codigo = '130/75'
    AND e.categoria_id IS NULL
    AND e.valor_sueldo IS NOT NULL
  ORDER BY p.name, e.nombre
`;

console.log(`Total Grupo C (sin categoria_id, con valor_sueldo, CCT 130/75): ${rows.length}\n`);

const unicos: typeof rows = [];
const ambiguos: typeof rows = [];
const sinMatch: typeof rows = [];

for (const r of rows) {
  const monto = Number(r.monto);
  const codigos = montoCodigos.get(monto);
  if (!codigos) {
    sinMatch.push(r);
  } else if (codigos.length === 1) {
    unicos.push({ ...r, _codigos: codigos });
  } else {
    ambiguos.push({ ...r, _codigos: codigos });
  }
}

// ── Únicos (match exacto sin ambigüedad) ───────────────────────────────────
console.log(`=== MATCH UNICO (${unicos.length}) ===`);
for (const r of unicos) {
  console.log(`  [${r.empresa}] ${r.nombre} | $${r.monto.toLocaleString('es-AR')} → ${(r as any)._codigos[0]}`);
}

// ── Ambiguos ───────────────────────────────────────────────────────────────
console.log(`\n=== AMBIGUOS (${ambiguos.length}) ===`);
for (const r of ambiguos) {
  console.log(`  [${r.empresa}] ${r.nombre} | $${r.monto.toLocaleString('es-AR')} → podría ser: ${(r as any)._codigos.join(' / ')}`);
}

// ── Sin match ──────────────────────────────────────────────────────────────
console.log(`\n=== SIN MATCH EN ESCALA MARZO (${sinMatch.length}) ===`);
for (const r of sinMatch) {
  const texto = r.categoria ? `"${r.categoria}"` : '(sin texto)';
  console.log(`  [${r.empresa}] ${r.nombre} | ${texto} | $${r.monto.toLocaleString('es-AR')}`);
}

await sql.end();
process.exit(0);
