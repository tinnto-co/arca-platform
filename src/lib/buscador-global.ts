import { useSyncExternalStore } from 'react';

/**
 * Estado de la paleta global (⌘K).
 *
 * Vive en un store de módulo y no en un contexto porque quien la abre —el
 * buscador del sidebar— y quien la dibuja —el layout autenticado— están en
 * ramas distintas del árbol, y pasar el estado entre ellas obligaría a
 * envolver medio `_authed` en un provider para un booleano.
 */
let abierto = false;
const oyentes = new Set<() => void>();

function avisar() {
  oyentes.forEach((cb) => cb());
}

export function abrirBuscador() {
  if (abierto) return;
  abierto = true;
  avisar();
}

export function cerrarBuscador() {
  if (!abierto) return;
  abierto = false;
  avisar();
}

export function setBuscadorAbierto(v: boolean) {
  if (v) abrirBuscador();
  else cerrarBuscador();
}

function suscribir(cb: () => void) {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

function leer() {
  return abierto;
}

export function useBuscadorAbierto() {
  return useSyncExternalStore(suscribir, leer, () => false);
}
