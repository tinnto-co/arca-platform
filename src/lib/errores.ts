/**
 * Qué error puede ver el usuario y cuál no.
 *
 * Un error de Postgres que llega al navegador no es sólo feo: el mensaje de
 * drizzle incluye la consulta entera con sus parámetros, o sea `org_id`, UUIDs
 * de cliente y de cuentas, y la forma de las tablas. Eso no sale del servidor.
 *
 * La clasificación es estructural y no por texto: los errores del driver traen
 * campos que ningún error nuestro tiene —el `code` SQLSTATE de cinco
 * caracteres, `severity`, `routine`— y drizzle envuelve el suyo con `query` y
 * `params`. Buscar substrings en el mensaje sería frágil: alcanza con que una
 * versión del driver cambie el texto para que empiece a filtrar de nuevo.
 */

export const MENSAJE_GENERICO =
  'No se pudo completar la operación. Probá de nuevo; si sigue pasando, avisale al equipo.';

type Indexable = Record<string, unknown>;

const esObjeto = (v: unknown): v is Indexable =>
  typeof v === 'object' && v !== null;

/** SQLSTATE: cinco caracteres, dígitos y letras mayúsculas. Ej: `42501`, `23505`. */
const esSqlstate = (v: unknown) =>
  typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v);

/**
 * ¿Viene de la base o del driver? Mira el error y su cadena de causas, porque
 * drizzle envuelve el error de postgres en vez de propagarlo tal cual.
 */
export function esErrorDeInfraestructura(e: unknown, profundidad = 0): boolean {
  if (!esObjeto(e) || profundidad > 5) return false;

  // postgres.js y pg: SQLSTATE + campos del protocolo.
  if (esSqlstate(e.code)) return true;
  if ('severity' in e || 'severity_local' in e || 'routine' in e) return true;

  // drizzle: adjunta la consulta y los parámetros al error.
  if ('query' in e && 'params' in e) return true;
  if (typeof e.name === 'string' && e.name.startsWith('Drizzle')) return true;

  return esErrorDeInfraestructura(e.cause, profundidad + 1);
}

/**
 * El mensaje que puede cruzar al navegador.
 *
 * Los errores que lanzamos a propósito —«No se puede borrar una tarea sin
 * archivar»— son para el usuario y pasan tal cual. Todo lo demás se reemplaza.
 */
export function mensajePublico(e: unknown): string {
  if (esErrorDeInfraestructura(e)) return MENSAJE_GENERICO;
  if (e instanceof Error && e.message.trim()) return e.message;
  return MENSAJE_GENERICO;
}

/**
 * Reemplaza el error por uno seguro, conservando el original en el log del
 * servidor: sin eso, sanear el mensaje equivaldría a perder el diagnóstico.
 */
export function sanearError(e: unknown): Error {
  if (!esErrorDeInfraestructura(e)) {
    return e instanceof Error ? e : new Error(mensajePublico(e));
  }
  console.error('[error de infraestructura, no enviado al cliente]', e);
  const seguro = new Error(MENSAJE_GENERICO);
  seguro.name = 'ErrorInterno';
  return seguro;
}
