/**
 * Limpia datos hardcodeados de payroll_convenio y los reemplaza por la dinámica de fuentes externas.
 *
 * Paso 1: Borra escalas con fuente=null (excepto "Gerente" de E-Presis SA)
 * Paso 2: Borra categorías que quedaron sin escalas
 * Paso 3: Borra entradas MANUAL de payroll_convenio_fuente
 * Paso 4: Asigna cct_codigo a convenios null según nombre (Gastronomía→389/04, Comercio→130/75)
 * Paso 5: Fusiona duplicados (mismo client_id + cct_codigo)
 *
 * Uso: bun run src/scripts/limpiar-convenios-hardcodeados.ts
 */
import postgres from 'postgres';

const NOMBRE_A_CCT: Record<string, string> = {
  'Comercio':             '130/75',
  'Construcción':         '76/75',
  'Gastronomía':          '389/04',
  'Sanidad':              '459/06',
  'Pasteleros':           '329/00',
  'Excluido de Convenio': '9999/99',
};

async function run(dbUrl: string, label: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  DB: ${label}`);
  console.log('═'.repeat(60));

  const c = postgres(dbUrl, { prepare: false });

  // ── PASO 1: Borrar escalas hardcodeadas (fuente=null), excepto Gerente de E-Presis ──
  console.log('\n── Paso 1: Borrar escalas hardcodeadas ──');
  const aEliminar = await c`
    SELECT pe.id, cl.name AS client, pcc.nombre AS categoria, pc.nombre AS convenio, pe.monto_basico
    FROM payroll_escala pe
    JOIN payroll_convenio_categoria pcc ON pe.categoria_id = pcc.id
    JOIN payroll_convenio pc ON pcc.convenio_id = pc.id
    JOIN client cl ON pc.client_id = cl.id
    WHERE pe.fuente IS NULL
      AND NOT (cl.name = 'E-Presis SA' AND pcc.nombre = 'Gerente')
  `;
  for (const r of aEliminar) {
    await c`DELETE FROM payroll_escala WHERE id = ${r.id}`;
    console.log(`  ✓ Eliminada: ${r.client} | ${r.convenio} | ${r.categoria} | $${r.monto_basico}`);
  }
  console.log(`  Total: ${aEliminar.length}`);

  // ── PASO 2: Borrar categorías sin escalas ──────────────────────────────────
  console.log('\n── Paso 2: Borrar categorías sin escalas ──');
  const catsSinEscalas = await c`
    SELECT pcc.id, pcc.nombre, pc.nombre AS convenio, cl.name AS client
    FROM payroll_convenio_categoria pcc
    JOIN payroll_convenio pc ON pcc.convenio_id = pc.id
    JOIN client cl ON pc.client_id = cl.id
    WHERE NOT EXISTS (SELECT 1 FROM payroll_escala pe WHERE pe.categoria_id = pcc.id)
  `;
  for (const r of catsSinEscalas) {
    await c`DELETE FROM payroll_convenio_categoria WHERE id = ${r.id}`;
    console.log(`  ✓ Eliminada categoría: ${r.client} | ${r.convenio} | ${r.nombre}`);
  }
  console.log(`  Total: ${catsSinEscalas.length}`);

  // ── PASO 3: Borrar entradas MANUAL de payroll_convenio_fuente ─────────────
  console.log('\n── Paso 3: Borrar entradas MANUAL de payroll_convenio_fuente ──');
  const manuales = await c`
    SELECT pcf.id, cl.name AS client, pc.nombre AS convenio
    FROM payroll_convenio_fuente pcf
    JOIN payroll_convenio pc ON pcf.convenio_id = pc.id
    JOIN client cl ON pc.client_id = cl.id
    WHERE pcf.fuente = 'MANUAL'
  `;
  for (const r of manuales) {
    await c`DELETE FROM payroll_convenio_fuente WHERE id = ${r.id}`;
    console.log(`  ✓ Eliminada fuente MANUAL: ${r.client} | ${r.convenio}`);
  }
  console.log(`  Total: ${manuales.length}`);

  // ── PASO 4: Asignar cct_codigo a convenios con null ────────────────────────
  console.log('\n── Paso 4: Asignar cct_codigo según nombre ──');
  const sinCct = await c`
    SELECT id, nombre FROM payroll_convenio WHERE cct_codigo IS NULL
  `;
  let asignados = 0;
  for (const r of sinCct) {
    const cct = NOMBRE_A_CCT[r.nombre];
    if (!cct) {
      console.log(`  ⚠ Sin mapeo para "${r.nombre}" — omitido`);
      continue;
    }
    await c`UPDATE payroll_convenio SET cct_codigo = ${cct}, updated_at = NOW() WHERE id = ${r.id}`;
    asignados++;
  }
  console.log(`  Total asignados: ${asignados}`);

  // ── PASO 5: Fusionar duplicados (mismo client_id + cct_codigo) ────────────
  console.log('\n── Paso 5: Fusionar duplicados ──');
  const duplicados = await c`
    SELECT client_id, cct_codigo, array_agg(id ORDER BY created_at) AS ids
    FROM payroll_convenio
    WHERE cct_codigo IS NOT NULL
    GROUP BY client_id, cct_codigo
    HAVING COUNT(*) > 1
  ` as { client_id: string; cct_codigo: string; ids: string[] }[];

  let fusionados = 0;
  for (const dup of duplicados) {
    const [mantener, ...eliminar] = dup.ids;

    for (const idEliminar of eliminar) {
      // Redirigir FKs antes de borrar
      await c`UPDATE liquidacion_import_empleado SET convenio_id = ${mantener}, updated_at = NOW() WHERE convenio_id = ${idEliminar}`;
      await c`UPDATE payroll_convenio_categoria SET convenio_id = ${mantener}, updated_at = NOW() WHERE convenio_id = ${idEliminar}`;
      await c`DELETE FROM payroll_convenio_fuente WHERE convenio_id = ${idEliminar}`;
      await c`DELETE FROM payroll_convenio WHERE id = ${idEliminar}`;
    }

    const [info] = await c`SELECT nombre FROM payroll_convenio WHERE id = ${mantener}`;
    const [cl] = await c`SELECT name FROM client WHERE id = ${dup.client_id}`;
    console.log(`  ✓ ${cl.name} | CCT ${dup.cct_codigo} → fusionados ${eliminar.length + 1} en "${info.nombre}" (${mantener})`);
    fusionados++;
  }
  console.log(`  Total grupos fusionados: ${fusionados}`);

  // ── RESUMEN ────────────────────────────────────────────────────────────────
  const total = (await c`SELECT COUNT(*) AS n FROM payroll_convenio`)[0].n;
  const sinCctFinal = (await c`SELECT COUNT(*) AS n FROM payroll_convenio WHERE cct_codigo IS NULL`)[0].n;
  console.log(`\n  payroll_convenio total: ${total} | sin cct_codigo: ${sinCctFinal}`);

  await c.end();
}

const DB   = process.env.DATABASE_URL!;
const MIGR = 'postgres://postgres:o1qdc9ZZFvzaPZ2MguML6263LcB0aeQTUTqAWs5Utc2kyYJuTIJo2Sz33wvMYtQy@5.78.132.83:5438/postgres';

await run(DB,   '/dump    ');
await run(MIGR, '/postgres');
