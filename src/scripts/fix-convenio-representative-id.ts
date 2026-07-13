/**
 * Rellena representative_id en payroll_convenio donde está NULL.
 *
 * Los scripts de seed (setup-fuera-convenio-gerentes, fix-gerentes-convenio, etc.)
 * insertaron filas en payroll_convenio sin el campo representative_id, lo que impide
 * que listConvenios() los devuelva (filtra por representativeId = clientId de la sesión).
 *
 * Fix: derivar representative_id desde client.representative_id usando el client_id ya guardado.
 *
 * Uso: bun run src/scripts/fix-convenio-representative-id.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // Diagnóstico: cuántos registros tienen representative_id NULL
  const [{ count }] = await sql`
    SELECT COUNT(*) AS count FROM payroll_convenio WHERE representative_id IS NULL
  ` as { count: string }[];
  console.log(`Convenios con representative_id NULL: ${count}`);

  if (Number(count) === 0) {
    console.log('Nada que corregir.');
    return;
  }

  // Mostrar los afectados antes de corregir
  const afectados = await sql`
    SELECT pc.id, pc.nombre, pc.cct_codigo, pc.client_id, c.representative_id AS rep_id_correcto
    FROM payroll_convenio pc
    JOIN client c ON c.id = pc.client_id
    WHERE pc.representative_id IS NULL
    ORDER BY pc.nombre
  `;
  console.log('\nRegistros a corregir:');
  for (const r of afectados) {
    console.log(`  ${r.nombre} (${r.cct_codigo ?? 'sin cct'}) → rep_id: ${r.rep_id_correcto}`);
  }

  // Aplicar fix
  const actualizados = await sql`
    UPDATE payroll_convenio pc
    SET representative_id = c.representative_id
    FROM client c
    WHERE pc.client_id = c.id
      AND pc.representative_id IS NULL
    RETURNING pc.id, pc.nombre
  `;
  console.log(`\nActualizados: ${actualizados.length} convenios`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
