/**
 * Lo que el banco dice que había al empezar y al terminar cada mes.
 *
 * Esos dos números vienen en cada extracto y se leían solo para validar que
 * el PDF cuadrara (`cuadreExtracto`); después se tiraban. Hacen falta para lo
 * que cierra el circuito contable: el asiento de apertura, y verificar que al
 * final del mes el saldo de la cuenta en el mayor sea el mismo que el del
 * banco. Sin eso se pueden generar asientos, pero nadie puede afirmar que el
 * banco está bien contabilizado.
 *
 * Un extracto por mes y por cuenta: si se vuelve a importar, se pisa.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-saldo-bancario.ts [--apply]
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
        where table_name = 'saldo_bancario') as tabla,
      (select coalesce(bool_or(relrowsecurity), false) from pg_class
        where relname = 'saldo_bancario') as rls,
      (select count(*) > 0 from pg_policies
        where tablename = 'saldo_bancario' and policyname = 'tenant') as politica,
      -- El grant sobre todas las tablas corrio una vez, cuando esta no
      -- existia: sin esto la app no la puede leer.
      (select count(*) > 0 from information_schema.role_table_grants
        where table_name = 'saldo_bancario' and grantee = 'arca_app') as permisos`;
  return r;
};

const antes = await estado();
console.log(`  tabla saldo_bancario      ${antes.tabla ? 'ya está' : 'FALTA'}`);
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
    '  · create table saldo_bancario (cuenta_bancaria_id, periodo, saldo_inicial, saldo_final)'
  );
  console.log('  · unique (cuenta_bancaria_id, periodo) + trigger updated_at');
  console.log('  · RLS heredando de cuenta_bancaria, como movimiento_bancario');
  console.log('  · grants para arca_app y arca_agent\n');
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  create table if not exists saldo_bancario (
    id uuid primary key default gen_random_uuid(),
    cuenta_bancaria_id uuid not null references cuenta_bancaria(id) on delete cascade,
    periodo date not null,
    saldo_inicial numeric(15, 2) not null,
    saldo_final numeric(15, 2) not null,
    extracto_id uuid references extracto_bancario(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (cuenta_bancaria_id, periodo)
  );

  create index if not exists idx_saldo_bancario_cuenta
    on saldo_bancario (cuenta_bancaria_id);

  comment on table saldo_bancario is
    'Lo que el banco dice que había al empezar y al terminar cada mes, por cuenta. Se lee del extracto al importarlo; antes se usaba solo para validar que el PDF cuadrara y se descartaba. Hace falta para dos cosas: el asiento de apertura y verificar al cierre que el saldo contable de la cuenta coincida con el del banco.';
  comment on column saldo_bancario.periodo is
    'Primer día del mes. Un extracto por mes y por cuenta: si se reimporta, se pisa.';

  alter table saldo_bancario enable row level security;

  grant select, insert, update, delete on saldo_bancario to arca_app;
  grant select on saldo_bancario to arca_agent;
`);

const [{ hayTrigger }] = await sql<{ hayTrigger: boolean }[]>`
  select count(*) > 0 as "hayTrigger" from pg_trigger
  where tgname = 'trg_set_updated_at'
    and tgrelid = 'saldo_bancario'::regclass`;
if (!hayTrigger) {
  await sql.unsafe(`
    create trigger trg_set_updated_at before update on saldo_bancario
      for each row execute function set_updated_at();`);
}

// Hereda del padre, igual que movimiento_bancario: la org se resuelve por la
// cuenta bancaria.
const [{ hayPolitica }] = await sql<{ hayPolitica: boolean }[]>`
  select count(*) > 0 as "hayPolitica" from pg_policies
  where tablename = 'saldo_bancario' and policyname = 'tenant'`;
if (!hayPolitica) {
  await sql.unsafe(`
    create policy tenant on saldo_bancario to arca_app, arca_agent
      using (exists (select 1 from cuenta_bancaria p
                     where p.id = saldo_bancario.cuenta_bancaria_id
                       and p.org_id = current_setting('app.org_id', true)))
      with check (exists (select 1 from cuenta_bancaria p
                     where p.id = saldo_bancario.cuenta_bancaria_id
                       and p.org_id = current_setting('app.org_id', true)));`);
}

const final = await estado();
console.log(
  final.tabla && final.rls && final.politica && final.permisos
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
