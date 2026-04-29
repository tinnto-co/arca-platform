/**
 * Muestra todos los empleados CCT 130/75 sin categoria_id pero con valor_sueldo,
 * indicando el match con la escala de Marzo 2026.
 *
 * Uso: bun run src/scripts/reporte-grupo-c-tabla.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

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

const montoCodigos = new Map<number, string[]>();
for (const [cod, monto] of Object.entries(ESCALAS_MARZO)) {
  if (!montoCodigos.has(monto)) montoCodigos.set(monto, []);
  montoCodigos.get(monto)!.push(cod);
}

const rows = await sql`
  SELECT
    p.name as empresa,
    e.nombre,
    e.valor_sueldo::numeric::integer as monto
  FROM liquidacion_import_empleado e
  JOIN profile p ON p.id = e.profile_id
  JOIN payroll_convenio pc ON pc.id = e.convenio_id
  WHERE pc.cct_codigo = '130/75'
    AND e.categoria_id IS NULL
    AND e.valor_sueldo IS NOT NULL
  ORDER BY p.name, e.nombre
`;

const col = { empresa: 30, nombre: 38, monto: 14, match: 28 };
const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
const sep = '-'.repeat(col.empresa + col.nombre + col.monto + col.match + 9);

console.log(sep);
console.log(
  '| ' + pad('Empresa', col.empresa) +
  '| ' + pad('Empleado', col.nombre) +
  '| ' + pad('Monto', col.monto) +
  '| ' + pad('Match escala Marzo 2026', col.match) + '|'
);
console.log(sep);

for (const r of rows) {
  const monto = Number(r.monto);
  const codigos = montoCodigos.get(monto);
  let matchStr: string;
  if (!codigos) {
    matchStr = 'sin match';
  } else if (codigos.length === 1) {
    matchStr = codigos[0]!;
  } else {
    matchStr = codigos.join(' / ') + ' (ambiguo)';
  }

  console.log(
    '| ' + pad(r.empresa, col.empresa) +
    '| ' + pad(r.nombre, col.nombre) +
    '| ' + pad('$' + monto.toLocaleString('es-AR'), col.monto) +
    '| ' + pad(matchStr, col.match) + '|'
  );
}

console.log(sep);
console.log(`Total: ${rows.length}`);

await sql.end();
process.exit(0);
