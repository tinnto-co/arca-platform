import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

// Convenios asignados en sistema que NO coinciden con AFIP
// (los que "sobran" según la auditoría anterior)
const sobrantes = await sql`
  SELECT
    p.name,
    p.identity_number,
    pc.id as convenio_id,
    pc.cct_codigo,
    pc.nombre as convenio_nombre,
    COUNT(DISTINCT e.id) as empleados,
    COUNT(DISTINCT pcc.id) as categorias,
    COUNT(DISTINCT pe.id) as escalas
  FROM payroll_convenio pc
  JOIN profile p ON p.client_id = pc.client_id
  LEFT JOIN afip_empleadores_convenio aec
    ON aec.profile_id = p.id
    AND REGEXP_REPLACE(aec.cct, '^0+', '') = pc.cct_codigo
  LEFT JOIN liquidacion_import_empleado e ON e.convenio_id = pc.id
  LEFT JOIN payroll_convenio_categoria pcc ON pcc.convenio_id = pc.id
  LEFT JOIN payroll_escala pe ON pe.categoria_id = pcc.id
  WHERE aec.id IS NULL  -- no tiene match en AFIP
    AND pc.cct_codigo != '9999/99'
  GROUP BY p.name, p.identity_number, pc.id, pc.cct_codigo, pc.nombre
  ORDER BY empleados DESC, p.name
`;

console.log('Convenios sin respaldo en AFIP:\n');
console.log(`${'Empresa'.padEnd(45)} ${'CCT'.padEnd(10)} ${'Empleados'.padEnd(12)} ${'Categorías'.padEnd(13)} Escalas`);
console.log('-'.repeat(100));
for (const r of sobrantes) {
  const emp = Number(r.empleados);
  const flag = emp > 0 ? ' ⚠️' : '';
  console.log(`${r.name.slice(0,44).padEnd(45)} ${r.cct_codigo.padEnd(10)} ${String(emp).padEnd(12)} ${String(r.categorias).padEnd(13)} ${r.escalas}${flag}`);
}

const conEmpleados = sobrantes.filter(r => Number(r.empleados) > 0);
const sinEmpleados = sobrantes.filter(r => Number(r.empleados) === 0);
console.log(`\nTotal sobrantes: ${sobrantes.length}`);
console.log(`  Con empleados (requieren atención): ${conEmpleados.length}`);
console.log(`  Sin empleados (seguros para borrar): ${sinEmpleados.length}`);

await sql.end();
