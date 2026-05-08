/**
 * One-time migration: encrypts all existing plaintext passwords.
 * - credential.data.password (JSONB)
 * - client.password (TEXT)
 *
 * Safe to re-run: detects already-encrypted values by attempting decrypt.
 * Usage: bun run src/scripts/encrypt-existing-credentials.ts
 */
import { db } from '@/lib/db';
import { credential, client } from '@/drizzle/schema';
import { encrypt, decrypt } from '@/lib/crypto';
import { eq } from 'drizzle-orm';

function isAlreadyEncrypted(value: string): boolean {
  try {
    decrypt(value);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('Starting credential encryption migration...\n');

  // 1. Encrypt credential.data.password
  const allCreds = await db.select().from(credential);
  let credCount = 0;
  for (const cred of allCreds) {
    const data = cred.data as { cuit?: string; password?: string };
    if (!data?.password || isAlreadyEncrypted(data.password)) continue;

    const encrypted = encrypt(data.password);
    await db
      .update(credential)
      .set({ data: { ...data, password: encrypted } })
      .where(eq(credential.id, cred.id));
    credCount++;
  }
  console.log(`Encrypted ${credCount} credential passwords.`);

  // 2. Encrypt client.password
  const allClients = await db
    .select({ id: client.id, password: client.password })
    .from(client);
  let clientCount = 0;
  for (const c of allClients) {
    if (!c.password || isAlreadyEncrypted(c.password)) continue;

    const encrypted = encrypt(c.password);
    await db
      .update(client)
      .set({ password: encrypted })
      .where(eq(client.id, c.id));
    clientCount++;
  }
  console.log(`Encrypted ${clientCount} client passwords.`);

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
