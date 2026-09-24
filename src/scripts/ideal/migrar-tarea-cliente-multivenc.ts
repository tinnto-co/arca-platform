/**
 * Un cliente puede tener varios vencimientos en la misma tarea.
 *
 * El unique pleno (tarea_id, cliente_id) hacía que el SEGUNDO vencimiento
 * del mismo cliente en la misma tarea automática chocara en silencio
 * (onConflictDoNothing) y quedara sin tarea para siempre — así se juntaron
 * 123 vencimientos «sin tarea» que Autogenerar decía tener cubiertos. El
 * índice pasa a ser parcial: aplica solo a filas manuales (sin vencimiento);
 * las filas con vencimiento ya tienen su unique propio por vencimiento_id.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-tarea-cliente-multivenc.ts [--apply]
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
    select indexdef ilike '%where%' as parcial
    from pg_indexes
    where indexname = 'uq_tarea_cliente'`;
  return r ?? { parcial: null };
};

const antes = await estado();
console.log(
  `  uq_tarea_cliente  ${
    antes.parcial === null
      ? 'NO EXISTE'
      : antes.parcial
        ? 'ya es parcial'
        : 'pleno (FALTA migrar)'
  }`
);

if (antes.parcial) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log(
    '\nCon --apply se recrea el índice como parcial (where vencimiento_id is null).\n'
  );
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    drop index if exists uq_tarea_cliente;
    create unique index uq_tarea_cliente on tarea_cliente(tarea_id, cliente_id)
      where vencimiento_id is null;
  `);
});

const final = await estado();
console.log(`\nDespués de aplicar: parcial = ${final.parcial}`);
console.log(
  final.parcial ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n'
);
await sql.end();
process.exit(final.parcial ? 0 : 1);
