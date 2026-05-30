import { Injectable } from "@nestjs/common";
import type { EnrichmentResult } from "../enrichment.types";
import type { EnrichmentProvider } from "../provider.interface";

/** Dados canônicos fictícios para GTINs conhecidos. Usado quando não há COSMOS_TOKEN. */
const FIXTURES: Record<string, Omit<EnrichmentResult, "gtin" | "raw">> = {
  "7891000100103": {
    name: "Leite em Pó Integral Ninho 380g",
    brand: "Ninho",
    imageUrl: "https://example.com/ninho.jpg",
    unit: "380g",
    ncm: "0402",
    gpc: "50080100",
    cosmosCategory: "Leite e derivados",
  },
  "7894900011517": {
    name: "Refrigerante Coca-Cola Original 2L",
    brand: "Coca-Cola",
    imageUrl: "https://example.com/coca2l.jpg",
    unit: "2L",
    ncm: "2202",
    gpc: "50202200",
    cosmosCategory: "Refrigerantes",
  },
  "7891910000197": {
    name: "Açúcar Refinado União 1kg",
    brand: "União",
    imageUrl: "https://example.com/uniao.jpg",
    unit: "1kg",
    ncm: "1701",
    gpc: "50161800",
    cosmosCategory: "Açúcar",
  },
};

@Injectable()
export class MockEnrichmentProvider implements EnrichmentProvider {
  readonly source = "mock";

  lookupByGtin(gtin: string): Promise<EnrichmentResult | null> {
    const fx = FIXTURES[gtin];
    if (!fx) return Promise.resolve(null);
    return Promise.resolve({ gtin, ...fx, raw: { mock: true, ...fx } });
  }
}
