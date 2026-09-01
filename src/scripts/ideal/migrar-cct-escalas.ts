/**
 * Separa la escala publicada del convenio de la escala propia del empleador.
 *
 * Hasta ahora la escala colgaba de `convenio_categoria`, que es por cliente. El
 * básico de convenio, en cambio, es nacional: el Maestranza A de agosto vale lo
 * mismo para todos los empleadores. El scrapper leía una página y tenía que
 * escribir N copias, una por cliente adherido — y sin clientes adheridos no
 * escribía ninguna y terminaba en OK igual, que es como el problema pasó
 * desapercibido.
 *
 * Esta migración agrega:
 *
 *   cct_categoria   la grilla oficial del convenio (global, como el CCT)
 *   cct_escala      el básico publicado por categoría y vigencia (global)
 *   convenio_categoria.cct_categoria_id
 *                   el vínculo entre la categoría del empleador y la oficial
 *
 * `escala_salarial` no se toca: pasa a ser la excepción —lo que el empleador
 * paga distinto— y sigue teniendo prioridad sobre la publicada.
 *
 * Las dos tablas nuevas son catálogos globales, sin `org_id` y sin RLS, igual
 * que `cct` y `cct_fuente` de las que cuelgan. Sí necesitan GRANT explícito: el
 * de `schema-rls.sql` es `on all tables`, una foto del momento en que corrió.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-cct-escalas.ts [--apply]
 *
 * Sin --apply es dry-run.
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
    select to_regclass('public.cct_categoria') is not null as tabla_categoria,
           to_regclass('public.cct_escala')    is not null as tabla_escala,
           (select count(*) > 0 from information_schema.columns
             where table_name = 'convenio_categoria'
               and column_name = 'cct_categoria_id')       as vinculo`;
  return r;
};

const antes = await estado();
console.log(`  cct_categoria                       ${antes.tabla_categoria ? 'ya está' : 'FALTA'}`);
console.log(`  cct_escala                          ${antes.tabla_escala ? 'ya está' : 'FALTA'}`);
console.log(`  convenio_categoria.cct_categoria_id ${antes.vinculo ? 'ya está' : 'FALTA'}`);

if (antes.tabla_categoria && antes.tabla_escala && antes.vinculo) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nCon --apply se crea lo que falta, con sus índices, comentarios y GRANT.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    create table if not exists cct_categoria (
      id uuid primary key default gen_random_uuid(),
      cct_codigo text not null references cct(codigo) on delete cascade,
      codigo text not null,
      nombre text not null,
      orden integer,
      es_valor_hora boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (cct_codigo, codigo)
    );
    create index if not exists idx_cct_categoria_cct on cct_categoria(cct_codigo);

    create table if not exists cct_escala (
      id uuid primary key default gen_random_uuid(),
      cct_categoria_id uuid not null references cct_categoria(id) on delete cascade,
      vigencia_desde date not null,
      vigencia_hasta date,
      monto_basico numeric(15, 2) not null,
      monto_no_remunerativo numeric(15, 2) not null default 0,
      periodo_label text,
      fuente text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (cct_categoria_id, vigencia_desde)
    );
    create index if not exists idx_cct_escala_categoria on cct_escala(cct_categoria_id);

    alter table convenio_categoria
      add column if not exists cct_categoria_id uuid
        references cct_categoria(id) on delete set null;

    comment on table cct_categoria is
      'Grilla oficial de categorías de un CCT (Maestranza A, Administrativo B…). Global, como el CCT: la publica la cámara, no la arma cada empleador. Es lo que faltaba para que el scrapeo de escalas tenga dónde escribir sin depender de que algún cliente ya se haya adherido.';
    comment on table cct_escala is
      'Escala publicada del convenio, por categoría y vigencia. Es el dato nacional: el básico de Maestranza A de agosto vale lo mismo para todos los empleadores. Acá escribe el job "escalas" del scrapper — en una sola fila por categoría, no una copia por cliente.';
    comment on column convenio_categoria.cct_categoria_id is
      'A qué categoría oficial del CCT corresponde esta. Con el vínculo, la liquidación toma el básico publicado sin que nadie lo cargue; sin él (categoría propia del empleador, o fuera de convenio) hay que cargar la escala a mano en escala_salarial.';
  `);

  // El trigger de updated_at no tiene "if not exists".
  for (const t of ['cct_categoria', 'cct_escala']) {
    await tx.unsafe(`
      do $do$
      begin
        if not exists (
          select 1 from pg_trigger
           where tgname = 'trg_set_updated_at'
             and tgrelid = '${t}'::regclass
        ) then
          create trigger trg_set_updated_at before update on ${t}
            for each row execute function set_updated_at();
        end if;
      end
      $do$;
    `);
  }

  // Los grants son por tabla y el general de schema-rls.sql ya corrió.
  await tx.unsafe(`
    grant select, insert, update, delete on cct_categoria, cct_escala to arca_app;
    grant select on cct_categoria, cct_escala to arca_agent;
  `);
});

const [final] = await sql`
  select to_regclass('public.cct_categoria') is not null            as tabla_categoria,
         to_regclass('public.cct_escala')    is not null            as tabla_escala,
         (select count(*) > 0 from information_schema.columns
           where table_name='convenio_categoria'
             and column_name='cct_categoria_id')                    as vinculo,
         has_table_privilege('arca_app','cct_escala','insert')      as app_escribe,
         has_table_privilege('arca_agent','cct_escala','select')    as agent_lee,
         has_table_privilege('arca_agent','cct_escala','insert')    as agent_escribe`;

console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${k.padEnd(18)} ${v}`);

const bien =
  final.tabla_categoria &&
  final.tabla_escala &&
  final.vinculo &&
  final.app_escribe &&
  final.agent_lee &&
  !final.agent_escribe;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
