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
    /** Detalhe de uma tarefa de separação. */
    task: (id: string) => ["pick", "task", id] as const,
    /** Busca de ofertas da loja p/ propor substituto (autocomplete). */
    search: (storeId: string, q: string) => ["pick", "search", storeId, q] as const,
  },
} as const;
