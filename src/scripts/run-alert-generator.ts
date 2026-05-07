/**
 * Corre el alert-generator (US-027) contra una org y reporta cuántas alertas creó.
 * Idempotente: re-correrlo con la misma org devuelve { created: 0 } por dedup.
 *
 * Uso:
 *   bun run src/scripts/run-alert-generator.ts                       # lista orgs disponibles
 *   bun run src/scripts/run-alert-generator.ts <orgId>               # corre para una org
 *   bun run src/scripts/run-alert-generator.ts --all                 # corre para todas las orgs
 *
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { organization } from '@/drizzle/auth';
import { generateAlerts } from '@/lib/alert-generator';

async function listOrgs() {
  const rows = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization);
  console.log('Orgs disponibles:');
  for (const r of rows) console.log(`  ${r.id}  ${r.name}`);
  console.log('\nUsá: bun run src/scripts/run-alert-generator.ts <orgId>');
}

async function runForOrg(orgId: string) {
  const t0 = Date.now();
  const result = await generateAlerts(orgId);
  console.log(
    `[${orgId}] created=${result.created}  (${Date.now() - t0} ms)`
  );
  return result.created;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length === 0) {
    await listOrgs();
    process.exit(0);
  }

  if (args[0] === '--all') {
    const rows = await db
      .select({ id: organization.id })
      .from(organization);
    let total = 0;
    for (const r of rows) total += await runForOrg(r.id);
    console.log(`\nTotal creadas: ${total}`);
    process.exit(0);
  }

  await runForOrg(args[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
