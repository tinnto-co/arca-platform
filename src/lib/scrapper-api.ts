/**
 * Cliente HTTP del scrapper.
 *
 * Se usa `fetch` y no axios a propósito: axios arrastra `follow-redirects`, que
 * al inicializarse llama `Error.captureStackTrace` sobre un objeto que sólo
 * hereda de Error. Node lo tolera, Bun tira `TypeError` — y como pasa al evaluar
 * el módulo, cualquier archivo que importara axios rompía TODOS sus server fn.
 */

/** El scrapper responde los errores como `{ error: "..." }`. */
export class ScrapperError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = 'ScrapperError';
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await parseBody(res);

  if (!res.ok) {
    const error =
      typeof body === 'object' && body !== null
        ? (body as { error?: unknown }).error
        : undefined;
    // Candado global del scrapper (SCRAPING_PAUSED): el 503 se traduce acá,
    // una sola vez, así CUALQUIER botón de actualizar muestra el mismo aviso
    // aunque el estado haya cambiado entre el load y el click.
    const pausado =
      res.status === 503 &&
      typeof body === 'object' &&
      body !== null &&
      (body as { scrapingPaused?: unknown }).scrapingPaused === true;
    // El servicio rechaza un tipo de job que no conoce: pasa cuando la
    // plataforma ya tiene una función y el scrapper desplegado todavía no.
    // Su mensaje enumera los tipos internos, vocabulario que no significa
    // nada para el estudio.
    const tipoDesconocido =
      typeof error === 'string' && /invalid job type/i.test(error);

    throw new ScrapperError(
      pausado
        ? 'Actualizaciones en pausa temporal — reintentá más tarde'
        : tipoDesconocido
          ? 'Esta actualización todavía no está disponible en el servicio de ARCA. Avisale al equipo: falta desplegar el servicio.'
          : typeof error === 'string'
            ? error
            : `${res.status} ${res.statusText}`,
      res.status,
      body
    );
  }

  return body as T;
}

export function scrapperGet<T = unknown>(url: string): Promise<T> {
  return request<T>(url);
}

export function scrapperPost<T = unknown>(
  url: string,
  body: unknown
): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
