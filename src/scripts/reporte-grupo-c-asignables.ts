/**
 * Muestra solo los empleados Grupo C con match en escala Marzo 2026
 * (únicos y ambiguos), con la categoría inferida o las opciones posibles.
 *
 * Uso: bun run src/scripts/reporte-grupo-c-asignables.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

const ESCALAS_MARZO: Record<string, string> = {
  MA_A:    '1.055.795',
  MA_B:    '1.058.852',
  MA_C:    '1.069.560',
  ADM_A:   '1.067.268',
  ADM_B:   '1.071.860',
  ADM_C:   '1.076.448',
  ADM_D:   '1.090.218',
  ADM_E:   '1.101.690',
  ADM_F:   '1.118.519',
  CAJ_A:   '1.071.091',
  CAJ_B:   '1.076.448',
  CAJ_C:   '1.083.333',
  AUX_A:   '1.071.091',
  AUX_B:   '1.078.740',
  AUX_C:   '1.103.985',
  AUESP_A: '1.080.274',
  AUESP_B: '1.094.041',
  VEN_A:   '1.071.091',
  VEN_B:   '1.094.044',
  VEN_C:   '1.101.690',
  VEN_D:   '1.118.519',
};

// Nombres completos de cada categoría
const NOMBRES: Record<string, string> = {
  MA_A:    'Maestranza A',
  MA_B:    'Maestranza B',
  MA_C:    'Maestranza C',
  ADM_A:   'Administrativo A',
  ADM_B:   'Administrativo B',
  ADM_C:   'Administrativo C',
  ADM_D:   'Administrativo D',
  ADM_E:   'Administrativo E',
  ADM_F:   'Administrativo F',
  CAJ_A:   'Cajeros A',
  CAJ_B:   'Cajeros B',
  CAJ_C:   'Cajeros C',
  AUX_A:   'Personal Auxiliar A',
  AUX_B:   'Personal Auxiliar B',
  AUX_C:   'Personal Auxiliar C',
  AUESP_A: 'Aux Especializado A',
  AUESP_B: 'Aux Especializado B',
  VEN_A:   'Vendedores A',
  VEN_B:   'Vendedores B',
  VEN_C:   'Vendedores C',
  VEN_D:   'Vendedores D',
};

const montoCodigos = new Map<number, string[]>();
for (const [cod, montoStr] of Object.entries(ESCALAS_MARZO)) {
  const monto = Number(montoStr.replace(/\./g, ''));
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

const asignables = rows
  .map(r => {
    const monto = Number(r.monto);
    const codigos = montoCodigos.get(monto);
    if (!codigos) return null;
    return { empresa: r.empresa, nombre: r.nombre, monto, codigos };
  })
  .filter(Boolean) as { empresa: string; nombre: string; monto: number; codigos: string[] }[];

const col = { empresa: 28, nombre: 38, monto: 14, cats: 42 };
const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
const sep = '-'.repeat(col.empresa + col.nombre + col.monto + col.cats + 9);

console.log(sep);
console.log(
  '| ' + pad('Empresa', col.empresa) +
  '| ' + pad('Empleado', col.nombre) +
  '| ' + pad('Monto', col.monto) +
  '| ' + pad('Categoría a asignar', col.cats) + '|'
);
console.log(sep);

for (const r of asignables) {
  const cats = r.codigos.map(c => `${c} (${NOMBRES[c]})`).join('  /  ');
  const ambiguo = r.codigos.length > 1 ? ' [?]' : '';
  console.log(
    '| ' + pad(r.empresa, col.empresa) +
    '| ' + pad(r.nombre, col.nombre) +
    '| ' + pad('$' + r.monto.toLocaleString('es-AR'), col.monto) +
    '| ' + pad(cats + ambiguo, col.cats) + '|'
  );
}

console.log(sep);
console.log(`Total asignables: ${asignables.length} (${asignables.filter(r => r.codigos.length === 1).length} únicos, ${asignables.filter(r => r.codigos.length > 1).length} ambiguos)`);

await sql.end();
process.exit(0);
