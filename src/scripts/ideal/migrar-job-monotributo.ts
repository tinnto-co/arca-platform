/**
 * Agrega el tipo de job 'monotributo' en una base que ya existe.
 *
 * El job consulta el padrón A5 (ws_sr_constancia_inscripcion) con el
 * certificado WSAA del computador fiscal y escribe `cliente_monotributo`.
 * No tiene login de AFIP, así que además de sumar el valor al enum hay que
 * eximirlo del CHECK `job_credencial_requerida`, como 'escalas' y
 * 'tope_imponible'.
 *
 * `alter type ... add value` no admite usarse el valor nuevo en la misma
 * transacción, por eso va en autocommit y el CHECK se recrea después.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-job-monotributo.ts [--apply]
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

const estado = async () => {
  const [r] = await sql`
    select exists (select 1 from pg_enum e
                    join pg_type t on t.oid = e.enumtypid
                   where t.typname = 'job_type'
                     and e.enumlabel = 'monotributo')        as valor_enum,
           coalesce((select pg_get_constraintdef(oid) like '%monotributo%'
                       from pg_constraint
                      where conname = 'job_credencial_requerida'
                        and conrelid = 'job'::regclass), false) as check_exime`;
  return r;
};

const antes = await estado();
console.log(`  job_type incluye 'monotributo'   ${antes.valor_enum ? 'ya está' : 'FALTA'}`);
console.log(`  CHECK exime a 'monotributo'      ${antes.check_exime ? 'ya está' : 'FALTA'}`);

if (antes.valor_enum && antes.check_exime) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  if (!antes.valor_enum) console.log("  · alter type job_type add value 'monotributo'");
  if (!antes.check_exime) console.log('  · recrear el CHECK job_credencial_requerida con la excepción');
  console.log();
  await sql.end();
  process.exit(0);
}

// Autocommit a propósito: el valor nuevo no se puede usar en la misma txn.
if (!antes.valor_enum) {
  await sql.unsafe(`alter type job_type add value if not exists 'monotributo'`);
}

if (!antes.check_exime) {
  await sql.unsafe(`
    alter table job drop constraint if exists job_credencial_requerida;
    alter table job add constraint job_credencial_requerida
      check (type in ('escalas', 'tope_imponible', 'monotributo')
             or credencial_id is not null);
  `);
}

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(14)} ${v}`);

const bien = final.valor_enum && final.check_exime;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
