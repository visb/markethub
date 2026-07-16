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
    /** Métricas próprias do separador por período (story 65). */
    metrics: (period: string) => ["pick", "metrics", period] as const,
  },
  /** Despacho de entregas da loja (story 61: destaque de falha + reenviar/cancelar). */
  deliveries: {
    /** Fila de entregas de uma loja. */
    queue: (storeId: string) => ["deliveries", "queue", storeId] as const,
    /** Entregadores vinculados à loja (p/ atribuição). */
    drivers: (storeId: string) => ["deliveries", "drivers", storeId] as const,
  },
} as const;
