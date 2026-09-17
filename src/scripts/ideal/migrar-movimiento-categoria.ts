/**
 * Conciliación bancaria (TIN-1634): categoría del movimiento + exclusión de
 * la comparación Banco vs Facturación, en una base que ya existe.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-movimiento-categoria.ts [--apply]
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
    select count(*) filter (where column_name = 'categoria') > 0 as categoria,
           count(*) filter (where column_name = 'categoria_fuente') > 0 as fuente,
           count(*) filter (where column_name = 'excluido') > 0 as excluido
    from information_schema.columns
    where table_name = 'movimiento_bancario'`;
  return r;
};

const antes = await estado();
console.log(`  columna categoria         ${antes.categoria ? 'ya está' : 'FALTA'}`);
console.log(`  columna categoria_fuente  ${antes.fuente ? 'ya está' : 'FALTA'}`);
console.log(`  columna excluido          ${antes.excluido ? 'ya está' : 'FALTA'}`);

if (antes.categoria && antes.fuente && antes.excluido) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · alter table movimiento_bancario add categoria, categoria_fuente (check), excluido + comments');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table movimiento_bancario
      add column if not exists categoria text,
      add column if not exists categoria_fuente text,
      add column if not exists excluido boolean not null default false;

    do $do$ begin
      if not exists (select 1 from pg_constraint
                      where conname = 'movimiento_bancario_categoria_fuente_check') then
        alter table movimiento_bancario
          add constraint movimiento_bancario_categoria_fuente_check
          check (categoria_fuente in ('sistema', 'manual'));
      end if;
    end $do$;

    comment on column movimiento_bancario.categoria is
      'Agrupación del movimiento (transferencias, impuestos, comisiones, ..., varios). La asigna el clasificador por palabras clave al importar; una persona puede pisarla.';
    comment on column movimiento_bancario.categoria_fuente is
      'sistema = la puso el clasificador; manual = la corrigió una persona (y el clasificador no la vuelve a tocar).';
    comment on column movimiento_bancario.excluido is
      'Excluido de la comparación Banco vs Facturación (ej. transferencia entre cuentas propias). Ajuste manual del estudio; el movimiento sigue existiendo.';
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final))
  console.log(`  ${String(k).padEnd(12)} ${v}`);
const bien = final.categoria && final.fuente && final.excluido;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
