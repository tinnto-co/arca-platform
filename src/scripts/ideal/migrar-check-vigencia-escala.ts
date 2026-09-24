/**
 * Impide que una escala salarial dure años.
 *
 * Las paritarias fijan sueldos por meses. Una fila que dice regir cinco años no
 * es una escala, y como el cálculo toma siempre la vigencia más reciente, esa
 * fila le gana a todas las mensuales posteriores: es lo que pasó con Comercio,
 * donde una fila "Jul 2026 – Mar 2031" dejó 34 empresas liquidando con el
 * básico de junio desde julio hasta que el estudio lo notó en septiembre.
 *
 * Se agrega el mismo CHECK a las dos tablas: `escala_salarial` (lo propio de
 * cada empleador, que es lo que lee el recibo) y `cct_escala` (la grilla común
 * que escribe el scrapeo).
 *
 * El check se agrega validado cuando la tabla ya cumple, que es lo que
 * garantiza que ninguna fila vieja quedó afuera. Si quedara alguna que no
 * cumple se agrega NOT VALID: protege lo que venga sin trabar la migración, y
 * el script dice cuáles son para limpiarlas después.
 *
 * Sin fecha de fin se permite: es lo normal para la última escala cargada, que
 * rige hasta que se cargue la siguiente.
 *
 * La fuente de verdad es `schema-dominio3.sql`, ya actualizado; esto es solo
 * para la base que ya existe.
 *
 * Idempotente. Uso:
 *   bun src/scripts/ideal/migrar-check-vigencia-escala.ts [--apply]
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const URL = process.env.MIGRATION_URL ?? process.env.DATABASE_URL;

/** Trece meses abarcados: deja pasar un acuerdo anual, corta cualquier cosa mayor. */
const TODAS = ['escala_salarial', 'cct_escala'] as const;
/** `--tabla=<nombre>` aplica solo a una; sin el flag, a las dos. */
const SOLO = process.argv
  .find((a) => a.startsWith('--tabla='))
  ?.slice('--tabla='.length);
const TABLAS = SOLO ? TODAS.filter((t) => t === SOLO) : TODAS;
if (TABLAS.length === 0) {
  console.error(`--tabla debe ser una de: ${TODAS.join(', ')}`);
  process.exit(1);
}
const nombreCheck = (t: string) => `${t}_vigencia_razonable`;
const expresion = `
  vigencia_hasta is null
  or (
    vigencia_hasta >= vigencia_desde
    and vigencia_hasta < vigencia_desde + interval '13 months'
  )`;

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

const existe = async (tabla: string) => {
  const [r] = await sql`
    select 1 as hay from pg_constraint
    where conname = ${nombreCheck(tabla)}
      and conrelid = to_regclass(${tabla})`;
  return !!r;
};

for (const tabla of TABLAS) {
  const hay = await existe(tabla);
  const [fuera] = await sql.unsafe(`
    select count(*)::int n from ${tabla}
    where vigencia_hasta is not null
      and (vigencia_hasta < vigencia_desde
           or vigencia_hasta >= vigencia_desde + interval '13 months')`);
  console.log(
    `  ${tabla.padEnd(16)} check ${hay ? 'ya está' : 'FALTA'} · filas que hoy no cumplen: ${fuera.n}`
  );
}

if (!APPLY) {
  console.log('\nDry-run: nada se aplicó. Volvé a correr con --apply.\n');
  await sql.end();
  process.exit(0);
}

for (const tabla of TABLAS) {
  if (await existe(tabla)) continue;
  const [fuera] = await sql.unsafe(`
    select count(*)::int n from ${tabla}
    where vigencia_hasta is not null
      and (vigencia_hasta < vigencia_desde
           or vigencia_hasta >= vigencia_desde + interval '13 months')`);
  const validado = fuera.n === 0;
  await sql.unsafe(`
    alter table ${tabla}
    add constraint ${nombreCheck(tabla)}
    check (${expresion})${validado ? '' : ' not valid'}`);
  console.log(
    `  ${tabla}: check agregado ${validado ? 'y validado sobre las filas existentes' : `NOT VALID (${fuera.n} filas viejas no cumplen)`}`
  );
}

console.log('\nVerificación:');
let ok = true;
for (const tabla of TABLAS) {
  const hay = await existe(tabla);
  ok &&= hay;
  console.log(`  ${tabla.padEnd(16)} ${hay ? 'ok' : 'FALTA'}`);
}
console.log(ok ? '✓ Listo\n' : '✗ Algo falló\n');

await sql.end();
