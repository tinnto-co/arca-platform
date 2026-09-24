/**
 * Reemplaza "AFIP" por "ARCA" en los resúmenes que generó el clasificador.
 *
 * Sólo toca `ai_resumen`, que es texto nuestro. El `mensaje` queda intacto:
 * eso lo escribió el organismo y cambiarlo sería falsear lo recibido.
 *
 * El prompt del clasificador ya nombra a ARCA, así que esto es sólo para lo
 * generado antes del cambio. Es idempotente.
 *
 *   bun run src/scripts/renombrar-afip-en-resumenes.ts          # sólo informa
 *   bun run src/scripts/renombrar-afip-en-resumenes.ts --aplicar
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

const aplicar = process.argv.includes('--aplicar');

// `\mAFIP\M` son bordes de palabra en Postgres: no toca "AFIPCourier" ni
// variantes pegadas a otra palabra.
const PATRON = String.raw`\mAFIP\M`;

const [{ count }] = await db.execute<{ count: number }>(sql`
  select count(*)::int as count
    from notificacion
   where ai_resumen ~ ${PATRON}
`);

console.log(`Resúmenes con "AFIP": ${count}`);

if (!aplicar) {
  const ejemplos = await db.execute<{ ai_resumen: string }>(sql`
    select ai_resumen from notificacion where ai_resumen ~ ${PATRON} limit 5
  `);
  for (const e of ejemplos) console.log(`  · ${e.ai_resumen}`);
  console.log('\nCorré con --aplicar para reescribirlos.');
  process.exit(0);
}

const r = await db.execute(sql`
  update notificacion
     set ai_resumen = regexp_replace(ai_resumen, ${PATRON}, 'ARCA', 'g'),
         updated_at = now()
   where ai_resumen ~ ${PATRON}
`);

console.log(`Actualizados: ${r.count ?? 0}`);
process.exit(0);
