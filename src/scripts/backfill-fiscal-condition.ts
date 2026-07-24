/**
 * Backfill de client.fiscal_condition. Idempotente (solo toca filas NULL).
 *
 * 1. Clients con presentaciones en iva_scrape → 'responsable_inscripto'.
 * 2. Clients aún NULL heredan representative.fiscal_condition si está cargada.
 *
 * Correr con: bun run src/scripts/backfill-fiscal-condition.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const ri = await db.execute(sql`
    UPDATE client
    SET fiscal_condition = 'responsable_inscripto', updated_at = now()
    WHERE fiscal_condition IS NULL
      AND id IN (SELECT DISTINCT client_id FROM iva_scrape)
  `);
  console.log(
    `RI por heurística iva_scrape: ${ri.count ?? 0} clients actualizados`
  );

  const inherited = await db.execute(sql`
    UPDATE client c
    SET fiscal_condition = r.fiscal_condition, updated_at = now()
    FROM representative r
    WHERE c.representative_id = r.id
      AND c.fiscal_condition IS NULL
      AND r.fiscal_condition IS NOT NULL
      AND r.fiscal_condition IN ('responsable_inscripto', 'monotributista', 'exento')
  `);
  console.log(
    `Heredados de representative: ${inherited.count ?? 0} clients actualizados`
  );

  const pending = await db.execute(sql`
    SELECT count(*)::int AS n FROM client WHERE fiscal_condition IS NULL AND disabled_at IS NULL
  `);
  console.log(
    `Quedan sin clasificar (activos): ${(pending as unknown as { n: number }[])[0]?.n ?? '?'}`
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
