/**
 * Agrega `cliente_eecc_config.fecha_constitucion` en una base que ya existe
 * (TIN-1439).
 *
 * La columna está en `schema-dominio1.sql`, que es la fuente de verdad, pero
 * eso solo alcanza al reconstruir desde cero. Las bases que ya corren
 * —staging, producción— necesitan esta migración.
 *
 * No hace falta GRANT: los permisos son por tabla, y `cliente_eecc_config` ya
 * los tiene. Distinto del caso de `asiento_template`, que era una tabla nueva.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-fecha-constitucion.ts [--apply]
 *
 * Sin --apply es dry-run.
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

const [{ existe }] = await sql`
  select count(*) > 0 as existe
  from information_schema.columns
  where table_name = 'cliente_eecc_config'
    and column_name = 'fecha_constitucion'`;

if (existe) {
  console.log('✓ La columna ya existe. Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

console.log('· Falta la columna fecha_constitucion.');

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · alter table cliente_eecc_config add column fecha_constitucion date');
  console.log('  · comment on column …\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table cliente_eecc_config
      add column if not exists fecha_constitucion date;

    comment on column cliente_eecc_config.fecha_constitucion is
      'Fecha del acta constitutiva. Distinta de fecha_inscripcion_rpc: una sociedad se constituye y se inscribe después, a veces con meses de diferencia, y la carátula y la Nota 1 piden las dos.';
  `);
});

const [final] = await sql`
  select count(*) > 0 as existe
  from information_schema.columns
  where table_name = 'cliente_eecc_config'
    and column_name = 'fecha_constitucion'`;

console.log(final.existe ? '\n✓ Columna agregada.\n' : '\n✗ No quedó agregada.\n');
await sql.end();
process.exit(final.existe ? 0 : 1);
