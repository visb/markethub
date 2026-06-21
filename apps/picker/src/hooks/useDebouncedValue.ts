import { useEffect, useState } from "react";

/**
 * Retorna `value` somente após ele permanecer estável por `delayMs`. Digitação
 * rápida cancela o valor intermediário (cada mudança reinicia o timer). Usado
 * pelo autocomplete de substituto para não chamar a API a cada tecla.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
