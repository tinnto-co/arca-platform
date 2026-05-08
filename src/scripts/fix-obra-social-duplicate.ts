import postgres from 'postgres';

const BAD_ID = 'c53383f1-b19e-46af-9a2f-ab9161c33a94'; // codigo "3276" - duplicada
const GOOD_ID = 'f6e490e5-296e-4c89-b9eb-270a071fad38'; // codigo "128201" - correcta

async function fixDb(label: string, url: string) {
  const client = postgres(url, { prepare: false });

  const emp = await client`SELECT COUNT(*) as n FROM liquidacion_import_empleado WHERE obra_social_id = ${BAD_ID}`;
  const rec = await client`SELECT COUNT(*) as n FROM liquidacion_import_recibo WHERE obra_social_id = ${BAD_ID}`;
  console.log(`[${label}] Referencias empleado: ${emp[0].n} | recibo: ${rec[0].n}`);

  await client`UPDATE liquidacion_import_empleado SET obra_social_id = ${GOOD_ID} WHERE obra_social_id = ${BAD_ID}`;
  await client`UPDATE liquidacion_import_recibo SET obra_social_id = ${GOOD_ID} WHERE obra_social_id = ${BAD_ID}`;

  await client`DELETE FROM obra_social WHERE id = ${BAD_ID}`;

  const total = await client`SELECT COUNT(*) as n FROM obra_social WHERE nombre ILIKE '128201%'`;
  console.log(`[${label}] Filas restantes con 128201: ${total[0].n} (debe ser 1)`);

  await client.end();
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const migUrl = process.env.MIGRATION_URL;
  if (!dbUrl || !migUrl) throw new Error('Faltan variables de entorno.');

  await fixDb('DATABASE_URL /dump', dbUrl);
  await fixDb('MIGRATION_URL /postgres', migUrl);
  console.log('\nListo. Ambas bases alineadas.');
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
