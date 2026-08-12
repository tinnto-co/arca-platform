/**
 * Aplica sobre una BD_IDEAL YA CARGADA lo que hace falta para que el scrapper
 * actualice solo las escalas salariales (job type 'escalas'):
 *
 *   1. job_type += 'escalas' y job.credencial_id nullable — un job de escalas lee
 *      una página pública, no tiene login de AFIP.
 *   2. cct_fuente: de dónde sale la escala de cada convenio.
 *   3. permisos y políticas de arca_scrapper sobre convenio/categoría/escala.
 *   4. backfill de convenio.cct_codigo, que quedó null en TODAS las filas porque
 *      el catálogo escribe "0130/75" y payroll_convenio escribía "130/75".
 *
 * Todo idempotente: se puede correr las veces que haga falta.
 * Uso: bun src/scripts/ideal/migrate-escalas.ts
 */
import postgres from "postgres";

const IDEAL_URL =
  process.env.IDEAL_DATABASE_URL ?? "postgres://arca:arca@localhost:5460/arca_ideal";

if (!IDEAL_URL.includes("localhost") && !IDEAL_URL.includes("127.0.0.1")) {
  throw new Error("Este script es para BD_IDEAL local");
}

const sql = postgres(IDEAL_URL, { max: 1 });

console.log("→ 1. job: tipo 'escalas' y credencial opcional");
await sql.unsafe(`
  alter type job_type add value if not exists 'escalas';
`);
// El nuevo valor del enum no es visible para otras sentencias de la MISMA
// transacción; postgres-js no abre una salvo que se lo pida, pero el alter type
// va solo por las dudas.
await sql.unsafe(`
  alter table job alter column credencial_id drop not null;
  alter table job drop constraint if exists job_credencial_requerida;
  alter table job add constraint job_credencial_requerida
    check (type = 'escalas' or credencial_id is not null);
  comment on column job.credencial_id is
    'Null solo en los jobs que no scrapean AFIP: type=''escalas'' lee una página pública de escalas salariales y no tiene login. El CHECK job_credencial_requerida lo exige para todos los demás tipos.';
`);

console.log("→ 2. cct_fuente");
await sql.unsafe(`
  create table if not exists cct_fuente (
    id uuid primary key default gen_random_uuid(),
    cct_codigo text not null references cct(codigo) on delete cascade,
    url text not null,
    extractor text not null,
    activo boolean not null default true,
    ultimo_intento_at timestamptz,
    ultimo_ok_at timestamptz,
    ultimo_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (cct_codigo, url)
  );
  alter table cct_fuente add column if not exists ultimo_intento_at timestamptz;
  drop trigger if exists trg_set_updated_at on cct_fuente;
  create trigger trg_set_updated_at before update on cct_fuente
    for each row execute function set_updated_at();
  comment on table cct_fuente is
    'De dónde saca el scrapper la escala de un CCT. Global como cct: la escala del convenio es la misma para todos los estudios, lo que cambia por cliente es a qué categorías se aplica. Agregar un convenio al scrapeo automático es una fila acá, no un deploy.';
  comment on column cct_fuente.extractor is
    'Qué rutina sabe leer esta página (ej. "vilaplana-tabla"). No se infiere de la URL: un sitio puede publicar dos formatos distintos.';
  comment on column cct_fuente.ultimo_intento_at is
    'Última vez que el scrapper abrió esta página, haya salido bien o mal. Comparada con ultimo_ok_at dice si el cron corre: si esta se mueve y la otra no, la fuente está fallando; si no se mueve ninguna, el cron no está corriendo.';
  comment on column cct_fuente.ultimo_ok_at is
    'Última corrida que trajo escalas. Si se queda vieja, la fuente cambió de forma y el extractor dejó de matchear — es la señal de alarma.';
  comment on column cct_fuente.ultimo_error is
    'Error de la última corrida fallida, en texto. Se limpia cuando una corrida vuelve a salir bien.';

  insert into cct_fuente (cct_codigo, url, extractor)
  select '0130/75', 'https://estudiovilaplana.com.ar/escala-salarial-empleados-comercio/', 'vilaplana-tabla'
  where exists (select 1 from cct where codigo = '0130/75')
  on conflict do nothing;
`);

console.log("→ 3. permisos y políticas de arca_scrapper");
await sql.unsafe(`
  grant select, insert, update on escala_salarial to arca_scrapper;
  grant select on convenio, convenio_categoria, cct, cct_fuente to arca_scrapper;
  grant update (ultimo_intento_at, ultimo_ok_at, ultimo_error) on cct_fuente to arca_scrapper;
`);
// alter policy, no create: las permisivas se suman con OR y una paralela abriría
// todo el estudio (misma lección que el portal).
await sql.unsafe(`
  do $do$
  declare t text;
  begin
    foreach t in array array['convenio','convenio_categoria','escala_salarial'] loop
      execute format('alter policy tenant on %I to arca_app, arca_agent, arca_scrapper', t);
    end loop;
  end
  $do$;
`);

console.log("→ 4. backfill de convenio.cct_codigo");
// El código quedó embebido en el nombre del convenio ("Comercio 130/75"), que es
// de donde se recupera. El lpad a 4 es la diferencia de formato que rompía el match.
const [{ n: antes }] = await sql.unsafe(
  `select count(*)::int as n from convenio where cct_codigo is null`
);
// El CTE saca el número antes del update: en un UPDATE la tabla target no se puede
// referenciar desde un LATERAL del FROM.
const filas = await sql.unsafe(`
  with candidato as (
    select id, regexp_match(nombre, '(\\d{1,4})/(\\d{1,4})') as m
      from convenio
     where cct_codigo is null
  )
  update convenio cv
     set cct_codigo = c.codigo
    from candidato x, cct c
   where cv.id = x.id
     and x.m is not null
     and c.codigo = lpad(x.m[1], 4, '0') || '/' || x.m[2]
  returning cv.nombre, c.codigo
`);
const porCct = new Map<string, number>();
for (const f of filas) porCct.set(f.codigo, (porCct.get(f.codigo) ?? 0) + 1);
console.log(`   ${filas.length} de ${antes} convenios religados:`);
for (const [codigo, n] of porCct) console.log(`     ${codigo}: ${n}`);

const huerfanos = await sql.unsafe(
  `select nombre, count(*)::int as n from convenio where cct_codigo is null group by 1 order by 2 desc`
);
if (huerfanos.length > 0) {
  console.log("   sin CCT (el nombre no trae número o no está en el catálogo):");
  for (const h of huerfanos) console.log(`     ${h.nombre} (${h.n})`);
}

const conFuente = await sql.unsafe(`
  select f.cct_codigo, count(distinct cv.id)::int as convenios, count(cc.id)::int as categorias
    from cct_fuente f
    join convenio cv on cv.cct_codigo = f.cct_codigo
    left join convenio_categoria cc on cc.convenio_id = cv.id
   group by 1
`);
console.log("\n✓ Alcance del scrapeo de escalas:");
for (const r of conFuente)
  console.log(`   ${r.cct_codigo}: ${r.convenios} convenios, ${r.categorias} categorías`);

await sql.end();
