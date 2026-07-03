import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

const rows = await sql`
  SELECT p.name, p.identity_number, pc.id as convenio_id
  FROM payroll_convenio pc
  JOIN profile p ON p.client_id = pc.client_id
  WHERE pc.cct_codigo = '389/04'
  ORDER BY p.name
`;

for (const r of rows) {
  console.log(`${r.name} | CUIT: ${r.identity_number} | convenio: ${r.convenio_id.slice(0, 8)}`);
}
console.log(`\nTotal: ${rows.length} empresas`);
await sql.end();
