/**
 * Un despacho puede tener varias alícuotas, no una.
 *
 * `despacho_importacion` guardaba una sola (`alicuota`, `iva_usd`, y los
 * derivados). Los despachos reales no son así: una Importación Directa trae un
 * concepto 415 por ítem —se vieron tres en un mismo despacho— y una
 * Destinación Simplificada de courier puede consolidar seis envíos con
 * alícuotas distintas. Con una sola columna, el resto se perdía sin aviso y el
 * crédito fiscal quedaba corto.
 *
 * Las líneas pasan a una tabla hija, como `comprobante_alicuota`, que es
 * adonde terminan al confirmar la compra.
 *
 * Las columnas viejas NO se borran: siguen guardando el total del despacho
 * (`iva_usd` sumado, `iva_pesos`, `neto_gravado`, `total`), que es lo que usa
 * el listado, y `alicuota` queda como la principal —la de mayor importe— para
 * no romper lo que ya la lee. Migrar los datos existentes es directo: cada
 * despacho ya cargado se convierte en una línea única.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-despacho-alicuotas.ts [--apply]
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

// Guard: este script toca tablas que solo existen en la base de la app. Sin
// esto, contra una base equivocada el estado da "FALTA" en todo —igual que en
// una base correcta sin migrar— y el error recién aparece al escribir.
const [{ existe }] = await sql<{ existe: boolean }[]>`
  select count(*) > 0 as existe from information_schema.tables
  where table_name = 'despacho_importacion'`;
if (!existe) {
  console.error(
    '✗ Esta base no tiene `despacho_importacion`: no es la base de la app.\n'
  );
  await sql.end();
  process.exit(1);
}

const estado = async () => {
  const [r] = await sql<
    {
      tabla: boolean;
      rls: boolean;
      politica: boolean;
      permisos: boolean;
    }[]
  >`
    select
      (select count(*) > 0 from information_schema.tables
        where table_name = 'despacho_alicuota') as tabla,
      (select coalesce(bool_or(relrowsecurity), false) from pg_class
        where relname = 'despacho_alicuota') as rls,
      (select count(*) > 0 from pg_policies
        where tablename = 'despacho_alicuota' and policyname = 'tenant') as politica,
      -- El grant sobre todas las tablas corrio una vez, cuando esta no
      -- existia: sin esto la app no la puede leer.
      (select count(*) > 0 from information_schema.role_table_grants
        where table_name = 'despacho_alicuota' and grantee = 'arca_app') as permisos`;

  // Los pendientes van en su propia consulta: si la tabla todavía no existe,
  // Postgres valida el SQL entero antes de ejecutarlo y una referencia a una
  // tabla ausente falla aunque esté detrás de un CASE que no se evalúa.
  const [{ pendientes }] = r.tabla
    ? await sql<{ pendientes: number }[]>`
        select count(*)::int as pendientes from despacho_importacion d
        where not exists (select 1 from despacho_alicuota a
                          where a.despacho_id = d.id)`
    : await sql<{ pendientes: number }[]>`
        select count(*)::int as pendientes from despacho_importacion`;

  return { ...r, pendientes };
};

const antes = await estado();
console.log(`  tabla despacho_alicuota   ${antes.tabla ? 'ya está' : 'FALTA'}`);
console.log(`  RLS activo                ${antes.rls ? 'ya está' : 'FALTA'}`);
console.log(
  `  política tenant           ${antes.politica ? 'ya está' : 'FALTA'}`
);
console.log(
  `  permisos de arca_app      ${antes.permisos ? 'ya están' : 'FALTAN'}`
);
console.log(`  despachos sin sus líneas  ${antes.pendientes}`);

if (
  antes.tabla &&
  antes.rls &&
  antes.politica &&
  antes.permisos &&
  antes.pendientes === 0
) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log(
    '  · create table despacho_alicuota (despacho_id, alicuota, iva_usd, iva_pesos, neto_gravado)'
  );
  console.log('  · unique (despacho_id, alicuota) + RLS heredando del padre');
  console.log('  · grants para arca_app y arca_agent');
  console.log(
    `  · pasar los ${antes.pendientes} despacho(s) ya cargado(s) a una línea cada uno\n`
  );
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  create table if not exists despacho_alicuota (
    id uuid primary key default gen_random_uuid(),
    despacho_id uuid not null references despacho_importacion(id) on delete cascade,
    alicuota numeric(5, 2) not null,
    iva_usd numeric(15, 2) not null,
    iva_pesos numeric(15, 2) not null,
    neto_gravado numeric(15, 2) not null,
    created_at timestamptz not null default now(),
    unique (despacho_id, alicuota)
  );

  create index if not exists idx_despacho_alicuota_despacho
    on despacho_alicuota (despacho_id);

  comment on table despacho_alicuota is
    'Los conceptos 415 de un despacho, uno por alícuota. Un despacho puede tener varios: una Importación Directa trae un 415 por ítem y una Destinación Simplificada de courier puede consolidar varios envíos con alícuotas distintas. El libro de IVA compras los necesita discriminados, así que van acá y no en una sola columna del padre.';
  comment on column despacho_alicuota.neto_gravado is
    'Base imponible derivada: iva_pesos / alícuota. No es el valor CIF+aranceles real, que el concepto 415 no trae; es la base que hace cerrar el crédito fiscal.';

  alter table despacho_alicuota enable row level security;

  grant select, insert, update, delete on despacho_alicuota to arca_app;
  grant select on despacho_alicuota to arca_agent;
`);

// Hereda del padre, como el resto de las tablas hijas: la org se resuelve por
// el despacho.
const [{ hayPolitica }] = await sql<{ hayPolitica: boolean }[]>`
  select count(*) > 0 as "hayPolitica" from pg_policies
  where tablename = 'despacho_alicuota' and policyname = 'tenant'`;
if (!hayPolitica) {
  await sql.unsafe(`
    create policy tenant on despacho_alicuota to arca_app, arca_agent
      using (exists (select 1 from despacho_importacion p
                     where p.id = despacho_alicuota.despacho_id
                       and p.org_id = current_setting('app.org_id', true)))
      with check (exists (select 1 from despacho_importacion p
                     where p.id = despacho_alicuota.despacho_id
                       and p.org_id = current_setting('app.org_id', true)));`);
}

// Cada despacho ya cargado tenía una sola alícuota: se convierte en su única
// línea, con los mismos importes. Nada cambia de valor.
const movidos = await sql`
  insert into despacho_alicuota (despacho_id, alicuota, iva_usd, iva_pesos, neto_gravado)
  select d.id, d.alicuota, d.iva_usd, d.iva_pesos, d.neto_gravado
  from despacho_importacion d
  where not exists (select 1 from despacho_alicuota a where a.despacho_id = d.id)
  on conflict (despacho_id, alicuota) do nothing
  returning id`;
console.log(`\n  despachos pasados a líneas: ${movidos.length}`);

const final = await estado();
console.log(
  final.tabla &&
    final.rls &&
    final.politica &&
    final.permisos &&
    final.pendientes === 0
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
