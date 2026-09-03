/**
 * Agrega `credencial_afip.comprobantes_frecuencia` en una base que ya existe.
 *
 * Con qué frecuencia se scrapean los comprobantes de una clave: estandar
 * (cron normal), semanal (solo lunes) o pausada. La decide una persona desde
 * la pantalla de clientes, para claves cuyas empresas no facturan — el 83%
 * del gasto de proxy era el scrapeo diario de comprobantes, y espaciar una
 * clave 100% vacía ahorra el job entero (~4 MB por corrida).
 *
 * La unidad es la credencial, no el cliente: el job recorre todas las
 * empresas del login. No hace falta grant nuevo: el scrapper ya tiene
 * `select` sobre toda la tabla; escribe solamente la app.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-frecuencia-comprobantes.ts [--apply]
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
  // has_column_privilege explota si la columna no existe: el CASE lo evita.
  const [r] = await sql`
    with col as (
      select count(*) > 0 as existe from information_schema.columns
       where table_name = 'credencial_afip'
         and column_name = 'comprobantes_frecuencia'
    )
    select existe as columna,
           case when existe then coalesce(has_column_privilege(
             'arca_scrapper', 'credencial_afip',
             'comprobantes_frecuencia', 'select'), false)
           else false end as scrapper_lee
    from col`;
  return r;
};

const antes = await estado();
console.log(`  columna comprobantes_frecuencia  ${antes.columna ? 'ya está' : 'FALTA'}`);
if (antes.columna) console.log(`  el scrapper la lee               ${antes.scrapper_lee}`);

if (antes.columna && antes.scrapper_lee) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · alter table credencial_afip add column comprobantes_frecuencia + CHECK + comment');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table credencial_afip
      add column if not exists comprobantes_frecuencia text not null default 'estandar';

    do $do$
    begin
      if not exists (
        select 1 from pg_constraint
         where conname = 'credencial_afip_comprobantes_frecuencia_check'
           and conrelid = 'credencial_afip'::regclass
      ) then
        alter table credencial_afip
          add constraint credencial_afip_comprobantes_frecuencia_check
          check (comprobantes_frecuencia in ('estandar', 'semanal', 'pausada'));
      end if;
    end
    $do$;

    comment on column credencial_afip.comprobantes_frecuencia is
      'Con qué frecuencia se scrapean los comprobantes de esta clave. estandar = el cron normal; semanal = solo los lunes; pausada = no se scrapean. Para claves cuyas empresas no facturan y vuelven vacías — ojo: pausada implica no enterarse si empiezan a facturar, semanal es la opción segura. Solo afecta comprobantes; notificaciones/deuda/IVA siguen normal.';
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(14)} ${v}`);

const bien = final.columna && final.scrapper_lee;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
