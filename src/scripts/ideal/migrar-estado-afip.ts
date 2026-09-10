/**
 * Agrega `cliente.estado_afip` + `estado_afip_at` en una base que ya existe.
 *
 * Estado del servicio ante AFIP, lo detecta el processor de comprobantes del
 * scrapper: 'irregularidades' = AFIP bloquea la consulta (Err: 001, el
 * contribuyente debe regularizar en su dependencia) y los comprobantes/IVA de
 * esa empresa quedan sin traer (en $0 sin explicación visible). 'ok' se marca
 * al scrapear bien, así el estado se autolimpia cuando la empresa regulariza.
 * null = sin determinar todavía.
 *
 * También da al scrapper UPDATE sobre esas dos columnas (hoy solo tiene
 * SELECT sobre cliente): sin el grant, marcarEstadoAfip() del scrapper
 * loguea y sigue, pero el estado no se persiste nunca.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-estado-afip.ts [--apply]
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
  // has_column_privilege explota si la columna no existe: el CASE lo evita.
  const [r] = await sql`
    with col as (
      select count(*) filter (where column_name = 'estado_afip') > 0 as col_estado,
             count(*) filter (where column_name = 'estado_afip_at') > 0 as col_fecha
        from information_schema.columns
       where table_name = 'cliente'
    )
    select exists (select 1 from pg_type where typname = 'estado_afip_cliente') as enum_existe,
           col_estado,
           col_fecha,
           case when col_estado then coalesce(has_column_privilege(
             'arca_scrapper', 'cliente', 'estado_afip', 'update'), false)
           else false end as scrapper_escribe
    from col`;
  return r;
};

const antes = await estado();
console.log(`  enum estado_afip_cliente     ${antes.enum_existe ? 'ya está' : 'FALTA'}`);
console.log(`  columna estado_afip          ${antes.col_estado ? 'ya está' : 'FALTA'}`);
console.log(`  columna estado_afip_at       ${antes.col_fecha ? 'ya está' : 'FALTA'}`);
console.log(`  el scrapper puede escribirla ${antes.scrapper_escribe}`);

if (antes.enum_existe && antes.col_estado && antes.col_fecha && antes.scrapper_escribe) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log("  · create type estado_afip_cliente as enum ('ok','irregularidades')");
  console.log('  · alter table cliente add column estado_afip + estado_afip_at + comments');
  console.log('  · grant update (estado_afip, estado_afip_at) on cliente to arca_scrapper');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    do $do$
    begin
      if not exists (select 1 from pg_type where typname = 'estado_afip_cliente') then
        create type estado_afip_cliente as enum ('ok', 'irregularidades');
      end if;
    end
    $do$;

    alter table cliente
      add column if not exists estado_afip estado_afip_cliente,
      add column if not exists estado_afip_at timestamptz;

    comment on column cliente.estado_afip is
      'Estado del servicio ante AFIP, escrito por el scrapper de comprobantes: irregularidades = AFIP bloquea la consulta (el contribuyente debe regularizar en su dependencia) y los comprobantes/IVA quedan sin traer. ok = el último scrapeo entró bien (se autolimpia al regularizar). null = sin determinar.';
    comment on column cliente.estado_afip_at is
      'Cuándo se determinó estado_afip por última vez.';

    grant update (estado_afip, estado_afip_at) on cliente to arca_scrapper;
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final)) console.log(`  ${String(k).padEnd(18)} ${v}`);

const bien =
  final.enum_existe && final.col_estado && final.col_fecha && final.scrapper_escribe;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
