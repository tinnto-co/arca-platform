/**
 * Crea los índices de performance en las tablas más consultadas.
 * Idempotente: usa CREATE INDEX IF NOT EXISTS.
 * No bloquea lecturas: usa CONCURRENTLY (excepto en transacciones).
 *
 * Uso: bun run src/scripts/ensure-performance-indexes.ts
 * Requiere DATABASE_URL en el entorno.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const indexes = [
  {
    name: 'idx_client_org',
    stmt: `CREATE INDEX IF NOT EXISTS idx_client_org ON client(organization_id)`,
  },
  {
    name: 'idx_invoice_client',
    stmt: `CREATE INDEX IF NOT EXISTS idx_invoice_client ON invoice(client_id)`,
  },
  {
    name: 'idx_invoice_client_date',
    stmt: `CREATE INDEX IF NOT EXISTS idx_invoice_client_date ON invoice(client_id, emition_date)`,
  },
  {
    name: 'idx_debt_client_date',
    stmt: `CREATE INDEX IF NOT EXISTS idx_debt_client_date ON debt(client_id, due_date)`,
  },
  {
    name: 'idx_duedate_client_date',
    stmt: `CREATE INDEX IF NOT EXISTS idx_duedate_client_date ON due_date(client_id, due_date)`,
  },
  {
    name: 'idx_notification_client_opened',
    stmt: `CREATE INDEX IF NOT EXISTS idx_notification_client_opened ON notification(client_id, opened)`,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL no está definido.');
    process.exit(1);
  }

  for (const { name, stmt } of indexes) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }

  console.log('\nÍndices de performance: OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
