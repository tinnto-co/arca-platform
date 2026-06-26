import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

const empleados = await sql`
  SELECT e.nombre, p.name as empresa, p.identity_number, e.convenio_id, pc.cct_codigo
  FROM liquidacion_import_empleado e
  JOIN profile p ON p.id = e.profile_id
  JOIN payroll_convenio pc ON pc.id = e.convenio_id
  WHERE e.convenio_id IN ('889163f3-1c98-4ec4-802f-4703becda635', '3957fc3e-be7c-47c3-8357-d832c6ef6572')
  ORDER BY pc.cct_codigo, p.name
`;
console.log(`Empleados referenciando los convenios de VITES: ${empleados.length}`);
for (const e of empleados) console.log(`  ${e.nombre} → ${e.empresa} (${e.identity_number}) | CCT: ${e.cct_codigo}`);

await sql.end();
