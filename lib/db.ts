import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/drizzle/schema';
import * as authSchema from '@/drizzle/auth';

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
export const db = drizzle(client, {
  schema: { ...schema, ...authSchema },
});

// Conexión de solo lectura para el agente AI.
// Apunta a un usuario PostgreSQL con permisos únicamente SELECT.
// Si no está configurada, cae al usuario principal (útil en desarrollo).
const readonlyClient = postgres(
  process.env.DATABASE_READONLY_URL ?? process.env.DATABASE_URL!,
  { prepare: false }
);
export const dbReadonly = drizzle(readonlyClient, {
  schema: { ...schema, ...authSchema },
});
