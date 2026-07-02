import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

// Clientes con más de un profile que liquida sueldos y tienen convenios
const clientesMultiProfile = await sql`
  SELECT
    c.id as client_id,
    COUNT(DISTINCT p.id) as total_profiles,
    COUNT(DISTINCT CASE WHEN p.liquida_sueldos THEN p.id END) as profiles_sueldos,
    COUNT(DISTINCT pc.id) as total_convenios,
    STRING_AGG(DISTINCT p.name || ' (' || COALESCE(p.identity_number, '?') || ')', ' | ' ORDER BY p.name || ' (' || COALESCE(p.identity_number, '?') || ')') as profiles,
    STRING_AGG(DISTINCT pc.cct_codigo, ', ' ORDER BY pc.cct_codigo) as convenios
  FROM client c
  JOIN profile p ON p.client_id = c.id
  JOIN payroll_convenio pc ON pc.client_id = c.id
  GROUP BY c.id
  HAVING COUNT(DISTINCT p.id) > 1
  ORDER BY COUNT(DISTINCT p.id) DESC
`;

console.log(`Clientes con múltiples profiles y convenios: ${clientesMultiProfile.length}\n`);
for (const r of clientesMultiProfile) {
  console.log(`── Client ${r.client_id.slice(0,8)} | ${r.total_profiles} profiles (${r.profiles_sueldos} liquidan sueldos) | ${r.total_convenios} convenios`);
  console.log(`   Profiles : ${r.profiles}`);
  console.log(`   Convenios: ${r.convenios}`);
  console.log();
}

// Convenios donde hay empleados de distintos profiles
const conveniosAmbiguos = await sql`
  SELECT
    pc.id as convenio_id,
    pc.cct_codigo,
    pc.nombre,
    COUNT(DISTINCT e.profile_id) as profiles_con_empleados,
    STRING_AGG(DISTINCT p.name || ' (' || COALESCE(p.identity_number,'?') || ')', ' | ') as profiles
  FROM payroll_convenio pc
  JOIN liquidacion_import_empleado e ON e.convenio_id = pc.id
  JOIN profile p ON p.id = e.profile_id
  GROUP BY pc.id, pc.cct_codigo, pc.nombre
  HAVING COUNT(DISTINCT e.profile_id) > 1
  ORDER BY COUNT(DISTINCT e.profile_id) DESC
`;

console.log(`\nConvenios con empleados de múltiples profiles (ambiguos): ${conveniosAmbiguos.length}`);
for (const r of conveniosAmbiguos) {
  console.log(`  ${r.nombre} (${r.cct_codigo}) → ${r.profiles_con_empleados} profiles: ${r.profiles}`);
}

// Resumen total
const totalConvenios = await sql`SELECT COUNT(*) as total FROM payroll_convenio`;
const conveniosConEmpleados = await sql`
  SELECT COUNT(DISTINCT pc.id) as total
  FROM payroll_convenio pc
  WHERE EXISTS (SELECT 1 FROM liquidacion_import_empleado e WHERE e.convenio_id = pc.id)
`;

console.log(`\n── Resumen ──`);
console.log(`Total convenios en sistema:          ${totalConvenios[0].total}`);
console.log(`Convenios con empleados:             ${conveniosConEmpleados[0].total}`);
console.log(`Clientes multi-profile con convenios: ${clientesMultiProfile.length}`);
console.log(`Convenios ambiguos (multi-profile):  ${conveniosAmbiguos.length}`);

await sql.end();
