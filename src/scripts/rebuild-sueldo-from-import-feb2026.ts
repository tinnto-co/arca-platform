/**
 * Mantenimiento: recibos generados en el front vs datos importados SOS (LSD).
 *
 * 1) Borra todos los recibos con origen "generado" del cliente indicado (y sus
 *    líneas de concepto en cascada).
 * 2) Convierte los recibos importados de tipo "sueldo" del período Febrero 2026
 *    en recibos de sistema: origen "generado", sin copiar filas (mismo id),
 *    preservando totales y conceptos importados.
 *
 * Uso (desde la raíz de arca-platform):
 *   bun run src/scripts/rebuild-sueldo-from-import-feb2026.ts
 *   bun run src/scripts/rebuild-sueldo-from-import-feb2026.ts --dry-run
 *
 * Variables de entorno:
 *   DATABASE_URL (requerido)
 *   CLIENT_NAME (opcional, default "E-Presis") — búsqueda case-insensitive por substring
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import {
  client,
  liquidacionImportRecibo,
  liquidacionImportEmpleado,
  profile,
} from '@/drizzle/schema';
import { and, eq, inArray, or, sql } from 'drizzle-orm';

const PERIODO_FEB_2026 = ['2026-02', '2026-2'] as const;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  return { dryRun };
}

async function findClientIdByName(substring: string): Promise<string | null> {
  const pattern = `%${substring.trim()}%`;
  const rows = await db
    .select({ id: client.id, name: client.name })
    .from(client)
    .where(sql`lower(${client.name}) like lower(${pattern})`)
    .limit(5);
  if (rows.length === 0) {
    console.error(
      `No se encontró cliente con nombre que contenga "${substring}".`
    );
    return null;
  }
  if (rows.length > 1) {
    console.warn('Varios clientes coinciden; se usa el primero:');
    rows.forEach((r) => console.warn(`  - ${r.name} (${r.id})`));
  }
  const chosen = rows[0];
  console.log(`Cliente: ${chosen.name} (${chosen.id})`);
  return chosen.id;
}

async function empleadoIdsForClient(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: liquidacionImportEmpleado.id })
    .from(liquidacionImportEmpleado)
    .innerJoin(profile, eq(liquidacionImportEmpleado.profileId, profile.id))
    .where(eq(profile.client, clientId));
  return rows.map((r) => r.id);
}

async function main() {
  const { dryRun } = parseArgs();
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL.');
    process.exit(1);
  }

  const clientName = process.env.CLIENT_NAME ?? 'E-Presis';
  const clientId = await findClientIdByName(clientName);
  if (!clientId) process.exit(1);

  const empleadoIds = await empleadoIdsForClient(clientId);
  if (empleadoIds.length === 0) {
    console.log('No hay empleados de liquidación para este cliente.');
    process.exit(0);
  }

  const generados = await db
    .select({ id: liquidacionImportRecibo.id })
    .from(liquidacionImportRecibo)
    .where(
      and(
        eq(liquidacionImportRecibo.origen, 'generado'),
        inArray(liquidacionImportRecibo.empleadoId, empleadoIds)
      )
    );

  const importsSueldoFeb = await db
    .select({
      id: liquidacionImportRecibo.id,
      periodo: liquidacionImportRecibo.periodo,
      tipo: liquidacionImportRecibo.tipo,
    })
    .from(liquidacionImportRecibo)
    .where(
      and(
        eq(liquidacionImportRecibo.origen, 'import'),
        sql`lower(${liquidacionImportRecibo.tipo}) = 'sueldo'`,
        or(
          eq(liquidacionImportRecibo.periodo, PERIODO_FEB_2026[0]),
          eq(liquidacionImportRecibo.periodo, PERIODO_FEB_2026[1])
        ),
        inArray(liquidacionImportRecibo.empleadoId, empleadoIds)
      )
    );

  console.log(
    `\nResumen (${dryRun ? 'dry-run' : 'ejecución'}):\n` +
      `  Recibos "generado" a borrar: ${generados.length}\n` +
      `  Recibos "import" sueldo Feb 2026 a convertir: ${importsSueldoFeb.length}\n`
  );

  if (dryRun) {
    console.log('Sin cambios (--dry-run).');
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (generados.length > 0) {
      await tx.delete(liquidacionImportRecibo).where(
        inArray(
          liquidacionImportRecibo.id,
          generados.map((g) => g.id)
        )
      );
      console.log(`Borrados ${generados.length} recibo(s) generado(s).`);
    }

    if (importsSueldoFeb.length > 0) {
      const now = new Date();
      await tx
        .update(liquidacionImportRecibo)
        .set({
          origen: 'generado',
          calculadoAt: now,
          reciboConfirmado: true,
          updatedAt: now,
        })
        .where(
          inArray(
            liquidacionImportRecibo.id,
            importsSueldoFeb.map((r) => r.id)
          )
        );
      console.log(
        `Convertidos ${importsSueldoFeb.length} recibo(s) importados a origen "generado" (Feb 2026, sueldo).`
      );
    }
  });

  console.log('Listo.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
