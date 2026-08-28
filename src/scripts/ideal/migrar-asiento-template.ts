/**
 * Crea `asiento_template` en una base que ya existe (TIN-1428).
 *
 * La tabla se agregó a `schema-dominio4.sql`, que es la fuente de verdad, pero
 * eso solo alcanza cuando la base se reconstruye desde cero. Las bases que ya
 * están corriendo —staging, producción— necesitan esta migración: sin ella la
 * pantalla de templates falla con
 *
 *     PostgresError: relation "asiento_template" does not exist   (42P01)
 *
 * Va junto con RLS y los GRANT en la misma transacción, y no por prolijidad:
 * el grant de `schema-rls.sql` es `on all tables in schema public`, o sea una
 * foto del momento en que corrió. Una tabla creada después queda sin permiso y
 * falla recién en runtime con `permission denied` — que es el otro síntoma del
 * mismo ticket. Crear la tabla sin el grant cambia un error por el otro.
 *
 * Idempotente: se puede correr las veces que haga falta.
 *
 * Uso:
 *   MIGRATION_URL="postgres://...dueño de la base..." \
 *     bun src/scripts/ideal/migrar-asiento-template.ts [--apply]
 *
 * Sin --apply es dry-run: dice qué haría y no escribe nada.
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
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run (sin --apply no escribe)\n');

const [{ existe }] = await sql`
  select to_regclass('public.asiento_template') is not null as existe`;

if (existe) {
  console.log('· La tabla ya existe, no se vuelve a crear.');
} else {
  console.log('· Falta la tabla asiento_template.');
}

// El grant y la política se revisan aunque la tabla exista: puede haberse
// creado a mano, que es justamente como apareció este problema.
const [permisos] = existe
  ? await sql`
      select has_table_privilege('arca_app','asiento_template','insert') as app_escribe,
             has_table_privilege('arca_agent','asiento_template','select') as agent_lee,
             (select relrowsecurity from pg_class
               where oid = 'asiento_template'::regclass)                   as rls,
             (select count(*) from pg_policies
               where tablename = 'asiento_template')                       as politicas`
  : [{ app_escribe: false, agent_lee: false, rls: false, politicas: 0 }];

if (existe) {
  console.log(`  arca_app escribe : ${permisos.app_escribe}`);
  console.log(`  arca_agent lee   : ${permisos.agent_lee}`);
  console.log(`  RLS              : ${permisos.rls}`);
  console.log(`  políticas        : ${permisos.politicas}`);
}

const faltaAlgo =
  !existe ||
  !permisos.app_escribe ||
  !permisos.agent_lee ||
  !permisos.rls ||
  Number(permisos.politicas) === 0;

if (!faltaAlgo) {
  console.log('\n✓ Nada que hacer: tabla, RLS, política y permisos están.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  if (!existe) console.log('  · create table asiento_template (+ índice, FKs, unique)');
  if (!permisos.rls) console.log('  · enable row level security');
  if (Number(permisos.politicas) === 0) console.log('  · create policy tenant');
  if (!permisos.app_escribe) console.log('  · grant select/insert/update/delete a arca_app');
  if (!permisos.agent_lee) console.log('  · grant select a arca_agent');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    create table if not exists asiento_template (
      id uuid primary key default gen_random_uuid(),
      org_id text not null references organization(id) on delete cascade,
      cliente_id uuid not null references cliente(id) on delete cascade,
      nombre text not null,
      lineas jsonb not null default '[]'::jsonb,
      creado_en timestamptz not null default now(),
      unique (cliente_id, nombre)
    );

    create index if not exists idx_asiento_template_cliente
      on asiento_template(cliente_id);

    alter table asiento_template enable row level security;
  `);

  // `create policy` no tiene "if not exists".
  await tx.unsafe(`
    do $do$
    begin
      if not exists (
        select 1 from pg_policies
         where tablename = 'asiento_template' and policyname = 'tenant'
      ) then
        create policy tenant on asiento_template to arca_app, arca_agent
          using (org_id = current_setting('app.org_id', true))
          with check (org_id = current_setting('app.org_id', true));
      end if;
    end
    $do$;
  `);

  await tx.unsafe(`
    grant select, insert, update, delete on asiento_template to arca_app;
    grant select on asiento_template to arca_agent;
  `);
});

const [final] = await sql`
  select to_regclass('public.asiento_template') is not null             as existe,
         has_table_privilege('arca_app','asiento_template','insert')    as app_escribe,
         has_table_privilege('arca_agent','asiento_template','select')  as agent_lee,
         has_table_privilege('arca_agent','asiento_template','insert')  as agent_escribe,
         (select relrowsecurity from pg_class
           where oid = 'asiento_template'::regclass)                    as rls,
         (select count(*) from pg_policies
           where tablename = 'asiento_template')                        as politicas`;

console.log('\nDespués de aplicar:');
console.log(`  tabla existe        : ${final.existe}`);
console.log(`  RLS activo          : ${final.rls}`);
console.log(`  políticas           : ${final.politicas}`);
console.log(`  arca_app escribe    : ${final.app_escribe}`);
console.log(`  arca_agent lee      : ${final.agent_lee}`);
console.log(`  arca_agent escribe  : ${final.agent_escribe}  (tiene que ser false)`);

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
