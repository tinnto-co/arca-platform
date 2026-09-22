/**
 * Crea `extracto_bancario`: la cola de extractos subidos, con su lectura.
 *
 * Hasta ahora la extracción de un PDF vivía en la memoria del navegador: se
 * subía uno, se esperaba la lectura con la pantalla abierta, y si el estudio
 * se iba se perdía. Con veinte extractos eso no es un flujo. La tabla permite
 * subir todo de una, procesar de a varios en segundo plano y revisar después.
 *
 * Incluye el enum de estado, RLS por org (nivel 1: la fila tiene org_id) y
 * los grants de la app. El scrapper no la toca.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-extracto-bancario.ts [--apply]
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
  select current_user as usuario, current_database() as base,
         inet_server_addr()::text as host`;
console.log(
  `\nBase: ${quien.base} — host ${quien.host ?? 'local'} — conectado como ${quien.usuario}`
);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

const estado = async () => {
  // `has_table_privilege` no devuelve false con una tabla inexistente: lanza
  // 42P01. De ahí el guard con to_regclass en vez de un coalesce.
  const [r] = await sql`
    with t as (select to_regclass('public.extracto_bancario') as oid)
    select
      exists (select 1 from pg_type where typname = 'extracto_estado') as enum_estado,
      (select oid from t) is not null as tabla,
      coalesce((select relrowsecurity from pg_class
        where oid = (select oid from t)), false) as rls,
      coalesce((select true from pg_policies
        where tablename = 'extracto_bancario' and policyname = 'tenant'), false) as politica,
      case when (select oid from t) is not null
        then coalesce(has_table_privilege('arca_app', 'extracto_bancario', 'insert'), false)
        else false end as app_escribe`;
  return r;
};

const antes = await estado();
console.log(
  `  enum extracto_estado      ${antes.enum_estado ? 'ya está' : 'FALTA'}`
);
console.log(`  tabla extracto_bancario   ${antes.tabla ? 'ya está' : 'FALTA'}`);
console.log(`  RLS                       ${antes.rls ? 'ya está' : 'FALTA'}`);
console.log(
  `  política tenant           ${antes.politica ? 'ya está' : 'FALTA'}`
);
console.log(
  `  grants de arca_app        ${antes.app_escribe ? 'ya está' : 'FALTA'}`
);

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

// El enum va fuera de la transacción: crear un tipo y usarlo en la misma
// transacción funciona, pero separarlo mantiene el paso reintentable.
if (!antes.enum_estado) {
  await sql.unsafe(`create type extracto_estado as enum (
    'cargado', 'pendiente', 'procesando', 'extraido', 'error', 'confirmado', 'descartado'
  )`);
  console.log('  → enum extracto_estado creado');
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    create table if not exists extracto_bancario (
      id uuid primary key default gen_random_uuid(),
      org_id text not null references organization(id) on delete cascade,
      cliente_id uuid not null references cliente(id) on delete cascade,
      documento_id uuid references documento(id) on delete set null,
      nombre_archivo text not null,
      estado extracto_estado not null default 'pendiente',
      extraccion jsonb,
      banco text,
      periodo_desde date,
      periodo_hasta date,
      cuentas_detectadas integer,
      movimientos_detectados integer,
      cuadra boolean,
      error text,
      intentos integer not null default 0,
      procesado_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);

  await tx.unsafe(
    `create index if not exists idx_extracto_cliente on extracto_bancario(cliente_id)`
  );
  await tx.unsafe(
    `create index if not exists idx_extracto_org on extracto_bancario(org_id)`
  );
  await tx.unsafe(
    `create index if not exists idx_extracto_pendientes on extracto_bancario(estado, created_at)
       where estado in ('pendiente', 'procesando')`
  );

  // `create trigger if not exists` no existe: se comprueba antes.
  const [trg] = await tx`
    select 1 as hay from pg_trigger
    where tgrelid = to_regclass('public.extracto_bancario')
      and tgname = 'trg_set_updated_at'`;
  if (!trg) {
    await tx.unsafe(`create trigger trg_set_updated_at before update
      on extracto_bancario for each row execute function set_updated_at()`);
  }

  await tx.unsafe(`alter table extracto_bancario enable row level security`);

  const [pol] = await tx`
    select 1 as hay from pg_policies
    where tablename = 'extracto_bancario' and policyname = 'tenant'`;
  if (!pol) {
    await tx.unsafe(`create policy tenant on extracto_bancario
      to arca_app, arca_agent
      using (org_id = current_setting('app.org_id', true))
      with check (org_id = current_setting('app.org_id', true))`);
  }

  await tx.unsafe(
    `grant select, insert, update, delete on extracto_bancario to arca_app, arca_agent`
  );

  await tx.unsafe(`comment on table extracto_bancario is
    'Un PDF de extracto subido, con su lectura y en qué punto de la cola está. Existe para que subir veinte extractos no obligue a esperar veinte lecturas con la pantalla abierta: se suben, se procesan en segundo plano de a varios, y se revisan cuando están.'`);
});

const despues = await estado();
console.log('\nVerificación:');
console.log(`  enum                      ${despues.enum_estado}`);
console.log(`  tabla                     ${despues.tabla}`);
console.log(`  RLS                       ${despues.rls}`);
console.log(`  política tenant           ${despues.politica}`);
console.log(`  grants de arca_app        ${despues.app_escribe}`);
const ok =
  despues.enum_estado &&
  despues.tabla &&
  despues.rls &&
  despues.politica &&
  despues.app_escribe;
console.log(ok ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
