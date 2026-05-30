import type { EnrichmentResult } from "./enrichment.types";

/**
 * Provider de enriquecimento por GTIN. Implementações: Cosmos (real) e Mock (dev/test).
 * Trocável via DI token ENRICHMENT_PROVIDER.
 */
export interface EnrichmentProvider {
  readonly source: string;
  /** Retorna dados do produto ou null se não encontrado. Lança em erro transitório (retry). */
  lookupByGtin(gtin: string): Promise<EnrichmentResult | null>;
}

export const ENRICHMENT_PROVIDER = Symbol("ENRICHMENT_PROVIDER");
