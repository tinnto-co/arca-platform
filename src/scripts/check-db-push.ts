import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('client_request', 'payroll_convenio')
  ORDER BY table_name
`;
console.log('Tablas encontradas:');
for (const t of tables) console.log(`  ✓ ${t.table_name}`);

// Verificar que profile_id existe en payroll_convenio
const cols = await sql`
  SELECT column_name, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'payroll_convenio' AND column_name = 'profile_id'
`;
if (cols.length > 0) {
  console.log(`\n  payroll_convenio.profile_id: ${cols[0].is_nullable === 'NO' ? 'NOT NULL ✓' : 'nullable'}`);
}

await sql.end();
