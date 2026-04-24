/**
 * Agrega columnas de metadatos y tool_calls a la tabla agent_message.
 * Idempotente: ADD COLUMN IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-agent-message-columns.ts
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

  const stmts = [
    `ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "metadata" jsonb`,
    `ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "tool_calls" jsonb`,
    `ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "citations" jsonb`,
    `ALTER TABLE "agent_message" ADD COLUMN IF NOT EXISTS "confidence" text`,
  ];

  for (const stmt of stmts) {
    await db.execute(sql.raw(stmt));
  }

  console.log('Columnas de agent_message: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
