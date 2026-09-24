/**
 * En qué asiento quedó contabilizado cada movimiento del banco.
 *
 * El asiento del banco agrupa un mes, un concepto y una cuenta bancaria: si en
 * enero hubo 40 comisiones, las 40 apuntan al mismo asiento. Por eso la
 * referencia vive en el movimiento y no en `asiento.origen_id`, que sirve
 * cuando un asiento sale de un solo documento (una factura, un recibo).
 *
 * Con esto se sabe qué está contabilizado y qué no, y regenerar un mes es
 * anular sus asientos y soltar la referencia.
 *
 * Se suma `no_contabilizar`: el movimiento que el estudio ya registró por otro
 * lado y no quiere que entre en el asiento automático.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-movimiento-asiento.ts [--apply]
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
    { asiento: boolean; noContab: boolean; indice: boolean }[]
  >`
    select
      (select count(*) > 0 from information_schema.columns
        where table_name = 'movimiento_bancario'
          and column_name = 'asiento_id') as asiento,
      (select count(*) > 0 from information_schema.columns
        where table_name = 'movimiento_bancario'
          and column_name = 'no_contabilizar') as "noContab",
      (select count(*) > 0 from pg_indexes
        where tablename = 'movimiento_bancario'
          and indexname = 'idx_movimiento_bancario_asiento') as indice`;
  return r;
};

const antes = await estado();
console.log(
  `  movimiento_bancario.asiento_id        ${antes.asiento ? 'ya está' : 'FALTA'}`
);
console.log(
  `  movimiento_bancario.no_contabilizar   ${antes.noContab ? 'ya está' : 'FALTA'}`
);
console.log(
  `  índice idx_movimiento_bancario_asiento ${antes.indice ? 'ya está' : 'FALTA'}`
);

if (antes.asiento && antes.noContab && antes.indice) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log(
    '  · alter table movimiento_bancario add column asiento_id uuid references asiento(id) on delete set null'
  );
  console.log('  · add column no_contabilizar boolean not null default false');
  console.log('  · create index idx_movimiento_bancario_asiento\n');
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  alter table movimiento_bancario
    add column if not exists asiento_id uuid references asiento(id) on delete set null,
    add column if not exists no_contabilizar boolean not null default false;

  create index if not exists idx_movimiento_bancario_asiento
    on movimiento_bancario (asiento_id) where asiento_id is not null;

  comment on column movimiento_bancario.asiento_id is
    'En qué asiento quedó contabilizado. El asiento del banco agrupa un mes, un concepto y una cuenta bancaria, así que muchos movimientos apuntan al mismo: por eso la referencia vive acá y no en asiento.origen_id. Null = todavía no contabilizado.';
  comment on column movimiento_bancario.no_contabilizar is
    'Marcado a mano: este movimiento ya está contabilizado por otro lado y el asiento automático tiene que ignorarlo.';
`);

const final = await estado();
console.log(
  final.asiento && final.noContab && final.indice
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
