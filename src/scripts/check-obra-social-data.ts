import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import {
  liquidacionImportEmpleado,
  liquidacionImportRecibo,
} from '../../drizzle/schema';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const [resumenRecibo] = await db
    .select({
      total: sql<number>`count(*)::int`,
      conObraSocial: sql<number>`count(${liquidacionImportRecibo.obraSocialId})::int`,
    })
    .from(liquidacionImportRecibo);

  const [resumenEmpleado] = await db
    .select({
      total: sql<number>`count(*)::int`,
      conObraSocial: sql<number>`count(${liquidacionImportEmpleado.obraSocialId})::int`,
    })
    .from(liquidacionImportEmpleado);

  console.log(
    JSON.stringify(
      {
        tieneObraSocialEnEmpleado: true,
        recibos: resumenRecibo,
        empleados: resumenEmpleado,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
