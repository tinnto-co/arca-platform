import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

// Empresas con convenio 389/04 en nuestro sistema + qué dice AFIP para cada una
const rows = await sql`
  SELECT
    p.name,
    p.identity_number,
    pc.id as convenio_id,
    aec.cct as afip_cct,
    aec.actividad as afip_actividad
  FROM payroll_convenio pc
  JOIN profile p ON p.client_id = pc.client_id
  LEFT JOIN afip_empleadores_convenio aec ON aec.profile_id = p.id
  WHERE pc.cct_codigo = '389/04'
  ORDER BY p.name
`;

console.log('\n=== CON CCT 389/04 en AFIP (coinciden) ===');
const coinciden = rows.filter(r => r.afip_cct?.replace(/^0/, '') === '389/04');
for (const r of coinciden) console.log(`  ✓ ${r.name} | CUIT: ${r.identity_number} | AFIP: ${r.afip_cct} - ${r.afip_actividad}`);

console.log('\n=== CON OTRO CCT en AFIP (mal asignadas en nuestro sistema) ===');
const otroConvenio = rows.filter(r => r.afip_cct && r.afip_cct.replace(/^0/, '') !== '389/04');
for (const r of otroConvenio) console.log(`  ✗ ${r.name} | CUIT: ${r.identity_number} | AFIP: ${r.afip_cct} - ${r.afip_actividad}`);

console.log('\n=== SIN REGISTRO EN AFIP (no scrapeadas) ===');
const sinAfip = rows.filter(r => !r.afip_cct);
for (const r of sinAfip) console.log(`  ? ${r.name} | CUIT: ${r.identity_number}`);

console.log(`\nResumen: ${coinciden.length} coinciden | ${otroConvenio.length} tienen otro CCT en AFIP | ${sinAfip.length} sin datos AFIP`);

await sql.end();
