/**
 * Query keys centralizadas (CLAUDE.md: NUNCA string literal como query key fora
 * daqui). Stories 08–13 estendem este objeto com seus recursos.
 */
export const queryKeys = {
  merchant: {
    context: ["merchant", "context"] as const,
  },
  stores: {
    all: ["stores"] as const,
  },
  integration: {
    erp: ["integration", "erp"] as const,
    apiKeys: ["integration", "api-keys"] as const,
    webhooks: ["integration", "webhooks"] as const,
  },
  staff: {
    all: ["staff"] as const,
    byStore: (storeId: string | undefined) => ["staff", storeId ?? "all"] as const,
  },
  catalog: {
    offers: (filters: { storeId?: string; categoryId?: string; search?: string; available?: boolean } = {}) =>
      ["catalog", "offers", filters] as const,
    offersAll: ["catalog", "offers"] as const,
    stocks: (storeId: string | undefined) => ["catalog", "stocks", storeId ?? "all"] as const,
    stocksAll: ["catalog", "stocks"] as const,
  },
  orders: {
    all: ["orders"] as const,
    list: (filters: { storeId?: string; status?: string } = {}) => ["orders", "list", filters] as const,
  },
  reports: {
    all: ["reports"] as const,
    sales: (filters: { from?: string; to?: string; storeId?: string } = {}) =>
      ["reports", "sales", filters] as const,
    operations: (filters: { from?: string; to?: string; storeId?: string } = {}) =>
      ["reports", "operations", filters] as const,
    topProducts: (filters: { from?: string; to?: string; storeId?: string } = {}) =>
      ["reports", "top-products", filters] as const,
    reviews: (filters: { from?: string; to?: string; storeId?: string } = {}) =>
      ["reports", "reviews", filters] as const,
  },
} as const;
