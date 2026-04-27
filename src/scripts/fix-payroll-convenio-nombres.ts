/**
 * Normaliza nombres en payroll_convenio:
 * 1. Renombra registros cuyo nombre es el código CCT ("130/75" → "Comercio")
 * 2. Fusiona duplicados (mismo client_id + cct_codigo): redirige FKs y elimina el sobrante
 *
 * Uso: bun run src/scripts/fix-payroll-convenio-nombres.ts
 */
import postgres from 'postgres';

const CCT_A_NOMBRE: Record<string, string> = {
  '130/75':  'Comercio',
  '0130/75': 'Comercio',
  '76/75':   'Construcción',
  '0076/75': 'Construcción',
  '108/75':  'Sanidad',
  '0108/75': 'Sanidad',
  '459/06':  'Sanidad',
  '0459/06': 'Sanidad',
  '21/88':   'Pasteleros',
  '0021/88': 'Pasteleros',
  '167/91':  'Pasteleros',
  '0167/91': 'Pasteleros',
  '272/96':  'Pasteleros',
  '0272/96': 'Pasteleros',
  '329/00':  'Pasteleros',
  '0329/00': 'Pasteleros',
  '389/04':  'Gastronomía',
  '0389/04': 'Gastronomía',
  '9999/99': 'Excluido de Convenio',
};

function normCct(cct: string): string {
  return cct.trim().replace(/^0+(\d)/, '$1');
}

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });

  // ── PASO 1: Renombrar registros con nombre = código CCT ─────────────────
  console.log('\n══ PASO 1: Renombrar registros con nombre = código CCT ══');

  const codigosPattern = Object.keys(CCT_A_NOMBRE).join('|').replace(/\//g, '\\/');
  const registros = await c`
    SELECT id, client_id, nombre, cct_codigo
    FROM payroll_convenio
    WHERE nombre ~ '^[0-9]+/[0-9]+$'
  ` as { id: string; client_id: string; nombre: string; cct_codigo: string | null }[];

  let renombrados = 0;
  for (const r of registros) {
    const nombreNuevo = CCT_A_NOMBRE[r.nombre] ?? CCT_A_NOMBRE[normCct(r.nombre)];
    const cctNuevo = normCct(r.nombre);
    if (!nombreNuevo) {
      console.log(`  ⚠ Sin mapeo para "${r.nombre}" — omitido`);
      continue;
    }
    await c`
      UPDATE payroll_convenio
      SET nombre = ${nombreNuevo},
          cct_codigo = ${cctNuevo},
          updated_at = NOW()
      WHERE id = ${r.id}
    `;
    console.log(`  ✓ "${r.nombre}" (cct=${r.cct_codigo ?? 'null'}) → nombre="${nombreNuevo}", cct_codigo="${cctNuevo}"`);
    renombrados++;
  }
  console.log(`  Total renombrados: ${renombrados}`);

  // ── PASO 2: Fusionar duplicados (mismo client_id + cct_codigo) ──────────
  console.log('\n══ PASO 2: Fusionar duplicados ══');

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

    // Redirigir FKs en liquidacion_import_empleado
    for (const idEliminar of eliminar) {
      const { count } = (await c`
        SELECT COUNT(*) AS count FROM liquidacion_import_empleado WHERE convenio_id = ${idEliminar}
      `)[0] as { count: string };

      if (Number(count) > 0) {
        await c`
          UPDATE liquidacion_import_empleado
          SET convenio_id = ${mantener}, updated_at = NOW()
          WHERE convenio_id = ${idEliminar}
        `;
        console.log(`  ↪ ${count} empleados redirigidos de ${idEliminar} → ${mantener}`);
      }

      // Redirigir FKs en payroll_convenio_categoria
      await c`
        UPDATE payroll_convenio_categoria
        SET convenio_id = ${mantener}, updated_at = NOW()
        WHERE convenio_id = ${idEliminar}
      `;

      // Redirigir FKs en payroll_convenio_fuente
      await c`
        UPDATE payroll_convenio_fuente
        SET convenio_id = ${mantener}
        WHERE convenio_id = ${idEliminar}
      `;

      await c`DELETE FROM payroll_convenio WHERE id = ${idEliminar}`;
    }

    const [info] = await c`SELECT nombre FROM payroll_convenio WHERE id = ${mantener}`;
    console.log(`  ✓ client=${dup.client_id} | CCT ${dup.cct_codigo} | fusionados ${eliminar.length + 1} → mantiene "${info.nombre}" (${mantener})`);
    fusionados++;
  }
  console.log(`  Total grupos fusionados: ${fusionados}`);

  // ── RESUMEN ────────────────────────────────────────────────────────────
  const total = await c`SELECT COUNT(*) AS n FROM payroll_convenio`;
  console.log(`\n══ RESUMEN ══`);
  console.log(`  Renombrados: ${renombrados}`);
  console.log(`  Grupos fusionados: ${fusionados}`);
  console.log(`  Total registros en payroll_convenio: ${total[0].n}`);

  await c.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
