/**
 * Corre el risk-engine (US-028) contra una org/perfil y reporta el resultado.
 * Idempotente: re-correrlo con el mismo (orgId, period) actualiza filas existentes.
 *
 * Uso:
 *   bun run src/scripts/run-risk-engine.ts                                       # lista orgs
 *   bun run src/scripts/run-risk-engine.ts <orgId> <period>                      # batch para una org
 *   bun run src/scripts/run-risk-engine.ts --client <clientId> <period>          # un solo cliente (debug)
 *
 * period en formato YYYY-MM (ej: 2026-03).
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { organization } from '@/drizzle/auth';
import { representative, client, clientRiskSnapshot } from '@/drizzle/schema';
import { calculateRiskScore, generateRiskSnapshots } from '@/lib/risk-engine';

async function listOrgs() {
  const rows = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization);
  console.log('Orgs disponibles:');
  for (const r of rows) console.log(`  ${r.id}  ${r.name}`);
  console.log(
    '\nUsá: bun run src/scripts/run-risk-engine.ts <orgId> <period>'
  );
  console.log('     bun run src/scripts/run-risk-engine.ts --client <id> <period>');
}

async function runForOrg(orgId: string, period: string) {
  const t0 = Date.now();
  const result = await generateRiskSnapshots(orgId, period);
  console.log(
    `[${orgId} / ${period}] processed=${result.processed} errors=${result.errors}  (${Date.now() - t0} ms)`
  );

  // Show distribution by risk level
  const clients = await db
    .select({ id: client.id })
    .from(client)
    .innerJoin(representative, eq(client.representative, representative.id))
    .where(eq(representative.organizationId, orgId));

  if (clients.length === 0) {
    console.log('La org no tiene clientes.');
    return;
  }

  const snapshots = await db
    .select({
      clientId: clientRiskSnapshot.clientId,
      score: clientRiskSnapshot.score,
      riskLevel: clientRiskSnapshot.riskLevel,
    })
    .from(clientRiskSnapshot)
    .where(eq(clientRiskSnapshot.period, period));

  const filtered = snapshots.filter((s) =>
    clients.some((c) => c.id === s.clientId)
  );

  const dist = filtered.reduce<Record<string, number>>((acc, s) => {
    acc[s.riskLevel] = (acc[s.riskLevel] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Distribución por nivel:`, dist);
}

async function runForClient(clientId: string, period: string) {
  const result = await calculateRiskScore(clientId, period);
  console.log(`Client ${clientId} / ${period}:`);
  console.log(`  score    = ${result.score}`);
  console.log(`  level    = ${result.riskLevel}`);
  console.log(`  factors  =`, result.factors);
  const factors = result.factors as Record<string, unknown>;
  const sum = Object.entries(factors).reduce((acc, [k, v]) => {
    return k.endsWith('Score') && typeof v === 'number' ? acc + v : acc;
  }, 0);
  console.log(`  sum(*Score) = ${sum.toFixed(2)} (debería matchear score)`);
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

  if (args[0] === '--client') {
    const clientId = args[1];
    const period = args[2];
    if (!clientId || !period) {
      console.error('--client requiere <clientId> <period>');
      process.exit(1);
    }
    await runForClient(clientId, period);
    process.exit(0);
  }

  const [orgId, period] = args;
  if (!orgId || !period) {
    console.error('Faltan args: <orgId> <period>');
    process.exit(1);
  }
  await runForOrg(orgId, period);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
