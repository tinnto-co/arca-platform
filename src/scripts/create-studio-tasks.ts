/**
 * Script puntual: crea las tablas studio_task, studio_task_client y studio_task_comment
 * si no existen. No toca ninguna tabla existente.
 * Uso: bun run src/scripts/create-studio-tasks.ts
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Creando tablas de Studio Tasks...');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS studio_task (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      tipo TEXT NOT NULL DEFAULT 'otro',
      estado TEXT NOT NULL DEFAULT 'pendiente',
      asignado_a_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      periodo_mes TEXT,
      fecha_vencimiento TIMESTAMP,
      es_auto_generada BOOLEAN NOT NULL DEFAULT FALSE,
      estado_changed_at TIMESTAMP,
      estado_changed_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      created_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ studio_task');

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS studio_task_client (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES studio_task(id) ON DELETE CASCADE,
      representative_id UUID NOT NULL REFERENCES representative(id) ON DELETE CASCADE,
      completado BOOLEAN NOT NULL DEFAULT FALSE,
      completado_at TIMESTAMP,
      completado_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      CONSTRAINT uq_studio_task_client UNIQUE (task_id, representative_id)
    )
  `);
  console.log('✓ studio_task_client');

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_studio_task_client_task ON studio_task_client(task_id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS studio_task_comment (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES studio_task(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      contenido TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✓ studio_task_comment');

  console.log('\n✅ Listo. Las 3 tablas fueron creadas (o ya existían).');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
