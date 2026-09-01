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

/* ── Errores de validación (Zod) ────────────────────────────────────────── */

/**
 * Zod serializa sus problemas en `message` como un JSON crudo — corchetes,
 * `too_small`, `path`, todo en inglés. Es una estructura para programar, no un
 * mensaje: hay que traducirla antes de mostrarla.
 */
interface ProblemaZod {
  code?: string;
  path?: (string | number)[];
  minimum?: number;
  maximum?: number;
  origin?: string;
  received?: string;
}

const esErrorDeValidacion = (e: unknown): e is { issues: ProblemaZod[] } =>
  esObjeto(e) &&
  Array.isArray((e as Indexable).issues) &&
  ((e as Indexable).issues as unknown[]).length > 0;

/** Nombres de campo en castellano, para no mostrarle `clientId` a un contador. */
const ETIQUETAS: Record<string, string> = {
  lineas: 'líneas',
  nombre: 'nombre',
  descripcion: 'descripción',
  fecha: 'fecha',
  clientId: 'cliente',
  cuentaId: 'cuenta',
  debe: 'debe',
  haber: 'haber',
  titulo: 'título',
  email: 'email',
};

function etiqueta(path?: (string | number)[]): string {
  const ultimo = path?.filter((p) => typeof p === 'string').pop();
  if (!ultimo) return 'los datos';
  return ETIQUETAS[ultimo as string] ?? String(ultimo);
}

function frase(p: ProblemaZod): string {
  const campo = etiqueta(p.path);
  switch (p.code) {
    case 'too_small':
      return p.origin === 'array'
        ? `Se necesitan al menos ${p.minimum} ${campo}.`
        : `El campo ${campo} es demasiado corto (mínimo ${p.minimum}).`;
    case 'too_big':
      return p.origin === 'array'
        ? `Se admiten como máximo ${p.maximum} ${campo}.`
        : `El campo ${campo} es demasiado largo (máximo ${p.maximum}).`;
    case 'invalid_type':
      return p.received === 'undefined'
        ? `Falta completar ${campo}.`
        : `El valor de ${campo} no es válido.`;
    case 'invalid_format':
    case 'invalid_string':
      return `El formato de ${campo} no es válido.`;
    case 'invalid_value':
    case 'invalid_enum_value':
      return `El valor de ${campo} no es una opción válida.`;
    default:
      return `Revisá ${campo}.`;
  }
}

export function mensajeDeValidacion(issues: ProblemaZod[]): string {
  const primero = frase(issues[0]);
  const resto = issues.length - 1;
  return resto > 0
    ? `${primero} (y ${resto} ${resto === 1 ? 'problema más' : 'problemas más'}.)`
    : primero;
}

/**
 * El mensaje que puede cruzar al navegador.
 *
 * Los errores que lanzamos a propósito —«No se puede borrar una tarea sin
 * archivar»— son para el usuario y pasan tal cual. Todo lo demás se reemplaza.
 */
export function mensajePublico(e: unknown): string {
  if (esErrorDeInfraestructura(e)) return MENSAJE_GENERICO;
  if (esErrorDeValidacion(e)) return mensajeDeValidacion(e.issues);
  if (e instanceof Error && e.message.trim()) return e.message;
  return MENSAJE_GENERICO;
}

/**
 * Reemplaza el error por uno seguro, conservando el original en el log del
 * servidor: sin eso, sanear el mensaje equivaldría a perder el diagnóstico.
 */
export function sanearError(e: unknown): Error {
  if (esErrorDeInfraestructura(e)) {
    console.error('[error de infraestructura, no enviado al cliente]', e);
    const seguro = new Error(MENSAJE_GENERICO);
    seguro.name = 'ErrorInterno';
    return seguro;
  }

  // Validación: el JSON de Zod se traduce, pero se loguea entero — el `path`
  // dice qué campo falló y eso es lo que sirve para depurar.
  if (esErrorDeValidacion(e)) {
    console.error('[error de validación]', JSON.stringify(e.issues));
    const legible = new Error(mensajeDeValidacion(e.issues));
    legible.name = 'ErrorDeValidacion';
    return legible;
  }

  return e instanceof Error ? e : new Error(mensajePublico(e));
}
