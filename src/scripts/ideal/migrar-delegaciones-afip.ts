/**
 * Delegaciones de AFIP por servicio (handoff scrapper, caso KASUR): la
 * columna `cliente_credencial.delegaciones_afip` dice, por servicio, si la
 * credencial VE a la empresa en AFIP. La escribe el scraper en cada corrida;
 * la UI muestra «No conectada en AFIP — {servicio}» en vez de una solapa
 * vacía sin explicación.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-delegaciones-afip.ts [--apply]
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
    with col as (
      select count(*) > 0 as existe from information_schema.columns
       where table_name = 'cliente_credencial'
         and column_name = 'delegaciones_afip'
    )
    select existe as columna,
           case when existe then coalesce(has_column_privilege(
             'arca_scrapper', 'cliente_credencial',
             'delegaciones_afip', 'update'), false)
           else false end as scrapper_escribe
    from col`;
  return r;
};

const antes = await estado();
console.log(`  columna delegaciones_afip  ${antes.columna ? 'ya está' : 'FALTA'}`);
console.log(`  scrapper la escribe        ${antes.scrapper_escribe}`);

if (antes.columna && antes.scrapper_escribe) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log("  · alter table cliente_credencial add column delegaciones_afip jsonb default '{}' + comment");
  console.log('  · grant update (delegaciones_afip) on cliente_credencial to arca_scrapper');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table cliente_credencial
      add column if not exists delegaciones_afip jsonb not null default '{}'::jsonb;

    comment on column cliente_credencial.delegaciones_afip is
      'Por servicio de AFIP, si esta credencial ve a este cliente. Lo escribe el scraper. Forma: {"mis_comprobantes":{"estado":"ok"|"sin_delegacion","at":"<iso>"}, "ctacte":{...}, "portal_iva":{...}, "domicilio_fiscal":{...}}. sin_delegacion = la empresa está cargada en la plataforma pero AFIP no se la muestra a esta credencial para ese servicio (falta delegar en Administrador de Relaciones). Se sobreescribe en cada corrida: al delegar en AFIP se limpia sola.';

    grant update (delegaciones_afip) on cliente_credencial to arca_scrapper;
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final))
  console.log(`  ${String(k).padEnd(18)} ${v}`);

const bien = final.columna && final.scrapper_escribe;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
