/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). A story 15 introduziu a infra React Query no app driver
 * para a feature de veículo; a story 41 migra a lista de entregas da home/detalhe
 * (antes fetch legado via useState/useEffect) para React Query.
 */
export const queryKeys = {
  vehicles: {
    /** Veículos disponíveis (active da rede) para o entregador selecionar. */
    all: ["vehicles", "all"] as const,
    /** Veículo atualmente selecionado pelo entregador. */
    current: ["vehicles", "current"] as const,
  },
  deliveries: {
    /** Prefixo de todas as queries de entrega — usado para invalidação em lote. */
    root: ["deliveries"] as const,
    /** Lojas às quais o entregador está vinculado. */
    stores: ["deliveries", "stores"] as const,
    /** Entregas atribuídas ao entregador (escopo por loja, ou todas quando null). */
    mine: (storeId: string | null) => ["deliveries", "mine", storeId ?? "all"] as const,
    /** Pool de entregas disponíveis para aceitar (escopo por loja). */
    available: (storeId: string | null) => ["deliveries", "available", storeId ?? "all"] as const,
    /** Detalhe de uma entrega (derivado da lista atribuída + atualizado por mutation). */
    detail: (id: string) => ["deliveries", "detail", id] as const,
    /** Histórico paginado de entregas concluídas/canceladas (story 60). */
    history: ["deliveries", "history"] as const,
  },
  /** Ganhos do entregador (gorjetas + entregas concluídas) por período (story 60). */
  earnings: {
    byPeriod: (period: string) => ["earnings", period] as const,
  },
} as const;
