/**
 * Permite filas de tarea_cliente sin cliente, para la columna «Sin cliente».
 *
 * Un vencimiento cuyo CUIT no es cliente de la plataforma antes se descartaba
 * con un contador en un toast; ahora genera su tarea igual y cae en la columna
 * de sistema «Sin cliente» del tablero. Para eso `cliente_id` pasa a nullable,
 * con un CHECK que exige que la fila apunte a un cliente o a un vencimiento —
 * una fila sin ninguno de los dos no señala nada y no debe existir.
 *
 * La columna del tablero no se crea acá: la crea la aplicación bajo demanda
 * (clave 'sin_cliente'), igual que Archivadas.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-tarea-sin-cliente.ts [--apply]
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
    select (select is_nullable = 'YES' from information_schema.columns
             where table_name = 'tarea_cliente'
               and column_name = 'cliente_id')      as nullable,
           exists (select 1 from pg_constraint
             where conname = 'tarea_cliente_destino'
               and conrelid = 'tarea_cliente'::regclass) as chequeo`;
  return r;
};

const antes = await estado();
console.log(
  `  cliente_id nullable        ${antes.nullable ? 'ya está' : 'FALTA'}`
);
console.log(
  `  CHECK tarea_cliente_destino ${antes.chequeo ? 'ya está' : 'FALTA'}`
);

if (antes.nullable && antes.chequeo) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  if (!antes.nullable)
    console.log(
      '  · alter table tarea_cliente alter column cliente_id drop not null'
    );
  if (!antes.chequeo)
    console.log(
      '  · add constraint tarea_cliente_destino check (cliente_id o vencimiento_id)'
    );
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  if (!antes.nullable) {
    await tx.unsafe(
      `alter table tarea_cliente alter column cliente_id drop not null;`
    );
  }
  if (!antes.chequeo) {
    await tx.unsafe(`
      alter table tarea_cliente add constraint tarea_cliente_destino
        check (cliente_id is not null or vencimiento_id is not null);
      comment on column tarea_cliente.cliente_id is
        'Null solo cuando la fila viene de un vencimiento cuyo CUIT no es cliente de la plataforma: la tarea igual se crea (columna «Sin cliente») para que el trabajo no desaparezca en un toast.';
    `);
  }
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final))
  console.log(`  ${k.padEnd(10)} ${v}`);

const bien = final.nullable && final.chequeo;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
process.exit(bien ? 0 : 1);
