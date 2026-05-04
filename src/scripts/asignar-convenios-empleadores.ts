/**
 * Asigna convenios a empleadores y empleados según lo scrapeado de AFIP.
 *
 * Paso 1: Actualiza cct_codigo en payroll_convenio existentes que matchean por nombre.
 * Paso 2: Crea payroll_convenio faltantes para clientes con CCT scrapeado pero sin registro.
 * Paso 3: Asigna convenio_id en liquidacion_import_empleado según el CCT del profile.
 *
 * Uso: bun run src/scripts/asignar-convenios-empleadores.ts
 */
import postgres from 'postgres';

// Normaliza CCT para comparación: quita ceros a la izquierda del número (ej. "0130/75" → "130/75")
function normCct(cct: string): string {
  return cct.trim().replace(/^0+(\d)/, '$1');
}

// Nombre legible a partir del nombre del catálogo (ej. "CONSTRUCCIÔN" → "Construcción")
const CCT_NOMBRES: Record<string, string> = {
  '0130/75': 'Comercio',
  '0076/75': 'Construcción',
  '0108/75': 'Sanidad',
  '0459/06': 'Sanidad',
  '0021/88': 'Pasteleros',
  '0167/91': 'Pasteleros',
  '0272/96': 'Pasteleros',
  '0329/00': 'Pasteleros',
  '0389/04': 'Gastronomía',
  '9999/99': 'Excluido de Convenio',
};

// Keyword para match por nombre en payroll_convenio existentes
const CCT_KEYWORD: Record<string, string> = {
  '0130/75': 'comercio',
  '0389/04': 'gastron',
  '0076/75': 'construc',
  '0108/75': 'sanidad',
  '0459/06': 'sanidad',
  '0021/88': 'pasteler',
  '0167/91': 'pasteler',
  '0272/96': 'pasteler',
  '0329/00': 'pasteler',
  '9999/99': 'exclu',
};

