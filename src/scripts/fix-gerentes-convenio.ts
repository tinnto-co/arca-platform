/**
 * 1. Revierte los empleados Gerente que apuntan a convenios FUERA (cct_codigo='FUERA')
 * 2. Borra las categorías y convenios FUERA que se crearon por error
 * 3. Para cada cliente con Gerentes, usa/crea el convenio 9999/99 ("Excluido de Convenio")
 * 4. Crea categoría GERENTE dentro del 9999/99 si no existe
 * 5. Enlaza cada empleado Gerente al 9999/99 + categoría GERENTE
 *
 * Uso: bun run src/scripts/fix-gerentes-convenio.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // ── 1. Desenlazar empleados que apuntan a convenios FUERA ─────────────────
  const desenlazados = await sql`
    UPDATE liquidacion_import_empleado e
    SET convenio_id = NULL, categoria_id = NULL
    FROM payroll_convenio pc
    WHERE pc.id = e.convenio_id AND pc.cct_codigo = 'FUERA'
    RETURNING e.nombre
  `;
  console.log(`Empleados desenlazados de FUERA: ${desenlazados.length}`);

  // ── 2. Borrar categorías y convenios FUERA ────────────────────────────────
  const catsBorradas = await sql`
    DELETE FROM payroll_convenio_categoria
    WHERE convenio_id IN (SELECT id FROM payroll_convenio WHERE cct_codigo = 'FUERA')
    RETURNING id
  `;
  console.log(`Categorías FUERA borradas: ${catsBorradas.length}`);

  const convBorrados = await sql`
    DELETE FROM payroll_convenio WHERE cct_codigo = 'FUERA' RETURNING nombre, id
  `;
  console.log(`Convenios FUERA borrados: ${convBorrados.length}`);

  // ── 3. Cargar todos los Gerentes activos con su client_id ─────────────────
  const gerentes = await sql`
    SELECT e.id, e.nombre, e.valor_sueldo, p.name as empresa, c.id as client_id
    FROM liquidacion_import_empleado e
    JOIN profile p ON p.id = e.profile_id
    JOIN client c ON c.id = p.client_id
    WHERE e.activo = true AND e.categoria ILIKE 'gerente'
    ORDER BY p.name, e.nombre
  `;
  console.log(`\nGerentes activos: ${gerentes.length}`);

  // ── 4. Por cada client_id, obtener o crear el convenio 9999/99 ────────────
  const convenioMap = new Map<string, string>(); // client_id → convenio_id

  const clientIds = [...new Set(gerentes.map(g => g.client_id as string))];
  for (const clientId of clientIds) {
    const existing = await sql`
      SELECT id FROM payroll_convenio
      WHERE client_id = ${clientId} AND cct_codigo = '9999/99'
      LIMIT 1
    `;
    if (existing.length > 0) {
      convenioMap.set(clientId, existing[0].id);
      const empresa = gerentes.find(g => g.client_id === clientId)?.empresa ?? '';
      console.log(`[existente] 9999/99 para ${empresa}`);
      continue;
    }

    const empresa = gerentes.find(g => g.client_id === clientId)?.empresa ?? '';
    const [conv] = await sql`
      INSERT INTO payroll_convenio (client_id, nombre, cct_codigo, descripcion)
      VALUES (
        ${clientId},
        'Excluido de Convenio 9999/99',
        '9999/99',
        'Puestos fuera de escala CCT (gerentes, socios, etc.)'
      )
      RETURNING id
    `;
    convenioMap.set(clientId, conv.id);
    console.log(`[creado] 9999/99 para ${empresa}`);
  }

  // ── 5. Por cada convenio 9999/99, crear categoría GERENTE si no existe ────
  const categMap = new Map<string, string>(); // convenio_id → categoria_id

  for (const [clientId, convenioId] of convenioMap) {
    const existing = await sql`
      SELECT id FROM payroll_convenio_categoria
      WHERE convenio_id = ${convenioId} AND codigo = 'GERENTE'
      LIMIT 1
    `;
    if (existing.length > 0) {
      categMap.set(convenioId, existing[0].id);
      continue;
    }

    const [cat] = await sql`
      INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre)
      VALUES (${convenioId}, 'GERENTE', 'Gerente')
      RETURNING id
    `;
    categMap.set(convenioId, cat.id);
    const empresa = gerentes.find(g => g.client_id === clientId)?.empresa ?? '';
    console.log(`[categoría] GERENTE creada en 9999/99 de ${empresa}`);
  }

  // ── 6. Enlazar cada gerente ───────────────────────────────────────────────
  let actualizados = 0;
  for (const g of gerentes) {
    const convenioId = convenioMap.get(g.client_id as string)!;
    const categoriaId = categMap.get(convenioId)!;

    await sql`
      UPDATE liquidacion_import_empleado
      SET convenio_id = ${convenioId}, categoria_id = ${categoriaId}
      WHERE id = ${g.id}
    `;
    const monto = g.valor_sueldo
      ? '$' + Math.round(Number(g.valor_sueldo)).toLocaleString('es-AR')
      : '(sin monto)';
    console.log(`[ok] ${g.empresa} | ${g.nombre} → 9999/99 / GERENTE | ${monto}`);
    actualizados++;
  }

  console.log(`\n── Resultado ──`);
  console.log(`Convenios 9999/99 usados: ${convenioMap.size}`);
  console.log(`Gerentes enlazados: ${actualizados}`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
