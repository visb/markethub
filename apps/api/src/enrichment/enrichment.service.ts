import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { inferSaleType, normalizeGtin, slugify } from "../erp/catalog-normalize";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { CATEGORY_MAPPER, type CategoryMapper } from "./category-mapper.interface";
import { completenessScore } from "./completeness";
import type { EnrichmentResult } from "./enrichment.types";
import { ENRICHMENT_PROVIDER, type EnrichmentProvider } from "./provider.interface";

const COSMOS_SOURCE = "cosmos";
const CATEGORY_CONFIDENCE_THRESHOLD = 0.5;
const ENRICHED_SCORE_THRESHOLD = 70;

export interface EnrichResult {
  productId: string;
  status: string;
  score: number;
  found: boolean;
}

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENRICHMENT_PROVIDER) private readonly provider: EnrichmentProvider,
    @Inject(CATEGORY_MAPPER) private readonly mapper: CategoryMapper,
    private readonly storage: StorageService,
  ) {}

  /** Enriquece um produto: Cosmos (cacheado) + mapeamento de categoria + score. Idempotente. */
  async enrichProduct(productId: string): Promise<EnrichResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: { select: { slug: true } } },
    });
    if (!product) {
      throw new NotFoundException({ code: "PRODUCT_NOT_FOUND", message: "Product not found" });
    }

    const locked = new Set(product.lockedFields);
    const provenance: Record<string, string> = {};
    const data: Prisma.ProductUpdateInput = {};
    let resolvedCategorySlug: string | null = null;

    const gtin = normalizeGtin(product.gtin);
    let result: EnrichmentResult | null = null;
    let source = "none";

    if (gtin) {
      result = await this.lookupCached(gtin);
      source = this.provider.source;
    }

    if (result) {
      if (result.name && !locked.has("name")) {
        data.name = result.name;
        provenance.name = source;
      }
      if (result.brand && !locked.has("brand")) {
        data.brand = result.brand;
        provenance.brand = source;
      }
      if (result.imageUrl && !locked.has("imageUrl")) {
        // Baixa a imagem da origem e grava no nosso storage; cai pra URL remota se falhar.
        const ingested = await this.ingestImage(gtin ?? productId, result.imageUrl);
        data.imageUrl = ingested ?? result.imageUrl;
        provenance.imageUrl = ingested ? `${source}+storage` : source;
      }
      if (result.unit && !locked.has("packageSize")) {
        data.packageSize = result.unit;
        provenance.packageSize = source;
      }
      if (result.cosmosCategory && !locked.has("category")) {
        const categoryId = await this.resolveCategory(result.cosmosCategory);
        if (categoryId) {
          data.category = { connect: { id: categoryId } };
          provenance.category = this.mapper.name;
          resolvedCategorySlug = await this.categorySlug(categoryId);
        }
      }
    }

    // saleType (un|weight) recomputado pela heurística, salvo se travado manualmente.
    if (!locked.has("saleType")) {
      const packageSize = (data.packageSize as string | undefined) ?? product.packageSize;
      const categorySlug = resolvedCategorySlug ?? product.category?.slug ?? null;
      data.saleType = inferSaleType(packageSize, categorySlug);
      provenance.saleType = "heuristic";
    }

    const found = result !== null;
    const final = {
      name: Boolean(data.name ?? product.name),
      gtin: Boolean(gtin),
      brand: Boolean(data.brand ?? product.brand),
      imageUrl: Boolean(data.imageUrl ?? product.imageUrl),
      packageSize: Boolean(data.packageSize ?? product.packageSize),
      category: Boolean(data.category ?? product.categoryId),
    };
    const score = completenessScore(final);
    const status = found
      ? score >= ENRICHED_SCORE_THRESHOLD
        ? "enriched"
        : "needs_review"
      : gtin
        ? "needs_review"
        : "pending";

    await this.prisma.product.update({
      where: { id: productId },
      data: { ...data, completenessScore: score, enrichmentStatus: status },
    });

    await this.prisma.productEnrichment.upsert({
      where: { productId },
      create: {
        productId,
        source,
        raw: (result?.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        provenance: provenance as Prisma.InputJsonValue,
      },
      update: {
        source,
        raw: (result?.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        provenance: provenance as Prisma.InputJsonValue,
        fetchedAt: new Date(),
      },
    });

    return { productId, status, score, found };
  }

  /** Enriquece todos os produtos com oferta na loja. */
  async enrichStore(storeId: string): Promise<{ processed: number }> {
    const offers = await this.prisma.offer.findMany({
      where: { storeId },
      select: { productId: true },
      distinct: ["productId"],
    });
    for (const o of offers) await this.safeEnrich(o.productId);
    return { processed: offers.length };
  }

  /** Enriquece produtos ainda pendentes. */
  async enrichPending(limit = 500): Promise<{ processed: number }> {
    const products = await this.prisma.product.findMany({
      where: { enrichmentStatus: "pending" },
      select: { id: true },
      take: limit,
    });
    for (const p of products) await this.safeEnrich(p.id);
    return { processed: products.length };
  }

  private async safeEnrich(productId: string): Promise<void> {
    try {
      await this.enrichProduct(productId);
    } catch (e) {
      this.logger.warn(`enrich ${productId} failed: ${(e as Error).message}`);
    }
  }

  /** Cosmos com cache por GTIN (evita estourar rate limit). */
  private async lookupCached(gtin: string): Promise<EnrichmentResult | null> {
    const cached = await this.prisma.cosmosCache.findUnique({ where: { gtin } });
    if (cached) {
      return cached.found ? (cached.payload as unknown as EnrichmentResult) : null;
    }
    const result = await this.provider.lookupByGtin(gtin);
    await this.prisma.cosmosCache.upsert({
      where: { gtin },
      create: {
        gtin,
        found: result !== null,
        payload: (result ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      },
      update: {
        found: result !== null,
        payload: (result ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
        fetchedAt: new Date(),
      },
    });
    return result;
  }

  /**
   * Baixa a imagem da URL de origem (ex.: thumbnail do Cosmos) e sobe pro nosso storage.
   * Retorna a publicUrl, ou null se download/upload falhar (chamador usa a URL remota).
   */
  private async ingestImage(keyBase: string, remoteUrl: string): Promise<string | null> {
    try {
      const res = await fetch(remoteUrl, {
        headers: { "User-Agent": "MarketHub/0.1 (catalog enrichment)" },
      });
      if (!res.ok) {
        throw new Error(`fetch ${res.status}`);
      }
      const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      const body = Buffer.from(await res.arrayBuffer());
      const key = `products/${keyBase}.${extForContentType(contentType)}`;
      return await this.storage.uploadBuffer(key, body, contentType);
    } catch (e) {
      this.logger.warn(`image ingest failed for ${remoteUrl}: ${(e as Error).message}`);
      return null;
    }
  }

  private async categorySlug(categoryId: string): Promise<string | null> {
    const c = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true },
    });
    return c?.slug ?? null;
  }

  /**
   * Resolve categoria de origem → categoryId. Usa CategoryMapping persistido; só roda o
   * mapper (heurística/IA) para sourceKey novo. Retorna null se confiança baixa.
   */
  private async resolveCategory(cosmosCategory: string): Promise<string | null> {
    const existing = await this.prisma.categoryMapping.findUnique({
      where: { source_sourceKey: { source: COSMOS_SOURCE, sourceKey: cosmosCategory } },
    });
    if (existing) {
      return existing.confidence >= CATEGORY_CONFIDENCE_THRESHOLD ? existing.categoryId : null;
    }

    const classified = await this.mapper.classify(cosmosCategory);
    let categoryId: string | null = null;
    if (classified) {
      const category = await this.prisma.category.findUnique({
        where: { slug: slugify(classified.slug) },
      });
      categoryId = category?.id ?? null;
    }

    await this.prisma.categoryMapping.create({
      data: {
        source: COSMOS_SOURCE,
        sourceKey: cosmosCategory,
        categoryId,
        confidence: classified?.confidence ?? 0,
        mapper: this.mapper.name,
      },
    });

    return classified && classified.confidence >= CATEGORY_CONFIDENCE_THRESHOLD ? categoryId : null;
  }
}

/** Extensão de arquivo a partir do content-type da imagem. */
function extForContentType(contentType: string): string {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "jpg";
  }
}
