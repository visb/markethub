/**
 * Query keys centralizadas do admin (CLAUDE.md: NUNCA string literal como query
 * key fora daqui). React Query entrou no admin com a gestão de cupons (story 53);
 * novos recursos estendem este objeto.
 */
export const queryKeys = {
  coupons: {
    all: ["coupons"] as const,
    byFilter: (filter: string | undefined) => ["coupons", filter ?? "all"] as const,
  },
  merchantOptions: {
    all: ["merchant-options"] as const,
  },
} as const;
