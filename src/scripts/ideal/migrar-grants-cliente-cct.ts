/**
 * Le da al scrapper permiso sobre `cliente_cct`, para el job `convenios`.
 *
 * `cliente_cct` guarda los CCT que ARCA declara por empleador y hasta ahora la
 * escribía una corrida manual, así que el rol `arca_scrapper` no tenía ningún
 * grant: su `select` falla con "permission denied". Con RLS activo hacen falta
 * las dos cosas —el grant y estar en la política `tenant`—, igual que
 * `libro_iva`.
 *
 * No hay secuencia propia: la PK es uuid con `gen_random_uuid()`.
 *
 * La fuente de verdad es `schema-rls-scrapper.sql`, que ya quedó actualizado;
 * esto es solo para la base que ya existe.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-grants-cliente-cct.ts [--apply]
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
  select current_user as usuario, current_database() as base,
         inet_server_addr()::text as host`;
console.log(
  `\nBase: ${quien.base} — host ${quien.host ?? 'local'} — conectado como ${quien.usuario}`
);
console.log(APPLY ? 'Modo: APLICAR\n' : 'Modo: dry-run\n');

const estado = async () => {
  const [r] = await sql`
    select
      coalesce(has_table_privilege('arca_scrapper', 'cliente_cct', 'select'), false) as lee,
      coalesce(has_table_privilege('arca_scrapper', 'cliente_cct', 'insert'), false) as inserta,
      coalesce(has_table_privilege('arca_scrapper', 'cliente_cct', 'update'), false) as actualiza,
      coalesce(has_table_privilege('arca_scrapper', 'cliente_cct', 'delete'), false) as borra,
      coalesce((
        select 'arca_scrapper' = any(roles) from pg_policies
        where tablename = 'cliente_cct' and policyname = 'tenant'
      ), false) as en_politica`;
  return r;
};

const antes = await estado();
console.log(`  select                    ${antes.lee ? 'ya está' : 'FALTA'}`);
console.log(
  `  insert                    ${antes.inserta ? 'ya está' : 'FALTA'}`
);
console.log(
  `  update                    ${antes.actualiza ? 'ya está' : 'FALTA'}`
);
console.log(`  delete                    ${antes.borra ? 'ya está' : 'FALTA'}`);
console.log(
  `  política tenant           ${antes.en_politica ? 'ya está' : 'FALTA'}`
);

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(
    `grant select, insert, update, delete on cliente_cct to arca_scrapper`
  );

  // La política ya existe (la creó el schema base para arca_app/arca_agent):
  // se le suma el rol, sin recrearla.
  const [pol] = await tx`
    select roles::text[] as roles from pg_policies
    where tablename = 'cliente_cct' and policyname = 'tenant'`;
  if (!pol) {
    throw new Error(
      'cliente_cct no tiene política `tenant`: revisar schema-dominio3/schema-rls antes de seguir.'
    );
  }
  if (!(pol.roles as string[]).includes('arca_scrapper')) {
    await tx.unsafe(
      `alter policy tenant on cliente_cct to arca_app, arca_agent, arca_scrapper`
    );
  }
});

const despues = await estado();
console.log('\nVerificación:');
console.log(
  `  grants (s/i/u/d)          ${despues.lee && despues.inserta && despues.actualiza && despues.borra}`
);
console.log(`  política tenant           ${despues.en_politica}`);
const ok =
  despues.lee &&
  despues.inserta &&
  despues.actualiza &&
  despues.borra &&
  despues.en_politica;
console.log(ok ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
