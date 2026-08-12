import { useCallback, useState } from 'react';

/**
 * Estado persistido en localStorage (string). SSR-safe: en el server devuelve
 * el default y se hidrata con el valor guardado en el primer render del cliente.
 */
export function useLocalStorageState<T extends string>(
  key: string,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      return (window.localStorage.getItem(key) as T | null) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // localStorage no disponible (modo privado / cuota): queda solo en memoria.
      }
    },
    [key]
  );

  return [value, set];
}
