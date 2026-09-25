/**
 * Carga de módulos que llegan por separado (los `import()` diferidos).
 *
 * Esos módulos se piden al servidor recién cuando hacen falta, y el nombre del
 * archivo lleva un hash que cambia en cada deploy. Si alguien tenía la pantalla
 * abierta cuando se redesplegó, el archivo que su pestaña va a pedir ya no
 * existe y el navegador tira "Failed to fetch dynamically imported module".
 *
 * No es un error de la pantalla ni del dato: es que esa pestaña quedó vieja. Lo
 * único que hay que hacer es recargar. Pero el mensaje crudo no se entiende, y
 * al estudio le apareció justo al ir a imprimir recibos.
 */

export const MENSAJE_VERSION_VIEJA =
  'Se actualizó la plataforma mientras tenías esta pantalla abierta. Recargá la página y volvé a intentar.';

/** El error que tira el navegador cuando el archivo pedido ya no está. */
export function esVersionVieja(error: unknown): boolean {
  const texto =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return [
    'failed to fetch dynamically imported module', // Chrome
    'error loading dynamically imported module', // Firefox
    'importing a module script failed', // Safari
    'failed to load module script', // Chrome, variante con MIME raro
  ].some((patron) => texto.toLowerCase().includes(patron));
}

export class VersionVieja extends Error {
  override name = 'VersionVieja';
  constructor() {
    super(MENSAJE_VERSION_VIEJA);
  }
}

/**
 * Envuelve un `import()` diferido: si falla porque la pestaña quedó vieja,
 * tira un error con un mensaje que se entiende. Cualquier otro error pasa tal
 * cual, para no tapar un problema real del módulo.
 */
export async function cargarModulo<T>(importar: () => Promise<T>): Promise<T> {
  try {
    return await importar();
  } catch (error) {
    if (esVersionVieja(error)) throw new VersionVieja();
    throw error;
  }
}
