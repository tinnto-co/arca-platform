/**
 * Crea `libro_iva` en una base que ya existe, con RLS, grants y el tipo de
 * job del scraper.
 *
 * El Libro de IVA Digital de AFIP es la fuente autoritativa del período (la
 * ficha de IVA estima desde comprobantes electrónicos y no matchea AFIP).
 * La escribe el scrapper (job `libro_iva`, con credencial): grant completo a
 * arca_scrapper y política tenant por org vía cliente, como iva_declaracion.
 *
 * `alter type ... add value` no admite usar el valor en la misma transacción:
 * va en autocommit, el resto en una transacción.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-libro-iva.ts [--apply]
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
    with t as (select to_regclass('public.libro_iva') is not null as existe)
    select existe as tabla,
           case when existe then coalesce((select relrowsecurity from pg_class
             where oid = to_regclass('public.libro_iva')), false) else false end as rls,
           case when existe then coalesce((select 'arca_scrapper' = any(roles)
             from pg_policies where tablename = 'libro_iva'
              and policyname = 'tenant'), false) else false end as politica_scrapper,
           case when existe then coalesce(has_table_privilege(
             'arca_scrapper', 'libro_iva', 'insert'), false) else false end as scrapper_escribe,
           case when existe then coalesce(has_table_privilege(
             'arca_app', 'libro_iva', 'insert'), false) else false end as app_escribe,
           exists (select 1 from pg_enum e join pg_type ty on ty.oid = e.enumtypid
             where ty.typname = 'job_type' and e.enumlabel = 'libro_iva') as valor_enum
    from t`;
  return r;
};

const antes = await estado();
console.log(`  tabla libro_iva          ${antes.tabla ? 'ya está' : 'FALTA'}`);
if (antes.tabla) {
  console.log(`  RLS                      ${antes.rls}`);
  console.log(`  política incluye scrapper ${antes.politica_scrapper}`);
  console.log(`  arca_scrapper escribe    ${antes.scrapper_escribe}`);
  console.log(`  arca_app escribe         ${antes.app_escribe}`);
}
console.log(`  job_type 'libro_iva'     ${antes.valor_enum ? 'ya está' : 'FALTA'}`);

const faltaAlgo =
  !antes.tabla ||
  !antes.rls ||
  !antes.politica_scrapper ||
  !antes.scrapper_escribe ||
  !antes.app_escribe ||
  !antes.valor_enum;

if (!faltaAlgo) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nCon --apply se crea lo que falta (tabla, RLS, política, grants, enum).\n');
  await sql.end();
  process.exit(0);
}

// Autocommit a propósito: el valor nuevo del enum no se puede usar en la txn.
if (!antes.valor_enum) {
  await sql.unsafe(`alter type job_type add value if not exists 'libro_iva'`);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    create table if not exists libro_iva (
      id uuid primary key default gen_random_uuid(),
      cliente_id uuid not null references cliente(id) on delete cascade,
      periodo date not null,
      neto_gravado_ventas numeric(15,2),
      debito_fiscal_ventas numeric(15,2),
      nc_ventas_neto numeric(15,2),
      nc_ventas_iva numeric(15,2),
      neto_gravado_compras numeric(15,2),
      credito_fiscal_compras numeric(15,2),
      nc_compras_neto numeric(15,2),
      nc_compras_iva numeric(15,2),
      fuente dato_fuente not null default 'scraper',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (cliente_id, periodo)
    );

    do $do$
    begin
      if not exists (
        select 1 from pg_trigger
         where tgname = 'trg_set_updated_at' and tgrelid = 'libro_iva'::regclass
      ) then
        create trigger trg_set_updated_at before update on libro_iva
          for each row execute function set_updated_at();
      end if;
    end
    $do$;

    alter table libro_iva enable row level security;

    do $do$
    begin
      if not exists (
        select 1 from pg_policies
         where tablename = 'libro_iva' and policyname = 'tenant'
      ) then
        create policy tenant on libro_iva
          to arca_app, arca_agent, arca_scrapper
          using (exists (select 1 from cliente c
                          where c.id = libro_iva.cliente_id
                            and c.org_id = current_setting('app.org_id', true)))
          with check (exists (select 1 from cliente c
                          where c.id = libro_iva.cliente_id
                            and c.org_id = current_setting('app.org_id', true)));
      else
        alter policy tenant on libro_iva
          to arca_app, arca_agent, arca_scrapper;
      end if;
    end
    $do$;

    grant select, insert, update, delete on libro_iva to arca_app;
    grant select, insert, update, delete on libro_iva to arca_scrapper;
    grant select on libro_iva to arca_agent;

    comment on table libro_iva is
      'Libro de IVA Digital de AFIP: los libros de Ventas y Compras consolidados del período, tal como los muestra AFIP. A diferencia de iva_declaracion (F2051 presentado), existe durante el mes y es la fuente autoritativa para conciliar contra el IVA calculado de comprobantes, que solo ve las facturas electrónicas.';
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(18)} ${v}`);

const bien =
  final.tabla &&
  final.rls &&
  final.politica_scrapper &&
  final.scrapper_escribe &&
  final.app_escribe &&
  final.valor_enum;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
