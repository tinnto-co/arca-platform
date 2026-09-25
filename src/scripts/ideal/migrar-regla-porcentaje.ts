/**
 * Una línea de regla puede llevar un porcentaje del importe, no solo el total.
 *
 * Nace del impuesto sobre débitos y créditos (ley 25.413): el 33% se computa
 * a cuenta de Ganancias y el resto es gasto. Con las bases que había —el
 * total, o un monto fijo— no se podía escribir: el importe cambia todos los
 * meses, así que un monto fijo no sirve.
 *
 * Sirve para cualquier regla, no solo para esa: cualquier reparto en partes
 * de un mismo importe.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-regla-porcentaje.ts [--apply]
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
  const [r] = await sql<{ valor: boolean; columna: boolean; check: boolean }[]>`
    select
      (select count(*) > 0 from pg_type t join pg_enum e on e.enumtypid = t.oid
        where t.typname = 'regla_mapeo_base' and e.enumlabel = 'porcentaje') as valor,
      (select count(*) > 0 from information_schema.columns
        where table_name = 'regla_mapeo_linea'
          and column_name = 'porcentaje') as columna,
      (select count(*) > 0 from pg_constraint
        where conname = 'regla_mapeo_linea_porcentaje') as check`;
  return r;
};

const antes = await estado();
console.log(
  `  regla_mapeo_base += 'porcentaje'      ${antes.valor ? 'ya está' : 'FALTA'}`
);
console.log(
  `  regla_mapeo_linea.porcentaje          ${antes.columna ? 'ya está' : 'FALTA'}`
);
console.log(
  `  check regla_mapeo_linea_porcentaje    ${antes.check ? 'ya está' : 'FALTA'}`
);

if (antes.valor && antes.columna && antes.check) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log("  · alter type regla_mapeo_base add value 'porcentaje'");
  console.log('  · alter table regla_mapeo_linea add column porcentaje numeric(5,2)');
  console.log(
    "  · check (base <> 'porcentaje' or (porcentaje > 0 and porcentaje <= 100))\n"
  );
  await sql.end();
  process.exit(0);
}

// Agregar un valor a un enum no corre dentro de una transacción con los
// `alter table` que lo usan: va solo y primero.
if (!antes.valor) {
  await sql.unsafe(
    `alter type regla_mapeo_base add value if not exists 'porcentaje'`
  );
}

await sql.unsafe(`
  alter table regla_mapeo_linea
    add column if not exists porcentaje numeric(5, 2);

  comment on column regla_mapeo_linea.porcentaje is
    'Qué parte del importe lleva esta línea, en por ciento. Nace del impuesto sobre débitos y créditos, donde el 33% se computa a cuenta de Ganancias y el resto es gasto: sin esto haría falta un monto fijo, y el importe cambia todos los meses.';
`);

const [{ hayCheck }] = await sql<{ hayCheck: boolean }[]>`
  select count(*) > 0 as "hayCheck" from pg_constraint
  where conname = 'regla_mapeo_linea_porcentaje'`;
if (!hayCheck) {
  await sql.unsafe(`
    alter table regla_mapeo_linea
      add constraint regla_mapeo_linea_porcentaje
      check (base <> 'porcentaje' or (porcentaje > 0 and porcentaje <= 100));`);
}

const final = await estado();
console.log(
  final.valor && final.columna && final.check
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
