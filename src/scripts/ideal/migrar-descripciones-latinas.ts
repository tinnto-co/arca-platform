/**
 * Letras cirílicas que se ven latinas en movimientos ya importados.
 *
 * La lectura del PDF con IA a veces escribió "СОЕ" con С, О y Е cirílicas.
 * Desde ahora la importación las corrige (`aLatino`) y la huella de cada
 * movimiento (`id_externo`) las ignora. Este script corrige lo que ya estaba
 * guardado —descripción y huella—, para que un reimporte del mismo extracto
 * se reconozca como repetido y no duplique esos movimientos.
 *
 * Idempotente. Uso:
 *   MIGRATION_URL="postgres://...dueño..." \
 *     bun src/scripts/ideal/migrar-descripciones-latinas.ts [--apply]
 */
import postgres from 'postgres';
import { aLatino } from '../../lib/texto-latino';

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

// Cirílico y griego: el rango amplio; `aLatino` decide qué letra cambia.
const candidatos = await sql<
  { id: string; descripcion: string | null; idExterno: string | null }[]
>`
  select id, descripcion, id_externo as "idExterno"
  from movimiento_bancario
  where descripcion ~ '[Ͱ-ӿ]' or id_externo ~ '[Ͱ-ӿ]'`;

const cambios = candidatos
  .map((m) => ({
    ...m,
    nuevaDescripcion: m.descripcion && aLatino(m.descripcion),
    nuevoIdExterno: m.idExterno && aLatino(m.idExterno),
  }))
  .filter(
    (m) =>
      m.nuevaDescripcion !== m.descripcion || m.nuevoIdExterno !== m.idExterno
  );

console.log(`  movimientos a corregir: ${cambios.length}`);
for (const m of cambios.slice(0, 8)) {
  console.log(`    ${m.descripcion}  →  ${m.nuevaDescripcion}`);
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
      set descripcion = ${m.nuevaDescripcion},
          id_externo = ${m.nuevoIdExterno},
          updated_at = now()
      where id = ${m.id}`;
  }
});

console.log(`\n✓ Listo: ${cambios.length} movimientos corregidos.\n`);
await sql.end();
