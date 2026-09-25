/**
 * Vuelve a pasar el clasificador por los movimientos ya importados.
 *
 * Cuando se corrige una regla de `clasificarMovimiento` (p. ej. "Retiro en
 * efvo por caja" caía en Varios y "Com extraccion bca automatica" en
 * Efectivo), lo nuevo se clasifica bien pero lo guardado sigue igual. Este
 * script recalcula la categoría de lo que puso el sistema; lo que corrigió
 * una persona (`categoria_fuente = 'manual'`) no se toca.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-reclasificar-movimientos.ts [--apply]
 */
import postgres from 'postgres';
import { clasificarMovimiento } from '../../lib/clasificar-movimiento';

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

const movimientos = await sql<
  { id: string; descripcion: string | null; categoria: string | null }[]
>`
  select id, descripcion, categoria
  from movimiento_bancario
  where categoria_fuente is distinct from 'manual'`;

const cambios = movimientos
  .map((m) => ({ ...m, nueva: clasificarMovimiento(m.descripcion) }))
  .filter((m) => m.nueva !== m.categoria);

console.log(
  `  movimientos revisados: ${movimientos.length} · a reclasificar: ${cambios.length}`
);
const porPar = new Map<string, string[]>();
for (const m of cambios) {
  const clave = `${m.categoria ?? '(sin categoría)'} → ${m.nueva}`;
  porPar.set(clave, [...(porPar.get(clave) ?? []), m.descripcion ?? '']);
}
for (const [clave, descripciones] of porPar) {
  console.log(`\n  ${clave}: ${descripciones.length}`);
  for (const d of descripciones.slice(0, 4)) console.log(`    ${d}`);
}

if (cambios.length === 0 || !APPLY) {
  console.log(
    cambios.length === 0
      ? '\n✓ Nada que hacer.\n'
      : '\nDry-run: nada se aplicó. Volvé a correr con --apply.\n'
  );
  await sql.end();
  process.exit(0);
}

await sql.begin(async (tx) => {
  for (const m of cambios) {
    await tx`
      update movimiento_bancario
      set categoria = ${m.nueva}, categoria_fuente = 'sistema'
      where id = ${m.id} and categoria_fuente is distinct from 'manual'`;
  }
});

console.log(`\n✓ Listo: ${cambios.length} movimientos reclasificados.\n`);
await sql.end();
