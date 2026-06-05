/**
 * Siembra el plan de cuentas base del módulo de Balances en todas las
 * organizaciones existentes (idempotente).
 *
 * Uso: bun run src/scripts/seed-accounting-base.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { organization } from '@/drizzle/schema';
import { seedBaseChartForOrg } from '@/lib/accounting-seed';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  const orgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization);
  console.log(`Organizaciones a sembrar: ${orgs.length}`);

  let totalInserted = 0;
  for (const org of orgs) {
    const { inserted, skipped } = await seedBaseChartForOrg(org.id);
    totalInserted += inserted;
    console.log(
      `  • ${org.name} (${org.id}): +${inserted} cuentas, ${skipped} ya existían`
    );
  }

  console.log(`\nListo. Cuentas base insertadas en total: ${totalInserted}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
