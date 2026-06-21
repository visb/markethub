import { useEffect, useState } from "react";

/**
 * Retorna `value` somente após ele permanecer estável por `delayMs`. Cada mudança
 * reinicia o timer, então uma rajada de atualizações (ex.: arrastar/zoom contínuo
 * do mapa) resulta em um único valor estável. Usado pela recarga por viewport do
 * explore (story 06) para não disparar uma chamada a cada frame do gesto.
 *
 * Replica `apps/picker/src/hooks/useDebouncedValue.ts` (boundary de app: não há
 * import cruzando workspaces — CLAUDE.md).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
