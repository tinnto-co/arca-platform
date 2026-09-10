/**
 * Registro de cuándo se cambia la clave de una credencial (handoff scrapper,
 * Parte A del par coordinado con CRED_MARCAR_CLAVE_INVALIDA en el scraper).
 *
 * - Columna `credencial_afip.clave_actualizada_at` (updated_at no sirve: se
 *   pisa en cada login OK).
 * - Trigger before update: cambió la clave → registra la fecha y, si estaba
 *   clave_invalida, re-activa ('bloqueada' no se toca). Es lo que evita el
 *   deadlock: el scraper marca clave_invalida y la salida es que el estudio
 *   edite la clave.
 * - Verifica que arca_scrapper pueda escribir `estado` (Parte B lo necesita).
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-clave-actualizada.ts [--apply]
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
       where table_name = 'credencial_afip'
         and column_name = 'clave_actualizada_at'
    )
    select existe as columna,
           exists (select 1 from pg_trigger
                    where tgname = 'trg_credencial_clave_cambiada'
                      and tgrelid = 'credencial_afip'::regclass) as trigger_existe,
           coalesce(has_column_privilege(
             'arca_scrapper', 'credencial_afip', 'estado', 'update'), false)
             as scrapper_escribe_estado
    from col`;
  return r;
};

const antes = await estado();
console.log(`  columna clave_actualizada_at   ${antes.columna ? 'ya está' : 'FALTA'}`);
console.log(`  trigger clave_cambiada         ${antes.trigger_existe ? 'ya está' : 'FALTA'}`);
console.log(`  scrapper escribe estado        ${antes.scrapper_escribe_estado}`);

if (antes.columna && antes.trigger_existe && antes.scrapper_escribe_estado) {
  console.log('\n✓ Nada que hacer.\n');
  await sql.end();
  process.exit(0);
}

if (!APPLY) {
  console.log('\nQué haría con --apply:');
  console.log('  · alter table credencial_afip add column clave_actualizada_at + comment');
  console.log('  · create function/trigger trg_credencial_clave_cambiada (before update)');
  console.log('  · grant update (estado) on credencial_afip to arca_scrapper (si falta)');
  console.log();
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  await tx.unsafe(`
    alter table credencial_afip
      add column if not exists clave_actualizada_at timestamptz;

    comment on column credencial_afip.clave_actualizada_at is
      'Cuándo se cambió por última vez la clave (contraseña) de esta credencial. Distinto de updated_at, que se pisa en cada login exitoso. La setea el trigger trg_credencial_clave_cambiada, que además re-activa la credencial si estaba clave_invalida.';

    create or replace function trg_credencial_clave_cambiada() returns trigger as $fn$
    begin
      if new.clave is distinct from old.clave then
        new.clave_actualizada_at := now();
        if old.estado = 'clave_invalida' then
          new.estado := 'activa';
        end if;
      end if;
      return new;
    end;
    $fn$ language plpgsql;

    drop trigger if exists trg_credencial_clave_cambiada on credencial_afip;
    create trigger trg_credencial_clave_cambiada
      before update on credencial_afip
      for each row execute function trg_credencial_clave_cambiada();

    grant update (estado) on credencial_afip to arca_scrapper;
  `);
});

const final = await estado();
console.log('\nDespués de aplicar:');
for (const [k, v] of Object.entries(final))
  console.log(`  ${String(k).padEnd(24)} ${v}`);

const bien =
  final.columna && final.trigger_existe && final.scrapper_escribe_estado;
console.log(bien ? '\n✓ Listo.\n' : '\n✗ Algo no quedó como se esperaba.\n');
await sql.end();
