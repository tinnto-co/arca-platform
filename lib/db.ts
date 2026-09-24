import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '@/drizzle/schema';
import * as authSchema from '@/drizzle/auth';
import { getDbContext } from './db-context';

const fullSchema = { ...schema, ...authSchema };
type Db = PostgresJsDatabase<typeof fullSchema>;

/**
 * El aislamiento por organización lo hace Postgres con RLS, no el código: las
 * políticas leen `app.org_id` (y `app.cliente_id` en el portal).
 *
 * En vez de abrir una transacción por query para hacer `set local` —cuatro
 * viajes de red donde había uno— se mantiene un pool por organización y el
 * valor viaja como parámetro de arranque de la conexión. Cada conexión nace
 * con su org fijada, así que la query sale igual de barata que antes.
 */
function createDb(url: string, settings: Record<string, string> = {}): Db {
  const options = Object.entries(settings)
    .map(([k, v]) => `-c ${k}=${v}`)
    .join(' ');

  const client = postgres(url, {
    prepare: false,
    // Sin esto cada org dejaría conexiones ociosas abiertas para siempre.
    idle_timeout: 30,
    ...(options ? { connection: { options } } : {}),
  });

  return drizzle(client, { schema: fullSchema });
}

/**
 * Los identificadores se interpolan en la cadena de arranque de la conexión,
 * que no admite parámetros. Vienen de la sesión, pero se validan igual.
 */
function assertSafeId(value: string, campo: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`${campo} inválido: ${value}`);
  }
  return value;
}

/**
 * Pool sin contexto. Sirve para las tablas de auth (exentas de RLS, y Better
 * Auth las consulta antes de que exista una org) y para procesos sin sesión.
 * Contra una tabla con política devuelve cero filas.
 */
const baseDb = createDb(process.env.DATABASE_URL!);

// Conexión de solo lectura para el agente AI: usuario con permisos SELECT.
// Si no está configurada, cae al usuario principal (útil en desarrollo).
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ?? process.env.DATABASE_URL!;
const PORTAL_URL = process.env.DATABASE_PORTAL_URL ?? process.env.DATABASE_URL!;

const baseReadonlyDb = createDb(READONLY_URL);

const poolsByOrg = new Map<string, Db>();
const readonlyPoolsByOrg = new Map<string, Db>();
const poolsByCliente = new Map<string, Db>();

function pooled(
  cache: Map<string, Db>,
  key: string,
  url: string,
  settings: Record<string, string>
): Db {
  let instance = cache.get(key);
  if (!instance) {
    instance = createDb(url, settings);
    cache.set(key, instance);
  }
  return instance;
}

function resolve(cache: Map<string, Db>, url: string, fallback: Db): Db {
  const ctx = getDbContext();
  if (ctx?.orgId) {
    return pooled(cache, ctx.orgId, url, {
      'app.org_id': assertSafeId(ctx.orgId, 'orgId'),
    });
  }
  if (ctx?.clienteId) {
    return pooled(poolsByCliente, ctx.clienteId, PORTAL_URL, {
      'app.cliente_id': assertSafeId(ctx.clienteId, 'clienteId'),
    });
  }
  return fallback;
}

/**
 * Enruta cada acceso al pool que corresponde al contexto actual. Es un Proxy
 * para que el resto de la app siga escribiendo `db.select()` sin cambios.
 */
function routed(resolveTarget: () => Db): Db {
  return new Proxy({} as Db, {
    get(_target, prop) {
      const target = resolveTarget();
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export const db = routed(() =>
  resolve(poolsByOrg, process.env.DATABASE_URL!, baseDb)
);

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Corre `fn` con `app.user_id` seteado, en una transacción.
 *
 * Es la excepción al pool por organización: el valor cambia con cada usuario y
 * un pool por usuario no tiene sentido. Se usa sólo para el arranque de la
 * sesión del portal, que necesita leer a qué cliente accede el usuario antes
 * de saber la org o el cliente.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Corre `fn` con `app.org_id` seteado, en una transacción y como `arca_app`.
 *
 * Para cuando un request del portal necesita un dato del estudio: su pool es
 * `arca_portal`, que a propósito no tiene permiso sobre las tablas internas.
 * El orgId no lo elige el cliente, sale de una fila que el portal ya leyó.
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  return baseDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

export const dbReadonly = routed(() =>
  resolve(readonlyPoolsByOrg, READONLY_URL, baseReadonlyDb)
);
