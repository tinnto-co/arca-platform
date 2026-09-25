/**
 * De qué regla salió cada línea del asiento.
 *
 * Hasta ahora la regla se guardaba solo en la cabecera (`asiento.regla_id`), y
 * eso alcanza en facturas, donde un asiento sale de una sola regla. En sueldos
 * no: el asiento del mes agrupa muchos conceptos y cada uno puede venir de una
 * regla distinta, así que quedaba anotada solo la primera y no se podía
 * rastrear una línea. Con el módulo de banco pasa lo mismo.
 *
 * La columna es opcional: las líneas viejas y las cargadas a mano quedan en
 * null, y no se completan hacia atrás porque no hay con qué deducirlas.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-asiento-linea-regla.ts [--apply]
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
  const [r] = await sql<{ columna: boolean; indice: boolean }[]>`
    select
      (select count(*) > 0 from information_schema.columns
        where table_name = 'asiento_linea' and column_name = 'regla_id') as columna,
      (select count(*) > 0 from pg_indexes
        where tablename = 'asiento_linea' and indexname = 'idx_asiento_linea_regla') as indice`;
  return r;
};

const antes = await estado();
console.log(
  `  columna asiento_linea.regla_id   ${antes.columna ? 'ya está' : 'FALTA'}`
);
console.log(
  `  índice idx_asiento_linea_regla   ${antes.indice ? 'ya está' : 'FALTA'}`
);

if (antes.columna && antes.indice) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log(
    '  · alter table asiento_linea add column regla_id uuid references regla_mapeo(id) on delete set null'
  );
  console.log('  · create index idx_asiento_linea_regla\n');
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  alter table asiento_linea
    add column if not exists regla_id uuid references regla_mapeo(id) on delete set null;

  create index if not exists idx_asiento_linea_regla
    on asiento_linea (regla_id) where regla_id is not null;

  comment on column asiento_linea.regla_id is
    'Regla de mapeo que generó esta línea. Null en las cargadas a mano y en las anteriores a esta columna. En sueldos cada línea puede venir de una regla distinta.';
`);

const final = await estado();
console.log(
  final.columna && final.indice ? '\n✓ Listo.\n' : '\n✗ Algo no quedó.\n'
);
await sql.end();
