/**
 * Crea `cliente_monotributo` en una base que ya existe — y deja entrar al
 * scrapper.
 *
 * Guarda la categoría de monotributo del cliente y su cuota, como las informa
 * AFIP. La escribe el scrapper (job `monotributo`, padrón A5): el estudio
 * necesita saber en qué categoría ESTÁ inscripto, que puede no ser la que le
 * corresponde por facturación — esa diferencia es justamente lo que se vigila
 * desde la solapa de IVA.
 *
 * RLS de nivel 2, como el resto de las tablas que cuelgan del cliente: la
 * organización se resuelve por `cliente.org_id`. GRANT explícito, porque el de
 * `schema-rls.sql` es `on all tables` y no alcanza a las que se crean después.
 * Y la política incluye a `arca_scrapper`, que entra por la misma puerta que
 * la app (ver schema-rls-scrapper.sql): la primera versión de este script lo
 * omitió, así que aunque la tabla ya exista hay que verificar sus permisos.
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

const estado = async () => {
  const [r] = await sql`
    select to_regclass('public.cliente_monotributo') is not null as existe,
           coalesce((select relrowsecurity from pg_class
             where oid = to_regclass('public.cliente_monotributo')), false) as rls,
           coalesce((select 'arca_scrapper' = any(roles) from pg_policies
             where tablename = 'cliente_monotributo'
               and policyname = 'tenant'), false)                as politica_scrapper,
           (select count(*) from pg_policies
             where tablename = 'cliente_monotributo')            as politicas,
           coalesce(has_table_privilege('arca_app',
             'cliente_monotributo', 'insert'), false)            as app_escribe,
           coalesce(has_table_privilege('arca_scrapper',
             'cliente_monotributo', 'insert'), false)            as scrapper_escribe,
           coalesce(has_table_privilege('arca_agent',
             'cliente_monotributo', 'select'), false)            as agent_lee`;
  return r;
};

// has_table_privilege explota si la tabla no existe: en ese caso todo es falso.
const [{ existe }] = await sql`
  select to_regclass('public.cliente_monotributo') is not null as existe`;
const antes = existe
  ? await estado()
  : { existe: false, rls: false, politica_scrapper: false, politicas: 0,
      app_escribe: false, scrapper_escribe: false, agent_lee: false };

console.log(`  tabla                    ${antes.existe ? 'ya está' : 'FALTA'}`);
if (antes.existe) {
  console.log(`  RLS                      ${antes.rls}`);
  console.log(`  políticas                ${antes.politicas}`);
  console.log(`  política incluye scrapper ${antes.politica_scrapper}`);
  console.log(`  arca_app escribe         ${antes.app_escribe}`);
  console.log(`  arca_scrapper escribe    ${antes.scrapper_escribe}`);
  console.log(`  arca_agent lee           ${antes.agent_lee}`);
}

const faltaAlgo =
  !antes.existe ||
  !antes.rls ||
  Number(antes.politicas) === 0 ||
  !antes.politica_scrapper ||
  !antes.app_escribe ||
  !antes.scrapper_escribe ||
  !antes.agent_lee;

if (!faltaAlgo) {
  console.log('\n✓ Nada que hacer: tabla, RLS, política y permisos están.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  if (!antes.existe) console.log('  · create table cliente_monotributo (+ check, trigger, RLS)');
  if (antes.existe && Number(antes.politicas) === 0) console.log('  · create policy tenant');
  if (antes.existe && Number(antes.politicas) > 0 && !antes.politica_scrapper)
    console.log('  · alter policy tenant → incluye arca_scrapper');
  if (!antes.app_escribe) console.log('  · grant a arca_app');
  if (!antes.scrapper_escribe) console.log('  · grant select/insert/update a arca_scrapper');
  if (!antes.agent_lee) console.log('  · grant select a arca_agent');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  if (!antes.existe) {
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

      comment on table cliente_monotributo is
        'Categoría de monotributo del cliente y su cuota, como las informa AFIP. Es un hecho scrapeado de la constancia, no un cálculo: el estudio necesita saber en qué categoría ESTÁ inscripto, que puede no ser la que le corresponde por facturación — esa diferencia es justamente lo que se vigila.';
      comment on column cliente_monotributo.categoria is
        'Letra de la A a la K. El check evita que un scrapeo mal parseado meta "Categoría D" o un número.';
      comment on column cliente_monotributo.actualizado_at is
        'Cuándo se leyó de AFIP. Una categoría vieja no es un error pero sí un dato a mirar con reservas: la recategorización es semestral.';
      comment on column cliente_monotributo.fuente is
        '"AFIP" o "MANUAL". Misma trazabilidad que el resto de los datos que no cargó una persona.';
    `);
  }

  await tx.unsafe(`alter table cliente_monotributo enable row level security;`);

  // `create policy` no tiene "if not exists"; si existe sin el scrapper, se amplía.
  await tx.unsafe(`
    do $do$
    begin
      if not exists (
        select 1 from pg_policies
         where tablename = 'cliente_monotributo' and policyname = 'tenant'
      ) then
        create policy tenant on cliente_monotributo
          to arca_app, arca_agent, arca_scrapper
          using (exists (select 1 from cliente c
                          where c.id = cliente_monotributo.cliente_id
                            and c.org_id = current_setting('app.org_id', true)))
          with check (exists (select 1 from cliente c
                          where c.id = cliente_monotributo.cliente_id
                            and c.org_id = current_setting('app.org_id', true)));
      else
        alter policy tenant on cliente_monotributo
          to arca_app, arca_agent, arca_scrapper;
      end if;
    end
    $do$;
  `);

  await tx.unsafe(`
    grant select, insert, update, delete on cliente_monotributo to arca_app;
    grant select, insert, update on cliente_monotributo to arca_scrapper;
    grant select on cliente_monotributo to arca_agent;
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(18)} ${v}`);

const [extra] = await sql`
  select coalesce(has_table_privilege('arca_agent',
           'cliente_monotributo', 'insert'), false) as agent_escribe,
         coalesce(has_table_privilege('arca_scrapper',
           'cliente_monotributo', 'delete'), false) as scrapper_borra`;

const bien =
  final.existe &&
  final.rls &&
  Number(final.politicas) > 0 &&
  final.politica_scrapper &&
  final.app_escribe &&
  final.scrapper_escribe &&
  final.agent_lee &&
  !extra.agent_escribe &&
  !extra.scrapper_borra;
console.log(`  agent_escribe      ${extra.agent_escribe}  (tiene que ser false)`);
console.log(`  scrapper_borra     ${extra.scrapper_borra}  (tiene que ser false)`);
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
