/**
 * Crea un convenio "Fuera de Convenio" por cada empresa que tiene Gerentes,
 * agrega la categoría GERENTE dentro de ese convenio, y enlaza los empleados.
 *
 * Los empleados mantienen su valor_sueldo (override intencional por cliente).
 * Idempotente: si el convenio o categoría ya existe, no los duplica.
 *
 * Uso: bun run src/scripts/setup-fuera-convenio-gerentes.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

// Empleados activos sin categoria='Gerente' pero que son gerentes por monto/comportamiento
const GERENTES_EXTRA = [
  'Iskandarani, Ariel Alejandro',  // Khiro
  'KELMANOVICH, ERIK YAIR',        // Metagame
  'KELMANOVICH, YOEL ALEXIS',      // Metagame
  'MARTINEZ CERDA, JORGE ENRIQUE', // Ureshi
];

async function main() {
  // 1. Marcar como "Gerente" los que aún no tienen texto
  for (const nombre of GERENTES_EXTRA) {
    const res = await sql`
      UPDATE liquidacion_import_empleado
      SET categoria = 'Gerente'
      WHERE nombre ILIKE ${nombre} AND activo = true AND (categoria IS NULL OR categoria = '')
      RETURNING nombre
    `;
    if (res.length > 0) console.log(`[categoria] ${res[0].nombre} → "Gerente"`);
  }

  // 2. Cargar todos los Gerentes activos con su client_id
  const gerentes = await sql`
    SELECT e.id, e.nombre, e.valor_sueldo, p.name as empresa, c.id as client_id
    FROM liquidacion_import_empleado e
    JOIN profile p ON p.id = e.profile_id
    JOIN client c ON c.id = p.client_id
    WHERE e.activo = true
      AND e.categoria ILIKE 'gerente'
    ORDER BY p.name, e.nombre
  `;
  console.log(`\nGerentes activos encontrados: ${gerentes.length}`);

  // 3. Por cada client_id único, crear convenio "Fuera de Convenio" (idempotente)
  const convenioMap = new Map<string, string>(); // client_id → convenio_id

  const clientIds = [...new Set(gerentes.map(g => g.client_id))];
  for (const clientId of clientIds) {
    // Buscar si ya existe
    const existing = await sql`
      SELECT id FROM payroll_convenio
      WHERE client_id = ${clientId} AND cct_codigo = 'FUERA'
      LIMIT 1
    `;
    if (existing.length > 0) {
      convenioMap.set(clientId, existing[0].id);
      console.log(`[ya existe] convenio FUERA para client ${clientId} → ${existing[0].id}`);
      continue;
    }

    const empresa = gerentes.find(g => g.client_id === clientId)?.empresa ?? '';
    const [conv] = await sql`
      INSERT INTO payroll_convenio (client_id, nombre, cct_codigo, descripcion)
      VALUES (
        ${clientId},
        'Fuera de Convenio',
        'FUERA',
        'Puestos fuera de escala CCT (gerentes, socios, etc.)'
      )
      RETURNING id
    `;
    convenioMap.set(clientId, conv.id);
    console.log(`[creado] convenio FUERA para ${empresa} → ${conv.id}`);
  }

  // 4. Por cada convenio, crear categoría GERENTE (idempotente)
  const categMap = new Map<string, string>(); // convenio_id → categoria_id

  for (const [clientId, convenioId] of convenioMap) {
    const existing = await sql`
      SELECT id FROM payroll_convenio_categoria
      WHERE convenio_id = ${convenioId} AND codigo = 'GERENTE'
      LIMIT 1
    `;
    if (existing.length > 0) {
      categMap.set(convenioId, existing[0].id);
      console.log(`[ya existe] categoria GERENTE en convenio ${convenioId}`);
      continue;
    }

    const [cat] = await sql`
      INSERT INTO payroll_convenio_categoria (convenio_id, codigo, nombre)
      VALUES (${convenioId}, 'GERENTE', 'Gerente')
      RETURNING id
    `;
    categMap.set(convenioId, cat.id);
    console.log(`[creado] categoria GERENTE → ${cat.id}`);
  }

  // 5. Asignar convenio_id + categoria_id a cada gerente
  let actualizados = 0;
  for (const g of gerentes) {
    const convenioId = convenioMap.get(g.client_id)!;
    const categoriaId = categMap.get(convenioId)!;

    await sql`
      UPDATE liquidacion_import_empleado
      SET convenio_id = ${convenioId}, categoria_id = ${categoriaId}
      WHERE id = ${g.id}
    `;
    const monto = g.valor_sueldo ? '$' + Math.round(Number(g.valor_sueldo)).toLocaleString('es-AR') : '(sin monto)';
    console.log(`[ok] ${g.empresa} | ${g.nombre} → FUERA/GERENTE | override: ${monto}`);
    actualizados++;
  }

  console.log(`\n── Resultado ──`);
  console.log(`Convenios "Fuera de Convenio" creados/reutilizados: ${convenioMap.size}`);
  console.log(`Gerentes asignados: ${actualizados}`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
