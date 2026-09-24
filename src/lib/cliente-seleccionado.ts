/**
 * El cliente que el usuario tiene elegido, compartido entre módulos (TIN-1425).
 *
 * Antes vivía solo en el query param de la ruta de contabilidad. Eso alcanza
 * para moverse entre solapas, recargar y compartir el link, pero se pierde al
 * salir del módulo: al volver, el componente cae al primer cliente de la lista
 * y la pantalla no avisa nada. El riesgo que el ticket marca como prioridad
 * alta es justamente ese — cargar asientos en la empresa equivocada.
 *
 * Se persiste en `localStorage` y no en la sesión del servidor porque es una
 * preferencia de navegación de este navegador, no un dato del estudio: dos
 * personas de la misma cuenta pueden estar mirando empresas distintas.
 *
 * La URL sigue mandando cuando trae `clientId`: un link compartido tiene que
 * abrir en la empresa del link, no en la última que miró quien lo abre.
 */
import { useCallback, useSyncExternalStore } from 'react';

const CLAVE = 'arca.cliente-seleccionado';

let valor: string | null = null;
let leido = false;
const oyentes = new Set<() => void>();

function leer(): string | null {
  if (leido) return valor;
  leido = true;
  try {
    valor = localStorage.getItem(CLAVE);
  } catch {
    // Ventana privada, cookies bloqueadas, SSR. No es un error: simplemente
    // no hay preferencia guardada.
    valor = null;
  }
  return valor;
}

export function clienteSeleccionado(): string | null {
  return leer();
}

export function guardarClienteSeleccionado(id: string | null) {
  leido = true;
  if (valor === id) return;
  valor = id;
  try {
    if (id) localStorage.setItem(CLAVE, id);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin persistencia, pero la sesión en curso igual queda consistente.
  }
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
}

/**
 * En SSR no hay `localStorage`: devolver siempre `null` mantiene el HTML del
 * servidor y el del primer render del cliente iguales, y evita el error de
 * hidratación. El valor real entra en el efecto de `useSyncExternalStore`.
 */
const enServidor = () => null;

export function useClienteSeleccionado(): [
  string | null,
  (id: string | null) => void,
] {
  const actual = useSyncExternalStore(suscribir, leer, enServidor);
  const set = useCallback(
    (id: string | null) => guardarClienteSeleccionado(id),
    []
  );
  return [actual, set];
}
