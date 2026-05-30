import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";
import type { EnrichmentResult } from "../enrichment.types";
import type { EnrichmentProvider } from "../provider.interface";

interface CosmosResponse {
  description?: string;
  gtin?: number | string;
  thumbnail?: string | null;
  brand?: { name?: string } | null;
  gpc?: { code?: string; description?: string } | null;
  ncm?: { code?: string; description?: string } | null;
  [k: string]: unknown;
}

/**
 * Provider real do Cosmos Bluesoft. GET {base}/gtins/{gtin}.json com header X-Cosmos-Token.
 * Rate limit baixo — sempre usar atrás de cache (EnrichmentService).
 */
@Injectable()
export class CosmosEnrichmentProvider implements EnrichmentProvider {
  readonly source = "cosmos";
  private readonly logger = new Logger(CosmosEnrichmentProvider.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get("COSMOS_BASE_URL", { infer: true });
    this.token = config.get("COSMOS_TOKEN", { infer: true }) ?? "";
  }

  async lookupByGtin(gtin: string): Promise<EnrichmentResult | null> {
    const url = `${this.baseUrl}/gtins/${gtin}.json`;
    const res = await fetch(url, {
      headers: {
        "X-Cosmos-Token": this.token,
        "User-Agent": "MarketHub/0.1 (catalog enrichment)",
        "Content-Type": "application/json",
      },
    });

    if (res.status === 404) return null;
    if (res.status === 429) {
      throw new Error("Cosmos rate limit (429)");
    }
    if (!res.ok) {
      throw new Error(`Cosmos error ${res.status}`);
    }

    const data = (await res.json()) as CosmosResponse;
    const cosmosCategory = data.gpc?.description ?? data.ncm?.description ?? null;

    return {
      gtin,
      name: data.description ?? null,
      brand: data.brand?.name ?? null,
      imageUrl: data.thumbnail ?? null,
      unit: null,
      ncm: data.ncm?.code ?? null,
      gpc: data.gpc?.code ?? null,
      cosmosCategory,
      raw: data,
    };
  }
}
