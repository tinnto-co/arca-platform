/**
 * Decrypt AFIP credentials for a given representative.
 * Usage: bun run src/scripts/decrypt-credential.ts --representative-id <uuid>
 */
import { db } from '@/lib/db';
import { representative } from '@/drizzle/schema';
import { safeDecrypt } from '@/lib/crypto';
import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'representative-id': { type: 'string' },
  },
});

const representativeId = values['representative-id'];
if (!representativeId) {
  console.error('Usage: bun run src/scripts/decrypt-credential.ts --representative-id <uuid>');
  process.exit(1);
}

const [rep] = await db
  .select({ id: representative.id, name: representative.name, cuit: representative.cuit, afipPassword: representative.afipPassword })
  .from(representative)
  .where(eq(representative.id, representativeId))
  .limit(1);

if (!rep) {
  console.error(`Representative not found: ${representativeId}`);
  process.exit(1);
}

console.log(`\nRepresentante: ${rep.name ?? '(sin nombre)'}`);
console.log(`CUIT: ${rep.cuit}`);
console.log(`Password: ${rep.afipPassword ? safeDecrypt(rep.afipPassword) : '(vacío)'}\n`);

process.exit(0);
