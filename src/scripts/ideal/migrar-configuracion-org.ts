/**
 * Preferencias del estudio, guardadas.
 *
 * Hasta ahora todo umbral vivía como constante en el código: el control
 * bancario avisa con 20% y $1.000.000, y el de monotributo con el 80% del
 * tope. El estudio quiere mirar varias empresas antes de fijar el número, y
 * ese número no es el mismo para un estudio que para otro.
 *
 * Clave-valor a propósito: cada preferencia nace de una conversación con un
 * estudio, y una columna por cada una llenaría la tabla de nulls. Lo que
 * define el negocio —qué módulos hay, qué cuenta usa una regla— no va acá:
 * eso es modelo, no preferencia.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-configuracion-org.ts [--apply]
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
  const [r] = await sql<
    { tabla: boolean; rls: boolean; politica: boolean; permisos: boolean }[]
  >`
    select
      (select count(*) > 0 from information_schema.tables
        where table_name = 'configuracion_org') as tabla,
      (select coalesce(bool_or(relrowsecurity), false) from pg_class
        where relname = 'configuracion_org') as rls,
      (select count(*) > 0 from pg_policies
        where tablename = 'configuracion_org' and policyname = 'tenant') as politica,
      -- El grant no se hereda: el grant sobre todas las tablas corrio una
      -- vez, cuando esta tabla no existia. Sin esto la app no la puede leer
      -- y la pantalla que usa el umbral se queda cargando para siempre.
      (select count(*) > 0 from information_schema.role_table_grants
        where table_name = 'configuracion_org' and grantee = 'arca_app') as permisos`;
  return r;
};

const antes = await estado();
console.log(`  tabla configuracion_org   ${antes.tabla ? 'ya está' : 'FALTA'}`);
console.log(`  RLS activo                ${antes.rls ? 'ya está' : 'FALTA'}`);
console.log(
  `  política tenant           ${antes.politica ? 'ya está' : 'FALTA'}`
);
console.log(
  `  permisos de arca_app      ${antes.permisos ? 'ya están' : 'FALTAN'}`
);

if (antes.tabla && antes.rls && antes.politica && antes.permisos) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log(
    '  · create table configuracion_org (org_id, clave, valor jsonb)'
  );
  console.log('  · unique (org_id, clave) + trigger de updated_at');
  console.log(
    '  · RLS con la política `tenant`, como el resto de las tablas\n'
  );
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  create table if not exists configuracion_org (
    id uuid primary key default gen_random_uuid(),
    org_id text not null references organization(id) on delete cascade,
    clave text not null,
    valor jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (org_id, clave)
  );

  comment on table configuracion_org is
    'Preferencias del estudio que cambian cómo se juzga un dato, no cómo se calcula: umbrales de aviso, tolerancias. Clave-valor a propósito: cada preferencia nace de una conversación con un estudio y agregar una columna por cada una llenaría la tabla de nulls. Lo que define el negocio (qué módulos hay, qué cuentas usa una regla) NO va acá: eso es modelo, no preferencia.';
  comment on column configuracion_org.clave is
    'Identificador estable, en snake_case. El código lee esta clave, así que renombrarla rompe la configuración guardada.';
  comment on column configuracion_org.valor is
    'jsonb porque una preferencia rara vez es un solo número: el umbral del control bancario son dos (porcentaje y monto) y se evalúan juntos.';

  alter table configuracion_org enable row level security;

  grant select, insert, update, delete on configuracion_org to arca_app;
  grant select on configuracion_org to arca_agent;
`);

// El trigger y la política no aceptan "if not exists": se crean solo si
// faltan, para que volver a correr el script no falle.
const [{ hayTrigger }] = await sql<{ hayTrigger: boolean }[]>`
  select count(*) > 0 as "hayTrigger" from pg_trigger
  where tgname = 'trg_set_updated_at'
    and tgrelid = 'configuracion_org'::regclass`;
if (!hayTrigger) {
  await sql.unsafe(`
    create trigger trg_set_updated_at before update on configuracion_org
      for each row execute function set_updated_at();`);
}

const [{ hayPolitica }] = await sql<{ hayPolitica: boolean }[]>`
  select count(*) > 0 as "hayPolitica" from pg_policies
  where tablename = 'configuracion_org' and policyname = 'tenant'`;
if (!hayPolitica) {
  await sql.unsafe(`
    create policy tenant on configuracion_org to arca_app, arca_agent
      using (org_id = current_setting('app.org_id', true))
      with check (org_id = current_setting('app.org_id', true));`);
}

const final = await estado();
console.log(
  final.tabla && final.rls && final.politica && final.permisos
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
