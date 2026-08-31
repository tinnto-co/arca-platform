/**
 * Crea `cliente_monotributo` en una base que ya existe.
 *
 * Guarda la categoría de monotributo del cliente y su cuota, como las informa
 * AFIP. La escribe el scrapper: el estudio necesita saber en qué categoría
 * ESTÁ inscripto, que puede no ser la que le corresponde por facturación —
 * esa diferencia es justamente lo que se vigila desde la solapa de IVA.
 *
 * RLS de nivel 2, como el resto de las tablas que cuelgan del cliente: la
 * organización se resuelve por `cliente.org_id`. Y GRANT explícito, porque el
 * de `schema-rls.sql` es `on all tables` y no alcanza a las que se crean
 * después.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-cliente-monotributo.ts [--apply]
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
  select to_regclass('public.cliente_monotributo') is not null as existe`;

if (existe) {
  console.log('✓ La tabla ya existe. Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

console.log('· Falta la tabla cliente_monotributo.');
if (!APPLY) {
  console.log('\nCon --apply se crea con su check, RLS, política y GRANT.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    create table cliente_monotributo (
      cliente_id uuid primary key references cliente(id) on delete cascade,
      categoria text not null,
      cuota_mensual numeric(15, 2),
      actualizado_at timestamptz,
      fuente text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint cliente_monotributo_categoria_valida
        check (categoria ~ '^[A-K]$')
    );

    create trigger trg_set_updated_at before update on cliente_monotributo
      for each row execute function set_updated_at();

    alter table cliente_monotributo enable row level security;
    create policy tenant on cliente_monotributo to arca_app, arca_agent
      using (exists (select 1 from cliente c
                      where c.id = cliente_monotributo.cliente_id
                        and c.org_id = current_setting('app.org_id', true)))
      with check (exists (select 1 from cliente c
                      where c.id = cliente_monotributo.cliente_id
                        and c.org_id = current_setting('app.org_id', true)));

    grant select, insert, update, delete on cliente_monotributo to arca_app;
    grant select on cliente_monotributo to arca_agent;

    comment on table cliente_monotributo is
      'Categoría de monotributo del cliente y su cuota, como las informa AFIP. Es un hecho scrapeado de la constancia, no un cálculo: el estudio necesita saber en qué categoría ESTÁ inscripto, que puede no ser la que le corresponde por facturación — esa diferencia es justamente lo que se vigila.';
    comment on column cliente_monotributo.categoria is
      'Letra de la A a la K. El check evita que un scrapeo mal parseado meta "Categoría D" o un número.';
    comment on column cliente_monotributo.actualizado_at is
      'Cuándo se leyó de AFIP. Una categoría vieja no es un error pero sí un dato a mirar con reservas: la recategorización es semestral.';
    comment on column cliente_monotributo.fuente is
      '"AFIP" o "MANUAL". Misma trazabilidad que el resto de los datos que no cargó una persona.';
  `);
});

const [final] = await sql`
  select to_regclass('public.cliente_monotributo') is not null         as existe,
         (select relrowsecurity from pg_class
           where oid='cliente_monotributo'::regclass)                  as rls,
         (select count(*) from pg_policies
           where tablename='cliente_monotributo')                      as politicas,
         has_table_privilege('arca_app','cliente_monotributo','insert')   as app_escribe,
         has_table_privilege('arca_agent','cliente_monotributo','select') as agent_lee,
         has_table_privilege('arca_agent','cliente_monotributo','insert') as agent_escribe`;

console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(14)} ${v}`);

const bien =
  final.existe &&
  final.rls &&
  Number(final.politicas) > 0 &&
  final.app_escribe &&
  final.agent_lee &&
  !final.agent_escribe;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
