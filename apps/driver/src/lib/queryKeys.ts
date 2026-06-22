/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). A story 15 introduz a infra React Query no app driver só
 * para a feature de veículo — a lista de entregas legada da home segue como está.
 */
export const queryKeys = {
  vehicles: {
    /** Veículos disponíveis (active da rede) para o entregador selecionar. */
    all: ["vehicles", "all"] as const,
    /** Veículo atualmente selecionado pelo entregador. */
    current: ["vehicles", "current"] as const,
  },
} as const;
