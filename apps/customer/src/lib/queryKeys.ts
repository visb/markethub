/**
 * Chaves de query centralizadas (CLAUDE.md: NUNCA string literal como query key
 * fora deste arquivo). Estruturadas por recurso para invalidação granular.
 */
export const queryKeys = {
  tracking: {
    /** Snapshot de rastreio (OrderTracking) de um pedido. */
    order: (orderId: string) => ["tracking", "order", orderId] as const,
    /** Substituições pendentes de um pedido. */
    substitutions: (orderId: string) => ["tracking", "substitutions", orderId] as const,
  },
} as const;
