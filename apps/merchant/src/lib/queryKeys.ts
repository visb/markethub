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
} as const;