async function main() {
  const c = postgres(process.env.DATABASE_URL!, { prepare: false });

  // ── PASO 1: Actualizar cct_codigo en payroll_convenio existentes ───────────
  console.log('\n══ PASO 1: Actualizar cct_codigo en payroll_convenio por nombre ══');

  const sinCct = await c`
    SELECT DISTINCT
      cl.id  AS client_id,
      cl.name AS client_name,
      cdt.cct,
      cdt.id AS convenio_catálogo_id
    FROM afip_empleadores_convenio aec
    JOIN profile p         ON aec.profile_id  = p.id
    JOIN client cl         ON p.client_id     = cl.id
    JOIN convenios_de_trabajo cdt ON aec.convenio_id = cdt.id
    WHERE cdt.cct != '9999/99'
      AND NOT EXISTS (
        SELECT 1 FROM payroll_convenio pc
        WHERE pc.client_id = cl.id
          AND (
            pc.cct_codigo = cdt.cct
            OR pc.cct_codigo = REGEXP_REPLACE(cdt.cct, '^0+', '')
            OR '0' || pc.cct_codigo = cdt.cct
          )
      )
  ` as { client_id: string; client_name: string; cct: string }[];

  let paso1Updated = 0;
  for (const row of sinCct) {
    const keyword = CCT_KEYWORD[row.cct];
    if (!keyword) continue;
    const [existing] = await c`
      SELECT id, nombre FROM payroll_convenio
      WHERE client_id = ${row.client_id}
        AND cct_codigo IS NULL
        AND LOWER(nombre) LIKE ${'%' + keyword + '%'}
      LIMIT 1
    `;
    if (!existing) continue;

    const cctNorm = normCct(row.cct);
    await c`
      UPDATE payroll_convenio
      SET cct_codigo = ${cctNorm}, updated_at = NOW()
      WHERE id = ${existing.id}
    `;
    console.log(`  ✓ ${row.client_name} | "${existing.nombre}" → cct_codigo = ${cctNorm}`);
    paso1Updated++;
  }
  console.log(`  Total actualizados: ${paso1Updated}`);

  // ── PASO 2: Crear payroll_convenio faltantes ───────────────────────────────
  console.log('\n══ PASO 2: Crear payroll_convenio faltantes ══');

  // Re-query después de paso 1 para ver qué sigue sin match
  const aunSinMatch = await c`
    SELECT DISTINCT
      cl.id  AS client_id,
      cl.name AS client_name,
      cdt.cct
    FROM afip_empleadores_convenio aec
    JOIN profile p         ON aec.profile_id  = p.id
    JOIN client cl         ON p.client_id     = cl.id
    JOIN convenios_de_trabajo cdt ON aec.convenio_id = cdt.id
    WHERE NOT EXISTS (
      SELECT 1 FROM payroll_convenio pc
      WHERE pc.client_id = cl.id
        AND (
          pc.cct_codigo = cdt.cct
          OR pc.cct_codigo = REGEXP_REPLACE(cdt.cct, '^0+', '')
          OR '0' || pc.cct_codigo = cdt.cct
        )
    )
    ORDER BY cl.name, cdt.cct
  ` as { client_id: string; client_name: string; cct: string }[];

  let paso2Created = 0;
  for (const row of aunSinMatch) {
    const cctNorm = normCct(row.cct);
    const nombre = CCT_NOMBRES[row.cct] ?? `CCT ${cctNorm}`;
    await c`
      INSERT INTO payroll_convenio (client_id, nombre, cct_codigo, activo, created_at, updated_at)
      VALUES (${row.client_id}, ${nombre}, ${cctNorm}, true, NOW(), NOW())
    `;
    console.log(`  ✓ ${row.client_name} | Creado: "${nombre}" (${cctNorm})`);
    paso2Created++;
  }
  console.log(`  Total creados: ${paso2Created}`);

  // ── PASO 3: Asignar convenio_id a empleados ────────────────────────────────
  console.log('\n══ PASO 3: Asignar convenio_id a empleados ══');

  // Para cada empleado sin convenio_id, buscar el CCT del profile y el payroll_convenio del cliente
  const empleados = await c`
    SELECT
      lie.id,
      lie.cuil,
      lie.nombre,
      lie.profile_id,
      p.client_id,
      p.name AS profile_name
    FROM liquidacion_import_empleado lie
    JOIN profile p ON lie.profile_id = p.id
    WHERE lie.convenio_id IS NULL
  ` as { id: string; cuil: string; nombre: string; profile_id: string; client_id: string; profile_name: string }[];

  let paso3Assigned = 0;
  let paso3Skipped = 0;
  const skippedReasons: string[] = [];

  for (const emp of empleados) {
    // CCTs del profile (excluyendo 9999/99 primero)
    const ccts = await c`
      SELECT cdt.cct
      FROM afip_empleadores_convenio aec
      JOIN convenios_de_trabajo cdt ON aec.convenio_id = cdt.id
      WHERE aec.profile_id = ${emp.profile_id}
      ORDER BY cdt.cct
    ` as { cct: string }[];

    const realCcts = ccts.filter(r => r.cct !== '9999/99');
    const tieneExcluido = ccts.some(r => r.cct === '9999/99');

    let targetCct: string | null = null;

    if (realCcts.length === 1) {
      // Caso simple: un solo CCT real
      targetCct = realCcts[0].cct;
    } else if (realCcts.length === 0 && tieneExcluido) {
      // Solo 9999/99
      targetCct = '9999/99';
    } else if (realCcts.length > 1) {
      // Múltiples CCTs reales → no se puede asignar automáticamente
      const cctsStr = realCcts.map(r => r.cct).join(', ');
      skippedReasons.push(`${emp.nombre} (CUIL ${emp.cuil}) | ${emp.profile_name} | múltiples CCT: ${cctsStr}`);
      paso3Skipped++;
      continue;
    } else {
      // Sin CCT scrapeado
      skippedReasons.push(`${emp.nombre} (CUIL ${emp.cuil}) | ${emp.profile_name} | sin CCT scrapeado`);
      paso3Skipped++;
      continue;
    }

    // Buscar payroll_convenio del cliente con ese CCT
    const cctNorm = normCct(targetCct);
    const [convenio] = await c`
      SELECT id FROM payroll_convenio
      WHERE client_id = ${emp.client_id}
        AND (
          cct_codigo = ${targetCct}
          OR cct_codigo = ${cctNorm}
          OR cct_codigo = ${'0' + cctNorm}
        )
      LIMIT 1
    `;

    if (!convenio) {
      skippedReasons.push(`${emp.nombre} (CUIL ${emp.cuil}) | ${emp.profile_name} | payroll_convenio no encontrado para CCT ${targetCct}`);
      paso3Skipped++;
      continue;
    }

    await c`
      UPDATE liquidacion_import_empleado
      SET convenio_id = ${convenio.id}, updated_at = NOW()
      WHERE id = ${emp.id}
    `;
    paso3Assigned++;
  }

  console.log(`  Asignados: ${paso3Assigned}`);
  console.log(`  Saltados:  ${paso3Skipped}`);

  if (skippedReasons.length) {
    console.log('\n  Requieren asignación manual:');
    for (const r of skippedReasons) console.log('  ⚠', r);
  }

  // ── RESUMEN FINAL ─────────────────────────────────────────────────────────
  const coverage = await c`
    SELECT
      COUNT(*) AS total,
      COUNT(convenio_id) AS con_convenio,
      COUNT(*) - COUNT(convenio_id) AS sin_convenio
    FROM liquidacion_import_empleado
  `;
  console.log('\n══ RESUMEN FINAL ══');
  console.log(`  Paso 1 - cct_codigo actualizados: ${paso1Updated}`);
  console.log(`  Paso 2 - payroll_convenio creados: ${paso2Created}`);
  console.log(`  Paso 3 - empleados asignados:     ${paso3Assigned} | saltados: ${paso3Skipped}`);
  console.log(`  Cobertura total: ${coverage[0].con_convenio}/${coverage[0].total} empleados con convenio`);

  await c.end();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
