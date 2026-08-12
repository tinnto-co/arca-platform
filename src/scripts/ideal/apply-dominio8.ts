/**
 * Aplica el dominio 8 sobre una BD_IDEAL que ya existe, SIN recrear el schema.
 *
 * `apply-schema.ts` dropea `public` y lo rehace: sirve para construir la base
 * desde cero, no para una base con datos. Este script es el camino incremental
 * — todo lo que aplica es aditivo (`create` / `alter table add column`), así
 * que no hay pérdida posible, y es idempotente: se puede correr dos veces.
 *
 * Uso: bun src/scripts/ideal/apply-dominio8.ts
 */
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const URL =
  process.env.IDEAL_DATABASE_URL ??
  'postgres://arca:arca@localhost:5460/arca_ideal';

if (!URL.includes('localhost') && !URL.includes('127.0.0.1')) {
  throw new Error('BD_IDEAL debe ser local — para la remota va dump + restore');
}

const sql = postgres(URL, { max: 1 });

/** Las 4 que llevan RLS. `indice_inflacion` es catálogo global y no lleva. */
const CON_RLS = [
  'ajuste_inflacion',
  'plantilla_informe_auditor',
  'cierre_sueldos',
] as const;

// Los `alter type add value` van aparte y siempre: son idempotentes por sí
// mismos (`if not exists`) y pueden faltar aunque las tablas ya estén.
console.log('→ Valores nuevos de enum...');
for (const stmt of [
  "alter type asiento_origen_tipo add value if not exists 'ajuste_inflacion'",
  "alter type cuenta_naturaleza_inflacion add value if not exists 'no_monetaria_costo'",
  "alter type cuenta_naturaleza_inflacion add value if not exists 'no_monetaria_valor_corriente'",
  "alter type cuenta_naturaleza_inflacion add value if not exists 'resultado_por_diferencia'",
]) {
  await sql.unsafe(stmt);
}

// `cliente.marco_contable` llegó después de la primera aplicación del dominio:
// se asegura aparte, también idempotente.
const [{ tieneMarco }] = await sql`
  select count(*)::int "tieneMarco" from information_schema.columns
  where table_schema = 'public' and table_name = 'cliente'
    and column_name = 'marco_contable'`;
if (!tieneMarco) {
  console.log('→ cliente.marco_contable...');
  await sql.unsafe("create type marco_contable as enum ('rt54', 'rt6')");
  await sql.unsafe(
    "alter table cliente add column marco_contable marco_contable not null default 'rt54'"
  );
}

const [{ existe }] = await sql`
  select count(*)::int existe from information_schema.tables
  where table_schema = 'public' and table_name = 'indice_inflacion'`;

if (existe) {
  console.log('→ Las tablas del dominio 8 ya están, no se recrean.');
} else {
  console.log('→ Aplicando schema-dominio8.sql...');
  await sql.unsafe(
    readFileSync(join(import.meta.dir, 'schema-dominio8.sql'), 'utf8')
  );

  console.log('→ RLS de las tablas nuevas...');
  for (const t of CON_RLS) {
    await sql.unsafe(`alter table ${t} enable row level security`);
    await sql.unsafe(`create policy tenant on ${t} to arca_app, arca_agent
      using (org_id = current_setting('app.org_id', true))
      with check (org_id = current_setting('app.org_id', true))`);
  }
  // La hija hereda la org del padre, como el resto del nivel 3.
  await sql.unsafe(
    'alter table ajuste_inflacion_linea enable row level security'
  );
  await sql.unsafe(`create policy tenant on ajuste_inflacion_linea to arca_app, arca_agent
    using (exists (select 1 from ajuste_inflacion p
                   where p.id = ajuste_inflacion_linea.ajuste_id
                     and p.org_id = current_setting('app.org_id', true)))
    with check (exists (select 1 from ajuste_inflacion p
                   where p.id = ajuste_inflacion_linea.ajuste_id
                     and p.org_id = current_setting('app.org_id', true)))`);

  // El scrapper y el portal NO se tocan: lo que no está enumerado en sus
  // archivos de RLS les da permission denied, y eso es a propósito.
  console.log('→ Grants de arca_app / arca_agent...');
  await sql.unsafe(
    'grant select, insert, update, delete on all tables in schema public to arca_app'
  );
  await sql.unsafe(
    'grant usage, select on all sequences in schema public to arca_app'
  );
  await sql.unsafe('grant select on all tables in schema public to arca_agent');
}

const [t] = await sql`select count(*)::int c from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE'`;
const [p] = await sql`select count(*)::int c from pg_policies`;
console.log(`✓ ${t.c} tablas, ${p.c} políticas.`);

await sql.end();
