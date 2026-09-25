/**
 * Una línea de regla puede apuntar a "la cuenta del banco" en vez de a una
 * cuenta fija.
 *
 * En un asiento de banco la contrapartida es siempre el banco, y cada cuenta
 * bancaria tiene la suya en el plan. Si la línea tuviera que nombrar una
 * cuenta concreta, haría falta una regla por cada cuenta bancaria: con siete
 * cuentas y diez conceptos, setenta reglas para mantener.
 *
 * Con esto, la línea dice "la cuenta del banco del movimiento" y al generar
 * se resuelve con `cuenta_bancaria.cuenta_contable_id`. Una sola regla de
 * comisiones sirve para Galicia, BBVA y Santander.
 *
 * `cuenta_id` pasa a ser opcional, con un check que exige una de las dos
 * cosas: o una cuenta, o la marca. Las líneas que ya existen no cambian.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-regla-cuenta-banco.ts [--apply]
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
    { columna: boolean; opcional: boolean; check: boolean }[]
  >`
    select
      (select count(*) > 0 from information_schema.columns
        where table_name = 'regla_mapeo_linea'
          and column_name = 'usa_cuenta_banco') as columna,
      (select coalesce(bool_or(is_nullable = 'YES'), false)
        from information_schema.columns
        where table_name = 'regla_mapeo_linea'
          and column_name = 'cuenta_id') as opcional,
      (select count(*) > 0 from pg_constraint
        where conname = 'regla_mapeo_linea_cuenta_o_banco') as check`;
  return r;
};

const antes = await estado();
console.log(
  `  columna usa_cuenta_banco   ${antes.columna ? 'ya está' : 'FALTA'}`
);
console.log(
  `  cuenta_id opcional         ${antes.opcional ? 'ya está' : 'FALTA'}`
);
console.log(
  `  check cuenta o banco       ${antes.check ? 'ya está' : 'FALTA'}`
);

if (antes.columna && antes.opcional && antes.check) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · alter table regla_mapeo_linea add column usa_cuenta_banco');
  console.log('  · alter column cuenta_id drop not null');
  console.log('  · check (cuenta_id is not null or usa_cuenta_banco)\n');
  await sql.end();
  process.exit(0);
}

await sql.unsafe(`
  alter table regla_mapeo_linea
    add column if not exists usa_cuenta_banco boolean not null default false;

  alter table regla_mapeo_linea alter column cuenta_id drop not null;

  comment on column regla_mapeo_linea.usa_cuenta_banco is
    'La línea no apunta a una cuenta fija sino a la del banco del movimiento (cuenta_bancaria.cuenta_contable_id). Sin esto haría falta una regla por cada cuenta bancaria: con siete cuentas y diez conceptos, setenta reglas. Solo tiene sentido en el módulo movimiento_bancario.';
`);

// El check no acepta "if not exists": se agrega solo si falta, para que
// volver a correr el script no falle.
const [{ hayCheck }] = await sql<{ hayCheck: boolean }[]>`
  select count(*) > 0 as "hayCheck" from pg_constraint
  where conname = 'regla_mapeo_linea_cuenta_o_banco'`;
if (!hayCheck) {
  await sql.unsafe(`
    alter table regla_mapeo_linea
      add constraint regla_mapeo_linea_cuenta_o_banco
      check (cuenta_id is not null or usa_cuenta_banco);`);
}

const final = await estado();
console.log(
  final.columna && final.opcional && final.check
    ? '\n✓ Listo.\n'
    : '\n✗ Algo no quedó.\n'
);
await sql.end();
