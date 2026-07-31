import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto de aislamiento para RLS.
 *
 * La BD filtra por organización (y el portal por cliente) con políticas de
 * Postgres que leen `app.org_id` / `app.cliente_id`. Si el valor no está
 * seteado, `current_setting(..., true)` da null y las políticas devuelven cero
 * filas: falla cerrado, nunca de más.
 *
 * El valor se cuelga del request para que los ~40 archivos de `src/actions`
 * sigan importando `db` sin enterarse. Lo setea `getSessionWithOrg()` (y
 * `getClientePortalSession()` para el portal), que es lo primero que corre en
 * cada server function.
 */

export interface DbContext {
  /** Organización del usuario logueado (app interna). */
  orgId?: string;
  /** Cliente al que accede un usuario del portal. */
  clienteId?: string;
}

/**
 * TanStack Start guarda el evento h3 de cada request en un AsyncLocalStorage
 * propio, publicado en un símbolo global. Se lee de ahí en vez de importar
 * `@tanstack/react-start/server` a propósito: ese import arrastra React y
 * revienta en los scripts de `src/scripts/**`, que también usan `db`.
 */
const EVENT_STORAGE_KEY = Symbol.for('tanstack-start:event-storage');

function currentRequest(): object | undefined {
  const eventStorage = (
    globalThis as unknown as Record<
      symbol,
      AsyncLocalStorage<{ h3Event: object }> | undefined
    >
  )[EVENT_STORAGE_KEY];
  return eventStorage?.getStore()?.h3Event;
}

/**
 * Un contexto por request. El evento h3 es el único objeto que el framework
 * propaga de punta a punta del handler, así que sirve de clave; el WeakMap
 * evita tener que limpiarlo cuando el request termina.
 */
const byRequest = new WeakMap<object, DbContext>();

/** Para código sin request: crons, workers y scripts. */
const storage = new AsyncLocalStorage<DbContext>();

export function getDbContext(): DbContext | undefined {
  const request = currentRequest();
  if (request) return byRequest.get(request);
  return storage.getStore();
}

/** Fija el contexto para el resto del request en curso. */
export function setDbContext(ctx: DbContext): void {
  const request = currentRequest();
  if (request) {
    byRequest.set(request, { ...byRequest.get(request), ...ctx });
    return;
  }
  // Sin request (cron o script): el llamador tiene que haber abierto el
  // contexto con `runWithDbContext`, si no `enterWith` no sobrevive al await.
  storage.enterWith({ ...storage.getStore(), ...ctx });
}

export function runWithDbContext<T>(ctx: DbContext, fn: () => T): T {
  return storage.run(ctx, fn);
}
