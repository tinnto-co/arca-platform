import { useSyncExternalStore } from 'react';

/**
 * Cómo se nombra la tecla modificadora de los atajos según la plataforma.
 *
 * El `⌘` es un glifo Unicode: en Windows se dibuja igual, pero ahí nadie
 * tiene esa tecla — se presiona Ctrl. Los handlers ya aceptan las dos
 * (`metaKey || ctrlKey`); lo que había que arreglar es la etiqueta.
 *
 * Se lee con `useSyncExternalStore` porque en SSR no hay `navigator`: el
 * snapshot de servidor devuelve `⌘` y el cliente re-renderiza con el valor
 * real, sin mismatch de hidratación.
 */

/** La plataforma no cambia en vida de la página: no hay a qué suscribirse. */
const desuscribir = () => undefined;
function suscribir() {
  return desuscribir;
}

function detectar(): '⌘' | 'Ctrl' {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const plataforma = nav.userAgentData?.platform ?? nav.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(plataforma) ? '⌘' : 'Ctrl';
}

export function useTeclaModificador(): '⌘' | 'Ctrl' {
  return useSyncExternalStore(suscribir, detectar, () => '⌘' as const);
}

/** `⌘K` en Mac, `Ctrl+K` en el resto. Para etiquetas y tooltips. */
export function useAtajo(tecla: string): string {
  const mod = useTeclaModificador();
  return mod === '⌘' ? `⌘${tecla}` : `Ctrl+${tecla}`;
}
