import { useEffect, useState } from "react";

/**
 * Valor "atrasado" (story 67): a busca de pedidos só dispara a query depois que
 * o usuário para de digitar — evita uma request por tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
