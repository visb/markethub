/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). Estruturadas por recurso para invalidação granular.
 */
export const queryKeys = {
  pick: {
    /** Lojas em que o separador atua. */
    stores: ["pick", "stores"] as const,
    /** Fila de tarefas de uma loja. */
    queue: (storeId: string) => ["pick", "queue", storeId] as const,
  },
} as const;
