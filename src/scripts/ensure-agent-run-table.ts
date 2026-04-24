/**
 * Crea la tabla agent_run para tracking de ejecuciones del agente AI.
 * Idempotente: CREATE TABLE IF NOT EXISTS.
 *
 * Uso: bun run src/scripts/ensure-agent-run-table.ts
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

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "agent_run" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "conversation_id" uuid NOT NULL REFERENCES "agent_conversation"("id") ON DELETE CASCADE,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
      "client_id" uuid REFERENCES "client"("id") ON DELETE SET NULL,
      "profile_id" uuid REFERENCES "profile"("id") ON DELETE SET NULL,
      "status" text NOT NULL DEFAULT 'running',
      "intent" text,
      "input" text NOT NULL,
      "output" text,
      "tool_trace" jsonb,
      "error" text,
      "started_at" timestamp DEFAULT now() NOT NULL,
      "finished_at" timestamp
    )
  `));

  console.log('Tabla agent_run: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
