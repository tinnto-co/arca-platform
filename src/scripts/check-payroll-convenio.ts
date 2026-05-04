import postgres from 'postgres';
const c = postgres(process.env.DATABASE_URL!, { prepare: false });
const rows = await c`
  SELECT pc.id, cl.name AS client_name, pc.nombre, pc.cct_codigo, pc.activo
  FROM payroll_convenio pc
  JOIN client cl ON pc.client_id = cl.id
  ORDER BY cl.name, pc.nombre
`;
for (const r of rows) console.log(`${r.client_name} | "${r.nombre}" | cct=${r.cct_codigo} | activo=${r.activo} | id=${r.id}`);
console.log(`\nTotal: ${rows.length}`);
await c.end();
