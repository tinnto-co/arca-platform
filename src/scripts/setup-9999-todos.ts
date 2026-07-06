/**
 * Crea el convenio 9999/99 ("Excluido de Convenio") para TODAS las empresas
 * que tienen liquidaSueldos=true y aún no lo tienen.
 *
 * Idempotente: si ya existe, lo omite.
 *
 * Uso: bun run src/scripts/setup-9999-todos.ts
 */
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  // Empresas con sueldos habilitados que no tienen 9999/99
  const faltantes = await sql`
    SELECT c.id AS client_id, c.name, c.representative_id
    FROM client c
    WHERE c.liquida_sueldos = true
      AND NOT EXISTS (
        SELECT 1 FROM payroll_convenio pc
        WHERE pc.client_id = c.id AND pc.cct_codigo = '9999/99'
      )
    ORDER BY c.name
  ` as { client_id: string; name: string; representative_id: string }[];

  console.log(`Empresas sin convenio 9999/99: ${faltantes.length}`);
  if (faltantes.length === 0) {
    console.log('Nada que hacer.');
    return;
  }

  let creados = 0;
  for (const empresa of faltantes) {
    await sql`
      INSERT INTO payroll_convenio (representative_id, client_id, nombre, cct_codigo, descripcion)
      VALUES (
        ${empresa.representative_id},
        ${empresa.client_id},
        'Excluido de Convenio',
        '9999/99',
        'Puestos fuera de escala CCT (gerentes, socios, directores, etc.)'
      )
    `;
    console.log(`[creado] ${empresa.name}`);
    creados++;
  }

  console.log(`\nTotal creados: ${creados}`);
}

main()
  .then(() => { sql.end(); process.exit(0); })
  .catch(e => { console.error(e); sql.end(); process.exit(1); });
