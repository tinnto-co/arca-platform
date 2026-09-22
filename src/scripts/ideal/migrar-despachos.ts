/**
 * Despachos de importación (IVA aduanero, Concepto 415) en una base que ya
 * existe: enums + tabla `despacho_importacion` + RLS/grants + el tipo de
 * comprobante 66 («Despacho de importación») en el catálogo.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-despachos.ts [--apply]
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
    select exists (select 1 from pg_type where typname = 'despacho_tipo') as enum_tipo,
           to_regclass('public.despacho_importacion') is not null as tabla,
           exists (select 1 from comprobante_tipo where codigo = 66) as tipo66,
           case when to_regclass('public.despacho_importacion') is not null
             then coalesce(has_table_privilege('arca_app', 'despacho_importacion', 'insert'), false)
             else false end as app_escribe`;
  return r;
};

const antes = await estado();
console.log(
  `  enums despacho_*        ${antes.enum_tipo ? 'ya está' : 'FALTA'}`
);
console.log(
  `  tabla despacho_importacion  ${antes.tabla ? 'ya está' : 'FALTA'}`
);
console.log(`  comprobante_tipo 66     ${antes.tipo66 ? 'ya está' : 'FALTA'}`);
console.log(`  arca_app escribe        ${antes.app_escribe}`);

if (antes.enum_tipo && antes.tabla && antes.tipo66 && antes.app_escribe) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · create type despacho_tipo / despacho_estado');
  console.log(
    '  · create table despacho_importacion + índices + trigger + comments'
  );
  console.log('  · RLS + policy tenant (arca_app, arca_agent) + grants');
  console.log("  · insert comprobante_tipo (66, 'Despacho de importación')");
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    do $do$ begin
      if not exists (select 1 from pg_type where typname = 'despacho_tipo') then
        create type despacho_tipo as enum ('importacion_directa', 'destinacion_simplificada');
      end if;
      if not exists (select 1 from pg_type where typname = 'despacho_estado') then
        create type despacho_estado as enum ('extraido', 'revision', 'confirmado', 'descartado');
      end if;
    end $do$;

    create table if not exists despacho_importacion (
      id uuid primary key default gen_random_uuid(),
      org_id text not null references organization(id) on delete cascade,
      cliente_id uuid not null references cliente(id) on delete cascade,
      documento_id uuid not null references documento(id),
      tipo despacho_tipo not null,
      numero text not null,
      fecha date,
      alicuota numeric(5, 2) not null,
      iva_usd numeric(15, 2) not null,
      tipo_cambio numeric(15, 6) not null,
      iva_pesos numeric(15, 2) not null,
      neto_gravado numeric(15, 2) not null,
      total numeric(15, 2) not null,
      estado despacho_estado not null default 'extraido',
      comprobante_id uuid references comprobante(id) on delete set null,
      extraccion jsonb,
      creado_por text references "user"(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (cliente_id, tipo, numero),
      constraint despacho_confirmado_con_comprobante check (
        (estado = 'confirmado') = (comprobante_id is not null)
      )
    );
    create index if not exists idx_despacho_org on despacho_importacion(org_id);
    create index if not exists idx_despacho_cliente on despacho_importacion(cliente_id);

    do $do$ begin
      if not exists (select 1 from pg_trigger where tgname = 'trg_set_updated_at'
                       and tgrelid = 'despacho_importacion'::regclass) then
        create trigger trg_set_updated_at before update on despacho_importacion
          for each row execute function set_updated_at();
      end if;
    end $do$;

    comment on table despacho_importacion is
      'Despacho de importación extraído de un PDF (IA propone, una persona confirma). Al confirmar se crea la compra (comprobante tipo 66) y comprobante_id la referencia; revision es para alícuotas fuera de 21/10,5 u otra extracción dudosa — nunca un cálculo erróneo silencioso.';

    alter table despacho_importacion enable row level security;
    drop policy if exists tenant on despacho_importacion;
    create policy tenant on despacho_importacion for all to arca_app, arca_agent
      using (org_id = current_setting('app.org_id', true))
      with check (org_id = current_setting('app.org_id', true));

    grant select, insert, update, delete on despacho_importacion to arca_app;
    grant select on despacho_importacion to arca_agent;

    insert into comprobante_tipo (codigo, descripcion, letra, clase, es_nc, discrimina_iva)
      values (66, 'Despacho de importación', null, 'factura', false, true)
      on conflict (codigo) do nothing;
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final))
  console.log(`  ${String(k).padEnd(14)} ${v}`);

const bien =
  final.enum_tipo && final.tabla && final.tipo66 && final.app_escribe;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
