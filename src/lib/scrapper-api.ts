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
    throw new ScrapperError(
      typeof error === 'string' ? error : `${res.status} ${res.statusText}`,
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
