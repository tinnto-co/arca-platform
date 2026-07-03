import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

const rows = await sql`
  SELECT
    p.name,
    p.identity_number,
    pc.cct_codigo,
    pc.nombre as convenio_nombre,
    COUNT(DISTINCT e.id) as empleados,
    aec.cct as afip_cct,
    aec.actividad as afip_actividad
  FROM payroll_convenio pc
  JOIN profile p ON p.client_id = pc.client_id
  JOIN liquidacion_import_empleado e ON e.convenio_id = pc.id
  -- La empresa NO tiene datos en AFIP para este CCT
  AND NOT EXISTS (
    SELECT 1 FROM afip_empleadores_convenio aec2
    WHERE aec2.profile_id = p.id
    AND REGEXP_REPLACE(aec2.cct, '^0+', '') = pc.cct_codigo
  )
  LEFT JOIN afip_empleadores_convenio aec ON aec.profile_id = p.id
  GROUP BY p.name, p.identity_number, pc.cct_codigo, pc.nombre, aec.cct, aec.actividad
  ORDER BY COUNT(DISTINCT e.id) DESC, p.name
`;

// Agrupar por empresa
const byEmpresa = new Map<string, any>();
for (const r of rows) {
  const key = `${r.identity_number}:${r.cct_codigo}`;
  if (!byEmpresa.has(key)) {
    byEmpresa.set(key, { ...r, afipEntries: [] });
  }
  if (r.afip_cct) {
    byEmpresa.get(key).afipEntries.push(`${r.afip_cct} - ${r.afip_actividad}`);
  }
}

console.log(`\n${'Empresa'.padEnd(45)} ${'CCT sistema'.padEnd(12)} ${'Empleados'.padEnd(11)} AFIP dice`);
console.log('-'.repeat(110));
for (const [, e] of byEmpresa) {
  const afip = e.afipEntries.length > 0 ? [...new Set(e.afipEntries)].join(' | ') : '(sin datos AFIP)';
  console.log(`${e.name.slice(0,44).padEnd(45)} ${e.cct_codigo.padEnd(12)} ${String(e.empleados).padEnd(11)} ${afip}`);
}
console.log(`\nTotal: ${byEmpresa.size} empresas`);

await sql.end();
