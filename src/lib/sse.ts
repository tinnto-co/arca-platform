/**
 * Consumo de streams SSE del scrapper (discovery de perfiles AFIP).
 * El scrapper emite eventos `progress`, `result` y `error`.
 */

export interface SseHandlers<TResult> {
  onProgress?: (message: string) => void;
  onResult?: (data: TResult) => void;
  onError?: (message: string) => void;
}

/**
 * Traduce errores técnicos de Puppeteer/red a un mensaje entendible por el estudio.
 */
export function friendlyError(msg: string): string {
  const technical = [
    'detached Frame',
    'Target closed',
    'Session closed',
    'Protocol error',
    'Navigation timeout',
    'Execution context was destroyed',
    'net::ERR_',
  ];
  if (technical.some((t) => msg.includes(t))) {
    return 'Hubo un problema de conexión con AFIP. Por favor intentá de nuevo en unos minutos.';
  }
  return msg;
}

export async function consumeSseStream<TResult>(
  response: Response,
  handlers: SseHandlers<TResult>
): Promise<void> {
  // Un error antes de abrir el stream vuelve como JSON, no como text/event-stream.
  if (
    !response.ok &&
    !response.headers.get('content-type')?.includes('text/event-stream')
  ) {
    const json = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(json?.error ?? `Error ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No se pudo leer la respuesta');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        try {
          const data = JSON.parse(line.slice(6)) as {
            message?: string;
            error?: string;
          };
          if (eventType === 'progress')
            handlers.onProgress?.(data.message ?? '');
          else if (eventType === 'result') handlers.onResult?.(data as TResult);
          else if (eventType === 'error')
            handlers.onError?.(
              friendlyError(data.error ?? 'Error desconocido')
            );
        } catch {
          // Frame parcial o no-JSON: se ignora, el siguiente read completa el buffer.
        }
        eventType = '';
      }
    }
  }
}
