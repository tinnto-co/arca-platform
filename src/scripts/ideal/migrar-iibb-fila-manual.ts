/**
 * Filas manuales en la liquidación de IIBB ("Otro Capital Federal").
 *
 * Dentro de una misma jurisdicción puede haber actividades con distinta
 * alícuota (parte de la base al 3%, otra al 1%). La fila manual lleva su
 * propia base (`base_manual`) y resta de la base calculada de su provincia
 * (`provincia_padre`); las filas normales tienen ambas columnas en null.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-iibb-fila-manual.ts [--apply]
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
    select (select count(*) = 2 from information_schema.columns
             where table_name = 'liquidacion_iibb'
               and column_name in ('provincia_padre', 'base_manual')) as columnas,
           exists (select 1 from pg_constraint
             where conname = 'liquidacion_iibb_fila_manual'
               and conrelid = 'liquidacion_iibb'::regclass)           as chequeo`;
  return r;
};

const antes = await estado();
console.log(`  provincia_padre + base_manual  ${antes.columnas ? 'ya están' : 'FALTAN'}`);
console.log(`  CHECK fila_manual              ${antes.chequeo ? 'ya está' : 'FALTA'}`);

if (antes.columnas && antes.chequeo) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nCon --apply se agregan las columnas, el CHECK y los comentarios.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table liquidacion_iibb
      add column if not exists provincia_padre text,
      add column if not exists base_manual numeric(15, 2);

    do $do$
    begin
      if not exists (
        select 1 from pg_constraint
         where conname = 'liquidacion_iibb_fila_manual'
           and conrelid = 'liquidacion_iibb'::regclass
      ) then
        alter table liquidacion_iibb
          add constraint liquidacion_iibb_fila_manual
          check ((provincia_padre is null) = (base_manual is null));
      end if;
    end
    $do$;

    comment on column liquidacion_iibb.provincia_padre is
      'Solo en filas manuales ("Otro Capital Federal"): de qué provincia real resta su base_manual. Null en filas normales, cuya base sale de los comprobantes.';
    comment on column liquidacion_iibb.base_manual is
      'Base imponible cargada a mano de una fila manual, para liquidar parte de la base de la provincia a otra alícuota según la actividad. Null en filas normales.';
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(10)} ${v}`);

const bien = final.columnas && final.chequeo;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
