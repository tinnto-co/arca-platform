/**
 * Asigna `posicion` a las tareas que no la tienen, respetando el orden que
 * muestran hoy (vence_at, después created_at) dentro de cada columna.
 *
 * Sin esto, las tareas anteriores al índice fraccional quedan con `posicion`
 * en null y el `nulls last` del listado las manda todas al fondo.
 *
 * Idempotente: sólo toca las que están en null.
 *
 *   DB_URL=postgres://... bun src/scripts/ideal/backfill-posicion-tareas.ts --apply
 */
import postgres from 'postgres';
import { generateKeyBetween } from 'fractional-indexing';

const APLICAR = process.argv.includes('--apply');
const url = process.env.DB_URL;
if (!url) {
  console.error('Falta DB_URL.');
  process.exit(1);
}
const sql = postgres(url, { max: 1, connect_timeout: 15, onnotice: () => {} });

try {
  const filas = (await sql`
    select id, coalesce(columna_id::text, '__sin_columna__') col, posicion
      from tarea
     order by col, vence_at nulls last, created_at
  `) as unknown as { id: string; col: string; posicion: string | null }[];

  // Por columna: se arranca desde la última clave ya usada, así las nuevas
  // caen después de las que ya tenían posición.
  const ultima = new Map<string, string | null>();
  for (const f of filas) {
    if (f.posicion) ultima.set(f.col, f.posicion);
  }

  const cambios: [string, string][] = [];
  for (const f of filas) {
    if (f.posicion) continue;
    const previa = ultima.get(f.col) ?? null;
    const clave = generateKeyBetween(previa, null);
    ultima.set(f.col, clave);
    cambios.push([f.id, clave]);
  }

  console.log(`tareas: ${filas.length} · sin posición: ${cambios.length}`);
  if (!cambios.length) {
    console.log('Nada que hacer.');
  } else if (!APLICAR) {
    console.log('(simulación — usá --apply)');
  } else {
    await sql.begin(async (tx) => {
      for (const [id, pos] of cambios) {
        await tx`update tarea set posicion = ${pos} where id = ${id}::uuid`;
      }
    });
    const [{ n }] = (await sql`
      select count(*)::int n from tarea where posicion is null
    `) as unknown as { n: number }[];
    console.log(`✓ aplicado · quedan sin posición: ${n}`);
  }
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
