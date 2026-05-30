import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { SyncType } from "@prisma/client";
import { EnrichmentQueueService } from "../enrichment/enrichment.queue";
import { PrismaService } from "../prisma/prisma.service";
import { cleanGtin, slugify } from "./catalog-normalize";
import { ConnectorRegistry } from "./connector-registry";
import type { ErpConnector } from "./connector.interface";
import type { ConnectorContext, RawProduct, SyncCounters } from "./erp.types";

@Injectable()
export class ErpService {
  private readonly logger = new Logger(ErpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    private readonly enrichmentQueue: EnrichmentQueueService,
  ) {}

  /** Sync completo de produtos+preços+estoque de uma loja. Enfileira enriquecimento ao fim. */
  async runFullSync(storeId: string): Promise<string> {
    const runId = await this.runSync(storeId, "full", async (connector, ctx, counters) => {
      const raws = await connector.fetchProducts(ctx);
      for (const raw of raws) {
        counters.processed++;
        try {
          await this.upsertRawProduct(ctx.store.id, raw);
          counters.updated++;
        } catch (e) {
          counters.failed++;
          this.logger.warn(`product ${raw.externalId} failed: ${(e as Error).message}`);
        }
      }
    });
    // Dispara enriquecimento (Cosmos + categorias) dos produtos da loja.
    await this.enrichmentQueue.enqueueStore(storeId);
    return runId;
  }

  /** Sync incremental de preços. */
  async runPriceSync(storeId: string, since?: Date): Promise<string> {
    return this.runSync(
      storeId,
      "prices",
      async (connector, ctx, counters) => {
        const prices = await connector.fetchPrices({ ...ctx, since });
        for (const p of prices) {
          counters.processed++;
          const updated = await this.prisma.offer.updateMany({
            where: { storeId: ctx.store.id, externalId: p.externalId },
            data: {
              priceCents: p.priceCents,
              promoPriceCents: p.promoPriceCents ?? null,
              available: p.available ?? true,
            },
          });
          if (updated.count > 0) counters.updated++;
          else counters.failed++;
        }
      },
      since,
    );
  }

  /** Sync incremental de estoque. */
  async runStockSync(storeId: string, since?: Date): Promise<string> {
    return this.runSync(
      storeId,
      "stock",
      async (connector, ctx, counters) => {
        const stocks = await connector.fetchStock({ ...ctx, since });
        for (const s of stocks) {
          counters.processed++;
          const offer = await this.prisma.offer.findUnique({
            where: { storeId_externalId: { storeId: ctx.store.id, externalId: s.externalId } },
          });
          if (!offer) {
            counters.failed++;
            continue;
          }
          await this.prisma.stock.upsert({
            where: { storeId_productId: { storeId: ctx.store.id, productId: offer.productId } },
            update: { quantity: s.quantity ?? null, available: s.available },
            create: {
              storeId: ctx.store.id,
              productId: offer.productId,
              quantity: s.quantity ?? null,
              available: s.available,
            },
          });
          counters.updated++;
        }
      },
      since,
    );
  }

  // ─── núcleo: resolve conector, grava SyncRun, executa fn ───
  private async runSync(
    storeId: string,
    type: SyncType,
    fn: (connector: ErpConnector, ctx: ConnectorContext, counters: SyncCounters) => Promise<void>,
    since?: Date,
  ): Promise<string> {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { merchant: true },
    });
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", message: "Store not found" });
    }

    const connector = this.registry.resolve(store.merchant.connectorType);
    const ctx: ConnectorContext = {
      merchantId: store.merchantId,
      store: { id: store.id, externalId: store.externalId },
      config: store.merchant.connectorConfig,
      since,
    };

    const run = await this.prisma.syncRun.create({
      data: { storeId, type, status: "running" },
    });
    const counters: SyncCounters = { processed: 0, updated: 0, failed: 0 };

    try {
      await fn(connector, ctx, counters);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          itemsProcessed: counters.processed,
          itemsUpdated: counters.updated,
          itemsFailed: counters.failed,
        },
      });
      this.logger.log(
        `sync ${type} store=${storeId} ok: ${counters.updated}/${counters.processed} (${counters.failed} fail)`,
      );
    } catch (e) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          itemsProcessed: counters.processed,
          itemsUpdated: counters.updated,
          itemsFailed: counters.failed,
          error: (e as Error).message,
        },
      });
      this.logger.error(`sync ${type} store=${storeId} failed: ${(e as Error).message}`);
      throw e;
    }

    return run.id;
  }

  /** Normaliza um RawProduct e faz upsert idempotente de Product/Offer/Stock. */
  private async upsertRawProduct(storeId: string, raw: RawProduct): Promise<void> {
    const categoryId = raw.categoryName ? await this.upsertCategory(raw.categoryName) : null;
    const gtin = cleanGtin(raw.gtin);

    const productId = await this.resolveCanonicalProduct(storeId, raw, gtin, categoryId);

    await this.prisma.offer.upsert({
      where: { storeId_externalId: { storeId, externalId: raw.externalId } },
      update: {
        productId,
        priceCents: raw.priceCents,
        promoPriceCents: raw.promoPriceCents ?? null,
        available: raw.available ?? true,
      },
      create: {
        storeId,
        productId,
        externalId: raw.externalId,
        priceCents: raw.priceCents,
        promoPriceCents: raw.promoPriceCents ?? null,
        available: raw.available ?? true,
      },
    });

    await this.prisma.stock.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: { quantity: raw.stockQuantity ?? null, available: raw.available ?? true },
      create: {
        storeId,
        productId,
        quantity: raw.stockQuantity ?? null,
        available: raw.available ?? true,
      },
    });
  }

  /** Dedup: por GTIN quando houver; senão reaproveita o produto já mapeado à oferta. */
  private async resolveCanonicalProduct(
    storeId: string,
    raw: RawProduct,
    gtin: string | null,
    categoryId: string | null,
  ): Promise<string> {
    if (gtin) {
      const existing = await this.prisma.product.findUnique({ where: { gtin } });
      if (existing) return existing.id;
      const created = await this.prisma.product.create({
        data: {
          gtin,
          name: raw.name,
          brand: raw.brand ?? null,
          unit: raw.unit ?? null,
          imageUrl: raw.imageUrl ?? null,
          categoryId,
        },
      });
      return created.id;
    }

    const existingOffer = await this.prisma.offer.findUnique({
      where: { storeId_externalId: { storeId, externalId: raw.externalId } },
    });
    if (existingOffer) return existingOffer.productId;

    const created = await this.prisma.product.create({
      data: {
        name: raw.name,
        brand: raw.brand ?? null,
        unit: raw.unit ?? null,
        imageUrl: raw.imageUrl ?? null,
        categoryId,
      },
    });
    return created.id;
  }

  private async upsertCategory(name: string): Promise<string> {
    const slug = slugify(name);
    const cat = await this.prisma.category.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
    return cat.id;
  }
}
