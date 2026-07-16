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
  adminDashboard: {
    summary: ["admin-dashboard", "summary"] as const,
  },
  adminOrders: {
    all: ["admin-orders"] as const,
    list: (filter: { status?: string; q?: string; page?: number }) =>
      ["admin-orders", "list", filter.status ?? "", filter.q ?? "", filter.page ?? 1] as const,
    detail: (id: string) => ["admin-orders", "detail", id] as const,
    timeline: (id: string) => ["admin-orders", "timeline", id] as const,
  },
  adminReviews: {
    all: ["admin-reviews"] as const,
    list: (filter: { rating?: number; hidden?: boolean; merchantId?: string; q?: string }) =>
      [
        "admin-reviews",
        "list",
        filter.rating ?? 0,
        filter.hidden ?? "all",
        filter.merchantId ?? "",
        filter.q ?? "",
      ] as const,
  },
} as const;
