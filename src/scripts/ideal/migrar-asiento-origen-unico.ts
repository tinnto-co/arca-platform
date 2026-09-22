/**
 * Un solo asiento vigente por comprobante, cierre de sueldos o movimiento.
 *
 * Hasta ahora el control era solo del programa: el job de cada hora y la
 * generación desde la pantalla podían crear dos asientos para la misma
 * factura. Este índice lo impide en la base.
 *
 * No alcanza a los cierres de ejercicio: ahí un mismo origen genera dos
 * asientos a propósito (refundición de resultados y cierre patrimonial).
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-asiento-origen-unico.ts [--apply]
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

const [{ existe }] = await sql<{ existe: boolean }[]>`
  select count(*) > 0 as existe from pg_indexes
  where tablename = 'asiento' and indexname = 'asiento_origen_unico'`;
console.log(`  índice asiento_origen_unico   ${existe ? 'ya está' : 'FALTA'}`);

if (existe) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

// Con duplicados previos el índice no se puede crear: hay que resolverlos a
// mano (anular el asiento que sobra), así que se listan.
const duplicados = await sql<
  { origenTipo: string; origenId: string; numeros: string }[]
>`
  select origen_tipo as "origenTipo", origen_id as "origenId",
         string_agg(numero::text, ', ' order by numero) as numeros
  from asiento
  where anulado = false and origen_id is not null
    and origen_tipo in ('comprobante', 'recibo', 'movimiento_bancario')
  group by 1, 2
  having count(*) > 1`;

console.log(`  orígenes con más de un asiento vigente: ${duplicados.length}`);
for (const d of duplicados.slice(0, 10)) {
  console.log(`    ${d.origenTipo} ${d.origenId} → asientos ${d.numeros}`);
}

if (duplicados.length > 0) {
  console.log(
    '\n✗ Hay duplicados: anulá el asiento que sobra en cada caso y volvé a correr.\n'
  );
  await sql.end();
  process.exit(1);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log(
    '  · create unique index asiento_origen_unico on asiento (origen_tipo, origen_id)'
  );
  console.log(
    "    where anulado = false and origen_id is not null and origen_tipo in ('comprobante','recibo','movimiento_bancario')\n"
  );
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  create unique index if not exists asiento_origen_unico
    on asiento (origen_tipo, origen_id)
    where anulado = false
      and origen_id is not null
      and origen_tipo in ('comprobante', 'recibo', 'movimiento_bancario');

  comment on index asiento_origen_unico is
    'Un solo asiento vigente por comprobante, cierre de sueldos o movimiento bancario. Los cierres de ejercicio quedan afuera: generan dos asientos con el mismo origen.';
`);

const [{ existe: quedo }] = await sql<{ existe: boolean }[]>`
  select count(*) > 0 as existe from pg_indexes
  where tablename = 'asiento' and indexname = 'asiento_origen_unico'`;
console.log(quedo ? '\n✓ Listo.\n' : '\n✗ El índice no quedó creado.\n');
await sql.end();
