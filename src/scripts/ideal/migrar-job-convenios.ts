/**
 * Agrega el valor `convenios` al enum `job_type`.
 *
 * Es el job que trae los CCT por empleador desde Mi Simplificación
 * (Simplificación Registral - Empleadores) y llena `cliente_cct`, que es de
 * donde la app ofrece los convenios de una empresa. Hoy esa tabla solo tiene
 * la carga manual de marzo de 2026, así que toda empresa dada de alta después
 * aparece sin convenios. Ver `tasks/handoff-job-convenios.md`.
 *
 * El scrapper es dueño del processor; el enum lo aplica este repo, que es
 * dueño del schema (igual que con `libro_iva`).
 *
 * `alter type ... add value` no admite usar el valor en la misma transacción,
 * así que va en autocommit.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-job-convenios.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;

if (!URL) {
  console.error('Falta MIGRATION_URL (o DATABASE_URL).');
  process.exit(1);
}

const sql = postgres(URL, { max: 1 });

const [quien] = await sql`
  select current_user as usuario, current_database() as base`;
console.log(`\nBase: ${quien.base} — conectado como ${quien.usuario}`);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

const tieneValor = async () => {
  const [r] = await sql`
    select exists (
      select 1 from pg_enum e
        join pg_type t on t.oid = e.enumtypid
      where t.typname = 'job_type' and e.enumlabel = 'convenios'
    ) as existe`;
  return r.existe as boolean;
};

const antes = await tieneValor();
console.log(`  job_type += 'convenios'   ${antes ? 'ya está' : 'FALTA'}`);

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

if (!antes) {
  await sql.unsafe(`alter type job_type add value 'convenios'`);
  console.log("  → valor 'convenios' agregado");
}

const despues = await tieneValor();
console.log(`\nVerificación: job_type tiene 'convenios' → ${despues}`);
console.log(despues ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
