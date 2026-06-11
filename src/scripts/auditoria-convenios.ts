import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, connect_timeout: 30, idle_timeout: 5 });

// Por cada empresa con datos en AFIP, ver qué CCT tiene en AFIP vs qué tiene en payroll_convenio
const rows = await sql`
  SELECT
    p.id as profile_id,
    p.name,
    p.identity_number,
    aec.cct as afip_cct,
    aec.actividad as afip_actividad,
    pc.id as convenio_id,
    pc.cct_codigo as sistema_cct,
    pc.nombre as convenio_nombre
  FROM afip_empleadores_convenio aec
  JOIN profile p ON p.id = aec.profile_id
  LEFT JOIN payroll_convenio pc ON pc.client_id = p.client_id
  ORDER BY p.name, aec.cct
`;

// Normalizar CCT (AFIP usa "0389/04", sistema usa "389/04")
const norm = (cct: string) => cct?.replace(/^0+/, '');

// Agrupar por profile
const byProfile = new Map<string, { name: string; identity_number: string; afipCcts: string[]; sistemaCcts: string[] }>();
for (const r of rows) {
  if (!byProfile.has(r.profile_id)) {
    byProfile.set(r.profile_id, { name: r.name, identity_number: r.identity_number, afipCcts: [], sistemaCcts: [] });
  }
  const entry = byProfile.get(r.profile_id)!;
  const afipNorm = norm(r.afip_cct);
  if (!entry.afipCcts.includes(afipNorm)) entry.afipCcts.push(afipNorm);
  if (r.sistema_cct && !entry.sistemaCcts.includes(r.sistema_cct)) entry.sistemaCcts.push(r.sistema_cct);
}

// Detectar mismatches: tiene CCT en AFIP pero no en sistema, o tiene en sistema pero no en AFIP
console.log('\n=== EMPRESAS CON CONVENIO INCORRECTO EN SISTEMA ===');
let mal = 0;
for (const [, e] of byProfile) {
  const faltanEnSistema = e.afipCcts.filter(c => c !== '9999/99' && !e.sistemaCcts.includes(c));
  const sobraEnSistema = e.sistemaCcts.filter(c => !e.afipCcts.map(norm).includes(c));
  if (faltanEnSistema.length > 0 || sobraEnSistema.length > 0) {
    console.log(`\n  ${e.name} | CUIT: ${e.identity_number}`);
    if (faltanEnSistema.length) console.log(`    → Falta en sistema: ${faltanEnSistema.join(', ')}`);
    if (sobraEnSistema.length)  console.log(`    → Sobra en sistema:  ${sobraEnSistema.join(', ')}`);
    mal++;
  }
}

console.log(`\n=== RESUMEN ===`);
console.log(`Empresas con datos AFIP: ${byProfile.size}`);
console.log(`Con convenio incorrecto:  ${mal}`);

await sql.end();
