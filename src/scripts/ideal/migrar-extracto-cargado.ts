/**
 * Agrega el estado `cargado` a `extracto_estado`.
 *
 * Subir y extraer pasan a ser dos pasos. Antes la subida despertaba al worker
 * y la lectura arrancaba sola; ahora el archivo queda `cargado` —subido, sin
 * leer— y el estudio junta la tanda, la revisa y aprieta "Extraer". Recién
 * ahí las filas pasan a `pendiente`, que es lo único que el worker toma.
 *
 * `alter type ... add value` no admite usar el valor en la misma transacción,
 * así que va en autocommit.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-extracto-cargado.ts [--apply]
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

const tieneValor = async () => {
  const [r] = await sql`
    select exists (
      select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'extracto_estado' and e.enumlabel = 'cargado'
    ) as existe`;
  return r.existe as boolean;
};

const antes = await tieneValor();
console.log(`  extracto_estado += 'cargado'   ${antes ? 'ya está' : 'FALTA'}`);

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

if (!antes) {
  // Antes de 'pendiente' para que el orden del enum siga el del flujo.
  await sql.unsafe(
    `alter type extracto_estado add value 'cargado' before 'pendiente'`
  );
  console.log("  → valor 'cargado' agregado");
}

const despues = await tieneValor();
console.log(`\nVerificación: extracto_estado tiene 'cargado' → ${despues}`);
console.log(despues ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
