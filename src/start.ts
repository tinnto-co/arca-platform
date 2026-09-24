/**
 * Configuración global de TanStack Start.
 *
 * `functionMiddleware` corre en todos los server functions sin tener que
 * tocarlos uno por uno, que es la única forma razonable de garantizar que
 * ningún error de base de datos llegue al navegador: son más de sesenta
 * handlers y alcanza con olvidarse de uno.
 */
import { createMiddleware, createStart } from '@tanstack/react-start';
import { sanearError } from '@/lib/errores';

const erroresSaneados = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (e) {
      // El original queda en el log del servidor; al cliente va uno genérico.
      throw sanearError(e);
    }
  }
);

export const startInstance = createStart(() => ({
  functionMiddleware: [erroresSaneados],
}));
